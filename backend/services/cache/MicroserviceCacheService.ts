import { getCacheStrategy } from './CacheStrategy';
import { getSessionCacheService } from './SessionCacheService';
import { logger } from '../logger';

export interface PaymentCacheData {
  id: string;
  userId: string;
  billId: string;
  amount: number;
  status: string;
  transactionHash?: string;
  createdAt: Date;
}

export interface BillCacheData {
  id: string;
  userId: string;
  utilityId: string;
  amount: number;
  status: string;
  dueDate: Date;
  lateFee: number;
  discount: number;
}

export interface WebhookCacheData {
  id: string;
  userId: string;
  url: string;
  events: string[];
  isActive: boolean;
  secret: string;
}

export interface AnalyticsCacheData {
  userId?: string;
  timeframe: string;
  data: Record<string, any>;
  generatedAt: Date;
}

/**
 * Microservice-specific cache implementations
 * Optimized for each service's data access patterns
 */
export class MicroserviceCacheService {
  private cacheStrategy = getCacheStrategy();
  private sessionCache = getSessionCacheService();

  /**
   * PAYMENT SERVICE CACHING
   */

  /**
   * Cache user's payment history with pagination
   */
  async cachePaymentHistory(userId: string, page: number, payments: PaymentCacheData[]): Promise<boolean> {
    try {
      const result = await this.cacheStrategy.set('payment:history', 
        { userId, page: page.toString() }, 
        payments
      );

      logger.debug(`Cached payment history for user ${userId}, page ${page}`);
      return result;
    } catch (error) {
      logger.error('Payment cache error:', error as any);
      return false;
    }
  }

  /**
   * Get cached payment history with database fallback
   */
  async getPaymentHistory(
    userId: string, 
    page: number, 
    fallback?: () => Promise<PaymentCacheData[]>
  ): Promise<PaymentCacheData[] | null> {
    return await this.cacheStrategy.get<PaymentCacheData[]>(
      'payment:history',
      { userId, page: page.toString() },
      fallback
    );
  }

  /**
   * Cache recent payments for quick access
   */
  async cacheRecentPayments(userId: string, payments: PaymentCacheData[]): Promise<boolean> {
    try {
      const result = await this.cacheStrategy.set('payment:recent', 
        { userId }, 
        payments
      );

      logger.debug(`Cached ${payments.length} recent payments for user ${userId}`);
      return result;
    } catch (error) {
      logger.error('Recent payments cache error:', error as any);
      return false;
    }
  }

  /**
   * Get cached recent payments
   */
  async getRecentPayments(
    userId: string, 
    fallback?: () => Promise<PaymentCacheData[]>
  ): Promise<PaymentCacheData[] | null> {
    return await this.cacheStrategy.get<PaymentCacheData[]>(
      'payment:recent',
      { userId },
      fallback
    );
  }

  /**
   * Invalidate payment cache when payment status changes
   */
  async invalidatePaymentCache(userId: string, billId?: string): Promise<void> {
    try {
      // Invalidate user's payment history (all pages)
      await this.cacheStrategy.invalidate('', {}, ['payment', 'user']);
      
      // Invalidate recent payments
      await this.cacheStrategy.invalidate('payment:recent', { userId });

      if (billId) {
        // Invalidate bill-specific cache
        await this.cacheStrategy.invalidate('bill:status', { billId });
      }

      logger.debug(`Invalidated payment cache for user ${userId}`);
    } catch (error) {
      logger.error('Payment cache invalidation error:', error as any);
    }
  }

  /**
   * BILLING SERVICE CACHING
   */

  /**
   * Cache user's bills
   */
  async cacheUserBills(userId: string, bills: BillCacheData[]): Promise<boolean> {
    try {
      const result = await this.cacheStrategy.set('bill:user', 
        { userId }, 
        bills
      );

      logger.debug(`Cached ${bills.length} bills for user ${userId}`);
      return result;
    } catch (error) {
      logger.error('User bills cache error:', error as any);
      return false;
    }
  }

  /**
   * Get cached user bills
   */
  async getUserBills(
    userId: string, 
    fallback?: () => Promise<BillCacheData[]>
  ): Promise<BillCacheData[] | null> {
    return await this.cacheStrategy.get<BillCacheData[]>(
      'bill:user',
      { userId },
      fallback
    );
  }

