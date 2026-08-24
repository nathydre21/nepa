import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export interface ComprehensiveRateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
  breachThreshold?: number;
}

export interface RateLimitBreachEvent {
  id: string;
  ip: string;
  userId?: string;
  endpoint: string;
  method: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  breachType: 'EXCEEDED' | 'BURST' | 'DDOS' | 'IP_BLOCKED';
  timestamp: Date;
  count: number;
  details: Record<string, unknown>;
}

type BreachCallback = (breach: RateLimitBreachEvent) => void;

class ComprehensiveRateLimitService {
  private redis: Redis;
  private breachCallbacks: BreachCallback[] = [];
  private readonly BREACH_PREFIX = 'rate_limit_breach';
  private readonly IP_STATS_PREFIX = 'ip_stats';
  private readonly USER_STATS_PREFIX = 'user_stats';

  constructor(redisUrl?: string) {
    this.redis = new Redis(redisUrl || process.env.REDIS_URL || 'redis://localhost:6379');
  }

  onBreach(callback: BreachCallback): void {
    this.breachCallbacks.push(callback);
  }

  private async emitBreach(breach: RateLimitBreachEvent): Promise<void> {
    await this.redis.setex(
      `${this.BREACH_PREFIX}:${breach.id}`,
      30 * 24 * 60 * 60,
      JSON.stringify(breach)
    );

    for (const callback of this.breachCallbacks) {
      try {
        await callback(breach);
      } catch (error) {
        console.error('Breach callback error:', error);
      }
    }
  }

  async analyzeIPBehavior(ip: string): Promise<{ score: number; patterns: string[] }> {
    const statsKey = `${this.IP_STATS_PREFIX}:${ip}`;
    const stats = await this.redis.hgetall(statsKey);
    
    let score = 0;
    const patterns: string[] = [];

    const requestCount = parseInt(stats.requestCount || '0');
    const errorCount = parseInt(stats.errorCount || '0');
    const breachCount = parseInt(stats.breachCount || '0');

    if (requestCount > 1000) {
      score += 30;
      patterns.push('HIGH_REQUEST_VOLUME');
    }

    if (errorCount > 50) {
      score += 25;
      patterns.push('HIGH_ERROR_RATE');
    }

    if (breachCount > 5) {
      score += 40;
      patterns.push('RECURRING_BREACHES');
    }

    const requestRate = parseFloat(stats.requestRate || '0');
    if (requestRate > 100) {
      score += 20;
      patterns.push('RAPID_REQUESTS');
    }

    return { score: Math.min(score, 100), patterns };
  }

  async getUserStats(userId: string): Promise<Record<string, string>> {
    const statsKey = `${this.USER_STATS_PREFIX}:${userId}`;
    return this.redis.hgetall(statsKey);
  }

