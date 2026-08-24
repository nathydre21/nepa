import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
import { AdvancedRateLimitService } from '../services/AdvancedRateLimitService';
import { RateLimitBreach } from '../types/rateLimit';
import { IPBlockingService } from '../services/IPBlockingService';
import { RateLimitBreachNotificationService } from '../services/RateLimitBreachNotificationService';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const rateLimitService = new AdvancedRateLimitService();
const ipBlockingService = new IPBlockingService();
const notificationService = new RateLimitBreachNotificationService();

// Breach alerting system
rateLimitService.onBreach(async (breach: RateLimitBreach) => {
  console.warn(`🚨 Rate Limit Breach Detected:`, {
    id: breach.id,
    ip: breach.ip,
    endpoint: breach.endpoint,
    severity: breach.severity,
    timestamp: breach.timestamp
  });

  // Send notifications through configured channels
  try {
    await notificationService.notifyBreach(breach);
  } catch (error) {
    console.error('Notification error:', error);
  }

  // Handle IP blocking based on severity and breach type
  try {
    if (breach.severity === 'CRITICAL') {
      // Auto-block for critical breaches
      await ipBlockingService.blockIP(
        breach.ip,
        `Critical rate limit breach: ${breach.breachType}`,
        'CRITICAL',
        true,
        {
          breachId: breach.id,
          endpoint: breach.endpoint,
          detectedAt: new Date()
        }
      );
    } else if (breach.severity === 'HIGH' && breach.breachType === 'DDOS') {
      // Auto-block for DDOS patterns
      await ipBlockingService.recordAbuse(breach.ip, 'DDOS_PATTERN', {
        endpoint: breach.endpoint,
        breachId: breach.id
      });
    } else if (breach.severity === 'HIGH') {
      // Record abuse for high severity
      await ipBlockingService.recordAbuse(breach.ip, 'RATE_LIMIT_BREACH', {
        endpoint: breach.endpoint,
        breachId: breach.id
      });
    }
  } catch (error) {
    console.error('IP blocking error:', error);
  }
});

// Advanced multi-tier rate limiting middleware
export const advancedRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Skip for health checks and internal monitoring
    if (req.path === '/health' || req.path.startsWith('/api/monitoring')) {
      return next();
    }

    const clientIP = req.ip || (req.connection as any).remoteAddress;

    // Check if IP is whitelisted
    const isWhitelisted = await ipBlockingService.isIPWhitelisted(clientIP);
    if (isWhitelisted) {
      return next();
    }

    // Check if IP is blocked
    const blockRecord = await ipBlockingService.isIPBlocked(clientIP);
    if (blockRecord) {
      return res.status(403).json({
        status: 403,
        error: 'Access denied',
        message: `Your IP has been blocked due to: ${blockRecord.reason}`,
        severity: blockRecord.severity,
        blockedUntil: blockRecord.expiresAt.toISOString()
      });
    }

    // Analyze DDOS patterns
    const isDDOSPattern = await ipBlockingService.analyzeDDOSPattern(clientIP, req.path, req.method);
    if (isDDOSPattern) {
      await ipBlockingService.recordAbuse(clientIP, 'DDOS_PATTERN', {
        endpoint: req.path,
        method: req.method
      });

      return res.status(429).json({
        status: 429,
        error: 'Too many requests',
        message: 'Suspicious activity detected. Please try again later.'
      });
    }

    // Get user profile and effective rate limit
    const userProfile = await rateLimitService.getUserRateLimitProfile(
      (req as any).user?.id || 'anonymous'
    );
    
    const effectiveLimit = await rateLimitService.getEffectiveRateLimit(req, userProfile);
    
    // Check if user is blocked
    if (effectiveLimit.name === 'BLOCKED') {
      return res.status(403).json({
        status: 403,
        error: 'Access denied',
        message: 'Your account has been restricted due to policy violations',
        retryAfter: Math.ceil(effectiveLimit.windowMs / 1000)
      });
    }

    // Check rate limit
    const result = await rateLimitService.checkRateLimit(req, effectiveLimit);
    
    // Record metrics for analytics
    await rateLimitService.recordMetrics(req, effectiveLimit, result);

    if (!result.allowed) {
      // Detect and handle breach
      const breach = await rateLimitService.detectBreach(req, effectiveLimit, result);
      
      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': effectiveLimit.requestsPerWindow,
        'X-RateLimit-Remaining': result.remaining,
        'X-RateLimit-Reset': result.resetTime.toISOString(),
        'X-RateLimit-Tier': effectiveLimit.name,
        'X-RateLimit-Burst': result.burstUsed || 0,
        'Retry-After': Math.ceil((result.resetTime.getTime() - Date.now()) / 1000)
      });

      return res.status(429).json({
        status: 429,
        error: 'Rate limit exceeded',
        message: `Too many requests. Limit: ${effectiveLimit.requestsPerWindow} per ${Math.ceil(effectiveLimit.windowMs / 60000)} minutes`,
        tier: effectiveLimit.name,
        retryAfter: Math.ceil((result.resetTime.getTime() - Date.now()) / 1000),
        resetTime: result.resetTime.toISOString()
      });
    }

    // Set rate limit headers for successful requests
    res.set({
      'X-RateLimit-Limit': effectiveLimit.requestsPerWindow,
      'X-RateLimit-Remaining': result.remaining,
      'X-RateLimit-Reset': result.resetTime.toISOString(),
      'X-RateLimit-Tier': effectiveLimit.name,
      'X-RateLimit-Burst': result.burstUsed || 0
    });

    next();
  } catch (error) {
    console.error('Rate limiting error:', error);
    // Fail open - allow request if rate limiting fails
    next();
  }
};

