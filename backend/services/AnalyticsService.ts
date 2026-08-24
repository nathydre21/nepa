// TODO: Fix Prisma imports
// import { PrismaClient, BillStatus } from '@prisma/client';
import { subDays, format, startOfDay, endOfDay, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';

// TODO: Fix Prisma client
// const prisma = new PrismaClient();
const prisma = null as any;

export class AnalyticsService {
  async getBillingStats(startDate?: Date, endDate?: Date) {
    const dateFilter = startDate && endDate ? {
      createdAt: {
        gte: startDate,
        lte: endDate
      }
    } : {};

    const [totalRevenue, overdueCount, pendingCount, successfulPayments, failedPayments] = await Promise.all([
      prisma.payment.aggregate({
        where: { 
          status: 'SUCCESS',
          ...dateFilter
        },
        _sum: { amount: true }
      }),
      prisma.bill.count({
        where: { 
          // status: BillStatus.OVERDUE
      status: 'OVERDUE',
          ...dateFilter
        }
      }),
      prisma.bill.count({
        where: { 
          // status: BillStatus.PENDING,
      status: 'PENDING',
          ...dateFilter
        }
      }),
      prisma.payment.count({
        where: { 
          status: 'SUCCESS',
          ...dateFilter
        }
      }),
      prisma.payment.count({
        where: { 
          status: 'FAILED',
          ...dateFilter
        }
      })
    ]);

    const totalPayments = successfulPayments + failedPayments;
    const successRate = totalPayments > 0 ? (successfulPayments / totalPayments) * 100 : 0;

    return {
      totalRevenue: totalRevenue._sum.amount || 0,
      overdueBills: overdueCount,
      pendingBills: pendingCount,
      successfulPayments,
      failedPayments,
      successRate: Math.round(successRate * 100) / 100
    };
  }

  async getLateFeeRevenue() {
    return prisma.bill.aggregate({
      where: { lateFee: { gt: 0 } },
      _sum: { lateFee: true }
    });
  }

  async getDailyRevenue(days: number = 30, startDate?: Date, endDate?: Date) {
    const start = startDate || subDays(new Date(), days);
    const end = endDate || new Date();
    
    const payments = await prisma.payment.findMany({
      where: {
        status: 'SUCCESS',
        createdAt: {
          gte: startOfDay(start),
          lte: endOfDay(end)
        }
      },
      select: { createdAt: true, amount: true },
      orderBy: { createdAt: 'asc' }
    });

    const revenueMap = new Map<string, number>();
    
    // Fill all dates in range with 0 to ensure continuity
    const currentDate = new Date(start);
    while (currentDate <= end) {
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      revenueMap.set(dateStr, 0);
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    payments.forEach((p: any) => {
      const date = format(p.createdAt, 'yyyy-MM-dd');
      const amount = Number(p.amount);
      revenueMap.set(date, (revenueMap.get(date) || 0) + amount);
    });

    return Array.from(revenueMap.entries())
      .map(([date, value]) => ({ date, value }))
      .sort((a: any, b: any) => a.date.localeCompare(b.date));
  }

  async getPaymentTrends(days: number = 30) {
    const startDate = subDays(new Date(), days);
    
    const payments = await prisma.payment.findMany({
      where: {
        createdAt: { gte: startDate }
      },
      select: { 
        createdAt: true, 
        amount: true, 
        status: true,
        bill: {
          select: { utilityType: true }
        }
      }
    });

    // Group by utility type and status
    const trends = payments.reduce((acc: Record<string, any>, payment: any) => {
      const date = format(payment.createdAt, 'yyyy-MM-dd');
      const type = payment.bill?.utilityType || 'Unknown';
      
      if (!acc[date]) {
        acc[date] = {
          date,
          total: 0,
          successful: 0,
          failed: 0,
          byType: {} as Record<string, number>
        };
      }
      
      acc[date].total += Number(payment.amount);
      if (payment.status === 'SUCCESS') {
        acc[date].successful += Number(payment.amount);
      } else {
        acc[date].failed += Number(payment.amount);
      }
      
      acc[date].byType[type] = (acc[date].byType[type] || 0) + Number(payment.amount);
      
      return acc;
    }, {});

    return Object.values(trends).sort((a: any, b: any) => a.date.localeCompare(b.date));
  }

  async getUserMetrics(days: number = 30) {
    const startDate = subDays(new Date(), days);
    
    const [newUsers, activeUsers, totalUsers] = await Promise.all([
      prisma.user.count({
        where: { createdAt: { gte: startDate } }
      }),
      prisma.user.count({
        where: {
          payments: {
            some: {
              createdAt: { gte: startDate }
            }
          }
        }
      }),
      prisma.user.count()
    ]);

    const userActivity = await prisma.user.findMany({
      where: {
        payments: {
          some: {
            createdAt: { gte: startDate }
          }
        }
      },
      select: {
        id: true,
        payments: {
          where: { createdAt: { gte: startDate } },
          select: { amount: true, createdAt: true }
        }
      }
    });

    const avgSpendingPerUser = userActivity.length > 0 
      ? userActivity.reduce((sum: number, user: any) => 
          sum + user.payments.reduce((pSum: number, p: any) => pSum + Number(p.amount), 0), 0
        ) / userActivity.length
      : 0;

    return {
      newUsers,
      activeUsers,
      totalUsers,
      avgSpendingPerUser: Math.round(avgSpendingPerUser * 100) / 100,
      userEngagementRate: totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 10000) / 100 : 0
    };
  }

  async getUserGrowth(days: number = 30) {
    const startDate = subDays(new Date(), days);
    const users = await prisma.user.findMany({
      where: { createdAt: { gte: startDate } },
      select: { createdAt: true }
    });

    const growthMap = new Map<string, number>();
    users.forEach((u: any) => {
      const date = format(u.createdAt, 'yyyy-MM-dd');
      growthMap.set(date, (growthMap.get(date) || 0) + 1);
    });

    return Array.from(growthMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async predictRevenue(days: number = 30) {
    const dailyRevenue = await this.getDailyRevenue(days * 2); // Get more data for better prediction
    if (dailyRevenue.length < 7) return { prediction: 0, confidence: 'LOW', trend: 'STABLE' };

    // Simple linear regression for trend analysis
    const n = dailyRevenue.length;
    const xValues = dailyRevenue.map((_, index) => index);
    const yValues = dailyRevenue.map((d: any) => d.value);
    
    const sumX = xValues.reduce((sum, x) => sum + x, 0);
    const sumY = yValues.reduce((sum, y) => sum + y, 0);
    const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
    const sumXX = xValues.reduce((sum, x) => sum + x * x, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Predict next 7 days
    const predictions = [];
    for (let i = 1; i <= 7; i++) {
      const predictedValue = slope * (n + i) + intercept;
      predictions.push(Math.max(0, predictedValue));
    }
    
    const avgPrediction = predictions.reduce((sum, pred) => sum + pred, 0) / predictions.length;
    const recentAvg = dailyRevenue.slice(-7).reduce((sum, d) => sum + d.value, 0) / 7;
    
    // Determine trend and confidence
    let trend = 'STABLE';
    let confidence = 'MEDIUM';
    
    if (slope > 5) trend = 'UP';
    else if (slope < -5) trend = 'DOWN';
    
    if (dailyRevenue.length >= 30) {
      const variance = yValues.reduce((sum, y) => sum + Math.pow(y - recentAvg, 2), 0) / n;
      const coefficientOfVariation = Math.sqrt(variance) / recentAvg;
      
      if (coefficientOfVariation < 0.2) confidence = 'HIGH';
      else if (coefficientOfVariation > 0.5) confidence = 'LOW';
    }

    return {
      predictedDailyRevenue: Math.round(avgPrediction * 100) / 100,
      predictedWeeklyRevenue: Math.round(avgPrediction * 7 * 100) / 100,
      predictedMonthlyRevenue: Math.round(avgPrediction * 30 * 100) / 100,
      trend,
      confidence,
      nextWeekPredictions: predictions.map(p => Math.round(p * 100) / 100)
    };
  }

  async getUtilityTypeBreakdown(startDate?: Date, endDate?: Date) {
    const dateFilter = startDate && endDate ? {
      createdAt: {
        gte: startDate,
        lte: endDate
      }
    } : {};

    const breakdown = await prisma.bill.groupBy({
      by: ['utilityType'],
      where: dateFilter,
      _count: { id: true },
      _sum: { amount: true, lateFee: true }
    });

    return breakdown.map((item: any) => ({
      utilityType: item.utilityType,
      count: item._count.id,
      totalAmount: item._sum.amount || 0,
      totalLateFees: item._sum.lateFee || 0,
      averageAmount: item._count.id > 0 ? (item._sum.amount || 0) / item._count.id : 0
    }));
  }

  async getHourlyPaymentPatterns(days: number = 7) {
    const startDate = subDays(new Date(), days);
    
    const payments = await prisma.payment.findMany({
      where: {
        status: 'SUCCESS',
        createdAt: { gte: startDate }
      },
      select: { createdAt: true, amount: true }
    });

    const hourlyData = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: 0,
      totalAmount: 0,
      avgAmount: 0
    }));

    payments.forEach((payment: any) => {
      const hour = payment.createdAt.getHours();
      hourlyData[hour].count++;
      hourlyData[hour].totalAmount += Number(payment.amount);
    });

    hourlyData.forEach(data => {
      data.avgAmount = data.count > 0 ? data.totalAmount / data.count : 0;
    });

    return hourlyData;
  }

  async generateReport(data: {
    type: string;
    userId?: string;
    startDate: Date;
    endDate: Date;
    filters?: Record<string, any>;
  }) {
    // TODO: Fix missing report model
    // return prisma.report.create({
    //   data: {
    //     type: data.type,
    //     userId: data.userId,
    //     startDate: data.startDate,
    //     endDate: data.endDate,
    //     filters: data.filters || {},
    //     status: 'SUCCESS',
    //   },
    // });
    return null;
  }

  async exportRevenueData() {
    const data = await this.getDailyRevenue(90);
    const header = 'Date,Revenue\n';
    const rows = data.map(row => `${row.date},${row.value.toFixed(2)}`).join('\n');
    return header + rows;
  }

  async getRevenueData(startDate?: Date, endDate?: Date) {
    const where: any = { status: 'SUCCESS' };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const payments = await prisma.payment.findMany({
      where,
      select: {
        id: true,
        amount: true,
        status: true,
        createdAt: true,
        bill: {
          select: {
            id: true,
            amount: true,
            utility: {
              select: {
                name: true,
                type: true
              }
            }
          }
        },
        user: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return payments;
  }

  async getUserData(startDate?: Date, endDate?: Date) {
    const where: any = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        role: true,
        status: true,
        isEmailVerified: true,
        twoFactorEnabled: true,
        createdAt: true,
        lastLoginAt: true,
        _count: {
          select: {
            bills: true,
            payments: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return users;
  }

  async getBillsData(startDate?: Date, endDate?: Date) {
    const where: any = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const bills = await prisma.bill.findMany({
      where,
      select: {
        id: true,
        amount: true,
        lateFee: true,
        discount: true,
        dueDate: true,
        status: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true
          }
        },
        utility: {
          select: {
            name: true,
            type: true,
            provider: true
          }
        },
        payments: {
          select: {
            id: true,
            amount: true,
            status: true,
            createdAt: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return bills;
  }

  convertToCSV(data: any[]): string {
    if (!data || data.length === 0) {
      return 'No data available';
    }

    const headers = Object.keys(data[0]);
    const csvHeaders = headers.join(',');
    
    const csvRows = data.map(row => {
      return headers.map(header => {
        const value = row[header];
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return JSON.stringify(value);
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',');
    });

    return [csvHeaders, ...csvRows].join('\n');
  }
}