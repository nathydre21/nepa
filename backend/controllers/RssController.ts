import { Request, Response } from 'express';
import RSS from 'rss';
import { PrismaClient } from '@prisma/client';
import { errorResponse } from '../utils/errorResponse';

const prisma = new PrismaClient();

interface RSSFeedOptions {
  title: string;
  description: string;
  feed_url: string;
  site_url: string;
  language?: string;
  pubDate?: Date;
}

interface FeedItem {
  title: string;
  description: string;
  url: string;
  guid: string;
  date: Date;
  categories?: string[];
  author?: string;
}

export class RssController {
  private static generateFeed(options: RSSFeedOptions): RSS {
    return new RSS({
      title: options.title,
      description: options.description,
      feed_url: options.feed_url,
      site_url: options.site_url,
      language: options.language || 'en',
      pubDate: options.pubDate || new Date(),
      ttl: 60 // Cache for 1 hour
    });
  }

  private static formatPaymentItem(payment: any): FeedItem {
    return {
      title: `Payment of ${payment.amount} ${payment.asset} - ${payment.status}`,
      description: `
        Payment transaction details:
        Amount: ${payment.amount} ${payment.asset}
        Status: ${payment.status}
        Method: ${payment.method}
        Network: ${payment.network}
        ${payment.transactionHash ? `Transaction Hash: ${payment.transactionHash}` : ''}
        ${payment.fraudScore ? `Fraud Score: ${payment.fraudScore}` : ''}
        Created: ${payment.createdAt}
      `.trim(),
      url: `${process.env.SITE_URL || 'https://nepa.io'}/payments/${payment.id}`,
      guid: payment.id,
      date: payment.createdAt,
      categories: ['payment', payment.network.toLowerCase(), payment.status.toLowerCase()],
      author: payment.user?.email || 'Anonymous'
    };
  }

  private static formatBillItem(bill: any): FeedItem {
    return {
      title: `Bill from ${bill.utility?.name || 'Utility'} - ${bill.amount} - ${bill.status}`,
      description: `
        Utility bill details:
        Provider: ${bill.utility?.name || 'Unknown'}
        Amount: ${bill.amount}
        Status: ${bill.status}
        Due Date: ${bill.dueDate}
        Late Fee: ${bill.lateFee}
        Discount: ${bill.discount}
        Created: ${bill.createdAt}
      `.trim(),
      url: `${process.env.SITE_URL || 'https://nepa.io'}/bills/${bill.id}`,
      guid: bill.id,
      date: bill.createdAt,
      categories: ['bill', bill.utility?.type?.toLowerCase() || 'utility', bill.status.toLowerCase()],
      author: bill.user?.email || 'Anonymous'
    };
  }

  private static formatReportItem(report: any): FeedItem {
    return {
      title: `${report.type} Report: ${report.title}`,
      description: `
        Report generated:
        Title: ${report.title}
        Type: ${report.type}
        Generated: ${report.createdAt}
        Created by: ${report.user?.email || 'System'}
      `.trim(),
      url: `${process.env.SITE_URL || 'https://nepa.io'}/reports/${report.id}`,
      guid: report.id,
      date: report.createdAt,
      categories: ['report', report.type.toLowerCase()],
      author: report.user?.email || 'System'
    };
  }

