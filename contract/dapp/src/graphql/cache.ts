import { GraphQLResolveInfo } from 'graphql';
import { Redis } from 'ioredis';
import { createHash } from 'crypto';

export interface CacheConfig {
  enabled: boolean;
  ttl: number; // Time to live in seconds
  maxSize: number; // Maximum number of cached items
  strategy: 'lru' | 'fifo' | 'lfu'; // Cache eviction strategy
  redis?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
}

export interface CacheEntry<T = any> {
  key: string;
  value: T;
  timestamp: number;
  ttl: number;
  hits: number;
  size: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  memoryUsage: number;
  evictions: number;
}

export class GraphQLCache {
  private config: CacheConfig;
  private cache: Map<string, CacheEntry>;
  private accessOrder: string[]; // For LRU
  private stats: CacheStats;
  private redis?: Redis;
  private memoryUsage: number = 0;

  constructor(config: CacheConfig) {
    this.config = config;
    this.cache = new Map();
    this.accessOrder = [];
    this.stats = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      size: 0,
      memoryUsage: 0,
      evictions: 0
    };

    if (config.redis) {
      this.initializeRedis();
    }
  }

  private initializeRedis(): void {
    if (!this.config.redis) return;

    this.redis = new Redis({
      host: this.config.redis.host,
      port: this.config.redis.port,
      password: this.config.redis.password,
      db: this.config.redis.db || 0,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });

    this.redis.on('connect', () => {
      console.log('Redis cache connected');
    });

    this.redis.on('error', (error) => {
      console.error('Redis cache error:', error);
    });
  }

  private generateCacheKey(
    operationName: string | undefined,
    variables: any,
    fieldName: string,
    args: any
  ): string {
    const keyData = {
      operation: operationName || 'anonymous',
      variables: variables || {},
      field: fieldName,
      args: args || {}
    };

    const keyString = JSON.stringify(keyData, Object.keys(keyData).sort());
    const hash = createHash('sha256').update(keyString).digest('hex');
    return `gql:${hash}`;
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl * 1000;
  }

  private updateAccessOrder(key: string): void {
    if (this.config.strategy === 'lru') {
      // Remove from current position
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
      // Add to end (most recently used)
      this.accessOrder.push(key);
    }
  }

  private evictIfNeeded(): void {
    if (this.cache.size <= this.config.maxSize) {
      return;
    }

    let keyToEvict: string | null = null;

    switch (this.config.strategy) {
      case 'lru':
        // Remove least recently used
        keyToEvict = this.accessOrder[0];
        break;
      
      case 'fifo':
        // Remove first inserted
        keyToEvict = this.cache.keys().next().value;
        break;
      
      case 'lfu':
        // Remove least frequently used
        let minHits = Infinity;
        for (const [key, entry] of this.cache.entries()) {
          if (entry.hits < minHits) {
            minHits = entry.hits;
            keyToEvict = key;
          }
        }
        break;
    }

    if (keyToEvict) {
      this.delete(keyToEvict);
      this.stats.evictions++;
    }
  }

  private calculateSize(value: any): number {
    // Rough estimation of memory size
    return JSON.stringify(value).length * 2; // Assume 2 bytes per character
  }

  async get<T = any>(
    key: string,
    operationName?: string,
    variables?: any,
    fieldName?: string,
    args?: any
  ): Promise<T | null> {
    const cacheKey = this.generateCacheKey(operationName, variables, fieldName || '', args || {});

    // Try Redis first if available
    if (this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          this.stats.hits++;
          this.updateHitRate();
          return parsed.value;
        }
      } catch (error) {
        console.error('Redis cache get error:', error);
      }
    }

    // Fallback to memory cache
    const entry = this.cache.get(cacheKey);
    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(cacheKey);
      const index = this.accessOrder.indexOf(cacheKey);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    entry.hits++;
    this.updateAccessOrder(cacheKey);
    this.stats.hits++;
    this.updateHitRate();

    return entry.value;
  }

  async set<T = any>(
    key: string,
    value: T,
    ttl?: number,
    operationName?: string,
    variables?: any,
    fieldName?: string,
    args?: any
  ): Promise<void> {
    const cacheKey = this.generateCacheKey(operationName, variables, fieldName || '', args || {});
    const actualTtl = ttl || this.config.ttl;
    const size = this.calculateSize(value);

    const entry: CacheEntry<T> = {
      key: cacheKey,
      value,
      timestamp: Date.now(),
      ttl: actualTtl,
      hits: 0,
      size
    };

    // Set in Redis if available
    if (this.redis) {
      try {
        await this.redis.setex(cacheKey, actualTtl, JSON.stringify(entry));
      } catch (error) {
        console.error('Redis cache set error:', error);
      }
    }

    // Set in memory cache
    this.cache.set(cacheKey, entry);
    this.updateAccessOrder(cacheKey);
    this.memoryUsage += size;
    this.evictIfNeeded();
    this.updateStats();
  }

  async delete(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (entry) {
      this.memoryUsage -= entry.size;
      this.cache.delete(key);
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
      
      if (this.redis) {
        try {
          await this.redis.del(key);
        } catch (error) {
          console.error('Redis cache delete error:', error);
        }
      }
      
      this.updateStats();
      return true;
    }
    return false;
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.accessOrder = [];
    this.memoryUsage = 0;
    this.stats = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      size: 0,
      memoryUsage: 0,
      evictions: 0
    };

    if (this.redis) {
      try {
        await this.redis.flushdb();
      } catch (error) {
        console.error('Redis cache clear error:', error);
      }
    }
  }

  private updateStats(): void {
    this.stats.size = this.cache.size;
    this.stats.memoryUsage = this.memoryUsage;
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  getStats(): CacheStats {
    this.updateStats();
    return { ...this.stats };
  }

  // Cache invalidation methods
  async invalidateByPattern(pattern: string): Promise<number> {
    let invalidated = 0;

    // Invalidate memory cache
    for (const [key] of this.cache.entries()) {
      if (key.includes(pattern)) {
        await this.delete(key);
        invalidated++;
      }
    }

    // Invalidate Redis cache
    if (this.redis) {
      try {
        const keys = await this.redis.keys(`*${pattern}*`);
        if (keys.length > 0) {
          await this.redis.del(...keys);
          invalidated += keys.length;
        }
      } catch (error) {
        console.error('Redis pattern invalidation error:', error);
      }
    }

    return invalidated;
  }

  async invalidateByUser(userId: string): Promise<number> {
    return this.invalidateByPattern(`user:${userId}`);
  }

  async invalidateByType(type: string): Promise<number> {
    return this.invalidateByPattern(`type:${type}`);
  }

  // Cache warming
  async warmup<T>(
    keys: Array<{
      key: string;
      loader: () => Promise<T>;
      ttl?: number;
    }>
  ): Promise<void> {
    const promises = keys.map(async ({ key, loader, ttl }) => {
      try {
        const value = await loader();
        await this.set(key, value, ttl);
      } catch (error) {
        console.error(`Cache warmup error for key ${key}:`, error);
      }
    });

    await Promise.all(promises);
  }

  // Cache middleware for GraphQL resolvers
  createCacheMiddleware(options: {
    ttl?: number;
    keyGenerator?: (args: any, context: any, info: GraphQLResolveInfo) => string;
    condition?: (args: any, context: any, info: GraphQLResolveInfo) => boolean;
  }) => {
    return async (
      target: any,
      propertyName: string,
      descriptor: PropertyDescriptor
    ) => {
      const originalMethod = descriptor.value;

      descriptor.value = async function (args: any, context: any, info: GraphQLResolveInfo) {
        // Check if caching should be applied
        if (options.condition && !options.condition(args, context, info)) {
          return originalMethod.apply(this, [args, context, info]);
        }

        // Generate cache key
        const cacheKey = options.keyGenerator 
          ? options.keyGenerator(args, context, info)
          : `${info.fieldName}:${JSON.stringify(args)}`;

        // Try to get from cache
        const cached = await this.get(cacheKey);
        if (cached !== null) {
          return cached;
        }

        // Execute original method
        const result = await originalMethod.apply(this, [args, context, info]);

        // Cache the result
        if (result !== null && result !== undefined) {
          await this.set(cacheKey, result, options.ttl);
        }

        return result;
      };

      return descriptor;
    };
  }

  // Health check
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: any;
  }> {
    const details = {
      memory: {
        size: this.stats.size,
        maxSize: this.config.maxSize,
        usage: this.stats.size / this.config.maxSize,
        memoryUsage: this.stats.memoryUsage
      },
      performance: {
        hitRate: this.stats.hitRate,
        hits: this.stats.hits,
        misses: this.stats.misses,
        evictions: this.stats.evictions
      },
      redis: {
        connected: this.redis?.status === 'ready' || false
      }
    };

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Check memory usage
    if (details.memory.usage > 0.9) {
      status = 'unhealthy';
    } else if (details.memory.usage > 0.8) {
      status = 'degraded';
    }

    // Check hit rate
    if (details.performance.hitRate < 0.3) {
      status = 'unhealthy';
    } else if (details.performance.hitRate < 0.5) {
      status = 'degraded';
    }

    // Check Redis connection
    if (this.config.redis && !details.redis.connected) {
      status = 'unhealthy';
    }

    return { status, details };
  }

  // Cleanup and disconnect
  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.disconnect();
    }
    this.cache.clear();
  }
}

