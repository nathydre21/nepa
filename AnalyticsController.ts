import { Request, Response } from 'express';
import { AnalyticsService } from '../AnalyticsService';

const analyticsService = new AnalyticsService();

export const getDashboardData = async (req: Request, res: Response) => {
  try {
    const [stats, revenueChart, userGrowth, prediction] = await Promise.all([
      analyticsService.getBillingStats(),
      analyticsService.getDailyRevenue(30),
      analyticsService.getUserGrowth(30),
      analyticsService.predictRevenue()
    ]);

    res.json({
      summary: stats,
      charts: {
        revenue: revenueChart,
        userGrowth: userGrowth
      },
      prediction
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
};

export const generateReport = async (req: Request, res: Response) => {
  try {
    const { title, type, userId } = req.body;
    
    let data;
    if (type === 'REVENUE') {
      data = await analyticsService.getDailyRevenue(30);
    } else if (type === 'USER_GROWTH') {
      data = await analyticsService.getUserGrowth(30);
    } else {
      data = await analyticsService.getBillingStats();
    }

    const report = await analyticsService.saveReport(userId, title, type, data);
    res.status(201).json(report);
  } catch (error) {
    console.error('Report generation error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
};

export const exportData = async (req: Request, res: Response) => {
  try {
    const csv = await analyticsService.exportRevenueData();
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=revenue_export.csv');
    res.send(csv);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
};