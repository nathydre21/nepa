import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export interface RateLimitMetrics {
  totalRequests: number;
  blockedRequests: number;
  uniqueIPs: number;
  uniqueUsers: number;
  breaches: RateLimitBreach[];
}

export interface RateLimitBreach {
  id: string;
  ip: string;
  userId?: string;
  endpoint: string;
  timestamp: Date;
  limit: number;
  used: number;
}

class APIRateLimiter {
  private redis: Redis;
  private metrics: RateLimitMetrics = {
    totalRequests: 0,
    blockedRequests: 0,
    uniqueIPs: new Set<string>().size,
    uniqueUsers: new Set<string>().size,
    breaches: []
  };
  private ipTrack = new Set<string>();
  private userTrack = new Set<string>();

  constructor() {
    this.redis = redis;
    this.startMonitoring();
  }

  private startMonitoring(): void {
    setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  private async cleanup(): Promise<void> {
    const now = Date.now();
    const keys = await this.redis.keys('rl:ip:*');
    for (const key of keys) {
      const ttl = await this.redis.ttl(key);
      if (ttl <= 0) {
        this.ipTrack.delete(key);
      }
    }
  }

  async recordRequest(req: Request): Promise<void> {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const userId = (req as any).user?.id;
    
    this.ipTrack.add(ip);
    if (userId) this.userTrack.add(userId);
    this.metrics.totalRequests++;
    
    await this.redis.incr('rl:metrics:total');
  }

  recordBlocked(req: Request): void {
    this.metrics.blockedRequests++;
    this.redis.incr('rl:metrics:blocked');
  }

async recordBreach(breach: RateLimitBreach): Promise<void> {
    this.metrics.breaches.push(breach);
    
    const key = `rl:breach:${breach.id}`;
    await this.redis.setex(key, 86400, JSON.stringify(breach));
    
    this.sendAlert(breach);
  }
  
  private async sendAlert(breach: RateLimitBreach): Promise<void> {
    const alert = {
      type: 'RATE_LIMIT_BREACH',
      severity: breach.used > breach.limit * 2 ? 'HIGH' : 'MEDIUM',
      ip: breach.ip,
      endpoint: breach.endpoint,
      used: breach.used,
      limit: breach.limit,
      timestamp: breach.timestamp
    };
    
    console.error('RATE LIMIT BREACH:', JSON.stringify(alert));
    
    if (process.env.SLACK_WEBHOOK_URL) {
      try {
        const axios = require('axios');
        await axios.post(process.env.SLACK_WEBHOOK_URL, {
          text: `🚨 Rate Limit Breach Alert`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*RATE LIMIT BREACH*\n• IP: ${breach.ip}\n• Endpoint: ${breach.endpoint}\n• Used: ${breach.used}/${breach.limit}\n• Severity: ${alert.severity}`
              }
            }
          ]
        });
      } catch (e) {
        console.error('Failed to send Slack alert:', e);
      }
    }
    
    if (process.env.DISCORD_WEBHOOK_URL) {
      try {
        const axios = require('axios');
        await axios.post(process.env.DISCORD_WEBHOOK_URL, {
          content: `🚨 **Rate Limit Breach**\n• IP: ${breach.ip}\n• Endpoint: ${breach.endpoint}\n• Used: ${breach.used}/${breach.limit}`
        });
      } catch (e) {
        console.error('Failed to send Discord alert:', e);
      }
    }
    
    await this.redis.lpush('rl:alerts', JSON.stringify(alert));
    await this.redis.ltrim('rl:alerts', 0, 99);
  }
  
  async getAlerts(limit = 50): Promise<any[]> {
    const alerts = await this.redis.lrange('rl:alerts', 0, limit - 1);
    return alerts.map(a => JSON.parse(a));
  }

  async getMetrics(): Promise<RateLimitMetrics> {
    const total = await this.redis.get('rl:metrics:total') || '0';
    const blocked = await this.redis.get('rl:metrics:blocked') || '0';
    
    return {
      totalRequests: parseInt(total),
      blockedRequests: parseInt(blocked),
      uniqueIPs: this.ipTrack.size,
      uniqueUsers: this.userTrack.size,
      breaches: this.metrics.breaches.slice(-50)
    };
  }
}

const rateLimiter = new APIRateLimiter();

export const endpointRateLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.call(...args),
  }),
  windowMs: 60000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.path,
  handler: (req, res) => {
    rateLimiter.recordBlocked(req);
    res.status(429).json({
      status: 429,
      error: 'Rate limit exceeded for this endpoint',
      endpoint: req.path,
      retryAfter: '1 minute'
    });
  }
});

export const userRateLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.call(...args),
  }),
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.id || 'anonymous';
    return `user:${userId}`;
  },
  handler: (req, res) => {
    rateLimiter.recordBlocked(req);
    res.status(429).json({
      status: 429,
      error: 'User rate limit exceeded',
      retryAfter: '15 minutes'
    });
  }
});

export const ipRateLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.call(...args),
  }),
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.ip || 'unknown',
  handler: (req, res) => {
    rateLimiter.recordBlocked(req);
    res.status(429).json({
      status: 429,
      error: 'IP rate limit exceeded',
      retryAfter: '1 minute'
    });
  }
});

export const createRateLimiter = (options: {
  windowMs?: number;
  max?: number;
  keyGenerator?: (req: Request) => string;
}) => {
  return rateLimit({
    store: new RedisStore({
      sendCommand: (...args: string[]) => redis.call(...args),
    }),
    windowMs: options.windowMs || 60000,
    max: options.max || 100,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: options.keyGenerator || ((req: Request) => req.ip || 'unknown'),
  });
};

export const getRateLimitMetrics = async (): Promise<RateLimitMetrics> => {
  return rateLimiter.getMetrics();
};

export const getRateLimitStatus = async (req: Request, res: Response) => {
  const metrics = await rateLimiter.getMetrics();
  res.json({
    status: 'ok',
    metrics,
    timestamp: new Date().toISOString()
  });
};

export const checkRateLimitHealth = async () => {
  try {
    await redis.ping();
    return { healthy: true };
  } catch {
    return { healthy: false };
  }
};

export default rateLimiter;