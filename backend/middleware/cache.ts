import { Request, Response, NextFunction } from 'express';

export const CachePresets = {
  development: { maxSize: 100, ttl: 60 },
  production: { maxSize: 10000, ttl: 3600 },
  test: { maxSize: 50, ttl: 10 },
};

// Module-level active cache - updated whenever a new GraphQLCache is constructed
let _activeCache: GraphQLCache;

// In-memory cache store
export class GraphQLCache {
  private cache: Map<string, { value: any; expiresAt: number }>;
  private config: { maxSize: number; ttl: number };
  private stats = { hits: 0, misses: 0, evictions: 0 };

  constructor(config: { maxSize?: number; ttl?: number; [key: string]: any } = {}) {
    this.config = { maxSize: config.maxSize ?? 1000, ttl: config.ttl ?? 300 };
    this.cache = new Map();
    // Register as the active global instance for invalidation helpers
    _activeCache = this;
  }

  async get<T = any>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) { this.stats.misses++; return null; }
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }
    this.stats.hits++;
    return entry.value as T;
  }

  async set<T = any>(key: string, value: T, ttl?: number): Promise<void> {
    if (this.cache.size >= this.config.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) { this.cache.delete(firstKey); this.stats.evictions++; }
    }
    const expiresAt = Date.now() + ((ttl ?? this.config.ttl) * 1000);
    this.cache.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<boolean> {
    return this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  async disconnect(): Promise<void> {
    this.cache.clear();
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      size: this.cache.size,
      evictions: this.stats.evictions,
    };
  }

  async healthCheck(): Promise<{ status: string; details: any }> {
    const stats = this.getStats();
    const status = stats.misses === 0 || stats.hitRate >= 0.5 ? 'healthy' : 'degraded';
    return {
      status,
      details: {
        memory: { size: this.cache.size, maxSize: this.config.maxSize },
        performance: { hitRate: stats.hitRate },
      },
    };
  }

  invalidatePattern(pattern: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) { this.cache.delete(key); count++; }
    }
    return count;
  }
}

// Initialize default global cache
_activeCache = new GraphQLCache(CachePresets.production);

export interface CacheMiddlewareOptions {
  ttl?: number;
  keyGenerator?: (req: Request) => string;
  patterns?: string[];
}

export function cacheMiddleware(options: CacheMiddlewareOptions = {}) {
  const { ttl = 300, keyGenerator } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') return next();

    const key = keyGenerator ? keyGenerator(req) : `${req.path}:${JSON.stringify(req.query)}`;
    const cached = await _activeCache.get(key);
    if (cached !== null) {
      res.set('X-Cache', 'HIT');
      return res.json(cached);
    }

    res.set('X-Cache', 'MISS');
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      if (res.statusCode === 200) _activeCache.set(key, body, ttl).catch(() => {});
      return originalJson(body);
    };
    return next();
  };
}

export function invalidateCache(options: { patterns?: string[] } = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    res.on('finish', async () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        for (const pattern of options.patterns ?? []) {
          _activeCache.invalidatePattern(pattern);
        }
      }
    });
    return next();
  };
}

export async function invalidateUserCache(userId: string): Promise<number> {
  return _activeCache.invalidatePattern(`user:${userId}`);
}

export async function invalidateCacheByPattern(pattern: string): Promise<number> {
  return _activeCache.invalidatePattern(pattern);
}

export default _activeCache;