// Burst handling middleware
export const burstHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userProfile = await rateLimitService.getUserRateLimitProfile(
      (req as any).user?.id || 'anonymous'
    );
    
    const effectiveLimit = await rateLimitService.getEffectiveRateLimit(req, userProfile);
    
    if (!effectiveLimit.features.burstHandling) {
      return next();
    }

    const result = await rateLimitService.checkRateLimit(req, effectiveLimit);
    
    // If burst capacity is exceeded, apply additional throttling
    if (result.burstUsed && effectiveLimit.burstCapacity && result.burstUsed > effectiveLimit.burstCapacity) {
      const delay = Math.min(1000 * Math.pow(2, result.burstUsed - effectiveLimit.burstCapacity), 10000);
      
      return setTimeout(() => {
        res.set('X-RateLimit-Burst-Delay', delay.toString());
        next();
      }, delay);
    }

    next();
  } catch (error) {
    console.error('Burst handling error:', error);
    next();
  }
};

// Role-based rate limiting
export const roleBasedRateLimiter = (requiredRole?: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userRole = (req as any).user?.role;
      
      if (requiredRole && userRole !== requiredRole) {
        return res.status(403).json({
          status: 403,
          error: 'Insufficient permissions',
          message: `This endpoint requires ${requiredRole} role`
        });
      }

      // Apply stricter limits for lower-tier roles
      const userProfile = await rateLimitService.getUserRateLimitProfile(
        (req as any).user?.id || 'anonymous'
      );
      
      const effectiveLimit = await rateLimitService.getEffectiveRateLimit(req, userProfile);
      const result = await rateLimitService.checkRateLimit(req, effectiveLimit);
      
      if (!result.allowed) {
        return res.status(429).json({
          status: 429,
          error: 'Rate limit exceeded',
          message: `Rate limit exceeded for role ${userRole}`,
          tier: effectiveLimit.name,
          retryAfter: Math.ceil((result.resetTime.getTime() - Date.now()) / 1000)
        });
      }

      next();
    } catch (error) {
      console.error('Role-based rate limiting error:', error);
      next();
    }
  };
};

