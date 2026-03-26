import { PrismaClient } from '@prisma/client';
import RSS from 'rss';
import { format } from 'date-fns';

const prisma = new PrismaClient();

export interface RssFeedOptions {
  title: string;
  description: string;
  feed_url: string;
  site_url: string;
  language?: string;
  pubDate?: Date;
  ttl?: number;
}

export interface RssItem {
  title: string;
  description: string;
  url: string;
  guid?: string;
  categories?: string[];
  author?: string;
  date: Date;
}

export class RssService {
  private static instance: RssService;

  public static getInstance(): RssService {
    if (!RssService.instance) {
      RssService.instance = new RssService();
    }
    return RssService.instance;
  }

  /**
   * Generate RSS feed for recent bills
   */
  async generateBillsFeed(options: RssFeedOptions): Promise<string> {
    const feed = new RSS({
      title: options.title,
      description: options.description,
      feed_url: options.feed_url,
      site_url: options.site_url,
      language: options.language || 'en',
      pubDate: options.pubDate || new Date(),
      ttl: options.ttl || 60
    });

    // Get recent bills from the database
    const recentBills = await prisma.bill.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { name: true, email: true }
        },
        utility: {
          select: { name: true, type: true, provider: true }
        }
      }
    });

    for (const bill of recentBills) {
      const itemTitle = `Bill: ${bill.utility.name} - ${bill.user.name || bill.user.email}`;
      const itemDescription = `
        Amount: $${bill.amount}
        Due Date: ${format(bill.dueDate, 'MMM dd, yyyy')}
        Status: ${bill.status}
        Utility Type: ${bill.utility.type}
        Provider: ${bill.utility.provider}
        ${bill.lateFee > 0 ? `Late Fee: $${bill.lateFee}` : ''}
        ${bill.discount > 0 ? `Discount: $${bill.discount}` : ''}
      `.trim();

      feed.item({
        title: itemTitle,
        description: itemDescription,
        url: `${options.site_url}/bills/${bill.id}`,
        guid: bill.id,
        categories: [bill.utility.type, bill.status.toLowerCase()],
        author: bill.user.name || bill.user.email,
        date: bill.createdAt
      });
    }

    return feed.xml({ indent: true });
  }

  /**
   * Generate RSS feed for recent payments
   */
  async generatePaymentsFeed(options: RssFeedOptions): Promise<string> {
    const feed = new RSS({
      title: options.title,
      description: options.description,
      feed_url: options.feed_url,
      site_url: options.site_url,
      language: options.language || 'en',
      pubDate: options.pubDate || new Date(),
      ttl: options.ttl || 60
    });

    // Get recent payments from the database
    const recentPayments = await prisma.payment.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { name: true, email: true }
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

    for (const payment of recentPayments) {
      const itemTitle = `Payment: ${payment.bill.utility.name} - ${payment.user.name || payment.user.email}`;
      const itemDescription = `
        Amount: $${payment.amount}
        Payment Method: ${payment.method}
        Status: ${payment.status}
        Utility: ${payment.bill.utility.name}
        Utility Type: ${payment.bill.utility.type}
        ${payment.transactionId ? `Transaction ID: ${payment.transactionId}` : ''}
      `.trim();

      feed.item({
        title: itemTitle,
        description: itemDescription,
        url: `${options.site_url}/payments/${payment.id}`,
        guid: payment.id,
        categories: ['payment', payment.status.toLowerCase(), payment.method.toLowerCase()],
        author: payment.user.name || payment.user.email,
        date: payment.createdAt
      });
    }

    return feed.xml({ indent: true });
  }

  /**
   * Generate RSS feed for recent user registrations
   */
  async generateUsersFeed(options: RssFeedOptions): Promise<string> {
    const feed = new RSS({
      title: options.title,
      description: options.description,
      feed_url: options.feed_url,
      site_url: options.site_url,
      language: options.language || 'en',
      pubDate: options.pubDate || new Date(),
      ttl: options.ttl || 60
    });

    // Get recent user registrations from the database
    const recentUsers = await prisma.user.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        role: true,
        status: true,
        createdAt: true,
        walletAddress: true
      }
    });

    for (const user of recentUsers) {
      const itemTitle = `New User: ${user.name || user.username || user.email}`;
      const itemDescription = `
        Email: ${user.email}
        Role: ${user.role}
        Status: ${user.status}
        ${user.username ? `Username: ${user.username}` : ''}
        ${user.walletAddress ? `Wallet: ${user.walletAddress.slice(0, 8)}...${user.walletAddress.slice(-8)}` : ''}
        Registered: ${format(user.createdAt, 'MMM dd, yyyy')}
      `.trim();

      feed.item({
        title: itemTitle,
        description: itemDescription,
        url: `${options.site_url}/users/${user.id}`,
        guid: user.id,
        categories: ['user', user.role.toLowerCase(), user.status.toLowerCase()],
        author: user.name || user.username || user.email,
        date: user.createdAt
      });
    }

    return feed.xml({ indent: true });
  }

  /**
   * Generate RSS feed for recent reports
   */
  async generateReportsFeed(options: RssFeedOptions): Promise<string> {
    const feed = new RSS({
      title: options.title,
      description: options.description,
      feed_url: options.feed_url,
      site_url: options.site_url,
      language: options.language || 'en',
      pubDate: options.pubDate || new Date(),
      ttl: options.ttl || 60
    });

    // Get recent reports from the database
    const recentReports = await prisma.report.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { name: true, email: true }
        }
      }
    });

    for (const report of recentReports) {
      const itemTitle = `Report: ${report.title}`;
      const itemDescription = `
        Type: ${report.type}
        Created by: ${report.user.name || report.user.email}
        Created: ${format(report.createdAt, 'MMM dd, yyyy')}
        ${report.data && typeof report.data === 'object' ? 
          `Data Summary: ${JSON.stringify(report.data).slice(0, 200)}...` : ''}
      `.trim();

      feed.item({
        title: itemTitle,
        description: itemDescription,
        url: `${options.site_url}/reports/${report.id}`,
        guid: report.id,
        categories: ['report', report.type.toLowerCase()],
        author: report.user.name || report.user.email,
        date: report.createdAt
      });
    }

    return feed.xml({ indent: true });
  }

  /**
   * Generate combined RSS feed for all recent activity
   */
  async generateCombinedFeed(options: RssFeedOptions): Promise<string> {
    const feed = new RSS({
      title: options.title,
      description: options.description,
      feed_url: options.feed_url,
      site_url: options.site_url,
      language: options.language || 'en',
      pubDate: options.pubDate || new Date(),
      ttl: options.ttl || 60
    });

    // Get recent activity from all relevant tables
    const [recentBills, recentPayments, recentUsers, recentReports] = await Promise.all([
      prisma.bill.findMany({
        take: 25,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { name: true, email: true } },
          utility: { select: { name: true, type: true } }
        }
      }),
      prisma.payment.findMany({
        take: 25,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { name: true, email: true } },
          bill: {
            include: {
              utility: { select: { name: true, type: true } }
            }
          }
        }
      }),
      prisma.user.findMany({
        take: 25,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          username: true,
          role: true,
          status: true,
          createdAt: true
        }
      }),
      prisma.report.findMany({
        take: 25,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { name: true, email: true } }
        }
      })
    ]);

    // Combine all activities and sort by date
    const allActivities: any[] = [];

    recentBills.forEach(bill => {
      allActivities.push({
        type: 'bill',
        title: `Bill: ${bill.utility.name} - ${bill.user.name || bill.user.email}`,
        description: `Amount: $${bill.amount}, Due: ${format(bill.dueDate, 'MMM dd, yyyy')}, Status: ${bill.status}`,
        url: `${options.site_url}/bills/${bill.id}`,
        guid: bill.id,
        categories: ['bill', bill.utility.type, bill.status.toLowerCase()],
        author: bill.user.name || bill.user.email,
        date: bill.createdAt
      });
    });

    recentPayments.forEach(payment => {
      allActivities.push({
        type: 'payment',
        title: `Payment: ${payment.bill.utility.name} - ${payment.user.name || payment.user.email}`,
        description: `Amount: $${payment.amount}, Method: ${payment.method}, Status: ${payment.status}`,
        url: `${options.site_url}/payments/${payment.id}`,
        guid: payment.id,
        categories: ['payment', payment.status.toLowerCase(), payment.method.toLowerCase()],
        author: payment.user.name || payment.user.email,
        date: payment.createdAt
      });
    });

    recentUsers.forEach(user => {
      allActivities.push({
        type: 'user',
        title: `New User: ${user.name || user.username || user.email}`,
        description: `Role: ${user.role}, Status: ${user.status}`,
        url: `${options.site_url}/users/${user.id}`,
        guid: user.id,
        categories: ['user', user.role.toLowerCase(), user.status.toLowerCase()],
        author: user.name || user.username || user.email,
        date: user.createdAt
      });
    });

    recentReports.forEach(report => {
      allActivities.push({
        type: 'report',
        title: `Report: ${report.title}`,
        description: `Type: ${report.type}, Created by: ${report.user.name || report.user.email}`,
        url: `${options.site_url}/reports/${report.id}`,
        guid: report.id,
        categories: ['report', report.type.toLowerCase()],
        author: report.user.name || report.user.email,
        date: report.createdAt
      });
    });

    // Sort by date (most recent first) and take top 50
    allActivities.sort((a, b) => b.date.getTime() - a.date.getTime());
    const topActivities = allActivities.slice(0, 50);

    // Add items to feed
    for (const activity of topActivities) {
      feed.item({
        title: activity.title,
        description: activity.description,
        url: activity.url,
        guid: activity.guid,
        categories: activity.categories,
        author: activity.author,
        date: activity.date
      });
    }

    return feed.xml({ indent: true });
  }
}

export const rssService = RssService.getInstance();