// Cache configuration presets
export const CachePresets = {
  development: {
    enabled: true,
    ttl: 300, // 5 minutes
    maxSize: 1000,
    strategy: 'lru' as const
  },
  
  staging: {
    enabled: true,
    ttl: 600, // 10 minutes
    maxSize: 5000,
    strategy: 'lru' as const
  },
  
  production: {
    enabled: true,
    ttl: 1800, // 30 minutes
    maxSize: 10000,
    strategy: 'lru' as const,
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0')
    }
  }
};

// Cache decorator for easy usage
export function Cache(options: {
  ttl?: number;
  keyPrefix?: string;
  condition?: (args: any, context: any) => boolean;
}) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const cache = new GraphQLCache(CachePresets.development);

    descriptor.value = async function (args: any, context: any, info: any) {
      // Check condition
      if (options.condition && !options.condition(args, context)) {
        return originalMethod.apply(this, [args, context, info]);
      }

      // Generate cache key
      const keyPrefix = options.keyPrefix || propertyName;
      const cacheKey = `${keyPrefix}:${JSON.stringify(args)}`;

      // Try cache
      const cached = await cache.get(cacheKey);
      if (cached !== null) {
        return cached;
      }

      // Execute and cache
      const result = await originalMethod.apply(this, [args, context, info]);
      if (result !== null && result !== undefined) {
        await cache.set(cacheKey, result, options.ttl);
      }

      return result;
    };

    return descriptor;
  };
}
