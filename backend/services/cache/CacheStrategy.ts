import { getCacheManager } from '../RedisCacheManager';
import { logger } from '../logger';

export interface CacheStrategyConfig {
  defaultTTL: number;
  maxMemoryUsage: number;
  compressionThreshold: number;
  warmupEnabled: boolean;
  monitoringEnabled: boolean;
}

export interface CacheKey {
  pattern: string;
  ttl: number;
  tags: string[];
  compress?: boolean;
  priority: 'high' | 'medium' | 'low';
}

export interface CacheMetrics {
  hitRate: number;
  avgResponseTime: number;
  memoryUsage: number;
  keyCount: number;
  evictionRate: number;
  compressionRatio: number;
}

/**
 * Comprehensive caching strategy for NEPA application
 * Implements intelligent caching patterns for different data types
 */
export class CacheStrategy {
  private cacheManager = getCacheManager();
  private config: CacheStrategyConfig;
  private metrics: Map<string, CacheMetrics> = new Map();

  // Cache key patterns for different data types
  private readonly cachePatterns: Record<string, CacheKey> = {
    // User & Authentication (High - High frequency access)
    'user:session': {
      pattern: 'session:{sessionId}',
      ttl: 600, // 10 minutes
      tags: ['session', 'auth'],
      priority: 'high'
    },
    'user:profile': {
      pattern: 'user:{userId}',
      ttl: 3600, // 1 hour
      tags: ['user', 'profile'],
      priority: 'high'
    },
    'user:preferences': {
      pattern: 'user:prefs:{userId}',
      ttl: 3600, // 1 hour
      tags: ['user', 'preferences'],
      priority: 'high'
    },
    'user:active_sessions': {
      pattern: 'user:sessions:{userId}',
      ttl: 300, // 5 minutes
      tags: ['session', 'user'],
      priority: 'high'
    },

    // Payment & Billing (High - Frequent queries)
    'payment:history': {
      pattern: 'payment:history:{userId}:{page}',
      ttl: 900, // 15 minutes
      tags: ['payment', 'user'],
      compress: true,
      priority: 'high'
    },
    'payment:recent': {
      pattern: 'payment:recent:{userId}',
      ttl: 300, // 5 minutes
      tags: ['payment', 'user'],
      priority: 'high'
    },
    'bill:user': {
      pattern: 'bill:user:{userId}',
      ttl: 1800, // 30 minutes
      tags: ['bill', 'user'],
      compress: true,
      priority: 'high'
    },
    'bill:status': {
      pattern: 'bill:status:{billId}',
      ttl: 600, // 10 minutes
      tags: ['bill'],
      priority: 'medium'
    },

    // Analytics & Dashboard (Medium - Complex queries)
    'analytics:dashboard': {
      pattern: 'analytics:dashboard:{userId}:{timeframe}',
      ttl: 1800, // 30 minutes
      tags: ['analytics', 'dashboard'],
      compress: true,
      priority: 'medium'
    },
    'analytics:revenue': {
      pattern: 'analytics:revenue:{period}',
      ttl: 3600, // 1 hour
      tags: ['analytics', 'revenue'],
      compress: true,
      priority: 'medium'
    },
    'analytics:user_growth': {
      pattern: 'analytics:growth:{period}',
      ttl: 3600, // 1 hour
      tags: ['analytics', 'growth'],
      compress: true,
      priority: 'medium'
    },

    // Webhook & Events (Medium - Event-driven)
    'webhook:config': {
      pattern: 'webhook:config:{webhookId}',
      ttl: 3600, // 1 hour
      tags: ['webhook', 'config'],
      priority: 'medium'
    },
    'webhook:user': {
      pattern: 'webhook:user:{userId}',
      ttl: 1800, // 30 minutes
      tags: ['webhook', 'user'],
      priority: 'medium'
    },
    'webhook:events': {
      pattern: 'webhook:events:{webhookId}:{page}',
      ttl: 600, // 10 minutes
      tags: ['webhook', 'events'],
      compress: true,
      priority: 'low'
    },

    // Utility & Static Data (Low - Rarely changes)
    'utility:providers': {
      pattern: 'utility:providers',
      ttl: 86400, // 24 hours
      tags: ['utility', 'static'],
      priority: 'low'
    },
    'utility:types': {
      pattern: 'utility:types',
      ttl: 86400, // 24 hours
      tags: ['utility', 'static'],
      priority: 'low'
    },

    // Rate Limiting (High - Every request)
    'rate_limit:user': {
      pattern: 'rate_limit:{userId}:{endpoint}',
      ttl: 3600, // 1 hour
      tags: ['rate_limit'],
      priority: 'high'
    }
  };

