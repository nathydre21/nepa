import { logger } from './logger';
import prisma from '../src/config/prismaClient';
import { EventEmitter } from 'events';
import { webhookService } from './WebhookService';

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

/**
 * Runs the interval that drives WebhookEvent retry delivery
 * (WebhookService.processPendingRetries) — this is now the sole retry
 * worker, replacing the old in-process setTimeout scheduling.
 *
 * The WebhookQueue table and addToQueue/getQueueMetrics/getQueuedEvents/
 * retryEvent/cancelEvent below are a separate, still-functional CRUD
 * surface over that table, but nothing currently calls addToQueue, and
 * the processor no longer drains WebhookQueue — WebhookEvent/
 * WebhookAttempt remain the single source of truth so the admin
 * dashboard and event-history APIs keep working.
 */
class WebhookQueueService extends EventEmitter {
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
   * Start the queue processor. Drives WebhookEvent retry delivery via
   * WebhookService.processPendingRetries — see the class doc comment
   * above for why this no longer drains the WebhookQueue table.
   */
  private startQueueProcessor(): void {
    this.queueProcessorInterval = setInterval(async () => {
      if (!this.isShuttingDown) {
        await webhookService.processPendingRetries();
      }
    }, 5000); // Process every 5 seconds

    logger.info('Webhook queue processor started');
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

    logger.info('Webhook queue service shutdown complete');
  }
}

export const webhookQueueService = new WebhookQueueService();