  /**
   * Cache individual bill status
   */
  async cacheBillStatus(billId: string, bill: BillCacheData): Promise<boolean> {
    try {
      const result = await this.cacheStrategy.set('bill:status', 
        { billId }, 
        bill
      );

      logger.debug(`Cached bill status for ${billId}`);
      return result;
    } catch (error) {
      logger.error('Bill status cache error:', error as any);
      return false;
    }
  }

  /**
   * Get cached bill status
   */
  async getBillStatus(
    billId: string, 
    fallback?: () => Promise<BillCacheData>
  ): Promise<BillCacheData | null> {
    return await this.cacheStrategy.get<BillCacheData>(
      'bill:status',
      { billId },
      fallback
    );
  }

  /**
   * Invalidate billing cache
   */
  async invalidateBillingCache(userId: string, billId?: string): Promise<void> {
    try {
      // Invalidate user's bills
      await this.cacheStrategy.invalidate('bill:user', { userId });

      if (billId) {
        // Invalidate specific bill
        await this.cacheStrategy.invalidate('bill:status', { billId });
      }

      // Invalidate by tags
      await this.cacheStrategy.invalidate('', {}, ['bill', 'user']);

      logger.debug(`Invalidated billing cache for user ${userId}`);
    } catch (error) {
      logger.error('Billing cache invalidation error:', error as any);
    }
  }

  /**
   * WEBHOOK SERVICE CACHING
   */

  /**
   * Cache webhook configuration
   */
  async cacheWebhookConfig(webhookId: string, webhook: WebhookCacheData): Promise<boolean> {
    try {
      const result = await this.cacheStrategy.set('webhook:config', 
        { webhookId }, 
        webhook
      );

      logger.debug(`Cached webhook config for ${webhookId}`);
      return result;
    } catch (error) {
      logger.error('Webhook config cache error:', error as any);
      return false;
    }
  }

  /**
   * Get cached webhook configuration
   */
  async getWebhookConfig(
    webhookId: string, 
    fallback?: () => Promise<WebhookCacheData>
  ): Promise<WebhookCacheData | null> {
    return await this.cacheStrategy.get<WebhookCacheData>(
      'webhook:config',
      { webhookId },
      fallback
    );
  }

  /**
   * Cache user's webhooks
   */
  async cacheUserWebhooks(userId: string, webhooks: WebhookCacheData[]): Promise<boolean> {
    try {
      const result = await this.cacheStrategy.set('webhook:user', 
        { userId }, 
        webhooks
      );

      logger.debug(`Cached ${webhooks.length} webhooks for user ${userId}`);
      return result;
    } catch (error) {
      logger.error('User webhooks cache error:', error as any);
      return false;
    }
  }

  /**
   * Get cached user webhooks
   */
  async getUserWebhooks(
    userId: string, 
    fallback?: () => Promise<WebhookCacheData[]>
  ): Promise<WebhookCacheData[] | null> {
    return await this.cacheStrategy.get<WebhookCacheData[]>(
      'webhook:user',
      { userId },
      fallback
    );
  }

  /**
   * Cache webhook events with pagination
   */
  async cacheWebhookEvents(webhookId: string, page: number, events: any[]): Promise<boolean> {
    try {
      const result = await this.cacheStrategy.set('webhook:events', 
        { webhookId, page: page.toString() }, 
        events
      );

      logger.debug(`Cached webhook events for ${webhookId}, page ${page}`);
      return result;
    } catch (error) {
      logger.error('Webhook events cache error:', error as any);
      return false;
    }
  }

  /**
   * Get cached webhook events
   */
  async getWebhookEvents(
    webhookId: string, 
    page: number, 
    fallback?: () => Promise<any[]>
  ): Promise<any[] | null> {
    return await this.cacheStrategy.get<any[]>(
      'webhook:events',
      { webhookId, page: page.toString() },
      fallback
    );
  }

