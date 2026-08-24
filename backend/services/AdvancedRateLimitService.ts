import Redis from 'ioredis';
import { Request, Response, NextFunction } from 'express';
import { 
  RateLimitTier, 
  UserRateLimitProfile, 
  RateLimitMetrics, 
  RateLimitBreach,
  RateLimitAnalytics,
  UserRole,
  RateLimitTierType 
} from '../types/rateLimit';
import { 
  DEFAULT_RATE_LIMIT_TIERS, 
  ENDPOINT_SPECIFIC_RULES,
  ROLE_BASED_MULTIPLIERS,
  HTTP_METHOD_MULTIPLIERS,
  RATE_LIMIT_CONFIG 
} from '../config/rateLimitConfig';

export class AdvancedRateLimitService {
  private redis: Redis;
  private breachCallbacks: Array<(breach: RateLimitBreach) => void> = [];

  constructor(redisUrl?: string) {
    this.redis = new Redis(redisUrl || process.env.REDIS_URL || 'redis://localhost:6379');
  }

  async getUserRateLimitProfile(userId: string): Promise<UserRateLimitProfile> {
    const cacheKey = `${RATE_LIMIT_CONFIG.REDIS_PREFIX}profile:${userId}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    // In a real implementation, this would fetch from database
    // For now, we'll use a default profile
    const profile: UserRateLimitProfile = {
      userId,
      tier: RATE_LIMIT_CONFIG.DEFAULT_TIER,
      whitelist: false,
      blacklist: false,
      metadata: {}
    };

    await this.redis.setex(cacheKey, 300, JSON.stringify(profile)); // 5 minutes cache
    return profile;
  }

  async setUserRateLimitProfile(profile: UserRateLimitProfile): Promise<void> {
    const cacheKey = `${RATE_LIMIT_CONFIG.REDIS_PREFIX}profile:${profile.userId}`;
    await this.redis.setex(cacheKey, 300, JSON.stringify(profile));
    
    // In a real implementation, this would also update the database
  }

  async getEffectiveRateLimit(
    req: Request,
    userProfile?: UserRateLimitProfile
  ): Promise<RateLimitTier> {
    const profile = userProfile || await this.getUserRateLimitProfile(
      (req as any).user?.id || 'anonymous'
    );

    if (profile.blacklist) {
      return {
        name: 'BLOCKED',
        requestsPerWindow: 0,
        windowMs: RATE_LIMIT_CONFIG.BLOCK_DURATION,
        priority: 0,
        features: {
          burstHandling: false,
          analytics: false,
          customRules: false,
          endpointSpecific: false,
          methodSpecific: false,
          roleBased: false,
          breachAlerts: false
        }
      };
    }

    if (profile.whitelist) {
      return DEFAULT_RATE_LIMIT_TIERS[RateLimitTierType.UNLIMITED];
    }

    let baseTier = DEFAULT_RATE_LIMIT_TIERS[profile.tier as RateLimitTierType];
    
    // Apply endpoint-specific rules
    const endpointRule = ENDPOINT_SPECIFIC_RULES.find(rule => 
      req.path === rule.endpoint && 
      (!rule.method || req.method === rule.method) &&
      (!rule.userRole || (req as any).user?.role === rule.userRole)
    );

    if (endpointRule) {
      baseTier = {
        ...baseTier,
        requestsPerWindow: endpointRule.customLimit || baseTier.requestsPerWindow,
        windowMs: endpointRule.windowMs || baseTier.windowMs,
        burstCapacity: endpointRule.burstCapacity || baseTier.burstCapacity
      };
    }

    // Apply role-based multipliers
    const userRole = (req as any).user?.role || UserRole.USER;
    const roleMultiplier = ROLE_BASED_MULTIPLIERS[userRole as UserRole] || 1.0;
    
    // Apply HTTP method multipliers
    const methodMultiplier = HTTP_METHOD_MULTIPLIERS[req.method] || 1.0;

    const finalMultiplier = roleMultiplier * methodMultiplier;

    return {
      ...baseTier,
      requestsPerWindow: Math.floor(baseTier.requestsPerWindow * finalMultiplier),
      burstCapacity: Math.floor((baseTier.burstCapacity || baseTier.requestsPerWindow) * finalMultiplier)
    };
  }

  async checkRateLimit(
    req: Request,
    tier: RateLimitTier
  ): Promise<{ allowed: boolean; remaining: number; resetTime: Date; burstUsed?: number }> {
    const identifier = this.getIdentifier(req);
    const key = `${RATE_LIMIT_CONFIG.REDIS_PREFIX}${identifier}:${req.path}:${req.method}`;
    
    const now = Date.now();
    const windowStart = now - (now % tier.windowMs);
    const windowKey = `${key}:${windowStart}`;

    const pipeline = this.redis.pipeline();
    pipeline.incr(windowKey);
    pipeline.expire(windowKey, Math.ceil(tier.windowMs / 1000));
    
    const results = await pipeline.exec();
    const currentCount = results?.[0]?.[1] as number || 0;

    // Check burst capacity if available
    let burstUsed = 0;
    if (tier.features.burstHandling && tier.burstCapacity) {
      const burstKey = `${key}:burst:${windowStart}`;
      const burstCount = await this.redis.incr(burstKey);
      await this.redis.expire(burstKey, Math.ceil(tier.windowMs / 1000));
      burstUsed = burstCount;
      
      // Decay burst usage over time
      if (burstCount > tier.burstCapacity * RATE_LIMIT_CONFIG.BURST_DECAY_FACTOR) {
        await this.redis.decr(burstKey);
      }
    }

    const allowed = currentCount <= tier.requestsPerWindow;
    const remaining = Math.max(0, tier.requestsPerWindow - currentCount);
    const resetTime = new Date(windowStart + tier.windowMs);

    return { allowed, remaining, resetTime, burstUsed };
  }

  async recordMetrics(
    req: Request,
    tier: RateLimitTier,
    result: { allowed: boolean; remaining: number; resetTime: Date }
  ): Promise<void> {
    const metrics: RateLimitMetrics = {
      userId: (req as any).user?.id,
      ip: req.ip || req.connection.remoteAddress || 'unknown',
      endpoint: req.path,
      method: req.method,
      timestamp: new Date(),
      blocked: !result.allowed,
      remaining: result.remaining,
      resetTime: result.resetTime,
      tier: tier.name,
      breach: !result.allowed
    };

    const metricsKey = `${RATE_LIMIT_CONFIG.METRICS_PREFIX}${Date.now()}:${Math.random()}`;
    await this.redis.setex(metricsKey, RATE_LIMIT_CONFIG.ANALYTICS_RETENTION_DAYS * 24 * 60 * 60, JSON.stringify(metrics));
  }

  async detectBreach(
    req: Request,
    tier: RateLimitTier,
    result: { allowed: boolean; remaining: number; resetTime: Date }
  ): Promise<RateLimitBreach | null> {
    if (result.allowed) return null;

    const breachId = `breach_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const breach: RateLimitBreach = {
      id: breachId,
      userId: (req as any).user?.id,
      ip: req.ip || req.connection.remoteAddress || 'unknown',
      endpoint: req.path,
      breachType: 'RATE_LIMIT',
      severity: this.calculateSeverity(req, tier),
      timestamp: new Date(),
      details: {
        tier: tier.name,
        method: req.method,
        userAgent: req.get('User-Agent'),
        remaining: result.remaining
      },
      resolved: false
    };

    const breachKey = `${RATE_LIMIT_CONFIG.BREACH_PREFIX}${breachId}`;
    await this.redis.setex(breachKey, RATE_LIMIT_CONFIG.BREACH_RETENTION_DAYS * 24 * 60 * 60, JSON.stringify(breach));

    // Trigger breach callbacks
    this.breachCallbacks.forEach(callback => callback(breach));

    return breach;
  }

