import { logger } from './logger';
import prisma from '../src/config/prismaClient';
import { EventEmitter } from 'events';

export interface QueuedWebhookEvent {
  id: string;
  webhookId: string;
  eventType: string;
  payload: any;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  scheduledFor?: Date;
  maxRetries: number;
  retryDelay: number;
  timeoutSeconds: number;
  headers?: Record<string, string>;
  createdAt: Date;
}

export interface QueueMetrics {
  totalQueued: number;
  pendingByPriority: Record<string, number>;
  processingCount: number;
  failedCount: number;
  averageProcessingTime: number;
  throughputPerMinute: number;
}

class WebhookQueueService extends EventEmitter {
  private processingQueue: Map<string, boolean> = new Map();
  private queueProcessorInterval?: NodeJS.Timeout;
  private isShuttingDown = false;

  constructor() {
    super();
    this.startQueueProcessor();
  }

  /**
   * Add webhook event to queue with priority
   */
  async addToQueue(
    webhookId: string,
    eventType: string,
    payload: any,
    options: {
      priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
      scheduledFor?: Date;
      maxRetries?: number;
      retryDelay?: number;
      timeoutSeconds?: number;
      headers?: Record<string, string>;
    } = {}
  ): Promise<string> {
    try {
      const webhook = await prisma.webhook.findUnique({
        where: { id: webhookId },
      });

      if (!webhook) {
        throw new Error(`Webhook not found: ${webhookId}`);
      }

      const queuedEvent = await prisma.webhookQueue.create({
        data: {
          webhookId,
          eventType,
          payload,
          priority: options.priority || this.determinePriority(eventType),
          scheduledFor: options.scheduledFor || new Date(),
          maxRetries: options.maxRetries || webhook.maxRetries,
          retryDelay: options.retryDelay || webhook.retryDelaySeconds,
          timeoutSeconds: options.timeoutSeconds || webhook.timeoutSeconds,
          headers: options.headers || (webhook.headers as any) || null,
          status: 'QUEUED',
        },
      });

      this.emit('eventQueued', queuedEvent);
      logger.info(`Webhook event queued: ${queuedEvent.id} with priority: ${queuedEvent.priority}`);

      return queuedEvent.id;
    } catch (error) {
      logger.error(`Failed to queue webhook event: ${error}`);
      throw error;
    }
  }

  /**
   * Determine event priority based on event type
   */
  private determinePriority(eventType: string): 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL' {
    const criticalEvents = ['payment.failed', 'user.suspended', 'security.breach'];
    const highEvents = ['payment.success', 'bill.overdue', 'user.created'];
    const lowEvents = ['report.generated', 'document.uploaded'];

