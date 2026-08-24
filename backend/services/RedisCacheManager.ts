import Redis from 'ioredis';
import { logger } from './logger';

export interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
  retryDelayOnFailover: number;
  maxRetriesPerRequest: number;
  lazyConnect: boolean;
}

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[]; // Cache tags for invalidation
  compress?: boolean; // Enable compression
  priority?: 'high' | 'medium' | 'low'; // Cache priority
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  hitRate: number;
  memoryUsage: number;
  keyCount: number;
}

class RedisCacheManager {
  private client: Redis;
  private subscriber: Redis;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    hitRate: 0,
    memoryUsage: 0,
    keyCount: 0
  };
  private invalidationCallbacks: Map<string, (() => void)[]> = new Map();

  constructor(config: CacheConfig) {
    // Main Redis client for caching
    this.client = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db,
      keyPrefix: config.keyPrefix,
      maxRetriesPerRequest: config.maxRetriesPerRequest,
      lazyConnect: config.lazyConnect,
      enableReadyCheck: false
    });

    // Separate Redis client for pub/sub
    this.subscriber = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db,
      keyPrefix: config.keyPrefix,
      lazyConnect: true
    });

    this.setupEventHandlers();
    this.setupInvalidationChannel();
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      logger.info('Redis cache connected');
    });

    this.client.on('error', (error) => {
      logger.error('Redis cache error:', error);
    });

    this.client.on('close', () => {
      logger.warn('Redis cache connection closed');
    });

    this.subscriber.on('message', (channel, message) => {
      if (channel === 'cache:invalidation') {
        this.handleInvalidation(message);
      }
    });
  }

  private setupInvalidationChannel(): void {
    this.subscriber.subscribe('cache:invalidation');
  }

  private handleInvalidation(message: string): void {
    try {
      const { keys, tags } = JSON.parse(message);
      
      // Invalidate by keys
      if (keys) {
        keys.forEach((key: string) => {
          this.delete(key);
        });
      }

      // Invalidate by tags
      if (tags) {
        tags.forEach((tag: string) => {
          this.invalidateByTag(tag);
        });
      }

      // Trigger callbacks
      const callbacks = this.invalidationCallbacks.get('global') || [];
      callbacks.forEach(callback => callback());
    } catch (error) {
      logger.error('Cache invalidation error:', error as any);
    }
  }

  async connect(): Promise<void> {
    await Promise.all([
      this.client.connect(),
      this.subscriber.connect()
    ]);
  }

  async disconnect(): Promise<void> {
    await Promise.all([
      this.client.disconnect(),
      this.subscriber.disconnect()
    ]);
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      
      if (value) {
        this.stats.hits++;
        const parsed = JSON.parse(value);
        
        // Handle compressed data
        if (parsed.__compressed) {
          return JSON.parse(parsed.data);
        }
        
        return parsed;
      } else {
        this.stats.misses++;
        return null;
      }
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error as any);
      this.stats.misses++;
      return null;
    }
  }

  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<boolean> {
    try {
      const { ttl = 3600, tags = [], compress = false } = options;
      
      let serializedValue = JSON.stringify(value);
      
      // Add tags to metadata
      const metadata = {
        data: value,
        tags,
        createdAt: Date.now(),
        __compressed: compress
      };

      if (compress) {
        // Simple compression for demonstration
        // In production, use zlib or similar
        metadata.data = value;
        metadata.__compressed = true;
      }

      serializedValue = JSON.stringify(metadata);

      const result = await this.client.setex(key, ttl, serializedValue);
      
      if (result === 'OK') {
        this.stats.sets++;
        
        // Add to tag sets for invalidation
        if (tags.length > 0) {
          await this.addToTags(key, tags);
        }
        
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error as any);
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.client.del(key);
      this.stats.deletes += result;
      return result > 0;
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error as any);
      return false;
    }
  }

  async invalidateByTag(tag: string): Promise<number> {
    try {
      const tagKey = `tag:${tag}`;
      const keys = await this.client.smembers(tagKey);
      
      if (keys.length > 0) {
        await this.client.del(...keys);
        await this.client.del(tagKey);
        this.stats.deletes += keys.length + 1;
      }
      
      return keys.length;
    } catch (error) {
      logger.error(`Cache invalidation error for tag ${tag}:`, error as any);
      return 0;
    }
  }

  private async addToTags(key: string, tags: string[]): Promise<void> {
    const pipeline = this.client.pipeline();
    
    tags.forEach(tag => {
      pipeline.sadd(`tag:${tag}`, key);
      pipeline.expire(`tag:${tag}`, 86400); // Tags expire after 24 hours
    });
    
    await pipeline.exec();
  }

  async invalidatePattern(pattern: string): Promise<number> {
    try {
      const keys = await this.client.keys(pattern);
      
      if (keys.length > 0) {
        const result = await this.client.del(...keys);
        this.stats.deletes += result;
        return result;
      }
      
      return 0;
    } catch (error) {
      logger.error(`Cache pattern invalidation error for pattern ${pattern}:`, error as any);
      return 0;
    }
  }

  // Return logical keys (without client keyPrefix) matching the pattern
  async scanKeys(pattern: string): Promise<string[]> {
    try {
      // The client will apply the configured keyPrefix when executing commands,
      // so pass the pattern as-is. The returned keys include the prefix, so
      // strip it before returning logical keys.
      const rawKeys = await this.client.keys(pattern);
      const prefix = (this.client.options && (this.client.options as any).keyPrefix) || '';
      if (!prefix) return rawKeys;
      return rawKeys.map(k => (k.startsWith(prefix) ? k.slice(prefix.length) : k));
    } catch (error) {
      logger.error(`Redis scanKeys error for pattern ${pattern}:`, error as any);
      return [];
    }
  }

  async getStats(): Promise<CacheStats> {
    try {
      const info = await this.client.info('memory');
      const keyCount = await this.client.dbsize();
      
      // Parse memory usage from Redis info
      const memoryMatch = info.match(/used_memory:(\d+)/);
      const memoryUsage = memoryMatch ? parseInt(memoryMatch[1]) : 0;
      
      this.stats.memoryUsage = memoryUsage;
      this.stats.keyCount = keyCount;
      this.stats.hitRate = this.stats.hits / (this.stats.hits + this.stats.misses) || 0;
      
      return { ...this.stats };
    } catch (error) {
      logger.error('Cache stats error:', error as any);
      return this.stats;
    }
  }

  async flush(): Promise<boolean> {
    try {
      await this.client.flushdb();
      this.stats = {
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0,
        hitRate: 0,
        memoryUsage: 0,
        keyCount: 0
      };
      return true;
    } catch (error) {
      logger.error('Cache flush error:', error as any);
      return false;
    }
  }

  // Distributed cache coordination
  async broadcastInvalidation(keys: string[] = [], tags: string[] = []): Promise<void> {
    try {
      const message = JSON.stringify({ keys, tags });
      await this.client.publish('cache:invalidation', message);
    } catch (error) {
      logger.error('Cache broadcast invalidation error:', error as any);
    }
  }

  // Register callback for invalidation events
  onInvalidation(callback: () => void): void {
    const callbacks = this.invalidationCallbacks.get('global') || [];
    callbacks.push(callback);
    this.invalidationCallbacks.set('global', callbacks);
  }

  // Cache warming
  async warmCache(entries: Array<{ key: string; value: any; options?: CacheOptions }>): Promise<void> {
    const promises = entries.map(({ key, value, options }) => 
      this.set(key, value, options)
    );
    
    await Promise.all(promises);
    logger.info(`Warmed ${entries.length} cache entries`);
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      const testKey = 'health:check';
      await this.client.set(testKey, 'ok', 'EX', 10);
      const result = await this.client.get(testKey);
      await this.client.del(testKey);
      return result === 'ok';
    } catch (error) {
      logger.error('Cache health check failed:', error as any);
      return false;
    }
  }
}

// Singleton instance
let cacheManager: RedisCacheManager | null = null;

export function getCacheManager(): RedisCacheManager {
  if (!cacheManager) {
    const config: CacheConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_CACHE_DB || '1'),
      keyPrefix: 'nepa:cache:',
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    };

    cacheManager = new RedisCacheManager(config);
  }

  return cacheManager;
}

export { RedisCacheManager };
