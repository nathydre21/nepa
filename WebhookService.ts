import * as crypto from 'crypto';
import axios, { AxiosError } from 'axios';
import { logger } from './logger';
import prisma from './prismaClient';

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

class WebhookService {
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
        new URL(updates.url);
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
      // Create event record
      const payloadString = JSON.stringify(payload);
      const signature = WebhookService.generateSignature(payloadString, webhook.secret);

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
      await this.attemptWebhookDelivery(webhook, event, payload, signature, 0);
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
    signature: string,
    attemptNumber: number
  ): Promise<void> {
    try {
      const payloadString = JSON.stringify(payload);
      const headers: { [key: string]: string } = {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
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

          // Schedule retry
          setTimeout(() => {
            this.attemptWebhookDelivery(webhook, event, payload, signature, attemptNumber + 1);
          }, nextRetryDelay * 1000);

          logger.info(`Webhook delivery failed. Retry scheduled for event ${event.id} in ${nextRetryDelay}s`);
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
   * Calculate retry delay based on policy
   */
  private calculateRetryDelay(
    policy: 'EXPONENTIAL' | 'LINEAR' | 'FIXED',
    attemptNumber: number,
    baseDelay: number
  ): number {
    switch (policy) {
      case 'EXPONENTIAL':
        return baseDelay * Math.pow(2, attemptNumber);
      case 'LINEAR':
        return baseDelay * (attemptNumber + 1);
      case 'FIXED':
      default:
        return baseDelay;
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
      const signature = WebhookService.generateSignature(payloadString, webhook.secret);

      const headers = {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
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
      const signature = WebhookService.generateSignature(JSON.stringify(payload), webhook.secret);

      // Reset attempts for retry
      await prisma.webhookEvent.update({
        where: { id: eventId },
        data: {
          status: 'PENDING',
          attempts: 0,
        },
      });

      await this.attemptWebhookDelivery(webhook, event, payload, signature, 0);
      logger.info(`Webhook event retried: ${eventId}`);
    } catch (error) {
      logger.error(`Failed to retry webhook event: ${error}`);
      throw error;
    }
  }
}

export const webhookService = new WebhookService();
