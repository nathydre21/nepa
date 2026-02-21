import { PrismaClient, BillStatus } from '@prisma/client';
import { subDays, format } from 'date-fns';

const prisma = new PrismaClient();

export class AnalyticsService {
  async getBillingStats() {
    const totalRevenue = await prisma.payment.aggregate({
      where: { status: 'SUCCESS' },
      _sum: { amount: true }
    });

    const overdueCount = await prisma.bill.count({
      where: { status: BillStatus.OVERDUE }
    });

    const pendingCount = await prisma.bill.count({
      where: { status: BillStatus.PENDING }
    });

    return {
      totalRevenue: totalRevenue._sum.amount || 0,
      overdueBills: overdueCount,
      pendingBills: pendingCount
    };
  }

  async getLateFeeRevenue() {
    return prisma.bill.aggregate({
      where: { lateFee: { gt: 0 } },
      _sum: { lateFee: true }
    });
  }

  async getDailyRevenue(days: number = 30) {
    const startDate = subDays(new Date(), days);
    
    const payments = await prisma.payment.findMany({
      where: {
        status: 'SUCCESS',
        createdAt: { gte: startDate }
      },
      select: { createdAt: true, amount: true }
    });

    const revenueMap = new Map<string, number>();
    
    payments.forEach(p => {
      const date = format(p.createdAt, 'yyyy-MM-dd');
      const amount = Number(p.amount);
      revenueMap.set(date, (revenueMap.get(date) || 0) + amount);
    });

    return Array.from(revenueMap.entries())
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getUserGrowth(days: number = 30) {
    const startDate = subDays(new Date(), days);
    const users = await prisma.user.findMany({
      where: { createdAt: { gte: startDate } },
      select: { createdAt: true }
    });

    const growthMap = new Map<string, number>();
    users.forEach(u => {
      const date = format(u.createdAt, 'yyyy-MM-dd');
      growthMap.set(date, (growthMap.get(date) || 0) + 1);
    });

    return Array.from(growthMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async predictRevenue() {
    // Simple predictive model: Moving Average of last 30 days
    const dailyRevenue = await this.getDailyRevenue(30);
    if (dailyRevenue.length === 0) return { prediction: 0, confidence: 'LOW' };

    const total = dailyRevenue.reduce((sum, day) => sum + day.value, 0);
    const average = total / 30;

    return {
      predictedDailyRevenue: average,
      predictedMonthlyRevenue: average * 30,
      trend: dailyRevenue[dailyRevenue.length - 1].value > average ? 'UP' : 'DOWN',
      confidence: 'MEDIUM'
    };
  }

  async saveReport(userId: string, title: string, type: string, data: any) {
    return prisma.report.create({
      data: {
        title,
        type,
        data,
        createdBy: userId
      }
    });
  }

  async exportRevenueData() {
    const data = await this.getDailyRevenue(90);
    const header = 'Date,Revenue\n';
    const rows = data.map(row => `${row.date},${row.value.toFixed(2)}`).join('\n');
    return header + rows;
  }
}