  constructor(config: Partial<CacheStrategyConfig> = {}) {
    this.config = {
      defaultTTL: 3600,
      maxMemoryUsage: 512 * 1024 * 1024, // 512MB
      compressionThreshold: 1024, // 1KB
      warmupEnabled: true,
      monitoringEnabled: true,
      ...config
    };

    if (this.config.monitoringEnabled) {
      this.startMetricsCollection();
    }
  }

  /**
   * Get cache key configuration for a specific pattern
   */
  getCacheConfig(pattern: string): CacheKey | null {
    return this.cachePatterns[pattern] || null;
  }

  /**
   * Generate cache key from pattern and parameters
   */
  generateKey(pattern: string, params: Record<string, string>): string {
    const config = this.getCacheConfig(pattern);
    if (!config) {
      throw new Error(`Unknown cache pattern: ${pattern}`);
    }

    let key = config.pattern;
    Object.entries(params).forEach(([param, value]) => {
      key = key.replace(`{${param}}`, value);
    });

    return key;
  }

  /**
   * Smart cache get with fallback and metrics
   */
  async get<T>(pattern: string, params: Record<string, string>, fallback?: () => Promise<T>): Promise<T | null> {
    const startTime = Date.now();
    const key = this.generateKey(pattern, params);
    const config = this.getCacheConfig(pattern);

    try {
      // Try cache first
      const cached = await this.cacheManager.get<T>(key);
      
      if (cached !== null) {
        this.recordMetric(pattern, 'hit', Date.now() - startTime);
        return cached;
      }

      // Cache miss - use fallback if provided
      if (fallback) {
        const data = await fallback();
        if (data !== null) {
          await this.set(pattern, params, data);
        }
        this.recordMetric(pattern, 'miss', Date.now() - startTime);
        return data;
      }

      this.recordMetric(pattern, 'miss', Date.now() - startTime);
      return null;
    } catch (error) {
      logger.error(`Cache get error for pattern ${pattern}:`, error as any);
      this.recordMetric(pattern, 'error', Date.now() - startTime);
      
      // Fallback on error
      if (fallback) {
        return await fallback();
      }
      return null;
    }
  }

  /**
   * Smart cache set with compression and optimization
   */
  async set<T>(pattern: string, params: Record<string, string>, value: T): Promise<boolean> {
    const key = this.generateKey(pattern, params);
    const config = this.getCacheConfig(pattern);
    
    if (!config) {
      return false;
    }

    try {
      // Determine if compression should be used
      const serialized = JSON.stringify(value);
      const shouldCompress = config.compress || serialized.length > this.config.compressionThreshold;

      const result = await this.cacheManager.set(key, value, {
        ttl: config.ttl,
        tags: config.tags,
        compress: shouldCompress,
        priority: config.priority
      });

      if (result) {
        logger.debug(`Cached ${pattern} with key ${key} (TTL: ${config.ttl}s)`);
      }

      return result;
    } catch (error) {
      logger.error(`Cache set error for pattern ${pattern}:`, error as any);
      return false;
    }
  }

  /**
   * Invalidate cache by pattern and tags
   */
  async invalidate(pattern: string, params?: Record<string, string>, tags?: string[]): Promise<void> {
    try {
      if (params) {
        // Invalidate specific key
        const key = this.generateKey(pattern, params);
        await this.cacheManager.delete(key);
        logger.debug(`Invalidated cache key: ${key}`);
      }

      if (tags) {
        // Invalidate by tags
        for (const tag of tags) {
          const count = await this.cacheManager.invalidateByTag(tag);
          logger.debug(`Invalidated ${count} keys with tag: ${tag}`);
        }
      }

      // Broadcast invalidation to other nodes
      await this.cacheManager.broadcastInvalidation(
        params ? [this.generateKey(pattern, params)] : [],
        tags || []
      );
    } catch (error) {
      logger.error(`Cache invalidation error for pattern ${pattern}:`, error as any);
    }
  }