// API endpoint for rate limiting analytics
export const rateLimitAnalyticsHandler = async (req: Request, res: Response) => {
  try {
    const { start, end } = req.query as { start?: string; end?: string };
    
    const timeWindow = {
      start: start ? new Date(start) : new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
      end: end ? new Date(end) : new Date()
    };

    const analytics = await rateLimitService.getAnalytics(timeWindow);
    
    res.json({
      success: true,
      data: analytics,
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate analytics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// API endpoint for breach history
export const breachHistoryHandler = async (req: Request, res: Response) => {
  try {
    const { limit = 50 } = req.query as { limit?: string };
    
    const breaches = await rateLimitService.getBreachHistory(parseInt(limit.toString()));
    
    res.json({
      success: true,
      data: breaches,
      count: breaches.length,
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Breach history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch breach history',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// API endpoint for managing user rate limit profiles
export const userProfileHandler = {
  // Get user's rate limit profile
  get: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id || req.params.userId;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'User ID required'
        });
      }

      const profile = await rateLimitService.getUserRateLimitProfile(userId);
      
      res.json({
        success: true,
        data: profile
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch user profile',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  // Update user's rate limit profile (admin only)
  update: async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { tier, whitelist, blacklist, customLimits, metadata } = req.body;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'User ID required'
        });
      }

      // Only admins can update other users' profiles
      if ((req as any).user?.role !== 'ADMIN' && (req as any).user?.role !== 'SUPER_ADMIN') {
        return res.status(403).json({
          success: false,
          error: 'Admin access required'
        });
      }

      const existingProfile = await rateLimitService.getUserRateLimitProfile(userId);
      const updatedProfile = {
        ...existingProfile,
        tier: tier || existingProfile.tier,
        whitelist: whitelist !== undefined ? whitelist : existingProfile.whitelist,
        blacklist: blacklist !== undefined ? blacklist : existingProfile.blacklist,
        customLimits: customLimits || existingProfile.customLimits,
        metadata: metadata || existingProfile.metadata
      };

      await rateLimitService.setUserRateLimitProfile(updatedProfile);
      
      res.json({
        success: true,
        data: updatedProfile,
        message: 'User rate limit profile updated successfully'
      });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update user profile',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
};

// Legacy rate limiters for backward compatibility
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    status: 429,
    error: 'Too many requests, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => req.path === '/health'
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    status: 429,
    error: 'Too many authentication attempts. Please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

export const paymentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  message: {
    status: 429,
    error: 'Too many payment attempts. Please try again later.',
    retryAfter: '5 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// API Key-based rate limiting middleware
import { APIKeyManagementService } from '../services/APIKeyManagementService';

const apiKeyService = new APIKeyManagementService();

export const apiKeyRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Only apply to API key authenticated requests
    const apiKeyValidation = await apiKeyService.validateAPIKey(req);
    
    if (!apiKeyValidation.valid) {
      // Not an API key request, pass through
      return next();
    }

    const keyData = apiKeyValidation.keyData!;
    
    // Check rate limit for API key
    const result = await apiKeyService.checkRateLimit(keyData.id, keyData);
    
    if (!result.allowed) {
      return res.status(429).json({
        status: 429,
        error: 'API Key rate limit exceeded',
        message: `Rate limit: ${keyData.rateLimit} per ${Math.ceil(keyData.windowMs / 60000)} minutes`,
        tier: keyData.tier,
        retryAfter: Math.ceil((result.resetTime.getTime() - Date.now()) / 1000),
        resetTime: result.resetTime.toISOString()
      });
    }

    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': keyData.rateLimit.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': result.resetTime.toISOString(),
      'X-RateLimit-Tier': keyData.tier
    });

    // Store API key info in request for downstream handlers
    (req as any).apiKey = keyData;

    next();
  } catch (error) {
    console.error('API key rate limiting error:', error);
    next();
  }
};
