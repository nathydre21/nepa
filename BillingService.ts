import { PrismaClient, BillStatus } from '@prisma/client';
import { differenceInDays, addDays } from 'date-fns';
import { NotificationService } from './NotificationService';

const prisma = new PrismaClient();
const notificationService = new NotificationService();

export class BillingService {
  // Automated Bill Generation
  async generateBill(userId: string, utilityId: string, amount: number, dueDateDays: number = 30) {
    const dueDate = addDays(new Date(), dueDateDays);
    
    const bill = await prisma.bill.create({
      data: {
        userId,
        utilityId,
        amount,
        dueDate,
        status: BillStatus.PENDING,
      },
      include: { user: true }
    });

    await notificationService.sendBillCreated(bill.userId, bill);
    return bill;
  }

  // Due Date Management & Late Fee Calculation
  async processOverdueBills() {
    const overdueBills = await prisma.bill.findMany({
      where: {
        status: BillStatus.PENDING,
        dueDate: { lt: new Date() }
      },
      include: { user: true }
    });

    for (const bill of overdueBills) {
      const daysOverdue = differenceInDays(new Date(), bill.dueDate);
      
      // Calculate Late Fee (e.g., 1% of amount per day overdue)
      // Note: In production, ensure Decimal arithmetic precision
      const lateFeeAmount = Number(bill.amount) * 0.01 * daysOverdue;

      await prisma.bill.update({
        where: { id: bill.id },
        data: {
          status: BillStatus.OVERDUE,
          lateFee: lateFeeAmount
        }
      });

      await notificationService.sendBillOverdue(bill.userId, bill, lateFeeAmount);
    }
  }

  // Discount and Coupon System
  async applyCoupon(billId: string, couponCode: string) {
    const coupon = await prisma.coupon.findUnique({
      where: { code: couponCode }
    });

    if (!coupon || !coupon.isActive || new Date() > coupon.expiryDate) {
      throw new Error('Invalid or expired coupon');
    }

    const bill = await prisma.bill.findUnique({ where: { id: billId } });
    if (!bill) throw new Error('Bill not found');

    let discountAmount = 0;
    const billAmount = Number(bill.amount);
    const couponValue = Number(coupon.amount);

    if (coupon.type === 'PERCENTAGE') {
      discountAmount = billAmount * (couponValue / 100);
    } else {
      discountAmount = couponValue;
    }

    // Ensure discount doesn't exceed bill amount
    discountAmount = Math.min(discountAmount, billAmount);

    return prisma.bill.update({
      where: { id: billId },
      data: { discount: discountAmount }
    });
  }
}