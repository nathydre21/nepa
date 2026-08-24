import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { BillingService } from "../BillingService";
import { NotificationService } from "./NotificationService";

const prisma = new PrismaClient();
const billingService = new BillingService();
const notificationService = new NotificationService();

// ── Types ──────────────────────────────────────────────────────────────────

export type ScheduleFrequency =
  | "DAILY"
  | "WEEKLY"
  | "BIWEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "ANNUALLY";

export interface CreateScheduledPaymentDTO {
  userId: string;
  billId: string;
  amount: number;
  paymentMethod: string;
  frequency: ScheduleFrequency;
  startDate: Date;
  endDate?: Date;
  maxRetries?: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Calculate the next run date based on frequency.
 */
function getNextRunDate(from: Date, frequency: ScheduleFrequency): Date {
  const next = new Date(from);
  switch (frequency) {
    case "DAILY":
      next.setDate(next.getDate() + 1);
      break;
    case "WEEKLY":
      next.setDate(next.getDate() + 7);
      break;
    case "BIWEEKLY":
      next.setDate(next.getDate() + 14);
      break;
    case "MONTHLY":
      next.setMonth(next.getMonth() + 1);
      break;
    case "QUARTERLY":
      next.setMonth(next.getMonth() + 3);
      break;
    case "ANNUALLY":
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return next;
}

/**
 * Exponential backoff delay in milliseconds.
 * attempt 1 → 2 min, attempt 2 → 4 min, attempt 3 → 8 min …
 */
function getBackoffDelay(attemptNumber: number): number {
  return Math.pow(2, attemptNumber) * 60 * 1000;
}

/**
 * Check wallet balance before payment.
 * Returns the balance or null if the service is unavailable.
 */
async function getWalletBalance(userId: string): Promise<number | null> {
  try {
    const wallet = await (prisma as any).wallet?.findUnique({
      where: { userId },
      select: { balance: true },
    });
    return wallet ? Number(wallet.balance) : null;
  } catch {
    return null;
  }
}

// ── ScheduledPaymentService ────────────────────────────────────────────────

export class ScheduledPaymentService {
  private static instance: ScheduledPaymentService;
  private cronJob: cron.ScheduledTask | null = null;

  static getInstance(): ScheduledPaymentService {
    if (!ScheduledPaymentService.instance) {
      ScheduledPaymentService.instance = new ScheduledPaymentService();
    }
    return ScheduledPaymentService.instance;
  }

  // ── Scheduler lifecycle ────────────────────────────────────────────────

  /**
   * Start the cron job that runs every minute and processes due payments.
   */
  startScheduler(): void {
    if (this.cronJob) return; // already running

    // Run every minute: "* * * * *"
    this.cronJob = cron.schedule("* * * * *", async () => {
      await this.processDuePayments();
    });

    console.log("[ScheduledPaymentService] Cron scheduler started.");
  }

  stopScheduler(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log("[ScheduledPaymentService] Cron scheduler stopped.");
    }
  }

  // ── Core processing ────────────────────────────────────────────────────

  /**
   * Find all ACTIVE scheduled payments whose nextRunAt is due and execute them.
   */
  async processDuePayments(): Promise<void> {
    const now = new Date();

    const due = await prisma.scheduledPayment.findMany({
      where: {
        status: "ACTIVE",
        nextRunAt: { lte: now },
        OR: [{ retryAfter: null }, { retryAfter: { lte: now } }],
      },
    });

    for (const schedule of due) {
      await this.executeScheduledPayment(schedule);
    }
  }

  /**
   * Execute a single scheduled payment with retry + backoff logic.
   */
  private async executeScheduledPayment(schedule: any): Promise<void> {
    const attemptNumber = schedule.retryCount + 1;

    // ── Wallet balance check ───────────────────────────────────────────
    const walletBalance = await getWalletBalance(schedule.userId);
    if (walletBalance !== null && walletBalance < Number(schedule.amount)) {
      // Insufficient funds — notify user and skip this run
      await prisma.paymentExecutionLog.create({
        data: {
          scheduledPaymentId: schedule.id,
          userId: schedule.userId,
          amount: schedule.amount,
          status: "SKIPPED",
          errorMessage: "Insufficient wallet balance",
          attemptNumber,
          walletBalanceBefore: walletBalance,
        },
      });

      await notificationService.sendSystemAlert(
        schedule.userId,
        `Scheduled payment of ${schedule.amount} was skipped due to insufficient wallet balance.`,
        "HIGH"
      );

      // Advance nextRunAt to the next cycle so we do not retry infinitely
      await prisma.scheduledPayment.update({
        where: { id: schedule.id },
        data: {
          nextRunAt: getNextRunDate(new Date(), schedule.frequency),
          retryCount: 0,
          retryAfter: null,
          lastRunAt: new Date(),
        },
      });
      return;
    }

    // ── Attempt payment ────────────────────────────────────────────────
    try {
      const result = await billingService.processPayment({
        billId: schedule.billId,
        userId: schedule.userId,
        amount: Number(schedule.amount),
        paymentMethod: schedule.paymentMethod,
        timestamp: new Date(),
      });

      // Success path
      await prisma.paymentExecutionLog.create({
        data: {
          scheduledPaymentId: schedule.id,
          userId: schedule.userId,
          amount: schedule.amount,
          status: "SUCCESS",
          transactionId: result?.transactionId ?? null,
          attemptNumber,
          walletBalanceBefore: walletBalance,
        },
      });

      const nextRunAt = getNextRunDate(new Date(), schedule.frequency);
      const isExpired = schedule.endDate && nextRunAt > schedule.endDate;

      await prisma.scheduledPayment.update({
        where: { id: schedule.id },
        data: {
          lastRunAt: new Date(),
          nextRunAt,
          retryCount: 0,
          retryAfter: null,
          status: isExpired ? "COMPLETED" : "ACTIVE",
        },
      });

      await notificationService.sendPaymentConfirmed(schedule.userId, {
        amount: schedule.amount,
        transactionId: result?.transactionId,
        billId: schedule.billId,
        scheduledPaymentId: schedule.id,
      });

    } catch (error: any) {
      // Failure path — apply exponential backoff
      const newRetryCount = schedule.retryCount + 1;
      const maxRetries = schedule.maxRetries ?? 3;

      await prisma.paymentExecutionLog.create({
        data: {
          scheduledPaymentId: schedule.id,
          userId: schedule.userId,
          amount: schedule.amount,
          status: newRetryCount >= maxRetries ? "FAILED" : "RETRYING",
          errorMessage: error.message ?? "Unknown error",
          attemptNumber,
          walletBalanceBefore: walletBalance,
        },
      });

      if (newRetryCount >= maxRetries) {
        // Mark as ACTIVE but push to next cycle — do not cancel permanently
        await prisma.scheduledPayment.update({
          where: { id: schedule.id },
          data: {
            retryCount: 0,
            retryAfter: null,
            lastRunAt: new Date(),
            nextRunAt: getNextRunDate(new Date(), schedule.frequency),
          },
        });

        await notificationService.sendSystemAlert(
          schedule.userId,
          `Scheduled payment of ${schedule.amount} failed after ${maxRetries} attempts. It will retry on the next cycle.`,
          "URGENT"
        );
      } else {
        // Schedule a retry with exponential backoff
        const backoffMs = getBackoffDelay(newRetryCount);
        const retryAfter = new Date(Date.now() + backoffMs);

        await prisma.scheduledPayment.update({
          where: { id: schedule.id },
          data: {
            retryCount: newRetryCount,
            retryAfter,
          },
        });

        await notificationService.sendSystemAlert(
          schedule.userId,
          `Scheduled payment of ${schedule.amount} failed (attempt ${newRetryCount}/${maxRetries}). Retrying in ${Math.round(backoffMs / 60000)} minutes.`,
          "HIGH"
        );
      }
    }
  }

  // ── CRUD ───────────────────────────────────────────────────────────────

  async createScheduledPayment(dto: CreateScheduledPaymentDTO) {
    return prisma.scheduledPayment.create({
      data: {
        userId: dto.userId,
        billId: dto.billId,
        amount: dto.amount,
        paymentMethod: dto.paymentMethod,
        frequency: dto.frequency,
        nextRunAt: dto.startDate,
        endDate: dto.endDate ?? null,
        maxRetries: dto.maxRetries ?? 3,
      },
    });
  }

  async getUserScheduledPayments(userId: string) {
    return prisma.scheduledPayment.findMany({
      where: { userId },
      include: { executionLogs: { orderBy: { executedAt: "desc" }, take: 5 } },
      orderBy: { createdAt: "desc" },
    });
  }

  async getScheduledPaymentById(id: string, userId: string) {
    return prisma.scheduledPayment.findFirst({
      where: { id, userId },
      include: { executionLogs: { orderBy: { executedAt: "desc" } } },
    });
  }

  async pauseScheduledPayment(id: string, userId: string) {
    return prisma.scheduledPayment.updateMany({
      where: { id, userId, status: "ACTIVE" },
      data: { status: "PAUSED" },
    });
  }

  async resumeScheduledPayment(id: string, userId: string) {
    return prisma.scheduledPayment.updateMany({
      where: { id, userId, status: "PAUSED" },
      data: { status: "ACTIVE", nextRunAt: new Date() },
    });
  }

  async cancelScheduledPayment(id: string, userId: string) {
    return prisma.scheduledPayment.updateMany({
      where: { id, userId, status: { in: ["ACTIVE", "PAUSED"] } },
      data: { status: "CANCELLED" },
    });
  }

  async getPaymentExecutionHistory(scheduledPaymentId: string, userId: string) {
    return prisma.paymentExecutionLog.findMany({
      where: { scheduledPaymentId, userId },
      orderBy: { executedAt: "desc" },
    });
  }
}

export const scheduledPaymentService = ScheduledPaymentService.getInstance();
