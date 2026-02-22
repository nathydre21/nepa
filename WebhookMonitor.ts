import { logger } from './logger';
import prisma from './prismaClient';

// Type definitions for Prisma models
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
  deliveryAttempts: any[];
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookMetrics {
  totalWebhooks: number;
  activeWebhooks: number;
  inactiveWebhooks: number;
  totalEvents: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  pendingDeliveries: number;
  averageResponseTime: number;
  successRate: number;
  failureRate: number;
  totalRetries: number;
  averageRetriesPerEvent: number;
}

export interface WebhookHealthStatus {
  webhookId: string;
  url: string;
  isHealthy: boolean;
  lastDeliveryTime?: Date;
  lastError?: string;
  consecutiveFailures: number;
  successRate: number;
  averageResponseTime: number;
}

class WebhookMonitor {
  /**
   * Get overall webhook metrics for a user
   */
  async getUserMetrics(userId: string): Promise<WebhookMetrics> {
    try {
      const webhooks = await prisma.webhook.findMany({
        where: { userId },
      });

      const webhookIds = webhooks.map((w: any) =>  w.id);

      const events = await prisma.webhookEvent.findMany({
        where: {
          webhookId: {
            in: webhookIds,
          },
        },
        include: {
          deliveryAttempts: true,
        },
      });

      const totalWebhooks = webhooks.length;
      const activeWebhooks = webhooks.filter((w: any) => w.isActive).length;
      const inactiveWebhooks = totalWebhooks - activeWebhooks;

      const totalEvents = events.length;
      const successfulDeliveries = events.filter((e: any) => e.status === 'DELIVERED').length;
      const failedDeliveries = events.filter((e: any) => e.status === 'FAILED').length;
      const pendingDeliveries = events.filter((e: any) => e.status === 'PENDING').length;

      const totalResponseTime = events.reduce((sum: number, event: any) => {
        const eventResponseTime = event.deliveryAttempts.reduce((sum: number, attempt: any) => sum + (attempt.duration || 0), 0);
        return sum + (event.deliveryAttempts.length > 0 ? eventResponseTime / event.deliveryAttempts.length : 0);
      }, 0);

      const averageResponseTime = events.length > 0 ? totalResponseTime / events.length : 0;

      const successRate = totalEvents > 0 ? (successfulDeliveries / totalEvents) * 100 : 0;
      const failureRate = totalEvents > 0 ? (failedDeliveries / totalEvents) * 100 : 0;

      const totalRetries = events.reduce((sum: number, event: any) => sum + (event.attempts - 1), 0);
      const averageRetriesPerEvent = events.length > 0 ? totalRetries / events.length : 0;

      return {
        totalWebhooks,
        activeWebhooks,
        inactiveWebhooks,
        totalEvents,
        successfulDeliveries,
        failedDeliveries,
        pendingDeliveries,
        averageResponseTime,
        successRate,
        failureRate,
        totalRetries,
        averageRetriesPerEvent,
      };
    } catch (error) {
      logger.error(`Failed to get user metrics: ${error}`);
      throw error;
    }
  }

  /**
   * Get global webhook metrics
   */
  async getGlobalMetrics(): Promise<WebhookMetrics> {
    try {
      const webhooks = await prisma.webhook.findMany();

      const eventsData = await prisma.webhookEvent.findMany({
        include: {
          deliveryAttempts: true,
        },
      });

      const totalWebhooks = webhooks.length;
      const activeWebhooks = webhooks.filter((w: any) => w.isActive).length;
      const inactiveWebhooks = totalWebhooks - activeWebhooks;

      const totalEvents = eventsData.length;
      const successfulDeliveries = eventsData.filter((e: any) => e.status === 'DELIVERED').length;
      const failedDeliveries = eventsData.filter((e: any) => e.status === 'FAILED').length;
      const pendingDeliveries = eventsData.filter((e: any) => e.status === 'PENDING').length;

      const totalResponseTime = eventsData.reduce((sum: number, event: any) => {
        const eventResponseTime = event.deliveryAttempts.reduce((sum: number, attempt: any) => sum + (attempt.duration || 0), 0);
        return sum + (event.deliveryAttempts.length > 0 ? eventResponseTime / event.deliveryAttempts.length : 0);
      }, 0);

      const averageResponseTime = eventsData.length > 0 ? totalResponseTime / eventsData.length : 0;

      const successRate = totalEvents > 0 ? (successfulDeliveries / totalEvents) * 100 : 0;
      const failureRate = totalEvents > 0 ? (failedDeliveries / totalEvents) * 100 : 0;

      const totalRetries = eventsData.reduce((sum: number, event: any) => sum + (event.attempts - 1), 0);
      const averageRetriesPerEvent = eventsData.length > 0 ? totalRetries / eventsData.length : 0;

      return {
        totalWebhooks,
        activeWebhooks,
        inactiveWebhooks,
        totalEvents,
        successfulDeliveries,
        failedDeliveries,
        pendingDeliveries,
        averageResponseTime,
        successRate,
        failureRate,
        totalRetries,
        averageRetriesPerEvent,
      };
    } catch (error) {
      logger.error(`Failed to get global metrics: ${error}`);
      throw error;
    }
  }