  /**
   * Invalidate webhook cache
   */
  async invalidateWebhookCache(userId: string, webhookId?: string): Promise<void> {
    try {
      // Invalidate user's webhooks
      await this.cacheStrategy.invalidate('webhook:user', { userId });

      if (webhookId) {
        // Invalidate specific webhook
        await this.cacheStrategy.invalidate('webhook:config', { webhookId });
        
        // Invalidate webhook events (all pages)
        await this.cacheStrategy.invalidate('', {}, ['webhook', 'events']);
      }

      logger.debug(`Invalidated webhook cache for user ${userId}`);
    } catch (error) {
      logger.error('Webhook cache invalidation error:', error as any);
    }
  }

  /**
   * ANALYTICS SERVICE CACHING
   */

  /**
   * Cache dashboard analytics
   */
  async cacheDashboardAnalytics(
    userId: string, 
    timeframe: string, 
    analytics: AnalyticsCacheData
  ): Promise<boolean> {
    try {
      const result = await this.cacheStrategy.set('analytics:dashboard', 
        { userId, timeframe }, 
        analytics
      );

      logger.debug(`Cached dashboard analytics for user ${userId}, timeframe ${timeframe}`);
      return result;
    } catch (error) {
      logger.error('Dashboard analytics cache error:', error as any);
      return false;
    }
  }

  /**
   * Get cached dashboard analytics
   */
  async getDashboardAnalytics(
    userId: string, 
    timeframe: string, 
    fallback?: () => Promise<AnalyticsCacheData>
  ): Promise<AnalyticsCacheData | null> {
    return await this.cacheStrategy.get<AnalyticsCacheData>(
      'analytics:dashboard',
      { userId, timeframe },
      fallback
    );
  }

  /**
   * Cache revenue analytics
   */
  async cacheRevenueAnalytics(period: string, analytics: AnalyticsCacheData): Promise<boolean> {
    try {
      const result = await this.cacheStrategy.set('analytics:revenue', 
        { period }, 
        analytics
      );

      logger.debug(`Cached revenue analytics for period ${period}`);
      return result;
    } catch (error) {
      logger.error('Revenue analytics cache error:', error as any);
      return false;
    }
  }

  /**
   * Get cached revenue analytics
   */
  async getRevenueAnalytics(
    period: string, 
    fallback?: () => Promise<AnalyticsCacheData>
  ): Promise<AnalyticsCacheData | null> {
    return await this.cacheStrategy.get<AnalyticsCacheData>(
      'analytics:revenue',
      { period },
      fallback
    );
  }

  /**
   * Cache user growth analytics
   */
  async cacheUserGrowthAnalytics(period: string, analytics: AnalyticsCacheData): Promise<boolean> {
    try {
      const result = await this.cacheStrategy.set('analytics:user_growth', 
        { period }, 
        analytics
      );

      logger.debug(`Cached user growth analytics for period ${period}`);
      return result;
    } catch (error) {
      logger.error('User growth analytics cache error:', error as any);
      return false;
    }
  }

  /**
   * Get cached user growth analytics
   */
  async getUserGrowthAnalytics(
    period: string, 
    fallback?: () => Promise<AnalyticsCacheData>
  ): Promise<AnalyticsCacheData | null> {
    return await this.cacheStrategy.get<AnalyticsCacheData>(
      'analytics:user_growth',
      { period },
      fallback
    );
  }

  /**
   * Invalidate analytics cache
   */
  async invalidateAnalyticsCache(userId?: string): Promise<void> {
    try {
      if (userId) {
        // Invalidate user-specific analytics
        await this.cacheStrategy.invalidate('', {}, ['analytics', 'user']);
      } else {
        // Invalidate all analytics
        await this.cacheStrategy.invalidate('', {}, ['analytics']);
      }

      logger.debug(`Invalidated analytics cache${userId ? ` for user ${userId}` : ''}`);
    } catch (error) {
      logger.error('Analytics cache invalidation error:', error as any);
    }
  }

  /**
   * UTILITY SERVICE CACHING
   */

  /**
   * Cache utility providers (static data)
   */
  async cacheUtilityProviders(providers: any[]): Promise<boolean> {
    try {
      const result = await this.cacheStrategy.set('utility:providers', 
        {}, 
        providers
      );

      logger.debug(`Cached ${providers.length} utility providers`);
      return result;
    } catch (error) {
      logger.error('Utility providers cache error:', error as any);
      return false;
    }
  }

