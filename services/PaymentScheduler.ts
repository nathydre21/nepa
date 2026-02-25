import cron from 'node-cron';
import { recurringPaymentService } from './RecurringPaymentService';

export class PaymentScheduler {
  private task: cron.ScheduledTask | null = null;

  start() {
    if (this.task) return;

    // Run every minute and let service pick due payments
    this.task = cron.schedule('* * * * *', async () => {
      try {
        await recurringPaymentService.runDuePayments();
      } catch (err) {
        console.error('PaymentScheduler error:', err);
      }
    });

    this.task.start();
    console.log('PaymentScheduler started (runs every minute)');
  }

  stop() {
    if (!this.task) return;
    this.task.stop();
    this.task = null;
    console.log('PaymentScheduler stopped');
  }
}

export const paymentScheduler = new PaymentScheduler();
