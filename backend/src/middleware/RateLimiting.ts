import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
import { ApiResponse, ResponseBuilder, HttpStatus, ErrorCode } from '../interfaces/ApiResponse';

const redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

/**
 * Rate Limiting Configuration
 */
interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
  onLimitReached?: (req: Request, res: Response) => void;
}

/**
 * Rate Limiting Strategies
 */
export class RateLimiting {
  /**
   * Create basic rate limiter
   */
  static createBasic(config: RateLimitConfig) {
    return rateLimit({
      windowMs: config.windowMs,
      max: config.max,
      store: new RedisStore({
        sendCommand: (...args: string[]) => redisClient.call(...args),
        prefix: 'rl:basic:'
      }),
      message: {
        success: false,
        error: {
          code: ErrorCode.RATE_LIMIT_EXCEEDED,
          message: config.message || 'Too many requests',
          details: {
            limit: config.max,
            windowMs: config.windowMs
          }
        },
        timestamp: new Date().toISOString()
      },
      standardHeaders: config.standardHeaders !== false,
      legacyHeaders: config.legacyHeaders !== false,
      keyGenerator: config.keyGenerator || this.defaultKeyGenerator,
      skip: config.skip,
      onLimitReached: config.onLimitReached || this.defaultOnLimitReached,
      handler: (req: Request, res: Response) => {
        const response = ResponseBuilder.tooManyRequests(
          config.max,
          Date.now() + config.windowMs,
          Math.ceil(config.windowMs / 1000)
        );
        res.status(HttpStatus.TOO_MANY_REQUESTS).json(response);
      }
    });
  }

  /**
   * Create user-specific rate limiter
   */
  static createUserBased(config: RateLimitConfig) {
    return RateLimiting.createBasic({
      ...config,
      keyGenerator: (req: Request) => {
        const user = (req as any).user;
        if (user?.id) {
          return `user:${user.id}`;
        }
        return RateLimiting.defaultKeyGenerator(req);
      }
    });
  }

  /**
   * Create IP-based rate limiter
   */
  static createIpBased(config: RateLimitConfig) {
    return RateLimiting.createBasic({
      ...config,
      keyGenerator: (req: Request) => {
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        return `ip:${ip}`;
      }
    });
  }

  /**
   * Create endpoint-specific rate limiter
   */
  static createEndpointBased(endpoint: string, config: RateLimitConfig) {
    return RateLimiting.createBasic({
      ...config,
      keyGenerator: (req: Request) => {
        const baseKey = RateLimiting.defaultKeyGenerator(req);
        return `${endpoint}:${baseKey}`;
      }
    });
  }

  /**
   * Create progressive rate limiter (increasing limits for trusted users)
   */
  static createProgressive(config: {
    baseLimit: number;
    maxLimit: number;
    windowMs: number;
    trustThreshold?: number;
  }) {
    return rateLimit({
      windowMs: config.windowMs,
      store: new RedisStore({
        sendCommand: (...args: string[]) => redisClient.call(...args),
        prefix: 'rl:prog:'
      }),
      max: (req: Request) => {
        const user = (req as any).user;
        if (!user) {
          return config.baseLimit;
        }

        // Calculate trust score based on user age, activity, etc.
        const trustScore = RateLimiting.calculateTrustScore(user);
        const limit = Math.floor(
          config.baseLimit + (config.maxLimit - config.baseLimit) * (trustScore / 100)
        );

        return Math.min(limit, config.maxLimit);
      },
      message: {
        success: false,
        error: {
          code: ErrorCode.RATE_LIMIT_EXCEEDED,
          message: 'Rate limit exceeded',
          details: {
            baseLimit: config.baseLimit,
            maxLimit: config.maxLimit,
            currentLimit: 'dynamic based on user trust'
          }
        },
        timestamp: new Date().toISOString()
      },
      standardHeaders: true,
      keyGenerator: (req: Request) => {
        const user = (req as any).user;
        if (user?.id) {
          return `progressive:user:${user.id}`;
        }
        return `progressive:${RateLimiting.defaultKeyGenerator(req)}`;
      }
    });
  }

