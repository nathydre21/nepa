import { PrismaClient } from '@prisma/client';
import { walletService } from './WalletService';
import { NotificationService } from './NotificationService';
import { addSeconds } from 'date-fns';

const prisma = new PrismaClient();
const notificationService = new NotificationService();

export class RecurringPaymentService {
  async createRecurringPayment(params: {
    userId: string;
    utilityId?: string;
    billId?: string;
    amount: number;
    cronExpression: string;
    startAt?: Date;
    maxRetries?: number;
    baseRetryDelaySeconds?: number;
  }) {
    const nextRun = params.startAt || new Date();
    const rp = await prisma.recurringPayment.create({
      data: {
        userId: params.userId,
        utilityId: params.utilityId,
        billId: params.billId,
        amount: params.amount,
        cronExpression: params.cronExpression,
        nextRun,
        maxRetries: params.maxRetries ?? 5,
        baseRetryDelaySeconds: params.baseRetryDelaySeconds ?? 60
      }
    });

    // Notify user that recurring payment was scheduled
    await notificationService.sendNotification({
      userId: params.userId,
      type: 'INFO',
      title: 'Recurring Payment Scheduled',
      message: `Recurring payment of ${params.amount} scheduled.`,
      priority: 'MEDIUM',
      category: 'BILLING'
    });

    return rp;
  }

  async cancelRecurringPayment(id: string, userId?: string) {
    const where: any = { id };
    const rec = await prisma.recurringPayment.findUnique({ where });
    if (!rec) throw new Error('Recurring payment not found');
    if (userId && rec.userId !== userId) throw new Error('Access denied');

    await prisma.recurringPayment.update({ where, data: { isActive: false, status: 'CANCELLED' } });

    await notificationService.sendNotification({
      userId: rec.userId,
      type: 'INFO',
      title: 'Recurring Payment Cancelled',
      message: `Recurring payment ${id} has been cancelled.`,
      priority: 'MEDIUM',
      category: 'BILLING'
    });

    return true;
  }

  async listForUser(userId: string) {
    return prisma.recurringPayment.findMany({ where: { userId } });
  }

  // Called by scheduler to process due recurring payments
  async runDuePayments() {
    const now = new Date();
    const due = await prisma.recurringPayment.findMany({
      where: {
        isActive: true,
        nextRun: { lte: now }
      }
    });

    for (const rp of due) {
      await this.attemptPayment(rp.id);
    }
  }

  private async attemptPayment(recurringPaymentId: string) {
    const rp = await prisma.recurringPayment.findUnique({ where: { id: recurringPaymentId } });
    if (!rp || !rp.isActive) return;

    const userId = rp.userId;
    const amount = Number(rp.amount);

    // Send pre-payment notification
    await notificationService.sendNotification({
      userId,
      type: 'INFO',
      title: 'Scheduled Payment Attempt',
      message: `Attempting scheduled payment of ${amount}.`,
      priority: 'MEDIUM',
      category: 'PAYMENT'
    });

    const balance = await walletService.getBalance(userId);
    const attemptNumber = rp.retryCount + 1;

    if (balance < amount) {
      // Insufficient funds
      const base = rp.baseRetryDelaySeconds || 60;
      const delay = base * Math.pow(2, rp.retryCount);
      const nextRetry = addSeconds(new Date(), delay);

      await prisma.recurringPaymentAttempt.create({
        data: {
          recurringPaymentId: rp.id,
          status: 'FAILED',
          error: 'INSUFFICIENT_FUNDS',
          attemptNumber,
          nextRetryAt: nextRetry
        }
      });

      const updated = await prisma.recurringPayment.update({
        where: { id: rp.id },
        data: {
          retryCount: { increment: 1 },
          lastAttemptAt: new Date(),
          nextRun: nextRetry
        }
      });

      await notificationService.sendNotification({
        userId,
        type: 'WARNING',
        title: 'Scheduled Payment Failed',
        message: `Scheduled payment of ${amount} failed due to insufficient funds. Next retry at ${nextRetry.toISOString()}.`,
        priority: 'HIGH',
        category: 'PAYMENT'
      });

      if (updated.retryCount >= (rp.maxRetries || 5)) {
        await prisma.recurringPayment.update({ where: { id: rp.id }, data: { isActive: false, status: 'FAILED' } });
        await notificationService.sendNotification({
          userId,
          type: 'ERROR',
          title: 'Recurring Payment Disabled',
          message: `Recurring payment ${rp.id} disabled after repeated failures.`,
          priority: 'URGENT',
          category: 'BILLING'
        });
      }

      return;
    }

    // Attempt debit
    const debited = await walletService.debit(userId, amount);
    if (!debited) {
      // treat like insufficient funds
      const base = rp.baseRetryDelaySeconds || 60;
      const delay = base * Math.pow(2, rp.retryCount);
      const nextRetry = addSeconds(new Date(), delay);

      await prisma.recurringPaymentAttempt.create({
        data: {
          recurringPaymentId: rp.id,
          status: 'FAILED',
          error: 'DEBIT_FAILED',
          attemptNumber,
          nextRetryAt: nextRetry
        }
      });

      await prisma.recurringPayment.update({ where: { id: rp.id }, data: { retryCount: { increment: 1 }, lastAttemptAt: new Date(), nextRun: nextRetry } });

      await notificationService.sendNotification({
        userId,
        type: 'ERROR',
        title: 'Scheduled Payment Failed',
        message: `Payment of ${amount} failed during debit. Will retry at ${nextRetry.toISOString()}.`,
        priority: 'HIGH',
        category: 'PAYMENT'
      });

      return;
    }

    // Create payment record and mark bill paid if possible
    const payment = await prisma.payment.create({
      data: {
        userId,
        amount: amount,
        method: 'RECURRING',
        status: 'SUCCESS',
        transactionId: `recurring-${rp.id}-${Date.now()}`,
        billId: rp.billId || ''
      }
    });

    if (rp.billId) {
      await prisma.bill.update({ where: { id: rp.billId }, data: { status: 'PAID' } });
    }

    await prisma.recurringPaymentAttempt.create({
      data: {
        recurringPaymentId: rp.id,
        status: 'SUCCESS',
        attemptNumber,
        nextRetryAt: null
      }
    });

    // reset retry count and set nextRun according to cronExpression — keep simple: add 1 day if cronExpression contains '@daily', otherwise add 30 days fallback
    let nextRunDate = addSeconds(new Date(), 60); // fallback 1 minute
    if (rp.cronExpression === '@daily') {
      nextRunDate = addSeconds(new Date(), 24 * 60 * 60);
    } else if (rp.cronExpression === '@monthly') {
      nextRunDate = addSeconds(new Date(), 30 * 24 * 60 * 60);
    } else {
      // best-effort: schedule next minute to pick up recurring cron parser in future
      nextRunDate = addSeconds(new Date(), 60);
    }

    await prisma.recurringPayment.update({ where: { id: rp.id }, data: { retryCount: 0, lastAttemptAt: new Date(), nextRun: nextRunDate } });

    await notificationService.sendNotification({
      userId,
      type: 'SUCCESS',
      title: 'Scheduled Payment Successful',
      message: `Scheduled payment of ${amount} completed successfully.`,
      priority: 'MEDIUM',
      category: 'PAYMENT'
    });
  }
}

export const recurringPaymentService = new RecurringPaymentService();
