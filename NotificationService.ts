import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class NotificationService {
  async sendBillCreated(userId: string, bill: any) {
    await this.handleNotification(userId, 'BILL_CREATED', {
      amount: bill.amount,
      dueDate: bill.dueDate
    });
  }

  async sendBillOverdue(userId: string, bill: any, lateFee: number) {
    await this.handleNotification(userId, 'BILL_OVERDUE', {
      amount: bill.amount,
      lateFee: lateFee
    });
  }

  private async handleNotification(userId: string, type: string, data: any) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { notificationPreference: true }
    });

    if (!user) return;

    const prefs = user.notificationPreference || { email: true, sms: false, push: false };
    const { subject, message } = this.getTemplate(type, user.name || 'Customer', data);

    if (prefs.email && user.email) {
      await this.sendEmail(user.email, subject, message);
      await this.logNotification(userId, 'EMAIL', 'SENT', message);
    }

    if (prefs.sms && user.phoneNumber) {
      await this.sendSMS(user.phoneNumber, message);
      await this.logNotification(userId, 'SMS', 'SENT', message);
    }

    if (prefs.push) {
      // Mock push token retrieval
      const pushToken = "mock-device-token"; 
      await this.sendPush(pushToken, subject, message);
      await this.logNotification(userId, 'PUSH', 'SENT', message);
    }
  }

  private getTemplate(type: string, userName: string, data: any) {
    switch (type) {
      case 'BILL_CREATED':
        return {
          subject: 'New Bill Generated',
          message: `Hello ${userName}, a new bill of ${data.amount} has been generated. Due date: ${data.dueDate}.`
        };
      case 'BILL_OVERDUE':
        return {
          subject: 'Bill Overdue Notice',
          message: `Hello ${userName}, your bill is overdue. A late fee of ${data.lateFee} has been applied.`
        };
      default:
        return { subject: 'Notification', message: 'You have a new notification.' };
    }
  }

  private async sendEmail(to: string, subject: string, body: string) {
    console.log(`[SendGrid] Sending email to ${to}: ${subject}`);
  }

  private async sendSMS(to: string, body: string) {
    console.log(`[Twilio] Sending SMS to ${to}: ${body}`);
  }

  private async sendPush(token: string, title: string, body: string) {
    console.log(`[FCM] Sending Push to ${token}: ${title}`);
  }

  private async logNotification(userId: string, type: string, status: string, message: string) {
    await prisma.notificationLog.create({
      data: { userId, type, status, message }
    });
  }
}