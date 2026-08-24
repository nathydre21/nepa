import { Request, Response, NextFunction } from 'express';
import { getCacheStrategy } from '../services/cache/CacheStrategy';
import { getSessionCacheService } from '../services/cache/SessionCacheService';
import { getCacheMonitoringService } from '../services/cache/CacheMonitoringService';
import { logger } from '../services/logger';

export interface CacheMiddlewareOptions {
  pattern: string;
  ttl?: number;
  keyGenerator?: (req: Request) => Record<string, string>;
  condition?: (req: Request) => boolean;
  skipCache?: (req: Request) => boolean;
  skipMethods?: string[];
  varyBy?: string[]; // Headers to vary cache by
  tags?: string[];
}

/**
 * Express middleware for automatic HTTP response caching
 */
export function cacheMiddleware(options: CacheMiddlewareOptions) {
  const cacheStrategy = getCacheStrategy();
  const monitoring = getCacheMonitoringService();

  return async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    // Skip caching for certain methods
    if (options.skipMethods?.includes(req.method) || req.method !== 'GET') {
      return next();
    }

    // Skip caching based on condition
    if (options.skipCache?.(req) || options.condition?.(req) === false) {
      return next();
    }

    try {
      // Generate cache key
      const keyParams = options.keyGenerator ? 
        options.keyGenerator(req) : 
        generateDefaultKeyParams(req, options.varyBy);

      const cacheKey = cacheStrategy.generateKey(options.pattern, keyParams);

      // Try to get cached response
      const cached = await cacheStrategy.get<{
        statusCode: number;
        headers: Record<string, string>;
        body: any;
        timestamp: number;
      }>(options.pattern, keyParams);

      if (cached) {
        // Cache hit - return cached response
        res.status(cached.statusCode);
        
        // Set cached headers
        Object.entries(cached.headers).forEach(([key, value]) => {
          res.set(key, value);
        });

        // Add cache headers
        res.set('X-Cache', 'HIT');
        res.set('X-Cache-Key', cacheKey);
        res.set('X-Cache-Age', Math.floor((Date.now() - cached.timestamp) / 1000).toString());

        const responseTime = Date.now() - startTime;
        monitoring.recordSlowQuery(options.pattern, responseTime);

        return res.json(cached.body);
      }

      // Cache miss - intercept response
      const originalSend = res.json;
      const originalStatus = res.status;
      let statusCode = 200;
      let responseBody: any;

      // Override status method
      res.status = function(code: number) {
        statusCode = code;
        return originalStatus.call(this, code);
      };

      // Override json method to cache response
      res.json = function(body: any) {
        responseBody = body;

        // Only cache successful responses
        if (statusCode >= 200 && statusCode < 300) {
          // Cache the response asynchronously
          setImmediate(async () => {
            try {
              const cacheData = {
                statusCode,
                headers: extractCacheableHeaders(res),
                body: responseBody,
                timestamp: Date.now()
              };

              await cacheStrategy.set(options.pattern, keyParams, cacheData);
              
              logger.debug(`Cached response for pattern ${options.pattern}`, {
                key: cacheKey,
                statusCode,
                size: JSON.stringify(responseBody).length
              });
            } catch (error) {
              logger.error('Response caching error:', error);
            }
          });
        }

        // Add cache headers
        res.set('X-Cache', 'MISS');
        res.set('X-Cache-Key', cacheKey);

        const responseTime = Date.now() - startTime;
        monitoring.recordSlowQuery(options.pattern, responseTime);

        return originalSend.call(this, body);
      };

      next();
    } catch (error) {
      logger.error('Cache middleware error:', error);
      next();
    }
  };
}

/**
 * Session-aware cache middleware
 */
export function sessionCacheMiddleware(options: Omit<CacheMiddlewareOptions, 'keyGenerator'>) {
  return cacheMiddleware({
    ...options,
    keyGenerator: (req: Request) => {
      const userId = req.user?.id || 'anonymous';
      const sessionId = req.session?.id || 'no-session';
      
      return {
        userId,
        sessionId,
        path: req.path,
        query: JSON.stringify(req.query)
      };
    }
  });
}

/**
 * User-specific cache middleware
 */