  async getAnalytics(timeWindow: { start: Date; end: Date }): Promise<RateLimitAnalytics> {
    const pattern = `${RATE_LIMIT_CONFIG.METRICS_PREFIX}*`;
    const keys = await this.redis.keys(pattern);
    
    if (keys.length === 0) {
      return this.getEmptyAnalytics(timeWindow);
    }

    const pipeline = this.redis.pipeline();
    keys.forEach(key => pipeline.get(key));
    const results = await pipeline.exec();
    
    const metrics: RateLimitMetrics[] = results
      ?.map(([err, data]) => err ? null : JSON.parse(data as string))
      ?.filter(Boolean) || [];

    const filteredMetrics = metrics.filter(m => 
      m.timestamp >= timeWindow.start && m.timestamp <= timeWindow.end
    );

    return this.processAnalytics(filteredMetrics, timeWindow);
  }

  async getBreachHistory(limit: number = 100): Promise<RateLimitBreach[]> {
    const pattern = `${RATE_LIMIT_CONFIG.BREACH_PREFIX}*`;
    const keys = await this.redis.keys(pattern);
    
    if (keys.length === 0) return [];

    const pipeline = this.redis.pipeline();
    keys.slice(0, limit).forEach(key => pipeline.get(key));
    const results = await pipeline.exec();
    
    return results
      ?.map(([err, data]) => err ? null : JSON.parse(data as string))
      ?.filter(Boolean)
      ?.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()) || [];
  }

  onBreach(callback: (breach: RateLimitBreach) => void): void {
    this.breachCallbacks.push(callback);
  }

  private getIdentifier(req: Request): string {
    const userId = (req as any).user?.id;
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    return userId ? `user:${userId}` : `ip:${ip}`;
  }

  private calculateSeverity(req: Request, tier: RateLimitTier): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const userAgent = req.get('User-Agent') || '';
    const suspicious = !userAgent || userAgent.length < 10;
    
    if (tier.name === 'BLOCKED') return 'CRITICAL';
    if (suspicious) return 'HIGH';
    if (tier.priority <= 2) return 'MEDIUM';
    return 'LOW';
  }

  private getEmptyAnalytics(timeWindow: { start: Date; end: Date }): RateLimitAnalytics {
    return {
      totalRequests: 0,
      blockedRequests: 0,
      topEndpoints: [],
      topIPs: [],
      tierDistribution: {},
      breachSummary: {
        total: 0,
        byType: {},
        bySeverity: {}
      },
      timeWindow
    };
  }

  private processAnalytics(metrics: RateLimitMetrics[], timeWindow: { start: Date; end: Date }): RateLimitAnalytics {
    const endpointCounts = new Map<string, { requests: number; blocked: number }>();
    const ipCounts = new Map<string, { requests: number; blocked: number }>();
    const tierCounts = new Map<string, number>();

    let totalRequests = 0;
    let blockedRequests = 0;

    metrics.forEach(metric => {
      totalRequests++;
      if (metric.blocked) blockedRequests++;

      // Endpoint stats
      const endpointKey = metric.endpoint;
      const endpointStats = endpointCounts.get(endpointKey) || { requests: 0, blocked: 0 };
      endpointStats.requests++;
      if (metric.blocked) endpointStats.blocked++;
      endpointCounts.set(endpointKey, endpointStats);

      // IP stats
      const ipKey = metric.ip;
      const ipStats = ipCounts.get(ipKey) || { requests: 0, blocked: 0 };
      ipStats.requests++;
      if (metric.blocked) ipStats.blocked++;
      ipCounts.set(ipKey, ipStats);

      // Tier distribution
      tierCounts.set(metric.tier, (tierCounts.get(metric.tier) || 0) + 1);
    });

    const topEndpoints = Array.from(endpointCounts.entries())
      .map(([endpoint, stats]) => ({ endpoint, ...stats }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10);

    const topIPs = Array.from(ipCounts.entries())
      .map(([ip, stats]) => ({ ip, ...stats }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10);

    return {
      totalRequests,
      blockedRequests,
      topEndpoints,
      topIPs,
      tierDistribution: Object.fromEntries(tierCounts),
      breachSummary: {
        total: blockedRequests,
        byType: { 'RATE_LIMIT': blockedRequests },
        bySeverity: { 'LOW': Math.floor(blockedRequests * 0.6), 'MEDIUM': Math.floor(blockedRequests * 0.3), 'HIGH': Math.floor(blockedRequests * 0.1) }
      },
      timeWindow
    };
  }
}