  /**
   * Check webhook health status
   */
  async checkWebhookHealth(webhookId: string): Promise<WebhookHealthStatus> {
    try {
      const webhook = await prisma.webhook.findUnique({
        where: { id: webhookId },
      });

      if (!webhook) {
        throw new Error('Webhook not found');
      }

      const events = await prisma.webhookEvent.findMany({
        where: { webhookId },
        include: {
          deliveryAttempts: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      const lastDelivery = events.length > 0 ? events[0].lastAttempt : undefined;

      const successfulDeliveries = events.filter((e: any) => e.status === 'DELIVERED').length;
      const failedDeliveries = events.filter((e: any) => e.status === 'FAILED').length;
      const totalEvents = events.length;

      const successRate = totalEvents > 0 ? (successfulDeliveries / totalEvents) * 100 : 0;

      const totalResponseTime = events.reduce((sum: number, event: any) => {
        const eventResponseTime = event.deliveryAttempts.reduce((sum: number, attempt: any) => sum + (attempt.duration || 0), 0);
        return sum + (event.deliveryAttempts.length > 0 ? eventResponseTime / event.deliveryAttempts.length : 0);
      }, 0);

      const averageResponseTime = events.length > 0 ? totalResponseTime / events.length : 0;

      // Determine if webhook is healthy
      // It's unhealthy if success rate < 80% or has more than 3 consecutive failures
      const recentFailures = events.slice(0, 10).filter((e: any) => e.status === 'FAILED').length;
      const isHealthy = successRate >= 80 && recentFailures < 3;

      const lastError = events.find((e: any) => e.status === 'FAILED')?.deliveryAttempts[0]?.error;

      return {
        webhookId,
        url: webhook.url,
        isHealthy,
        lastDeliveryTime: lastDelivery,
        lastError,
        consecutiveFailures: recentFailures,
        successRate,
        averageResponseTime,
      };
    } catch (error) {
      logger.error(`Failed to check webhook health: ${error}`);
      throw error;
    }
  }

  /**
   * Get all webhook health statuses for a user
   */
  async getUserWebhookHealth(userId: string): Promise<WebhookHealthStatus[]> {
    try {
      const webhooks = await prisma.webhook.findMany({
        where: { userId },
      });

      const healthStatuses: WebhookHealthStatus[] = [];

      for (const webhook of webhooks) {
        const health = await this.checkWebhookHealth(webhook.id);
        healthStatuses.push(health);
      }

      return healthStatuses;
    } catch (error) {
      logger.error(`Failed to get user webhook health: ${error}`);
      throw error;
    }
  }

  /**
   * Get failed deliveries for analysis
   */
  async getFailedDeliveries(
    webhookId?: string,
    limit: number = 50
  ): Promise<
    Array<{
      eventId: string;
      webhookId: string;
      eventType: string;
      attempts: number;
      lastError?: string;
      createdAt: Date;
    }>
  > {
    try {
      const query: any = {
        status: 'FAILED',
      };

      if (webhookId) {
        query.webhookId = webhookId;
      }

      const events = await prisma.webhookEvent.findMany({
        where: query,
        include: {
          deliveryAttempts: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return events.map((e: any) =>  ({
        eventId: e.id,
        webhookId: e.webhookId,
        eventType: e.eventType,
        attempts: e.attempts,
        lastError: e.deliveryAttempts[0]?.error,
        createdAt: e.createdAt,
      }));
    } catch (error) {
      logger.error(`Failed to get failed deliveries: ${error}`);
      throw error;
    }
  }

  /**
   * Get event statistics by type
   */
  async getEventStats(webhookId?: string): Promise<Record<string, any>> {
    try {
      let query: any = {};

      if (webhookId) {
        query.webhookId = webhookId;
      }

      const events = await prisma.webhookEvent.findMany({
        where: query,
        include: {
          deliveryAttempts: true,
        },
      });

      const stats: Record<string, any> = {};

      for (const event of events) {
        if (!stats[event.eventType]) {
          stats[event.eventType] = {
            total: 0,
            successful: 0,
            failed: 0,
            pending: 0,
            totalAttempts: 0,
            averageResponseTime: 0,
          };
        }

        stats[event.eventType].total++;

        if (event.status === 'DELIVERED') {
          stats[event.eventType].successful++;
        } else if (event.status === 'FAILED') {
          stats[event.eventType].failed++;
        } else {
          stats[event.eventType].pending++;
        }

        stats[event.eventType].totalAttempts += event.attempts;

        const eventResponseTime = event.deliveryAttempts.reduce((sum: number, attempt: any) => sum + (attempt.duration || 0), 0);
        if (event.deliveryAttempts.length > 0) {
          stats[event.eventType].averageResponseTime += eventResponseTime / event.deliveryAttempts.length;
        }
      }

      // Calculate averages
      for (const eventType in stats) {
        stats[eventType].averageAttempts = stats[eventType].total > 0 ? stats[eventType].totalAttempts / stats[eventType].total : 0;
        stats[eventType].successRate = stats[eventType].total > 0 ? (stats[eventType].successful / stats[eventType].total) * 100 : 0;
        stats[eventType].failureRate = stats[eventType].total > 0 ? (stats[eventType].failed / stats[eventType].total) * 100 : 0;
        stats[eventType].averageResponseTime = events.length > 0 ? stats[eventType].averageResponseTime / stats[eventType].total : 0;
      }

      return stats;
    } catch (error) {
      logger.error(`Failed to get event stats: ${error}`);
      throw error;
    }
  }

  /**
   * Generate webhook performance report
   */
  async generatePerformanceReport(
    userId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    period: { startDate: Date; endDate: Date };
    metrics: WebhookMetrics;
    topFailedEvents: Array<{ eventType: string; failures: number }>;
    webhookHealthSummary: Array<{ webhookId: string; url: string; status: string }>;
    recommendations: string[];
  }> {
    try {
      const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
      const end = endDate || new Date();

      const metrics = await this.getUserMetrics(userId);
      const webhooks = await prisma.webhook.findMany({ where: { userId } });

      // Get top failed events
      const failedDeliveries = await prisma.webhookEvent.findMany({
        where: {
          webhookId: {
            in: webhooks.map((w: any) =>  w.id),
          },
          status: 'FAILED',
          createdAt: {
            gte: start,
            lte: end,
          },
        },
      });

      const failedByType: Record<string, number> = {};
      for (const event of failedDeliveries) {
        failedByType[event.eventType] = (failedByType[event.eventType] || 0) + 1;
      }

      const topFailedEvents = Object.entries(failedByType)
        .map(([eventType, failures]) => ({ eventType, failures }))
        .sort((a, b) => b.failures - a.failures)
        .slice(0, 5);

      // Get webhook health summary
      const healthStatuses = await this.getUserWebhookHealth(userId);
      const webhookHealthSummary = healthStatuses.map((h: any) =>  ({
        webhookId: h.webhookId,
        url: h.url,
        status: h.isHealthy ? 'HEALTHY' : 'UNHEALTHY',
      }));

      // Generate recommendations
      const recommendations: string[] = [];

      if (metrics.failureRate > 20) {
        recommendations.push('High failure rate detected. Check webhook URLs and network connectivity.');
      }

      if (metrics.averageResponseTime > 5000) {
        recommendations.push('High average response time. Consider optimizing webhook endpoint performance.');
      }

      if (metrics.successRate < 80) {
        recommendations.push('Success rate below 80%. Review failed events and implement retry strategies.');
      }

      if (metrics.inactiveWebhooks > 0) {
        recommendations.push(`You have ${metrics.inactiveWebhooks} inactive webhooks. Consider activating or deleting them.`);
      }

      if (metrics.pendingDeliveries > 100) {
        recommendations.push('Large number of pending deliveries. Check for delivery delays.');
      }

      return {
        period: { startDate: start, endDate: end },
        metrics,
        topFailedEvents,
        webhookHealthSummary,
        recommendations,
      };
    } catch (error) {
      logger.error(`Failed to generate performance report: ${error}`);
      throw error;
    }
  }

  /**
   * Monitor webhook delivery in real-time
   */
  async monitorWebhookDelivery(webhookId: string, callback: (event: WebhookEvent) => void): Promise<() => void> {
    try {
      const interval = setInterval(async () => {
        try {
          const recentEvent = await prisma.webhookEvent.findFirst({
            where: { webhookId },
            orderBy: { createdAt: 'desc' },
          });

          if (recentEvent) {
            callback(recentEvent);
          }
        } catch (error) {
          logger.error(`Error monitoring webhook delivery: ${error}`);
        }
      }, 5000); // Check every 5 seconds

      // Return cleanup function
      return () => clearInterval(interval);
    } catch (error) {
      logger.error(`Failed to setup webhook monitoring: ${error}`);
      throw error;
    }
  }
}

export const webhookMonitor = new WebhookMonitor();