  /**
   * Create adaptive rate limiter (adjusts based on system load)
   */
  static createAdaptive(config: {
    baseLimit: number;
    windowMs: number;
    loadThreshold?: number;
  }) {
    return rateLimit({
      windowMs: config.windowMs,
      store: new RedisStore({
        sendCommand: (...args: string[]) => redisClient.call(...args),
        prefix: 'rl:adapt:'
      }),
      max: (req: Request) => {
        const systemLoad = RateLimiting.getSystemLoad();
        const threshold = config.loadThreshold || 0.8;
        
        if (systemLoad > threshold) {
          // Reduce limit during high load
          const reductionFactor = 1 - ((systemLoad - threshold) / (1 - threshold));
          return Math.floor(config.baseLimit * reductionFactor);
        }
        
        return config.baseLimit;
      },
      message: {
        success: false,
        error: {
          code: ErrorCode.RATE_LIMIT_EXCEEDED,
          message: 'Rate limit exceeded',
          details: {
            baseLimit: config.baseLimit,
            currentLimit: 'adaptive based on system load',
            systemLoad
          }
        },
        timestamp: new Date().toISOString()
      },
      standardHeaders: true,
      keyGenerator: RateLimiting.defaultKeyGenerator
    });
  }

  /**
   * Create tiered rate limiter (different limits for different user tiers)
   */
  static createTiered(config: {
    tiers: Record<string, number>;
    windowMs: number;
    defaultTier: string;
  }) {
    return rateLimit({
      windowMs: config.windowMs,
      store: new RedisStore({
        sendCommand: (...args: string[]) => redisClient.call(...args),
        prefix: 'rl:tier:'
      }),
      max: (req: Request) => {
        const user = (req as any).user;
        if (!user) {
          return config.tiers[config.defaultTier] || 100;
        }

        const userTier = user.tier || config.defaultTier;
        return config.tiers[userTier] || config.tiers[config.defaultTier] || 100;
      },
      message: {
        success: false,
        error: {
          code: ErrorCode.RATE_LIMIT_EXCEEDED,
          message: 'Rate limit exceeded',
          details: {
            tiers: config.tiers,
            userTier: (req as any).user?.tier || config.defaultTier
          }
        },
        timestamp: new Date().toISOString()
      },
      standardHeaders: true,
      keyGenerator: (req: Request) => {
        const user = (req as any).user;
        if (user?.id) {
          return `tiered:user:${user.id}:${user.tier || config.defaultTier}`;
        }
        return `tiered:${RateLimiting.defaultKeyGenerator(req)}`;
      }
    });
  }

  /**
   * Default key generator
   */
  private static defaultKeyGenerator(req: Request): string {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    // Create a hash from IP and user agent for basic identification
    return Buffer.from(`${ip}:${userAgent}`).toString('base64');
  }

  /**
   * Default limit reached handler
   */
  private static defaultOnLimitReached(req: Request, res: Response): void {
    const context = (req as any).context;
    console.warn('Rate limit reached:', {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: context?.requestId,
      userId: (req as any).user?.id
    });
  }

  /**
   * Calculate user trust score (0-100)
   */
  private static calculateTrustScore(user: any): number {
    let score = 0;

    // Account age (0-30 points)
    if (user.createdAt) {
      const daysSinceCreation = (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      score += Math.min(daysSinceCreation, 30);
    }

    // Email verification (10 points)
    if (user.isEmailVerified) {
      score += 10;
    }

    // Two-factor authentication (20 points)
    if (user.twoFactorEnabled) {
      score += 20;
    }

    // Account status (20 points)
    if (user.status === 'active') {
      score += 20;
    }

    // Previous good behavior (20 points)
    // This would typically come from a reputation system
    // For now, we'll use a placeholder
    score += 20;

    return Math.min(score, 100);
  }

  /**
   * Get current system load (0-1)
   */
  private static getSystemLoad(): number {
    // This would typically integrate with monitoring systems
    // For now, return a mock value
    return Math.random() * 0.5; // Mock: 0-50% load
  }
}

/**
 * Predefined rate limiters for common use cases
 */
export const RateLimiters = {
  // Authentication endpoints - very strict
  auth: RateLimiting.createBasic({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: 'Too many authentication attempts. Please try again later.'
  }),

  // General API - moderate
  api: RateLimiting.createProgressive({
    baseLimit: 100,
    maxLimit: 1000,
    windowMs: 15 * 60 * 1000, // 15 minutes
    trustThreshold: 80
  }),

  // File uploads - strict
  upload: RateLimiting.createBasic({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    message: 'Too many file uploads. Please try again later.'
  }),

  // Search endpoints - moderate
  search: RateLimiting.createBasic({
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    message: 'Too many search requests. Please slow down.'
  }),

  // Admin endpoints - very strict
  admin: RateLimiting.createUserBased({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 50,
    message: 'Too many admin requests. Please slow down.'
  }),

  // Public endpoints - lenient
  public: RateLimiting.createIpBased({
    windowMs: 60 * 1000, // 1 minute
    max: 1000,
    message: 'Too many requests from this IP.'
  })
};
