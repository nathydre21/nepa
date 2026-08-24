import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

interface AbuseMetrics {
  requestCount: number;
  errorCount: number;
  suspiciousPatterns: string[];
  lastActivity: number;
}

// Abuse detection and monitoring
export const abuseDetector = (req: Request, res: Response, next: NextFunction) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  const userId = (req as any).user?.id || 'anonymous';
  const userAgent = req.get('User-Agent') || '';
  const path = req.path;
  const method = req.method;
  
  const metricsKey = `abuse:${clientIP}:${userId}`;
  const globalKey = 'abuse:global';
  
  // Track request patterns
  redis.multi()
    .hincrby(metricsKey, 'requestCount', 1)
    .hset(metricsKey, 'lastActivity', Date.now().toString())
    .hset(metricsKey, 'userAgent', userAgent)
    .hset(metricsKey, 'lastPath', path)
    .hset(metricsKey, 'method', method)
    .expire(metricsKey, 3600) // Keep metrics for 1 hour
    .exec();
  
  // Check for suspicious patterns
  checkSuspiciousPatterns(clientIP || '', userId || '', userAgent, path, method)
    .then((isSuspicious) => {
      if (isSuspicious) {
        (req as any).suspicious = true;
        console.warn(`Suspicious activity detected from IP: ${clientIP}, User: ${userId}, Path: ${path}`);
        
        // Increment suspicious counter
        redis.hincrby(metricsKey, 'suspiciousCount', 1);
        redis.hincrby(globalKey, 'totalSuspicious', 1);
      }
      
      next();
    })
    .catch(error => {
      console.error('Abuse detection error:', error);
      next();
    });
};

// Check for various suspicious patterns
async function checkSuspiciousPatterns(
  clientIP: string, 
  userId: string, 
  userAgent: string, 
  path: string, 
  method: string
): Promise<boolean> {
  const metricsKey = `abuse:${clientIP}:${userId}`;
  
  try {
    const metrics = await redis.hgetall(metricsKey);
    const requestCount = parseInt(metrics.requestCount || '0');
    const suspiciousCount = parseInt(metrics.suspiciousCount || '0');
    
    // Pattern 1: High request frequency
    if (requestCount > 50) { // More than 50 requests in an hour
      return true;
    }
    
    // Pattern 2: Missing or suspicious user agent
    if (!userAgent || userAgent.length < 10 || userAgent.includes('bot') || userAgent.includes('crawler')) {
      return true;
    }
    
    // Pattern 3: Repeated access to sensitive endpoints
    const sensitivePaths = ['/payment', '/transaction', '/auth', '/admin'];
    if (sensitivePaths.some(sensitivePath => path.includes(sensitivePath)) && requestCount > 10) {
      return true;
    }
    
    // Pattern 4: Already flagged as suspicious multiple times
    if (suspiciousCount > 3) {
      return true;
    }
    
    // Pattern 5: Unusual time patterns (requests at odd hours)
    const currentHour = new Date().getHours();
    if (currentHour >= 2 && currentHour <= 5 && requestCount > 20) {
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error checking suspicious patterns:', error);
    return false;
  }
}

// Error tracking for abuse detection
export const errorTracker = (err: Error, req: Request, res: Response, next: NextFunction) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  const userId = (req as any).user?.id || 'anonymous';
  const metricsKey = `abuse:${clientIP}:${userId}`;
  
  // Increment error count
  redis.hincrby(metricsKey, 'errorCount', 1);
  
  // Check for error patterns that might indicate abuse
  const errorMessage = err.message.toLowerCase();
  const isAuthError = errorMessage.includes('unauthorized') || errorMessage.includes('forbidden');
  const isValidationError = errorMessage.includes('validation') || errorMessage.includes('invalid');
  
  if (isAuthError) {
    redis.hincrby(metricsKey, 'authErrors', 1);
  }
  
  if (isValidationError) {
    redis.hincrby(metricsKey, 'validationErrors', 1);
  }
  
  next(err);
};

// Alert system for abuse detection
export const abuseAlerter = async () => {
  const globalKey = 'abuse:global';
  const alertKey = 'abuse:alerts';
  
  try {
    const globalMetrics = await redis.hgetall(globalKey);
    const totalSuspicious = parseInt(globalMetrics.totalSuspicious || '0');
    
    // Alert if suspicious activity exceeds threshold
    if (totalSuspicious > 100) {
      const alert = {
        type: 'HIGH_SUSPICIOUS_ACTIVITY',
        count: totalSuspicious,
        timestamp: new Date().toISOString(),
        severity: 'HIGH'
      };
      
      // Store alert
      await redis.lpush(alertKey, JSON.stringify(alert));
      await redis.ltrim(alertKey, 0, 99); // Keep last 100 alerts
      
      // In production, send to monitoring service
      console.error('ABUSE ALERT:', alert);
      
      // Reset counter after alerting
      await redis.hset(globalKey, 'totalSuspicious', '0');
    }
  } catch (error) {
    console.error('Error in abuse alerter:', error);
  }
};

// Run abuse alerter every 5 minutes
setInterval(abuseAlerter, 5 * 60 * 1000);

// Get abuse metrics for monitoring
export const getAbuseMetrics = async (clientIP?: string, userId?: string) => {
  try {
    if (clientIP && userId) {
      const metricsKey = `abuse:${clientIP}:${userId}`;
      return await redis.hgetall(metricsKey);
    }
    
    const globalKey = 'abuse:global';
    const alertKey = 'abuse:alerts';
    
    const [globalMetrics, alerts] = await Promise.all([
      redis.hgetall(globalKey),
      redis.lrange(alertKey, 0, -1)
    ]);
    
    return {
      global: globalMetrics,
      alerts: alerts.map(alert => JSON.parse(alert))
    };
  } catch (error) {
    console.error('Error getting abuse metrics:', error);
    return null;
  }
};
