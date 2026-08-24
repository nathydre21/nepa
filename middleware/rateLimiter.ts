import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';

// Redis client for distributed rate limiting
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// General API rate limiter
export const apiLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.call(...args),
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    status: 429,
    error: 'Too many requests, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  }
});

// Strict rate limiter for payment endpoints
export const paymentLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.call(...args),
  }),
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // Limit each IP to 5 payment requests per 5 minutes
  message: {
    status: 429,
    error: 'Too many payment attempts. Please try again later.',
    retryAfter: '5 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Use IP + user ID if available for more granular limiting
    const userId = (req as any).user?.id || 'anonymous';
    return `${req.ip}:${userId}`;
  }
});

// Transaction frequency limiter
export const transactionLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.call(...args),
  }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each IP to 20 transactions per hour
  message: {
    status: 429,
    error: 'Transaction limit exceeded. Please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.id || req.ip;
    return `tx:${userId}`;
  }
});

// Bruteforce protection for authentication endpoints
export const authLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.call(...args),
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 auth attempts per 15 minutes
  message: {
    status: 429,
    error: 'Too many authentication attempts. Please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// IP-based restriction middleware
export const ipRestriction = (req: Request, res: Response, next: Function) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  
  // Block known malicious IPs (in production, use a database or external service)
  const blockedIPs = process.env.BLOCKED_IPS?.split(',') || [];
  
  if (blockedIPs.includes(clientIP)) {
    return res.status(403).json({
      status: 403,
      error: 'Access denied'
    });
  }
  
  // Check for suspicious patterns
  const userAgent = req.get('User-Agent') || '';
  if (!userAgent || userAgent.length < 10) {
    // Flag suspicious requests with no or very short user agents
    req.suspicious = true;
  }
  
  next();
};

// Progressive rate limiting based on user behavior
export const progressiveLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.call(...args),
  }),
  windowMs: 60 * 1000, // 1 minute
  max: (req: Request) => {
    // Adjust limit based on user behavior
    if ((req as any).suspicious) {
      return 5; // Very low limit for suspicious requests
    }
    return 30; // Normal limit
  },
  message: {
    status: 429,
    error: 'Rate limit exceeded. Please slow down your requests.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// DDoS detection middleware
export const ddosDetector = (req: Request, res: Response, next: Function) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  const key = `ddos:${clientIP}`;
  
  // Increment request count
  redis.incr(key);
  redis.expire(key, 60); // Expire after 1 minute
  
  // Check request frequency
  redis.get(key, (err, count) => {
    if (err || !count) return next();
    
    const requestCount = parseInt(count);
    
    // If more than 100 requests in 1 minute, flag as potential DDoS
    if (requestCount > 100) {
      // Log potential DDoS attack
      console.warn(`Potential DDoS attack from IP: ${clientIP}, Requests: ${requestCount}`);
      
      // Add to blocked list temporarily (in production, use a more sophisticated system)
      redis.setex(`blocked:${clientIP}`, 300, 'true'); // Block for 5 minutes
      
      return res.status(429).json({
        status: 429,
        error: 'Too many requests. Your IP has been temporarily blocked.',
        retryAfter: '5 minutes'
      });
    }
    
    next();
  });
};

// Check if IP is blocked
export const checkBlockedIP = (req: Request, res: Response, next: Function) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  const key = `blocked:${clientIP}`;
  
  redis.get(key, (err, blocked) => {
    if (err || blocked) {
      return res.status(403).json({
        status: 403,
        error: 'Your IP has been temporarily blocked due to suspicious activity.',
        retryAfter: '5 minutes'
      });
    }
    
    next();
  });
};