  /**
   * Get cached utility providers
   */
  async getUtilityProviders(fallback?: () => Promise<any[]>): Promise<any[] | null> {
    return await this.cacheStrategy.get<any[]>(
      'utility:providers',
      {},
      fallback
    );
  }

  /**
   * Cache utility types
   */
  async cacheUtilityTypes(types: any[]): Promise<boolean> {
    try {
      const result = await this.cacheStrategy.set('utility:types', 
        {}, 
        types
      );

      logger.debug(`Cached ${types.length} utility types`);
      return result;
    } catch (error) {
      logger.error('Utility types cache error:', error as any);
      return false;
    }
  }

  /**
   * Get cached utility types
   */
  async getUtilityTypes(fallback?: () => Promise<any[]>): Promise<any[] | null> {
    return await this.cacheStrategy.get<any[]>(
      'utility:types',
      {},
      fallback
    );
  }

  /**
   * Invalidate utility cache (rarely needed)
   */
  async invalidateUtilityCache(): Promise<void> {
    try {
      await this.cacheStrategy.invalidate('', {}, ['utility', 'static']);
      logger.debug('Invalidated utility cache');
    } catch (error) {
      logger.error('Utility cache invalidation error:', error as any);
    }
  }


  /**
   * SCHEDULED PAYMENT SERVICE CACHING (Work #120)
   */

  async cacheScheduledPayments(userId: string, schedules: any[]): Promise<boolean> {
    try {
      const result = await this.cacheStrategy.set('payment:recent', { userId }, schedules);
      logger.debug(`Cached ${schedules.length} scheduled payments for user ${userId}`);
      return result;
    } catch (error) {
      logger.error('Scheduled payments cache error:', error);
      return false;
    }
  }

  async getScheduledPayments(userId: string, fallback?: () => Promise<any[]>): Promise<any[] | null> {
    return await this.cacheStrategy.get<any[]>('payment:recent', { userId }, fallback);
  }

  async cacheScheduledPaymentById(id: string, schedule: any): Promise<boolean> {
    try {
      const result = await this.cacheStrategy.set('bill:status', { billId: id }, schedule);
      logger.debug(`Cached scheduled payment ${id}`);
      return result;
    } catch (error) {
      logger.error('Scheduled payment cache error:', error);
      return false;
    }
  }

  async getScheduledPaymentById(id: string, fallback?: () => Promise<any>): Promise<any | null> {
    return await this.cacheStrategy.get<any>('bill:status', { billId: id }, fallback);
  }

  async invalidateScheduledPaymentCache(userId: string, scheduleId?: string): Promise<void> {
    try {
      await this.cacheStrategy.invalidate('payment:recent', { userId });
      if (scheduleId) {
        await this.cacheStrategy.invalidate('bill:status', { billId: scheduleId });
      }
      await this.cacheStrategy.invalidate('', {}, ['payment', 'user']);
      logger.debug(`Invalidated scheduled payment cache for user ${userId}`);
    } catch (error) {
      logger.error('Scheduled payment cache invalidation error:', error);
    }
  }

  /**
   * NOTIFICATION SERVICE CACHING
   */

  async cacheNotificationPreferences(userId: string, preferences: any): Promise<boolean> {
    try {
      const result = await this.cacheStrategy.set('user:preferences',
        { userId: `notif:${userId}` }, preferences);
      logger.debug(`Cached notification preferences for user ${userId}`);
      return result;
    } catch (error) {
      logger.error('Notification preferences cache error:', error);
      return false;
    }
  }

  async getNotificationPreferences(userId: string, fallback?: () => Promise<any>): Promise<any | null> {
    return await this.cacheStrategy.get<any>('user:preferences', { userId: `notif:${userId}` }, fallback);
  }

  async cacheNotificationTemplates(templates: any[]): Promise<boolean> {
    try {
      const result = await this.cacheStrategy.set('utility:types', {}, templates);
      logger.debug(`Cached ${templates.length} notification templates`);
      return result;
    } catch (error) {
      logger.error('Notification templates cache error:', error);
      return false;
    }
  }

  async getNotificationTemplates(fallback?: () => Promise<any[]>): Promise<any[] | null> {
    return await this.cacheStrategy.get<any[]>('utility:types', {}, fallback);
  }