export function userCacheMiddleware(options: Omit<CacheMiddlewareOptions, 'keyGenerator'>) {
  return cacheMiddleware({
    ...options,
    keyGenerator: (req: Request) => {
      const userId = req.user?.id || 'anonymous';
      
      return {
        userId,
        path: req.path,
        query: JSON.stringify(req.query)
      };
    },
    condition: (req: Request) => !!req.user?.id // Only cache for authenticated users
  });
}

/**
 * API endpoint cache middleware
 */
export function apiCacheMiddleware(pattern: string, ttl: number = 300) {
  return cacheMiddleware({
    pattern,
    ttl,
    keyGenerator: (req: Request) => ({
      endpoint: req.path,
      method: req.method,
      query: JSON.stringify(req.query),
      userId: req.user?.id || 'anonymous'
    }),
    skipMethods: ['POST', 'PUT', 'DELETE', 'PATCH'],
    varyBy: ['Authorization', 'Accept-Language']
  });
}

/**
 * Generate default cache key parameters
 */
function generateDefaultKeyParams(req: Request, varyBy?: string[]): Record<string, string> {
  const params: Record<string, string> = {
    path: req.path,
    query: JSON.stringify(req.query)
  };

  // Add headers to vary by
  if (varyBy) {
    varyBy.forEach(header => {
      const value = req.get(header);
      if (value) {
        params[`header_${header.toLowerCase()}`] = value;
      }
    });
  }

  return params;
}

/**
 * Extract cacheable headers from response
 */
function extractCacheableHeaders(res: Response): Record<string, string> {
  const cacheableHeaders = [
    'content-type',
    'content-encoding',
    'content-language',
    'etag',
    'last-modified'
  ];

  const headers: Record<string, string> = {};
  
  cacheableHeaders.forEach(header => {
    const value = res.get(header);
    if (value) {
      headers[header] = value;
    }
  });

  return headers;
}

/**
 * Cache invalidation middleware for write operations
 */
export function cacheInvalidationMiddleware(tags: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const cacheStrategy = getCacheStrategy();

    // Store original send method
    const originalSend = res.json;

    // Override to invalidate cache after successful write
    res.json = function(body: any) {
      // Only invalidate on successful operations
      if (res.statusCode >= 200 && res.statusCode < 300) {
        setImmediate(async () => {
          try {
            await cacheStrategy.invalidate('', {}, tags);
            logger.debug(`Invalidated cache tags: ${tags.join(', ')}`);
          } catch (error) {
            logger.error('Cache invalidation error:', error);
          }
        });
      }

      return originalSend.call(this, body);
    };

    next();
  };
}

/**
 * Conditional cache middleware based on user role
 */
export function roleCacheMiddleware(
  options: CacheMiddlewareOptions,
  allowedRoles: string[] = ['USER', 'ADMIN']
) {
  return cacheMiddleware({
    ...options,
    condition: (req: Request) => {
      const userRole = req.user?.role;
      return userRole && allowedRoles.includes(userRole);
    }
  });
}

/**
 * Cache warming middleware for critical endpoints
 */
export function cacheWarmingMiddleware(pattern: string, warmupData: any) {
  const cacheStrategy = getCacheStrategy();

  return async (req: Request, res: Response, next: NextFunction) => {
    // Warm cache in background if not already cached
    setImmediate(async () => {
      try {
        const keyParams = generateDefaultKeyParams(req);
        const cached = await cacheStrategy.get(pattern, keyParams);
        
        if (!cached && warmupData) {
          await cacheStrategy.set(pattern, keyParams, warmupData);
          logger.debug(`Warmed cache for pattern: ${pattern}`);
        }
      } catch (error) {
        logger.error('Cache warming error:', error);
      }
    });

    next();
  };
}

/**
 * Cache health check middleware
 */
export function cacheHealthMiddleware() {
  const monitoring = getCacheMonitoringService();

  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/health/cache') {
      try {
        const health = await monitoring.getHealthMetrics();
        const report = monitoring.getPerformanceReport();

        res.json({
          status: health.redis.connected ? 'healthy' : 'unhealthy',
          redis: health.redis,
          performance: report.summary,
          alerts: health.alerts.length,
          recommendations: report.recommendations
        });
      } catch (error) {
        res.status(500).json({
          status: 'error',
          message: 'Cache health check failed',
          error: error.message
        });
      }
    } else {
      next();
    }
  };
}