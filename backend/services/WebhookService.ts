import * as crypto from 'crypto';
import axios, { AxiosError } from 'axios';
import { logger } from './logger';
import prisma from '../src/config/prismaClient';

export interface WebhookPayload {
  eventType: string;
  data: any;
  timestamp: number;
}

export interface RetryConfig {
  policy: 'EXPONENTIAL' | 'LINEAR' | 'FIXED';
  maxRetries: number;
  initialDelaySeconds: number;
}

// Type definitions for Prisma models
interface Webhook {
  id: string;
  userId: string;
  url: string;
  events: string[];
  secret: string;
  isActive: boolean;
  retryPolicy: 'EXPONENTIAL' | 'LINEAR' | 'FIXED';
  maxRetries: number;
  retryDelaySeconds: number;
  timeoutSeconds: number;
  headers: { [key: string]: string };
  createdAt: Date;
  updatedAt: Date;
}

interface WebhookEvent {
  id: string;
  webhookId: string;
  eventType: string;
  payload: any;
  status: 'PENDING' | 'DELIVERED' | 'FAILED';
  attempts: number;
  lastAttempt?: Date;
  nextRetry?: Date;
  deliveryUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class WebhookService {
  private isProcessingRetries = false;

  /**
   * Generate HMAC signature for webhook payload
   */
  static generateSignature(payload: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Register a new webhook
   */
  async registerWebhook(
    userId: string,
    url: string,
    events: string[],
    options?: {
      description?: string;
      retryPolicy?: 'EXPONENTIAL' | 'LINEAR' | 'FIXED';
      maxRetries?: number;
      retryDelaySeconds?: number;
      timeoutSeconds?: number;
      headers?: Record<string, string>;
    }
  ): Promise<Webhook> {
    // Validate URL
    try {
      new URL(url);
    } catch {
      throw new Error('Invalid webhook URL');
    }

    // Validate events
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

    for (const event of events) {
      if (!validEvents.includes(event)) {
        throw new Error(`Invalid event type: ${event}`);
      }
    }

    // Generate webhook secret
    const secret = crypto.randomBytes(32).toString('hex');

    try {
      const webhook = await prisma.webhook.create({
        data: {
          userId,
          url,
          events,
          secret,
          description: options?.description,
          retryPolicy: options?.retryPolicy || 'EXPONENTIAL',
          maxRetries: options?.maxRetries || 3,
          retryDelaySeconds: options?.retryDelaySeconds || 60,
          timeoutSeconds: options?.timeoutSeconds || 30,
          headers: options?.headers ? JSON.stringify(options.headers) : null,
        },
      });

      await this.logWebhookAction(webhook.id, 'CREATED', 'Webhook registered successfully');
      logger.info(`Webhook registered: ${webhook.id} for user: ${userId}`);

      return webhook;
    } catch (error) {
      logger.error(`Failed to register webhook: ${error}`);
      throw error;
    }
  }

  /**
   * Update webhook configuration
   */
  async updateWebhook(
    webhookId: string,
    updates: {
      url?: string;
      events?: string[];
      description?: string;
      isActive?: boolean;
      maxRetries?: number;
      retryDelaySeconds?: number;
      timeoutSeconds?: number;
    }
  ): Promise<Webhook> {
    try {
      if (updates.url) {
        try {
          new URL(updates.url);
        } catch {
          throw new Error('Invalid webhook URL');
        }
      }

      const webhook = await prisma.webhook.update({
        where: { id: webhookId },
        data: updates,
      });

      await this.logWebhookAction(webhookId, 'UPDATED', `Webhook updated: ${JSON.stringify(updates)}`);
      logger.info(`Webhook updated: ${webhookId}`);

      return webhook;
    } catch (error) {
      logger.error(`Failed to update webhook: ${error}`);
      throw error;
    }
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(webhookId: string): Promise<void> {
    try {
      await prisma.webhook.delete({
        where: { id: webhookId },
      });

      await this.logWebhookAction(webhookId, 'DELETED', 'Webhook deleted');
      logger.info(`Webhook deleted: ${webhookId}`);
    } catch (error) {
      logger.error(`Failed to delete webhook: ${error}`);
      throw error;
    }
  }

  /**
   * Get all webhooks for a user
   */
  async getUserWebhooks(userId: string): Promise<Webhook[]> {
    try {
      return await prisma.webhook.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      logger.error(`Failed to fetch user webhooks: ${error}`);
      throw error;
    }
  }

  /**
   * Trigger webhook - send event to all registered webhooks
   */
  async triggerWebhook(eventType: string, payload: any): Promise<void> {
    try {
      // Find all active webhooks listening to this event
      const webhooks = await prisma.webhook.findMany({
        where: {
          isActive: true,
          events: {
            has: eventType,
          },
        },
      });

      if (webhooks.length === 0) {
        logger.info(`No webhooks registered for event: ${eventType}`);
        return;
      }

      const webhookPayload: WebhookPayload = {
        eventType,
        data: payload,
        timestamp: Date.now(),
      };

      for (const webhook of webhooks) {
        await this.deliverWebhookEvent(webhook, webhookPayload);
      }
    } catch (error) {
      logger.error(`Failed to trigger webhooks for event ${eventType}: ${error}`);
      throw error;
    }
  }

  /**
   * Deliver webhook event with retry logic
   */
  private async deliverWebhookEvent(webhook: Webhook, payload: WebhookPayload): Promise<void> {
    try {
      const event = await prisma.webhookEvent.create({
        data: {
          webhookId: webhook.id,
          eventType: payload.eventType,
          payload,
          deliveryUrl: webhook.url,
          status: 'PENDING',
        },
      });

      // Attempt delivery
      await this.attemptWebhookDelivery(webhook, event, payload, 0);
    } catch (error) {
      logger.error(`Failed to deliver webhook event for webhook ${webhook.id}: ${error}`);
    }
  }

  /**
   * Attempt to deliver webhook with retry logic
   */
  private async attemptWebhookDelivery(
    webhook: Webhook,
    event: WebhookEvent,
    payload: WebhookPayload,
    attemptNumber: number
  ): Promise<void> {
    try {
      const payloadString = JSON.stringify(payload);

      // Bind the timestamp into the signed string (matching the contract
      // documented in registerWebhook's response and the convention
      // middleware/webhookSecurity.ts already uses to verify *inbound*
      // signatures) so a receiver can enforce a replay window. Computed
      // fresh per attempt, not once at event-creation time — retries can
      // now happen up to an hour later (see calculateRetryDelay's cap), so
      // a signature computed at attempt 0 would otherwise sign a
      // timestamp that's long since expired by the time a retry fires.
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = WebhookService.generateSignature(`${timestamp}.${payloadString}`, webhook.secret);

      const headers: { [key: string]: string } = {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Timestamp': String(timestamp),
        'X-Webhook-ID': webhook.id,
        'X-Event-Type': payload.eventType,
        'X-Delivery-ID': event.id,
        ...(webhook.headers ? JSON.parse(webhook.headers as any) : {}),
      };

      const startTime = Date.now();

      try {
        const response = await axios.post(webhook.url, payloadString, {
          headers,
          timeout: webhook.timeoutSeconds * 1000,
        });

        const duration = Date.now() - startTime;

        // Record successful attempt
        await prisma.webhookAttempt.create({
          data: {
            eventId: event.id,
            statusCode: response.status,
            response: JSON.stringify(response.data),
            duration,
          },
        });

        // Update event status
        await prisma.webhookEvent.update({
          where: { id: event.id },
          data: {
            status: 'DELIVERED',
            attempts: attemptNumber + 1,
            lastAttempt: new Date(),
          },
        });

        await this.logWebhookAction(webhook.id, 'TRIGGERED', `Event ${payload.eventType} delivered successfully`);
        logger.info(`Webhook delivered successfully for event ${event.id}`);
      } catch (error) {
        const duration = Date.now() - startTime;
        const axiosError = error as AxiosError;

        // Record failed attempt
        await prisma.webhookAttempt.create({
          data: {
            eventId: event.id,
            statusCode: axiosError.response?.status,
            response: axiosError.response ? JSON.stringify(axiosError.response.data) : null,
            error: axiosError.message,
            duration,
          },
        });

        // Determine if retry should happen
        if (attemptNumber < webhook.maxRetries) {
          const nextRetryDelay = this.calculateRetryDelay(
            webhook.retryPolicy as 'EXPONENTIAL' | 'LINEAR' | 'FIXED',
            attemptNumber,
            webhook.retryDelaySeconds
          );

          const nextRetryTime = new Date(Date.now() + nextRetryDelay * 1000);

          await prisma.webhookEvent.update({
            where: { id: event.id },
            data: {
              attempts: attemptNumber + 1,
              lastAttempt: new Date(),
              nextRetry: nextRetryTime,
            },
          });

          // No in-process timer here: an in-process setTimeout doesn't
          // survive a restart, silently dropping the retry. nextRetry is
          // persisted instead, and WebhookQueueService's interval drains
          // due events via processPendingRetries() below.
          logger.info(`Webhook delivery failed. Retry due for event ${event.id} in ${nextRetryDelay}s`);
        } else {
          // Max retries exceeded
          await prisma.webhookEvent.update({
            where: { id: event.id },
            data: {
              status: 'FAILED',
              attempts: attemptNumber + 1,
              lastAttempt: new Date(),
            },
          });

          await this.logWebhookAction(webhook.id, 'FAILED', `Event ${payload.eventType} failed after ${attemptNumber + 1} attempts`);
          logger.error(`Webhook delivery failed permanently for event ${event.id} after ${attemptNumber + 1} attempts`);
        }
      }
    } catch (error) {
      logger.error(`Error during webhook delivery attempt: ${error}`);
    }
  }

  /**
   * Maximum retry delay, regardless of policy or attempt count. Without
   * this, EXPONENTIAL backoff is unbounded (baseDelay * 2^attempt) and can
   * reach multi-hour delays after a handful of failures.
   */
  private static readonly MAX_RETRY_DELAY_SECONDS = 3600; // 1 hour

  /**
   * Calculate retry delay based on policy, capped and jittered.
   *
   * Jitter uses the "equal jitter" pattern (delay in [capped/2, capped])
   * rather than full jitter (delay in [0, capped]): it still spreads out
   * retries to avoid a thundering herd when many events fail at once, but
   * never lets the delay collapse toward zero the way full jitter can.
   */
  private calculateRetryDelay(
    policy: 'EXPONENTIAL' | 'LINEAR' | 'FIXED',
    attemptNumber: number,
    baseDelay: number
  ): number {
    let delay: number;
    switch (policy) {
      case 'EXPONENTIAL':
        delay = baseDelay * Math.pow(2, attemptNumber);
        break;
      case 'LINEAR':
        delay = baseDelay * (attemptNumber + 1);
        break;
      case 'FIXED':
      default:
        delay = baseDelay;
        break;
    }

    const capped = Math.min(delay, WebhookService.MAX_RETRY_DELAY_SECONDS);
    return capped / 2 + Math.random() * (capped / 2);
  }

  /**
   * Resume delivery for WebhookEvents whose scheduled retry time has
   * passed. This is what actually executes retries now that
   * attemptWebhookDelivery only persists nextRetry instead of scheduling
   * an in-process timer — called on an interval by WebhookQueueService.
   */
  async processPendingRetries(): Promise<void> {
    if (this.isProcessingRetries) {
      return; // previous batch still running; let it finish before starting another
    }
    this.isProcessingRetries = true;

    try {
      const dueEvents = await prisma.webhookEvent.findMany({
        where: {
          status: 'PENDING',
          nextRetry: { lte: new Date() },
        },
        orderBy: { nextRetry: 'asc' },
        take: 20,
      });

      for (const event of dueEvents) {
        const webhook = await prisma.webhook.findUnique({
          where: { id: event.webhookId },
        });

        if (!webhook || !webhook.isActive) {
          await prisma.webhookEvent.update({
            where: { id: event.id },
            data: { status: 'FAILED', lastAttempt: new Date() },
          });
          await this.logWebhookAction(
            event.webhookId,
            'FAILED',
            'Webhook was deleted or deactivated before its scheduled retry could run'
          );
          continue;
        }

        const payload: WebhookPayload = JSON.parse(JSON.stringify(event.payload));

        await this.attemptWebhookDelivery(webhook, event, payload, event.attempts);
      }
    } catch (error) {
      logger.error(`Failed to process pending webhook retries: ${error}`);
    } finally {
      this.isProcessingRetries = false;
    }
  }

  /**
   * Get webhook event history
   */
  async getWebhookEvents(webhookId: string, limit: number = 50): Promise<WebhookEvent[]> {
    try {
      return await prisma.webhookEvent.findMany({
        where: { webhookId },
        include: {
          deliveryAttempts: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    } catch (error) {
      logger.error(`Failed to fetch webhook events: ${error}`);
      throw error;
    }
  }

  /**
   * Get webhook statistics
   */
  async getWebhookStats(webhookId: string): Promise<{
    totalEvents: number;
    successfulDeliveries: number;
    failedDeliveries: number;
    pendingDeliveries: number;
    successRate: number;
    averageResponseTime: number;
  }> {
    try {
      const events = await prisma.webhookEvent.findMany({
        where: { webhookId },
        include: {
          deliveryAttempts: true,
        },
      });

      const totalEvents = events.length;
      const successfulDeliveries = events.filter((e: any) => e.status === 'DELIVERED').length;
      const failedDeliveries = events.filter((e: any) => e.status === 'FAILED').length;
      const pendingDeliveries = events.filter((e: any) => e.status === 'PENDING').length;

      const successRate = totalEvents > 0 ? (successfulDeliveries / totalEvents) * 100 : 0;

      const totalTime = events.reduce((sum: number, event: any) => {
        const avgTime = event.deliveryAttempts.reduce((sum: number, attempt: any) => sum + (attempt.duration || 0), 0) / (event.deliveryAttempts.length || 1);
        return sum + avgTime;
      }, 0);

      const averageResponseTime = events.length > 0 ? totalTime / events.length : 0;

      return {
        totalEvents,
        successfulDeliveries,
        failedDeliveries,
        pendingDeliveries,
        successRate,
        averageResponseTime,
      };
    } catch (error) {
      logger.error(`Failed to get webhook stats: ${error}`);
      throw error;
    }
  }

  /**
   * Log webhook action
   */
  private async logWebhookAction(webhookId: string, action: string, details?: string): Promise<void> {
    try {
      await prisma.webhookLog.create({
        data: {
          webhookId,
          action,
          details,
          status: 'SUCCESS',
        },
      });
    } catch (error) {
      logger.error(`Failed to log webhook action: ${error}`);
    }
  }

  /**
   * Get webhook logs
   */
  async getWebhookLogs(webhookId: string, limit: number = 100): Promise<any[]> {
    try {
      return await prisma.webhookLog.findMany({
        where: { webhookId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    } catch (error) {
      logger.error(`Failed to fetch webhook logs: ${error}`);
      throw error;
    }
  }

  /**
   * Test webhook delivery
   */
  async testWebhook(webhookId: string): Promise<{
    success: boolean;
    statusCode?: number;
    responseTime: number;
    error?: string;
  }> {
    try {
      const webhook = await prisma.webhook.findUnique({
        where: { id: webhookId },
      });

      if (!webhook) {
        throw new Error('Webhook not found');
      }

      const testPayload: WebhookPayload = {
        eventType: 'webhook.test',
        data: { test: true, timestamp: Date.now() },
        timestamp: Date.now(),
      };

      const payloadString = JSON.stringify(testPayload);
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = WebhookService.generateSignature(`${timestamp}.${payloadString}`, webhook.secret);

      const headers = {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Timestamp': String(timestamp),
        'X-Webhook-ID': webhook.id,
        'X-Event-Type': 'webhook.test',
        'X-Test-Delivery': 'true',
        ...(webhook.headers ? JSON.parse(webhook.headers) : {}),
      };

      const startTime = Date.now();

      try {
        const response = await axios.post(webhook.url, payloadString, {
          headers,
          timeout: webhook.timeoutSeconds * 1000,
        });

        const responseTime = Date.now() - startTime;

        await this.logWebhookAction(webhook.id, 'TESTED', `Test delivery successful (${response.status})`);

        return {
          success: true,
          statusCode: response.status,
          responseTime,
        };
      } catch (error) {
        const responseTime = Date.now() - startTime;
        const axiosError = error as AxiosError;

        await this.logWebhookAction(webhook.id, 'TESTED', `Test delivery failed: ${axiosError.message}`);

        return {
          success: false,
          statusCode: axiosError.response?.status,
          responseTime,
          error: axiosError.message,
        };
      }
    } catch (error) {
      logger.error(`Failed to test webhook: ${error}`);
      throw error;
    }
  }

  /**
   * Process a received (inbound) webhook event, i.e. one sent to this
   * server by an external caller via WebhookController.receiveWebhook,
   * after signature verification has already passed.
   *
   * This only records that the event was received and processed; it does
   * not dispatch to any eventType-specific business logic, since no such
   * handler registry exists in this codebase yet.
   */
  async processWebhookEvent(eventId: string): Promise<void> {
    try {
      const event = await prisma.webhookEvent.findUnique({
        where: { id: eventId },
      });

      if (!event) {
        throw new Error('Webhook event not found');
      }

      await prisma.webhookEvent.update({
        where: { id: eventId },
        data: {
          status: 'DELIVERED',
          lastAttempt: new Date(),
        },
      });

      await this.logWebhookAction(event.webhookId, 'RECEIVED', `Event ${event.eventType} processed successfully`);
      logger.info(`Webhook event processed: ${eventId}`);
    } catch (error) {
      logger.error(`Failed to process webhook event: ${error}`);
      throw error;
    }
  }

  /**
   * Retry failed webhook event
   */
  async retryWebhookEvent(eventId: string): Promise<void> {
    try {
      const event = await prisma.webhookEvent.findUnique({
        where: { id: eventId },
      });

      if (!event) {
        throw new Error('Event not found');
      }

      const webhook = await prisma.webhook.findUnique({
        where: { id: event.webhookId },
      });

      if (!webhook) {
        throw new Error('Webhook not found');
      }

      const payload: WebhookPayload = JSON.parse(JSON.stringify(event.payload));

      // Reset attempts for retry
      await prisma.webhookEvent.update({
        where: { id: eventId },
        data: {
          status: 'PENDING',
          attempts: 0,
        },
      });

      await this.attemptWebhookDelivery(webhook, event, payload, 0);
      logger.info(`Webhook event retried: ${eventId}`);
    } catch (error) {
      logger.error(`Failed to retry webhook event: ${error}`);
      throw error;
    }
  }
}

export const webhookService = new WebhookService();