  async invalidateNotificationCache(userId: string): Promise<void> {
    try {
      await this.cacheStrategy.invalidate('user:preferences', { userId: `notif:${userId}` });
      logger.debug(`Invalidated notification cache for user ${userId}`);
    } catch (error) {
      logger.error('Notification cache invalidation error:', error);
    }
  }

  /**
   * DOCUMENT SERVICE CACHING
   */

  async cacheDocumentMetadata(documentId: string, metadata: any): Promise<boolean> {
    try {
      const result = await this.cacheStrategy.set('bill:status',
        { billId: `doc:${documentId}` }, metadata);
      logger.debug(`Cached document metadata for ${documentId}`);
      return result;
    } catch (error) {
      logger.error('Document metadata cache error:', error);
      return false;
    }
  }

  async getDocumentMetadata(documentId: string, fallback?: () => Promise<any>): Promise<any | null> {
    return await this.cacheStrategy.get<any>('bill:status', { billId: `doc:${documentId}` }, fallback);
  }

  async cacheUserDocuments(userId: string, documents: any[]): Promise<boolean> {
    try {
      const result = await this.cacheStrategy.set('bill:user',
        { userId: `docs:${userId}` }, documents);
      logger.debug(`Cached ${documents.length} documents for user ${userId}`);
      return result;
    } catch (error) {
      logger.error('User documents cache error:', error);
      return false;
    }
  }

  async getUserDocuments(userId: string, fallback?: () => Promise<any[]>): Promise<any[] | null> {
    return await this.cacheStrategy.get<any[]>('bill:user', { userId: `docs:${userId}` }, fallback);
  }

  async invalidateDocumentCache(userId: string, documentId?: string): Promise<void> {
    try {
      await this.cacheStrategy.invalidate('bill:user', { userId: `docs:${userId}` });
      if (documentId) {
        await this.cacheStrategy.invalidate('bill:status', { billId: `doc:${documentId}` });
      }
      logger.debug(`Invalidated document cache for user ${userId}`);
    } catch (error) {
      logger.error('Document cache invalidation error:', error);
    }
  }

  /**
   * BATCH OPERATIONS
   */

  /**
   * Batch cache multiple items for warmup
   */
  async batchCacheItems(items: Array<{
    pattern: string;
    params: Record<string, string>;
    data: any;
  }>): Promise<number> {
    let cached = 0;
    
    const promises = items.map(async ({ pattern, params, data }) => {
      try {
        const success = await this.cacheStrategy.set(pattern, params, data);
        if (success) cached++;
      } catch (error) {
        logger.error(`Batch cache error for pattern ${pattern}:`, error as any);
      }
    });

    await Promise.all(promises);
    logger.info(`Batch cached ${cached}/${items.length} items`);
    
    return cached;
  }

  /**
   * Get cache statistics for all microservices
   */
  async getMicroservicesCacheStats(): Promise<Record<string, any>> {
    try {
      const metrics = await this.cacheStrategy.getMetrics();
      
      const stats = {
        payment: {
          patterns: ['payment:history', 'payment:recent'],
          metrics: {}
        },
        billing: {
          patterns: ['bill:user', 'bill:status'],
          metrics: {}
        },
        webhook: {
          patterns: ['webhook:config', 'webhook:user', 'webhook:events'],
          metrics: {}
        },
        analytics: {
          patterns: ['analytics:dashboard', 'analytics:revenue', 'analytics:user_growth'],
          metrics: {}
        },
        utility: {
          patterns: ['utility:providers', 'utility:types'],
          metrics: {}
        }
      };

      // Populate metrics for each service
      Object.keys(stats).forEach(service => {
        (stats as any)[service].patterns.forEach((pattern: any) => {
          (stats as any)[service].metrics[pattern] = metrics[pattern];
        });
      });

      return stats;
    } catch (error) {
      logger.error('Microservices cache stats error:', error as any);
      return {};
    }
  }
}

// Singleton instance
let microserviceCacheService: MicroserviceCacheService | null = null;

export function getMicroserviceCacheService(): MicroserviceCacheService {
  if (!microserviceCacheService) {
    microserviceCacheService = new MicroserviceCacheService();
  }
  return microserviceCacheService;
}