import { LRUCache } from 'lru-cache';
import { logger } from '../middleware/logger';
import { CacheOptions } from './RedisCacheManager';

export interface MemoryCacheOptions extends CacheOptions {
  maxSize?: number; // Maximum number of items
  maxAge?: number; // Maximum age in milliseconds
  updateAgeOnGet?: boolean; // Update age on get
  allowStale?: boolean; // Allow stale values while revalidating
}

export interface MemoryCacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  hitRate: number;
  size: number;
  maxSize: number;
  totalMemoryUsage: number;
}

class MemoryCacheManager {
  private cache: LRUCache<string, any>;
  private stats: MemoryCacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    hitRate: 0,
    size: 0,
    maxSize: 0,
    totalMemoryUsage: 0
  };

  constructor(options: MemoryCacheOptions = {}) {
    const {
      maxSize = 1000,
      maxAge = 5 * 60 * 1000, // 5 minutes default
      updateAgeOnGet = true,
      allowStale = false
    } = options;

    this.cache = new LRUCache({
      max: maxSize,
      ttl: maxAge,
      updateAgeOnGet,
      allowStale,
      dispose: (value, key) => {
        this.stats.deletes++;
        logger.debug(`Memory cache disposed: ${key}`);
      }
    });

    this.stats.maxSize = maxSize;
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.cache.on('set', (key, value) => {
      this.stats.sets++;
      this.stats.size = this.cache.size;
      this.updateMemoryUsage();
    });

    this.cache.on('get', (key, value) => {
      if (value !== undefined) {
        this.stats.hits++;
      } else {
        this.stats.misses++;
      }
      this.updateHitRate();
    });

    this.cache.on('delete', (key, value) => {
      this.stats.deletes++;
      this.stats.size = this.cache.size;
      this.updateMemoryUsage();
    });

    this.cache.on('clear', () => {
      this.stats.deletes += this.stats.size;
      this.stats.size = 0;
      this.updateMemoryUsage();
    });
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  private updateMemoryUsage(): void {
    // Estimate memory usage based on cache size
    this.stats.totalMemoryUsage = this.cache.size * 1024; // Rough estimate
  }

  get<T>(key: string): T | undefined {
    try {
      const value = this.cache.get(key);
      
      if (value !== undefined) {
        // Handle wrapped cache entries
        if (value && typeof value === 'object' && value.__wrapped) {
          return value.data;
        }
        return value;
      }
      
      return undefined;
    } catch (error) {
      logger.error(`Memory cache get error for key ${key}:`, error);
      return undefined;
    }
  }

  set<T>(key: string, value: T, options: CacheOptions = {}): boolean {
    try {
      const { ttl, tags = [] } = options;
      
      // Wrap value with metadata if needed
      let wrappedValue = value;
      if (tags.length > 0 || ttl) {
        wrappedValue = {
          data: value,
          tags,
          createdAt: Date.now(),
          __wrapped: true
        };
      }

      const success = this.cache.set(key, wrappedValue, { ttl });
      
      if (success) {
        this.stats.sets++;
        this.stats.size = this.cache.size;
        this.updateMemoryUsage();
      }
      
      return success;
    } catch (error) {
      logger.error(`Memory cache set error for key ${key}:`, error);
      return false;
    }
  }

  delete(key: string): boolean {
    try {
      const result = this.cache.delete(key);
      if (result) {
        this.stats.deletes++;
        this.stats.size = this.cache.size;
        this.updateMemoryUsage();
      }
      return result;
    } catch (error) {
      logger.error(`Memory cache delete error for key ${key}:`, error);
      return false;
    }
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
    this.stats.size = 0;
    this.updateMemoryUsage();
  }

  getStats(): MemoryCacheStats {
    this.updateHitRate();
    this.updateMemoryUsage();
    return { ...this.stats };
  }

  // Get keys matching a pattern
  keys(pattern?: string): string[] {
    const allKeys = Array.from(this.cache.keys());
    
    if (!pattern) {
      return allKeys;
    }
    
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return allKeys.filter(key => regex.test(key));
  }

  // Invalidate by tags
  invalidateByTag(tag: string): number {
    let deletedCount = 0;
    
    for (const [key, value] of this.cache) {
      if (value && value.tags && value.tags.includes(tag)) {
        this.cache.delete(key);
        deletedCount++;
      }
    }
    
    return deletedCount;
  }

  // Get multiple keys at once
  mget<T>(keys: string[]): Array<T | undefined> {
    return keys.map(key => this.get<T>(key));
  }

  // Set multiple keys at once
  mset<T>(entries: Array<{ key: string; value: T; options?: CacheOptions }>): boolean[] {
    return entries.map(({ key, value, options }) => this.set(key, value, options));
  }

  // Cache warming
  warm<T>(entries: Array<{ key: string; value: T; options?: CacheOptions }>): void {
    entries.forEach(({ key, value, options }) => {
      this.set(key, value, options);
    });
    
    logger.info(`Warmed ${entries.length} memory cache entries`);
  }

  // Get cache size information
  size(): number {
    return this.cache.size;
  }

  // Check if cache is full
  isFull(): boolean {
    return this.cache.size >= this.cache.max;
  }

  // Get oldest key
  getOldestKey(): string | undefined {
    for (const key of this.cache.keys()) {
      return key;
    }
    return undefined;
  }

  // Get newest key
  getNewestKey(): string | undefined {
    const keys = Array.from(this.cache.keys());
    return keys[keys.length - 1];
  }

  // Export cache data
  export(): Array<{ key: string; value: any; ttl?: number }> {
    const entries: Array<{ key: string; value: any; ttl?: number }> = [];
    
    for (const [key, value] of this.cache) {
      const ttl = this.cache.getRemainingTTL(key);
      entries.push({
        key,
        value: value && value.__wrapped ? value.data : value,
        ttl: ttl > 0 ? ttl : undefined
      });
    }
    
    return entries;
  }

  // Import cache data
  import(entries: Array<{ key: string; value: any; ttl?: number }>): void {
    entries.forEach(({ key, value, ttl }) => {
      this.set(key, value, { ttl });
    });
    
    logger.info(`Imported ${entries.length} memory cache entries`);
  }

  // Get memory usage breakdown
  getMemoryBreakdown(): {
    total: number;
    average: number;
    largest: number;
    smallest: number;
  } {
    const size = this.cache.size;
    const total = this.stats.totalMemoryUsage;
    
    return {
      total,
      average: size > 0 ? total / size : 0,
      largest: total, // Simplified - in reality would calculate per item
      smallest: size > 0 ? 1024 : 0 // Simplified
    };
  }
}

// Singleton instance
let memoryCacheManager: MemoryCacheManager | null = null;

export function getMemoryCacheManager(): MemoryCacheManager {
  if (!memoryCacheManager) {
    memoryCacheManager = new MemoryCacheManager({
      maxSize: 1000,
      maxAge: 5 * 60 * 1000, // 5 minutes
      updateAgeOnGet: true,
      allowStale: false
    });
  }

  return memoryCacheManager;
}

export { MemoryCacheManager };