  async createBreachRecord(
    ip: string,
    endpoint: string,
    method: string,
    userId?: string,
    breachType: RateLimitBreachEvent['breachType'] = 'EXCEEDED',
    severity: RateLimitBreachEvent['severity'] = 'MEDIUM'
  ): Promise<RateLimitBreachEvent> {
    const breach: RateLimitBreachEvent = {
      id: `breach_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ip,
      userId,
      endpoint,
      method,
      severity,
      breachType,
      timestamp: new Date(),
      count: 1,
      details: {
        userAgent: '',
        referer: '',
        requestCount: 0,
        userStats: userId ? await this.getUserStats(userId) : {}
      }
    };

    await this.emitBreach(breach);

    const statsKey = `${this.IP_STATS_PREFIX}:${ip}`;
    await this.redis.hincrby(statsKey, 'breachCount', 1);
    await this.redis.expire(statsKey, 24 * 60 * 60);

    return breach;
  }

  async recordRequest(req: Request, userId?: string): Promise<void> {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();

    const ipStatsKey = `${this.IP_STATS_PREFIX}:${ip}`;
    await this.redis.multi()
      .hincrby(ipStatsKey, 'requestCount', 1)
      .hset(ipStatsKey, 'lastRequest', now.toString())
      .hset(ipStatsKey, 'lastPath', req.path)
      .hset(ipStatsKey, 'userAgent', req.get('User-Agent') || '')
      .expire(ipStatsKey, 24 * 60 * 60)
      .exec();

    const rateKey = `${ipStatsKey}:rate`;
    const rateCount = await this.redis.incr(rateKey);
    await this.redis.expire(rateKey, 60);
    await this.redis.hset(ipStatsKey, 'requestRate', rateCount.toString());

    if (userId) {
      const userStatsKey = `${this.USER_STATS_PREFIX}:${userId}`;
      await this.redis.multi()
        .hincrby(userStatsKey, 'requestCount', 1)
        .hset(userStatsKey, 'lastRequest', now.toString())
        .hset(userStatsKey, 'lastIP', ip)
        .expire(userStatsKey, 24 * 60 * 60)
        .exec();
    }
  }

  async getBreachHistory(limit: number = 100): Promise<RateLimitBreachEvent[]> {
    const keys = await this.redis.keys(`${this.BREACH_PREFIX}:*`);
    const breaches: RateLimitBreachEvent[] = [];

    for (const key of keys.slice(0, limit)) {
      const data = await this.redis.get(key);
      if (data) {
        breaches.push(JSON.parse(data));
      }
    }

    return breaches.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }
}

const rateLimitService = new ComprehensiveRateLimitService();

rateLimitService.onBreach(async (breach: RateLimitBreachEvent) => {
  console.warn('Rate Limit Breach Detected:', {
    id: breach.id,
    ip: breach.ip,
    endpoint: breach.endpoint,
    severity: breach.severity,
    breachType: breach.breachType,
    timestamp: breach.timestamp
  });

  if (process.env.SLACK_WEBHOOK_URL && (breach.severity === 'HIGH' || breach.severity === 'CRITICAL')) {
    try {
      const axios = require('axios');
      await axios.post(process.env.SLACK_WEBHOOK_URL, {
        text: `Rate Limit Breach Alert - ${breach.severity}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Rate Limit Breach*\n*Severity:* ${breach.severity}\n*IP:* ${breach.ip}\n*Endpoint:* ${breach.endpoint}\n*Type:* ${breach.breachType}`
            }
          }
        ]
      });
    } catch (error) {
      console.error('Failed to send Slack notification:', error);
    }
  }
});

export const createRateLimiter = (config: ComprehensiveRateLimitConfig) => {
  return rateLimit({
    store: new RedisStore({
      sendCommand: async (...args: string[]) => {
        const result = await (redis as any).call(...args);
        return result;
      },
    }),
    windowMs: config.windowMs,
    max: config.max,
    message: {
      status: 429,
      error: config.message || 'Too many requests, please try again later.',
      retryAfter: `${Math.ceil(config.windowMs / 60000)} minutes`
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: config.keyGenerator || ((req: Request) => {
      const userId = (req as any).user?.id;
      return userId ? `${req.ip}:${userId}` : req.ip || 'unknown';
    }),
    skip: config.skip || ((req: Request) => req.path === '/health'),
    handler: async (req, res, next, options) => {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      const userId = (req as any).user?.id;
      
      const behavior = await rateLimitService.analyzeIPBehavior(ip);
      const severity = behavior.score > 70 ? 'CRITICAL' : behavior.score > 50 ? 'HIGH' : 'MEDIUM';

      await rateLimitService.createBreachRecord(
        ip,
        req.path,
        req.method,
        userId,
        'EXCEEDED',
        severity as RateLimitBreachEvent['severity']
      );

      res.status(429).json({
        status: 429,
        error: 'Rate limit exceeded',
        message: config.message || 'Too many requests, please try again later.',
        severity,
        retryAfter: `${Math.ceil(config.windowMs / 60000)} minutes`,
        timestamp: new Date().toISOString()
      });
    }
  });
};

export const globalApiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});

export const strictApiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: 'High request volume detected, please slow down.'
});

export const paymentEndpointLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 5,
  message: 'Too many payment attempts, please try again later.'
});

export const authEndpointLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many authentication attempts, please try again later.',
  skip: () => false
});

export const scheduledPaymentLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: 'Too many scheduled payment operations, please try again later.'
});

export const webhookLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: 'Too many webhook requests, please try again later.'
});

export const fileUploadLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many file uploads, please try again later.'
});

export const exportLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many export requests, please try again later.'
});

export const downloadLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: 'Too many download requests, please try again later.'
});

export const userBasedRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const userId = (req as any).user?.id;
    
    await rateLimitService.recordRequest(req, userId);

    if (userId) {
      const stats = await rateLimitService.getUserStats(userId);
      const requestCount = parseInt(stats.requestCount || '0');

      if (requestCount > 500) {
        const breach = await rateLimitService.createBreachRecord(
          ip,
          req.path,
          req.method,
          userId,
          'BURST',
          requestCount > 1000 ? 'HIGH' : 'MEDIUM'
        );
        
        return res.status(429).json({
          status: 429,
          error: 'User rate limit exceeded',
          message: 'Too many requests, please slow down.',
          breachId: breach.id
        });
      }
    }

    next();
  } catch (error) {
    console.error('User-based rate limiting error:', error);
    next();
  }
};

export const ipBasedRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const behavior = await rateLimitService.analyzeIPBehavior(ip);

    if (behavior.score > 80) {
      const breach = await rateLimitService.createBreachRecord(
        ip,
        req.path,
        req.method,
        undefined,
        'DDOS',
        'CRITICAL'
      );

      await redis.setex(`blocked:${ip}`, 300, 'true');

      return res.status(429).json({
        status: 429,
        error: 'Access temporarily blocked',
        message: 'Suspicious activity detected. Please try again later.',
        blockedUntil: new Date(Date.now() + 300000).toISOString()
      });
    }

    res.setHeader('X-RateLimit-BehavioralScore', behavior.score.toString());

    next();
  } catch (error) {
    console.error('IP-based rate limiting error:', error);
    next();
  }
};

export const progressiveRateLimiter = (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  
  const baseLimit = 100;
  const suspicious = (req as any).suspicious;
  
  const limit = suspicious ? 20 : baseLimit;
  const windowMs = suspicious ? 60 * 1000 : 15 * 60 * 1000;

  const key = `progressive:${ip}:${Math.floor(Date.now() / windowMs)}`;
  
  redis.incr(key, (err, count) => {
    if (err) {
      return next();
    }
    
    redis.expire(key, Math.ceil(windowMs / 1000));
    
    const currentCount = count || 0;
    if (currentCount > limit) {
      return res.status(429).json({
        status: 429,
        error: 'Progressive rate limit exceeded',
        message: suspicious 
          ? 'Suspicious activity detected. Please wait before making more requests.'
          : 'Too many requests. Please wait before trying again.',
        retryAfter: `${Math.ceil(windowMs / 60000)} minutes`
      });
    }
    
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - currentCount).toString());
    res.setHeader('X-RateLimit-Limit', limit.toString());
    next();
  });
};

export const rateLimitBreachMonitor = async (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const userId = (req as any).user?.id;

  res.on('finish', async () => {
    if (res.statusCode === 429) {
      await rateLimitService.createBreachRecord(
        ip,
        req.path,
        req.method,
        userId,
        'EXCEEDED',
        'MEDIUM'
      );
    }
  });

  next();
};

export const getRateLimitAnalytics = async (req: Request, res: Response) => {
  try {
    const { limit = '50' } = req.query as { limit?: string };
    const breaches = await rateLimitService.getBreachHistory(parseInt(limit.toString()));

    const stats = {
      totalBreaches: breaches.length,
      bySeverity: {
        CRITICAL: breaches.filter(b => b.severity === 'CRITICAL').length,
        HIGH: breaches.filter(b => b.severity === 'HIGH').length,
        MEDIUM: breaches.filter(b => b.severity === 'MEDIUM').length,
        LOW: breaches.filter(b => b.severity === 'LOW').length
      },
      byType: {
        EXCEEDED: breaches.filter(b => b.breachType === 'EXCEEDED').length,
        BURST: breaches.filter(b => b.breachType === 'BURST').length,
        DDOS: breaches.filter(b => b.breachType === 'DDOS').length,
        IP_BLOCKED: breaches.filter(b => b.breachType === 'IP_BLOCKED').length
      },
      recentBreaches: breaches.slice(0, 10),
      generatedAt: new Date().toISOString()
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Rate limit analytics error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
  }
};

export default rateLimitService;