    if (criticalEvents.includes(eventType)) return 'CRITICAL';
    if (highEvents.includes(eventType)) return 'HIGH';
    if (lowEvents.includes(eventType)) return 'LOW';
    return 'NORMAL';
  }

  /**
   * Start the queue processor
   */
  private startQueueProcessor(): void {
    this.queueProcessorInterval = setInterval(async () => {
      if (!this.isShuttingDown) {
        await this.processQueue();
      }
    }, 5000); // Process every 5 seconds

    logger.info('Webhook queue processor started');
  }

  /**
   * Process queued webhook events
   */
  private async processQueue(): Promise<void> {
    try {
      // Get events ordered by priority and creation time
      const events = await prisma.webhookQueue.findMany({
        where: {
          status: 'QUEUED',
          scheduledFor: {
            lte: new Date(),
          },
        },
        orderBy: [
          { priority: 'desc' }, // CRITICAL, HIGH, NORMAL, LOW
          { createdAt: 'asc' },
        ],
        take: 10, // Process in batches
      });

      for (const event of events) {
        if (this.processingQueue.has(event.id)) {
          continue; // Skip if already processing
        }

        this.processingQueue.set(event.id, true);
        
        // Process in background to not block the queue
        this.processWebhookEvent(event).finally(() => {
          this.processingQueue.delete(event.id);
        });
      }
    } catch (error) {
      logger.error(`Error processing webhook queue: ${error}`);
    }
  }

  /**
   * Process individual webhook event
   */
  private async processWebhookEvent(event: any): Promise<void> {
    try {
      await prisma.webhookQueue.update({
        where: { id: event.id },
        data: { status: 'PROCESSING', startedAt: new Date() },
      });

      const webhook = await prisma.webhook.findUnique({
        where: { id: event.webhookId },
      });

      if (!webhook) {
        await this.markEventFailed(event.id, 'Webhook not found');
        return;
      }

      // Generate signature
      const payloadString = JSON.stringify(event.payload);
      const signature = this.generateSignature(payloadString, webhook.secret);

      // Prepare headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-ID': webhook.id,
        'X-Event-Type': event.eventType,
        'X-Queue-ID': event.id,
        'X-Priority': event.priority,
        ...(event.headers ? JSON.parse(event.headers as any) : {}),
      };

      const startTime = Date.now();

      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body: payloadString,
          signal: AbortSignal.timeout(event.timeoutSeconds * 1000),
        });

        const duration = Date.now() - startTime;

        if (response.ok) {
          await this.markEventDelivered(event.id, response.status, duration);
          logger.info(`Webhook delivered successfully: ${event.id}`);
        } else {
          const errorText = await response.text();
          await this.handleEventRetry(event.id, response.status, errorText, duration);
          logger.warn(`Webhook delivery failed: ${event.id}, status: ${response.status}`);
        }
      } catch (error: any) {
        const duration = Date.now() - startTime;
        await this.handleEventRetry(event.id, null, error.message, duration);
        logger.error(`Webhook delivery error: ${event.id}, error: ${error.message}`);
      }
    } catch (error) {
      logger.error(`Error processing webhook event ${event.id}: ${error}`);
      await this.markEventFailed(event.id, `Processing error: ${error}`);
    }
  }

  /**
   * Generate HMAC signature
   */
  private generateSignature(payload: string, secret: string): string {
    const crypto = require('crypto');
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Mark event as delivered
   */
  private async markEventDelivered(eventId: string, statusCode: number, duration: number): Promise<void> {
    await prisma.webhookQueue.update({
      where: { id: eventId },
      data: {
        status: 'DELIVERED',
        completedAt: new Date(),
        lastStatusCode: statusCode,
        attempts: { increment: 1 },
        totalDuration: duration,
      },
    });

    this.emit('eventDelivered', { eventId, statusCode, duration });
  }

  /**
   * Handle event retry logic
   */
  private async handleEventRetry(
    eventId: string,
    statusCode: number | null,
    error: string,
    duration: number
  ): Promise<void> {
    const event = await prisma.webhookQueue.findUnique({
      where: { id: eventId },
    });

    if (!event) return;

    const newAttempts = event.attempts + 1;

    if (newAttempts >= event.maxRetries) {
      await this.markEventFailed(eventId, `Max retries exceeded. Last error: ${error}`);
    } else {
      const nextRetryDelay = this.calculateRetryDelay(event.retryDelay, newAttempts);
      const nextRetryTime = new Date(Date.now() + nextRetryDelay * 1000);

      await prisma.webhookQueue.update({
        where: { id: eventId },
        data: {
          status: 'QUEUED',
          attempts: newAttempts,
          lastStatusCode: statusCode,
          lastError: error,
          scheduledFor: nextRetryTime,
          totalDuration: { increment: duration },
        },
      });

      this.emit('eventRetryScheduled', { eventId, nextRetryTime, attempts: newAttempts });
    }
  }

  /**
   * Mark event as failed
   */
  private async markEventFailed(eventId: string, error: string): Promise<void> {
    await prisma.webhookQueue.update({
      where: { id: eventId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        lastError: error,
        attempts: { increment: 1 },
      },
    });

    this.emit('eventFailed', { eventId, error });
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(baseDelay: number, attemptNumber: number): number {
    return baseDelay * Math.pow(2, attemptNumber - 1);
  }

  /**
   * Get queue metrics
   */
  async getQueueMetrics(): Promise<QueueMetrics> {
    try {
      const queued = await prisma.webhookQueue.groupBy({
        by: ['priority', 'status'],
        _count: true,
      });

      const totalQueued = queued
        .filter(q => q.status === 'QUEUED')
        .reduce((sum, q) => sum + q._count, 0);

      const pendingByPriority = queued
        .filter(q => q.status === 'QUEUED')
        .reduce((acc, q) => {
          acc[q.priority] = (acc[q.priority] || 0) + q._count;
          return acc;
        }, {} as Record<string, number>);

      const processingCount = queued
        .filter(q => q.status === 'PROCESSING')
        .reduce((sum, q) => sum + q._count, 0);

      const failedCount = queued
        .filter(q => q.status === 'FAILED')
        .reduce((sum, q) => sum + q._count, 0);

      // Calculate average processing time for delivered events in the last hour
      const recentDelivered = await prisma.webhookQueue.findMany({
        where: {
          status: 'DELIVERED',
          completedAt: {
            gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
          },
        },
        select: {
          totalDuration: true,
          completedAt: true,
        },
      });

      const averageProcessingTime = recentDelivered.length > 0
        ? recentDelivered.reduce((sum, e) => sum + (e.totalDuration || 0), 0) / recentDelivered.length
        : 0;

      const throughputPerMinute = recentDelivered.length / 60; // Events per minute in last hour

      return {
        totalQueued,
        pendingByPriority,
        processingCount,
        failedCount,
        averageProcessingTime,
        throughputPerMinute,
      };
    } catch (error) {
      logger.error(`Failed to get queue metrics: ${error}`);
      throw error;
    }
  }

  /**
   * Get queued events
   */
  async getQueuedEvents(
    status?: string,
    priority?: string,
    limit: number = 50
  ): Promise<any[]> {
    try {
      const where: any = {};
      if (status) where.status = status;
      if (priority) where.priority = priority;

      return await prisma.webhookQueue.findMany({
        where,
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' },
        ],
        take: limit,
        include: {
          webhook: {
            select: {
              url: true,
              isActive: true,
            },
          },
        },
      });
    } catch (error) {
      logger.error(`Failed to get queued events: ${error}`);
      throw error;
    }
  }

  /**
   * Retry failed event
   */
  async retryEvent(eventId: string): Promise<void> {
    try {
      const event = await prisma.webhookQueue.findUnique({
        where: { id: eventId },
      });

      if (!event) {
        throw new Error('Event not found');
      }

      await prisma.webhookQueue.update({
        where: { id: eventId },
        data: {
          status: 'QUEUED',
          attempts: 0,
          lastError: null,
          scheduledFor: new Date(),
        },
      });

      this.emit('eventRetry', { eventId });
      logger.info(`Webhook event queued for retry: ${eventId}`);
    } catch (error) {
      logger.error(`Failed to retry webhook event: ${error}`);
      throw error;
    }
  }

  /**
   * Cancel queued event
   */
  async cancelEvent(eventId: string): Promise<void> {
    try {
      await prisma.webhookQueue.update({
        where: { id: eventId },
        data: {
          status: 'CANCELLED',
          completedAt: new Date(),
        },
      });

      this.emit('eventCancelled', { eventId });
      logger.info(`Webhook event cancelled: ${eventId}`);
    } catch (error) {
      logger.error(`Failed to cancel webhook event: ${error}`);
      throw error;
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    if (this.queueProcessorInterval) {
      clearInterval(this.queueProcessorInterval);
    }

    // Wait for current processing to complete
    while (this.processingQueue.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    logger.info('Webhook queue service shutdown complete');
  }
}

export const webhookQueueService = new WebhookQueueService();
