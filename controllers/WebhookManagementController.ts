import { Request, Response } from 'express';
import { webhookService } from '../WebhookService';
import { webhookMonitor } from '../WebhookMonitor';
import { logger } from '../logger';
import prisma from '../prismaClient';

/**
 * Webhook Management API Controller
 */
export class WebhookManagementController {
  /**
   * Get dashboard data for webhook management UI
   * GET /api/webhooks/admin/dashboard
   */
  static async getDashboard(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId;

      const [userMetrics, userWebhooks, healthStatuses] = await Promise.all([
        webhookMonitor.getUserMetrics(userId),
        webhookService.getUserWebhooks(userId),
        webhookMonitor.getUserWebhookHealth(userId),
      ]);

      res.status(200).json({
        success: true,
        dashboard: {
          metrics: userMetrics,
          webhooks: userWebhooks.map((w) => ({
            id: w.id,
            url: w.url,
            events: w.events,
            isActive: w.isActive,
            createdAt: w.createdAt,
          })),
          healthStatuses,
        },
      });
    } catch (error) {
      logger.error(`Error getting dashboard: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  /**
   * Get webhook details with full information
   * GET /api/webhooks/admin/:webhookId
   */
  static async getWebhookDetails(req: Request, res: Response): Promise<void> {
    try {
      const { webhookId } = req.params;
      const userId = (req as any).userId;

      const webhook = await prisma.webhook.findUnique({
        where: { id: webhookId },
      });

      if (!webhook) {
        res.status(404).json({
          success: false,
          error: 'Webhook not found',
        });
        return;
      }

      if (webhook.userId !== userId) {
        res.status(403).json({
          success: false,
          error: 'Unauthorized',
        });
        return;
      }

      const [health, stats, recentEvents, recentLogs] = await Promise.all([
        webhookMonitor.checkWebhookHealth(webhookId),
        webhookMonitor.getEventStats(webhookId),
        webhookService.getWebhookEvents(webhookId, 10),
        webhookService.getWebhookLogs(webhookId, 20),
      ]);

      res.status(200).json({
        success: true,
        webhook: {
          ...webhook,
          health,
          stats,
          recentEvents,
          recentLogs,
        },
      });
    } catch (error) {
      logger.error(`Error getting webhook details: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  /**
   * Get performance report
   * GET /api/webhooks/admin/reports/performance
   */
  static async getPerformanceReport(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId;
      const { startDate, endDate } = req.query;

      const report = await webhookMonitor.generatePerformanceReport(
        userId,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );

      res.status(200).json({
        success: true,
        report,
      });
    } catch (error) {
      logger.error(`Error getting performance report: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  /**
   * Get failed deliveries
   * GET /api/webhooks/admin/failed-deliveries
   */
  static async getFailedDeliveries(req: Request, res: Response): Promise<void> {
    try {
      const { webhookId } = req.query;
      const { limit = '50' } = req.query;

      const failedDeliveries = await webhookMonitor.getFailedDeliveries(
        webhookId as string | undefined,
        parseInt(limit as string)
      );

      res.status(200).json({
        success: true,
        failedDeliveries,
      });
    } catch (error) {
      logger.error(`Error getting failed deliveries: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  /**
   * Bulk retry failed events
   * POST /api/webhooks/admin/bulk-retry
   */
  static async bulkRetryFailedEvents(req: Request, res: Response): Promise<void> {
    try {
      const { webhookId, eventIds } = req.body;
      const userId = (req as any).userId;

      // Verify ownership
      const webhook = await prisma.webhook.findUnique({
        where: { id: webhookId },
      });

      if (!webhook || webhook.userId !== userId) {
        res.status(403).json({
          success: false,
          error: 'Unauthorized',
        });
        return;
      }

      const results = [];

      for (const eventId of eventIds) {
        try {
          await webhookService.retryWebhookEvent(eventId);
          results.push({
            eventId,
            status: 'success',
          });
        } catch (error) {
          results.push({
            eventId,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      res.status(200).json({
        success: true,
        message: `Bulk retry initiated for ${results.filter((r) => r.status === 'success').length} events`,
        results,
      });
    } catch (error) {
      logger.error(`Error bulk retrying failed events: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  /**
   * Export webhook data
   * GET /api/webhooks/admin/export
   */
  static async exportWebhookData(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId;
      const { format = 'json' } = req.query;

      const [webhooks, metrics, report] = await Promise.all([
        webhookService.getUserWebhooks(userId),
        webhookMonitor.getUserMetrics(userId),
        webhookMonitor.generatePerformanceReport(userId),
      ]);

      const data = {
        webhooks,
        metrics,
        report,
        exportedAt: new Date(),
      };

      if (format === 'csv') {
        // Generate CSV
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="webhooks-export.csv"');

        let csv = 'Webhook ID,URL,Events,Status,Active\n';
        for (const webhook of webhooks) {
          csv += `${webhook.id},"${webhook.url}","${webhook.events.join(', ')}",${webhook.isActive ? 'Active' : 'Inactive'},${webhook.isActive ? 'Yes' : 'No'}\n`;
        }

        res.send(csv);
      } else {
        // Generate JSON
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="webhooks-export.json"');
        res.json(data);
      }
    } catch (error) {
      logger.error(`Error exporting webhook data: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  /**
   * Webhook analytics
   * GET /api/webhooks/admin/analytics
   */
  static async getAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId;

      const [metrics, eventStats, userHealthStatuses] = await Promise.all([
        webhookMonitor.getUserMetrics(userId),
        webhookMonitor.getEventStats(),
        webhookMonitor.getUserWebhookHealth(userId),
      ]);

      // Calculate trend data (simplified)
      const unhealthyCount = userHealthStatuses.filter((h) => !h.isHealthy).length;
      const healthyCount = userHealthStatuses.length - unhealthyCount;

      res.status(200).json({
        success: true,
        analytics: {
          metrics,
          eventStats,
          webhookHealth: {
            healthy: healthyCount,
            unhealthy: unhealthyCount,
          },
          alerts: {
            highFailureRate: metrics.failureRate > 20,
            highResponseTime: metrics.averageResponseTime > 5000,
            lowSuccessRate: metrics.successRate < 80,
            pendingDeliveries: metrics.pendingDeliveries > 100,
          },
        },
      });
    } catch (error) {
      logger.error(`Error getting analytics: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }
}

/**
 * Webhook Testing Controller
 */
export class WebhookTestingController {
  /**
   * Create test webhook event
   * POST /api/webhooks/testing/create-event
   */
  static async createTestEvent(req: Request, res: Response): Promise<void> {
    try {
      const { webhookId, eventType, payload } = req.body;
      const userId = (req as any).userId;

      // Verify ownership
      const webhook = await prisma.webhook.findUnique({
        where: { id: webhookId },
      });

      if (!webhook || webhook.userId !== userId) {
        res.status(403).json({
          success: false,
          error: 'Unauthorized',
        });
        return;
      }

      // Validate event type
      const validEvents = [
        'payment.success',
        'payment.failed',
        'bill.created',
        'bill.paid',
        'bill.overdue',
        'bill.updated',
        'user.created',
        'user.updated',
        'document.uploaded',
        'report.generated',
      ];

      if (!validEvents.includes(eventType)) {
        res.status(400).json({
          success: false,
          error: `Invalid event type: ${eventType}`,
        });
        return;
      }

      // Create test event
      await webhookService.triggerWebhook(eventType, payload || {});

      res.status(200).json({
        success: true,
        message: 'Test event created and webhook triggered',
      });
    } catch (error) {
      logger.error(`Error creating test event: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  /**
   * Get webhook test history
   * GET /api/webhooks/testing/history/:webhookId
   */
  static async getTestHistory(req: Request, res: Response): Promise<void> {
    try {
      const { webhookId } = req.params;
      const userId = (req as any).userId;
      const { limit = '20' } = req.query;

      // Verify ownership
      const webhook = await prisma.webhook.findUnique({
        where: { id: webhookId },
      });

      if (!webhook || webhook.userId !== userId) {
        res.status(403).json({
          success: false,
          error: 'Unauthorized',
        });
        return;
      }

      const events = await webhookService.getWebhookEvents(webhookId, parseInt(limit as string));

      res.status(200).json({
        success: true,
        testHistory: events.map((e) => ({
          id: e.id,
          eventType: e.eventType,
          status: e.status,
          attempts: e.attempts,
          createdAt: e.createdAt,
          lastAttempt: e.lastAttempt,
        })),
      });
    } catch (error) {
      logger.error(`Error getting test history: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  /**
   * Test webhook with custom payload
   * POST /api/webhooks/testing/test-with-payload
   */
  static async testWithPayload(req: Request, res: Response): Promise<void> {
    try {
      const { webhookId, payload } = req.body;
      const userId = (req as any).userId;

      // Verify ownership
      const webhook = await prisma.webhook.findUnique({
        where: { id: webhookId },
      });

      if (!webhook || webhook.userId !== userId) {
        res.status(403).json({
          success: false,
          error: 'Unauthorized',
        });
        return;
      }

      // Test webhook with custom payload
      const result = await webhookService.testWebhook(webhookId);

      res.status(200).json({
        success: result.success,
        testResult: result,
      });
    } catch (error) {
      logger.error(`Error testing webhook with payload: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  /**
   * Debug webhook delivery attempt
   * GET /api/webhooks/testing/debug/:eventId
   */
  static async debugDeliveryAttempt(req: Request, res: Response): Promise<void> {
    try {
      const { eventId } = req.params;
      const userId = (req as any).userId;

      const event = await prisma.webhookEvent.findUnique({
        where: { id: eventId },
        include: {
          webhook: true,
          deliveryAttempts: true,
        },
      });

      if (!event) {
        res.status(404).json({
          success: false,
          error: 'Event not found',
        });
        return;
      }

      if (event.webhook.userId !== userId) {
        res.status(403).json({
          success: false,
          error: 'Unauthorized',
        });
        return;
      }

      res.status(200).json({
        success: true,
        debugInfo: {
          event: {
            id: event.id,
            eventType: event.eventType,
            status: event.status,
            attempts: event.attempts,
            createdAt: event.createdAt,
          },
          webhook: {
            id: event.webhook.id,
            url: event.webhook.url,
            timeoutSeconds: event.webhook.timeoutSeconds,
          },
          deliveryAttempts: event.deliveryAttempts.map((a: any) => ({
            statusCode: a.statusCode,
            duration: a.duration,
            error: a.error,
            response: a.response,
            createdAt: a.createdAt,
          })),
        },
      });
    } catch (error) {
      logger.error(`Error debugging delivery attempt: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }
}