  /**
   * Warm up critical cache entries
   */
  async warmUp(entries: Array<{
    pattern: string;
    params: Record<string, string>;
    loader: () => Promise<any>;
  }>): Promise<void> {
    if (!this.config.warmupEnabled) {
      return;
    }

    logger.info(`Starting cache warmup for ${entries.length} entries`);
    
    const promises = entries.map(async ({ pattern, params, loader }) => {
      try {
        const data = await loader();
        await this.set(pattern, params, data);
        logger.debug(`Warmed up cache for pattern: ${pattern}`);
      } catch (error) {
        logger.error(`Cache warmup error for pattern ${pattern}:`, error as any);
      }
    });

    await Promise.all(promises);
    logger.info('Cache warmup completed');
  }

  /**
   * Get cache metrics for monitoring
   */
  async getMetrics(): Promise<Record<string, CacheMetrics>> {
    const result: Record<string, CacheMetrics> = {};
    
    for (const [pattern, metrics] of Array.from(this.metrics.entries())) {
      result[pattern] = { ...metrics };
    }

    // Add overall Redis metrics
    const redisStats = await this.cacheManager.getStats();
    result['_redis'] = {
      hitRate: redisStats.hitRate,
      avgResponseTime: 0, // Not tracked at Redis level
      memoryUsage: redisStats.memoryUsage,
      keyCount: redisStats.keyCount,
      evictionRate: 0, // Would need Redis config to calculate
      compressionRatio: 0 // Would need to track separately
    };

    return result;
  }

  /**
   * Health check for cache system
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    redis: boolean;
    memoryUsage: number;
    keyCount: number;
    issues: string[];
  }> {
    const issues: string[] = [];
    
    // Check Redis health
    const redisHealthy = await this.cacheManager.healthCheck();
    if (!redisHealthy) {
      issues.push('Redis connection failed');
    }

    // Check memory usage
    const stats = await this.cacheManager.getStats();
    if (stats.memoryUsage > this.config.maxMemoryUsage) {
      issues.push(`Memory usage exceeds limit: ${stats.memoryUsage} > ${this.config.maxMemoryUsage}`);
    }

    return {
      healthy: issues.length === 0,
      redis: redisHealthy,
      memoryUsage: stats.memoryUsage,
      keyCount: stats.keyCount,
      issues
    };
  }

  /**
   * Record metrics for monitoring
   */
  private recordMetric(pattern: string, type: 'hit' | 'miss' | 'error', responseTime: number): void {
    if (!this.config.monitoringEnabled) {
      return;
    }

    const current = this.metrics.get(pattern) || {
      hitRate: 0,
      avgResponseTime: 0,
      memoryUsage: 0,
      keyCount: 0,
      evictionRate: 0,
      compressionRatio: 0
    };

    // Update metrics (simplified - in production use proper time-series)
    if (type === 'hit') {
      current.hitRate = (current.hitRate + 1) / 2; // Simple moving average
    } else if (type === 'miss') {
      current.hitRate = current.hitRate / 2;
    }

    current.avgResponseTime = (current.avgResponseTime + responseTime) / 2;
    
    this.metrics.set(pattern, current);
  }

  /**
   * Start periodic metrics collection
   */
  private startMetricsCollection(): void {
    setInterval(async () => {
      try {
        const stats = await this.cacheManager.getStats();
        logger.debug('Cache metrics:', {
          hitRate: stats.hitRate,
          memoryUsage: stats.memoryUsage,
          keyCount: stats.keyCount
        });
      } catch (error) {
        logger.error('Metrics collection error:', error as any);
      }
    }, 60000); // Every minute
  }
}

// Singleton instance
let cacheStrategy: CacheStrategy | null = null;

export function getCacheStrategy(): CacheStrategy {
  if (!cacheStrategy) {
    cacheStrategy = new CacheStrategy();
  }
  return cacheStrategy;
}