  /**
   * Generate RSS feed for recent payments
   */
  static async getPaymentsFeed(req: Request, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const status = req.query.status as string;
      
      const whereClause = status ? { status: status.toUpperCase() } : {};
      
      const payments = await prisma.payment.findMany({
        where: whereClause,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { email: true, name: true }
          },
          bill: {
            include: {
              utility: {
                select: { name: true, type: true }
              }
            }
          }
        }
      });

      const feed = RssController.generateFeed({
        title: 'NEPA - Recent Payments',
        description: 'Recent payment transactions on the NEPA platform',
        feed_url: `${process.env.SITE_URL || 'https://nepa.io'}/api/rss/payments`,
        site_url: process.env.SITE_URL || 'https://nepa.io',
        language: 'en'
      });

      payments.forEach(payment => {
        feed.item(RssController.formatPaymentItem(payment));
      });

      res.set('Content-Type', 'application/rss+xml');
      res.send(feed.xml());
    } catch (error) {
      console.error('Error generating payments RSS feed:', error);
      errorResponse(res, 500, 'Failed to generate RSS feed');
    }
  }

  /**
   * Generate RSS feed for recent bills
   */
  static async getBillsFeed(req: Request, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const status = req.query.status as string;
      
      const whereClause = status ? { status: status.toUpperCase() } : {};
      
      const bills = await prisma.bill.findMany({
        where: whereClause,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { email: true, name: true }
          },
          utility: {
            select: { name: true, type: true }
          }
        }
      });

      const feed = RssController.generateFeed({
        title: 'NEPA - Recent Bills',
        description: 'Recent utility bills on the NEPA platform',
        feed_url: `${process.env.SITE_URL || 'https://nepa.io'}/api/rss/bills`,
        site_url: process.env.SITE_URL || 'https://nepa.io',
        language: 'en'
      });

      bills.forEach(bill => {
        feed.item(RssController.formatBillItem(bill));
      });

      res.set('Content-Type', 'application/rss+xml');
      res.send(feed.xml());
    } catch (error) {
      console.error('Error generating bills RSS feed:', error);
      errorResponse(res, 500, 'Failed to generate RSS feed');
    }
  }

  /**
   * Generate RSS feed for recent reports
   */
  static async getReportsFeed(req: Request, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const type = req.query.type as string;
      
      const whereClause = type ? { type: type.toUpperCase() } : {};
      
      const reports = await prisma.report.findMany({
        where: whereClause,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { email: true, name: true }
          }
        }
      });

      const feed = RssController.generateFeed({
        title: 'NEPA - Recent Reports',
        description: 'Recent reports generated on the NEPA platform',
        feed_url: `${process.env.SITE_URL || 'https://nepa.io'}/api/rss/reports`,
        site_url: process.env.SITE_URL || 'https://nepa.io',
        language: 'en'
      });

      reports.forEach(report => {
        feed.item(RssController.formatReportItem(report));
      });

      res.set('Content-Type', 'application/rss+xml');
      res.send(feed.xml());
    } catch (error) {
      console.error('Error generating reports RSS feed:', error);
      errorResponse(res, 500, 'Failed to generate RSS feed');
    }
  }

  /**
   * Generate combined RSS feed for all recent activity
   */
  static async getActivityFeed(req: Request, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      
      // Get recent activities from different models
      const [payments, bills, reports] = await Promise.all([
        prisma.payment.findMany({
          take: Math.ceil(limit / 3),
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { email: true, name: true } },
            bill: {
              include: {
                utility: { select: { name: true, type: true } }
              }
            }
          }
        }),
        prisma.bill.findMany({
          take: Math.ceil(limit / 3),
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { email: true, name: true } },
            utility: { select: { name: true, type: true } }
          }
        }),
        prisma.report.findMany({
          take: Math.ceil(limit / 3),
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { email: true, name: true } }
          }
        })
      ]);

      const feed = RssController.generateFeed({
        title: 'NEPA - Recent Activity',
        description: 'All recent activity on the NEPA platform including payments, bills, and reports',
        feed_url: `${process.env.SITE_URL || 'https://nepa.io'}/api/rss/activity`,
        site_url: process.env.SITE_URL || 'https://nepa.io',
        language: 'en'
      });

      // Add all items to feed
      payments.forEach(payment => {
        feed.item(RssController.formatPaymentItem(payment));
      });

      bills.forEach(bill => {
        feed.item(RssController.formatBillItem(bill));
      });

      reports.forEach(report => {
        feed.item(RssController.formatReportItem(report));
      });

      res.set('Content-Type', 'application/rss+xml');
      res.send(feed.xml());
    } catch (error) {
      console.error('Error generating activity RSS feed:', error);
      errorResponse(res, 500, 'Failed to generate RSS feed');
    }
  }

  /**
   * Generate RSS feed for user-specific activity
   */
  static async getUserActivityFeed(req: Request, res: Response) {
    try {
      const userId = req.params.userId;
      const limit = parseInt(req.query.limit as string) || 50;
      
      if (!userId) {
        return errorResponse(res, 400, 'User ID is required');
      }

      // Get user's recent activities
      const [payments, bills, reports] = await Promise.all([
        prisma.payment.findMany({
          where: { userId },
          take: Math.ceil(limit / 3),
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { email: true, name: true } },
            bill: {
              include: {
                utility: { select: { name: true, type: true } }
              }
            }
          }
        }),
        prisma.bill.findMany({
          where: { userId },
          take: Math.ceil(limit / 3),
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { email: true, name: true } },
            utility: { select: { name: true, type: true } }
          }
        }),
        prisma.report.findMany({
          where: { createdBy: userId },
          take: Math.ceil(limit / 3),
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { email: true, name: true } }
          }
        })
      ]);

      const feed = RssController.generateFeed({
        title: `NEPA - User Activity for ${payments[0]?.user?.name || bills[0]?.user?.name || reports[0]?.user?.name || userId}`,
        description: `Recent activity for user on the NEPA platform`,
        feed_url: `${process.env.SITE_URL || 'https://nepa.io'}/api/rss/user/${userId}`,
        site_url: process.env.SITE_URL || 'https://nepa.io',
        language: 'en'
      });

      // Add all items to feed
      payments.forEach(payment => {
        feed.item(RssController.formatPaymentItem(payment));
      });

      bills.forEach(bill => {
        feed.item(RssController.formatBillItem(bill));
      });

      reports.forEach(report => {
        feed.item(RssController.formatReportItem(report));
      });

      res.set('Content-Type', 'application/rss+xml');
      res.send(feed.xml());
    } catch (error) {
      console.error('Error generating user activity RSS feed:', error);
      errorResponse(res, 500, 'Failed to generate RSS feed');
    }
  }
}

export const {
  getPaymentsFeed,
  getBillsFeed,
  getReportsFeed,
  getActivityFeed,
  getUserActivityFeed
} = RssController;
