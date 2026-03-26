import { Request, Response } from 'express';
import { rssService } from './RssService';

export class RssController {
  /**
   * Generate RSS feed for recent bills
   */
  async getBillsFeed(req: Request, res: Response) {
    try {
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      const feedXml = await rssService.generateBillsFeed({
        title: 'NEPA - Recent Bills',
        description: 'RSS feed for recent bills and payments in the NEPA system',
        feed_url: `${baseUrl}/api/rss/bills`,
        site_url: baseUrl,
        language: 'en',
        ttl: 60
      });

      res.set('Content-Type', 'application/rss+xml');
      res.send(feedXml);
    } catch (error) {
      console.error('Error generating bills RSS feed:', error);
      res.status(500).json({ error: 'Failed to generate RSS feed' });
    }
  }

  /**
   * Generate RSS feed for recent payments
   */
  async getPaymentsFeed(req: Request, res: Response) {
    try {
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      const feedXml = await rssService.generatePaymentsFeed({
        title: 'NEPA - Recent Payments',
        description: 'RSS feed for recent payments in the NEPA system',
        feed_url: `${baseUrl}/api/rss/payments`,
        site_url: baseUrl,
        language: 'en',
        ttl: 60
      });

      res.set('Content-Type', 'application/rss+xml');
      res.send(feedXml);
    } catch (error) {
      console.error('Error generating payments RSS feed:', error);
      res.status(500).json({ error: 'Failed to generate RSS feed' });
    }
  }

  /**
   * Generate RSS feed for recent user registrations
   */
  async getUsersFeed(req: Request, res: Response) {
    try {
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      const feedXml = await rssService.generateUsersFeed({
        title: 'NEPA - New Users',
        description: 'RSS feed for new user registrations in the NEPA system',
        feed_url: `${baseUrl}/api/rss/users`,
        site_url: baseUrl,
        language: 'en',
        ttl: 60
      });

      res.set('Content-Type', 'application/rss+xml');
      res.send(feedXml);
    } catch (error) {
      console.error('Error generating users RSS feed:', error);
      res.status(500).json({ error: 'Failed to generate RSS feed' });
    }
  }

  /**
   * Generate RSS feed for recent reports
   */
  async getReportsFeed(req: Request, res: Response) {
    try {
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      const feedXml = await rssService.generateReportsFeed({
        title: 'NEPA - Recent Reports',
        description: 'RSS feed for recent reports in the NEPA system',
        feed_url: `${baseUrl}/api/rss/reports`,
        site_url: baseUrl,
        language: 'en',
        ttl: 60
      });

      res.set('Content-Type', 'application/rss+xml');
      res.send(feedXml);
    } catch (error) {
      console.error('Error generating reports RSS feed:', error);
      res.status(500).json({ error: 'Failed to generate RSS feed' });
    }
  }

  /**
   * Generate combined RSS feed for all recent activity
   */
  async getCombinedFeed(req: Request, res: Response) {
    try {
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      const feedXml = await rssService.generateCombinedFeed({
        title: 'NEPA - Recent Activity',
        description: 'RSS feed for all recent activity in the NEPA system including bills, payments, users, and reports',
        feed_url: `${baseUrl}/api/rss/activity`,
        site_url: baseUrl,
        language: 'en',
        ttl: 60
      });

      res.set('Content-Type', 'application/rss+xml');
      res.send(feedXml);
    } catch (error) {
      console.error('Error generating combined RSS feed:', error);
      res.status(500).json({ error: 'Failed to generate RSS feed' });
    }
  }

  /**
   * Get RSS feed information and available feeds
   */
  async getFeedInfo(req: Request, res: Response) {
    try {
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      
      const feeds = [
        {
          name: 'Recent Bills',
          description: 'Latest bills created in the system',
          url: `${baseUrl}/api/rss/bills`,
          category: 'bills'
        },
        {
          name: 'Recent Payments',
          description: 'Latest payments processed in the system',
          url: `${baseUrl}/api/rss/payments`,
          category: 'payments'
        },
        {
          name: 'New Users',
          description: 'Latest user registrations',
          url: `${baseUrl}/api/rss/users`,
          category: 'users'
        },
        {
          name: 'Recent Reports',
          description: 'Latest reports generated',
          url: `${baseUrl}/api/rss/reports`,
          category: 'reports'
        },
        {
          name: 'All Activity',
          description: 'Combined feed of all recent activity',
          url: `${baseUrl}/api/rss/activity`,
          category: 'combined'
        }
      ];

      res.json({
        title: 'NEPA RSS Feeds',
        description: 'Available RSS feeds for monitoring NEPA system activity',
        baseUrl,
        feeds
      });
    } catch (error) {
      console.error('Error getting feed info:', error);
      res.status(500).json({ error: 'Failed to get feed information' });
    }
  }
}

export const rssController = new RssController();
