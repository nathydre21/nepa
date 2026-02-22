import { Request, Response } from 'express';
import { webhookService } from '../WebhookService';
import { logger } from '../logger';
import prisma from '../prismaClient';

export class WebhookController {
  /**
   * Register a new webhook
   * POST /api/webhooks
   */
  static async registerWebhook(req: Request, res: Response): Promise<void> {
    try {
      const { url, events, description, retryPolicy, maxRetries, retryDelaySeconds, timeoutSeconds, headers } = req.body;
      const userId = (req as any).userId;

      // Validation
      if (!url || !events || events.length === 0) {
        res.status(400).json({
          success: false,
          error: 'URL and events array are required',
        });
        return;
      }

      if (!Array.isArray(events)) {
        res.status(400).json({
          success: false,
          error: 'Events must be an array',
        });
        return;
      }

      const webhook = await webhookService.registerWebhook(userId, url, events, {
        description,
        retryPolicy: retryPolicy || 'EXPONENTIAL',
        maxRetries: maxRetries || 3,
        retryDelaySeconds: retryDelaySeconds || 60,
        timeoutSeconds: timeoutSeconds || 30,
        headers,
      });

      logger.info(`Webhook registered by user ${userId}: ${webhook.id}`);

      res.status(201).json({
        success: true,
        message: 'Webhook registered successfully',
        webhook: {
          id: webhook.id,
          url: webhook.url,
          events: webhook.events,
          secret: webhook.secret,
          createdAt: webhook.createdAt,
        },
      });
    } catch (error) {
      logger.error(`Error registering webhook: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  /**
   * Get all webhooks for current user
   * GET /api/webhooks
   */
  static async getUserWebhooks(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId;

      const webhooks = await webhookService.getUserWebhooks(userId);

      res.status(200).json({
        success: true,
        webhooks: webhooks.map((w: any) => ({
          id: w.id,
          url: w.url,
          events: w.events,
          description: w.description,
          isActive: w.isActive,
          retryPolicy: w.retryPolicy,
          maxRetries: w.maxRetries,
          createdAt: w.createdAt,
          updatedAt: w.updatedAt,
        })),
      });
    } catch (error) {
      logger.error(`Error fetching webhooks: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  /**
   * Update webhook configuration
   * PUT /api/webhooks/:webhookId
   */
  static async updateWebhook(req: Request, res: Response): Promise<void> {
    try {
      const { webhookId } = req.params;
      const userId = (req as any).userId;
      const updates = req.body;

      // Verify ownership
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

      const updated = await webhookService.updateWebhook(webhookId, updates);

      res.status(200).json({
        success: true,
        message: 'Webhook updated successfully',
        webhook: {
          id: updated.id,
          url: updated.url,
          events: updated.events,
          isActive: updated.isActive,
          updatedAt: updated.updatedAt,
        },
      });
    } catch (error) {
      logger.error(`Error updating webhook: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  /**
   * Delete webhook
   * DELETE /api/webhooks/:webhookId
   */
  static async deleteWebhook(req: Request, res: Response): Promise<void> {
    try {
      const { webhookId } = req.params;
      const userId = (req as any).userId;

      // Verify ownership
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

      await webhookService.deleteWebhook(webhookId);

      res.status(200).json({
        success: true,
        message: 'Webhook deleted successfully',
      });
    } catch (error) {
      logger.error(`Error deleting webhook: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  /**
   * Get webhook event history
   * GET /api/webhooks/:webhookId/events
   */
  static async getWebhookEvents(req: Request, res: Response): Promise<void> {
    try {
      const { webhookId } = req.params;
      const userId = (req as any).userId;
      const { limit = '50' } = req.query;

      // Verify ownership
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

      const events = await webhookService.getWebhookEvents(webhookId, parseInt(limit as string));

      res.status(200).json({
        success: true,
        events: events.map((e: any) => ({
          id: e.id,
          eventType: e.eventType,
          status: e.status,
          attempts: e.attempts,
          lastAttempt: e.lastAttempt,
          nextRetry: e.nextRetry,
          createdAt: e.createdAt,
          deliveryAttempts: e.deliveryAttempts,
        })),
      });
    } catch (error) {
      logger.error(`Error fetching webhook events: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  /**
   * Get webhook statistics
   * GET /api/webhooks/:webhookId/stats
   */
  static async getWebhookStats(req: Request, res: Response): Promise<void> {
    try {
      const { webhookId } = req.params;
      const userId = (req as any).userId;

      // Verify ownership
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

      const stats = await webhookService.getWebhookStats(webhookId);

      res.status(200).json({
        success: true,
        stats,
      });
    } catch (error) {
      logger.error(`Error fetching webhook stats: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  /**
   * Test webhook delivery
   * POST /api/webhooks/:webhookId/test
   */
  static async testWebhook(req: Request, res: Response): Promise<void> {
    try {
      const { webhookId } = req.params;
      const userId = (req as any).userId;

      // Verify ownership
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

      const result = await webhookService.testWebhook(webhookId);

      res.status(200).json({
        success: result.success,
        result,
      });
    } catch (error) {
      logger.error(`Error testing webhook: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  /**
   * Retry failed webhook event
   * POST /api/webhooks/:webhookId/events/:eventId/retry
   */
  static async retryWebhookEvent(req: Request, res: Response): Promise<void> {
    try {
      const { webhookId, eventId } = req.params;
      const userId = (req as any).userId;

      // Verify ownership
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

      // Verify event belongs to webhook
      const event = await prisma.webhookEvent.findUnique({
        where: { id: eventId },
      });

      if (!event || event.webhookId !== webhookId) {
        res.status(404).json({
          success: false,
          error: 'Event not found',
        });
        return;
      }

      await webhookService.retryWebhookEvent(eventId);

      res.status(200).json({
        success: true,
        message: 'Webhook event retry initiated',
      });
    } catch (error) {
      logger.error(`Error retrying webhook event: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  /**
   * Get webhook logs
   * GET /api/webhooks/:webhookId/logs
   */
  static async getWebhookLogs(req: Request, res: Response): Promise<void> {
    try {
      const { webhookId } = req.params;
      const userId = (req as any).userId;
      const { limit = '100' } = req.query;

      // Verify ownership
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

      const logs = await webhookService.getWebhookLogs(webhookId, parseInt(limit as string));

      res.status(200).json({
        success: true,
        logs,
      });
    } catch (error) {
      logger.error(`Error fetching webhook logs: ${error}`);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }
}
