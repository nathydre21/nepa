import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { webhookService } from '../WebhookService';
import { logger } from '../logger';
import prisma from '../prismaClient';
import { errorResponse } from '../utils/errorResponse';

export class WebhookController {
  /**
   * SECURITY (Issue #415): Receive and process an incoming webhook event.
   *
   * This endpoint handles incoming webhook requests from external services.
   * It MUST be protected by the `verifyWebhookSignature` middleware, which:
   *   1. Verifies the HMAC-SHA256 signature using the webhook's stored secret
   *   2. Validates the timestamp to prevent replay attacks (max 5 min old)
   *   3. Uses constant-time comparison to prevent timing attacks
   *   4. Logs all verification failures for security monitoring
   *
   * Route: POST /api/webhooks/:webhookId/receive
   * Middleware: verifyWebhookSignature (must be applied in route definition)
   *
   * Required headers (verified by middleware before reaching this handler):
   *   - x-webhook-signature: HMAC-SHA256(timestamp + "." + body, webhookSecret)
   *   - x-webhook-id: The webhook's unique identifier
   *   - x-webhook-timestamp: Unix timestamp (seconds) when the request was sent
   *
   * @param req Express request — req.webhookId and req.webhookVerified are set by middleware
   * @param res Express response
   */
  static async receiveWebhook(req: Request, res: Response): Promise<void> {
    try {
      // The verifyWebhookSignature middleware has already verified:
      //   - The signature is valid (HMAC-SHA256 with timing-safe comparison)
      //   - The timestamp is within the allowed window (prevents replay attacks)
      //   - The webhook exists and is active
      //   - req.webhookId and req.webhookVerified are set
      const webhookId = (req as any).webhookId;
      const isVerified = (req as any).webhookVerified;

      // SECURITY: Double-check that the middleware verified the request
      // This is a defense-in-depth measure — if the middleware was bypassed
      // or misconfigured, we reject the request here
      if (!isVerified || !webhookId) {
        logger.error(`[SECURITY] Webhook receive endpoint called without signature verification. webhookId=${webhookId}, verified=${isVerified}`);
        errorResponse(res, 403, 'Webhook signature verification is required');
        return;
      }

      const { eventType, data } = req.body;

      // Validate the event type is provided
      if (!eventType) {
        logger.warn(`Webhook ${webhookId} received payload without eventType`);
        errorResponse(res, 400, 'eventType is required in webhook payload');
        return;
      }

      // Validate the event type is in the webhook's subscribed events list
      const webhook = await prisma.webhook.findUnique({
        where: { id: webhookId },
        select: { events: true, userId: true },
      });

      if (!webhook) {
        logger.warn(`[SECURITY] Webhook ${webhookId} not found during receive`);
        errorResponse(res, 404, 'Webhook not found');
        return;
      }

      // Check if this webhook is subscribed to this event type
      // This prevents an attacker from sending arbitrary event types even
      // with a valid signature — the webhook only processes events it subscribed to
      if (!webhook.events.includes(eventType)) {
        logger.warn(`[SECURITY] Webhook ${webhookId} received unsubscribed event type: ${eventType}`);
        errorResponse(res, 400, `Webhook is not subscribed to event type: ${eventType}`);
        return;
      }

      // Log the received webhook event for audit trail
      logger.info(`Webhook ${webhookId} received verified event: ${eventType}`);

      // Store the webhook event in the database for processing and tracking
      const webhookEvent = await prisma.webhookEvent.create({
        data: {
          webhookId,
          eventType,
          payload: JSON.stringify(data || {}),
          status: 'PENDING',
        },
      });

      // Trigger the webhook processing pipeline
      // The webhookService handles delivery, retries, and logging
      await webhookService.processWebhookEvent(webhookEvent.id).catch((err: any) => {
        logger.error(`Error processing webhook event ${webhookEvent.id}: ${err}`);
      });

      // Return 200 immediately — webhook processing is asynchronous
      // This follows the webhook best practice of responding quickly and
      // process the payload asynchronously
      res.status(200).json({
        success: true,
        message: 'Webhook received and verified successfully',
        eventId: webhookEvent.id,
        eventType,
      });
    } catch (error) {
      logger.error(`Error receiving webhook: ${error}`);
      errorResponse(res, 500, error instanceof Error ? error.message : 'Internal server error');
    }
  }

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
        errorResponse(res, 400, 'URL and events array are required');
        return;
      }

      if (!Array.isArray(events)) {
        errorResponse(res, 400, 'Events must be an array');
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

      // SECURITY (Issue #415): The signing secret is returned only once during
      // registration. The user must store it securely — it will not be shown
      // again. This secret is used to verify the signature on incoming webhook
      // requests (see receiveWebhook endpoint and verifyWebhookSignature middleware).
      res.status(201).json({
        success: true,
        message: 'Webhook registered successfully. Store your signing secret securely — it will NOT be shown again.',
        webhook: {
          id: webhook.id,
          url: webhook.url,
          events: webhook.events,
          secret: webhook.secret, // Only returned once — user must save this
          createdAt: webhook.createdAt,
        },
        // SECURITY: Document how to sign webhook requests
        signatureInstructions: {
          algorithm: 'HMAC-SHA256',
          headerName: 'x-webhook-signature',
          timestampHeader: 'x-webhook-timestamp',
          format: 'HMAC-SHA256(timestamp + "." + JSON.stringify(body), secret)',
          maxAgeSeconds: 300,
        },
      });
    } catch (error) {
      logger.error(`Error registering webhook: ${error}`);
      errorResponse(res, 500, error instanceof Error ? error.message : 'Internal server error');
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
      errorResponse(res, 500, error instanceof Error ? error.message : 'Internal server error');
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
        errorResponse(res, 404, 'Webhook not found');
        return;
      }

      if (webhook.userId !== userId) {
        errorResponse(res, 403, 'Unauthorized');
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
      errorResponse(res, 500, error instanceof Error ? error.message : 'Internal server error');
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
        errorResponse(res, 404, 'Webhook not found');
        return;
      }

      if (webhook.userId !== userId) {
        errorResponse(res, 403, 'Unauthorized');
        return;
      }

      await webhookService.deleteWebhook(webhookId);

      res.status(200).json({
        success: true,
        message: 'Webhook deleted successfully',
      });
    } catch (error) {
      logger.error(`Error deleting webhook: ${error}`);
      errorResponse(res, 500, error instanceof Error ? error.message : 'Internal server error');
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
        errorResponse(res, 404, 'Webhook not found');
        return;
      }

      if (webhook.userId !== userId) {
        errorResponse(res, 403, 'Unauthorized');
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
      errorResponse(res, 500, error instanceof Error ? error.message : 'Internal server error');
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
        errorResponse(res, 404, 'Webhook not found');
        return;
      }

      if (webhook.userId !== userId) {
        errorResponse(res, 403, 'Unauthorized');
        return;
      }

      const stats = await webhookService.getWebhookStats(webhookId);

      res.status(200).json({
        success: true,
        stats,
      });
    } catch (error) {
      logger.error(`Error fetching webhook stats: ${error}`);
      errorResponse(res, 500, error instanceof Error ? error.message : 'Internal server error');
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
        errorResponse(res, 404, 'Webhook not found');
        return;
      }

      if (webhook.userId !== userId) {
        errorResponse(res, 403, 'Unauthorized');
        return;
      }

      const result = await webhookService.testWebhook(webhookId);

      res.status(200).json({
        success: result.success,
        result,
      });
    } catch (error) {
      logger.error(`Error testing webhook: ${error}`);
      errorResponse(res, 500, error instanceof Error ? error.message : 'Internal server error');
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
        errorResponse(res, 404, 'Webhook not found');
        return;
      }

      if (webhook.userId !== userId) {
        errorResponse(res, 403, 'Unauthorized');
        return;
      }

      // Verify event belongs to webhook
      const event = await prisma.webhookEvent.findUnique({
        where: { id: eventId },
      });

      if (!event || event.webhookId !== webhookId) {
        errorResponse(res, 404, 'Event not found');
        return;
      }

      await webhookService.retryWebhookEvent(eventId);

      res.status(200).json({
        success: true,
        message: 'Webhook event retry initiated',
      });
    } catch (error) {
      logger.error(`Error retrying webhook event: ${error}`);
      errorResponse(res, 500, error instanceof Error ? error.message : 'Internal server error');
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
        errorResponse(res, 404, 'Webhook not found');
        return;
      }

      if (webhook.userId !== userId) {
        errorResponse(res, 403, 'Unauthorized');
        return;
      }

      const logs = await webhookService.getWebhookLogs(webhookId, parseInt(limit as string));

      res.status(200).json({
        success: true,
        logs,
      });
    } catch (error) {
      logger.error(`Error fetching webhook logs: ${error}`);
      errorResponse(res, 500, error instanceof Error ? error.message : 'Internal server error');
    }
  }
}
