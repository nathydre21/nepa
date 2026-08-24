import { RateLimitTier, RateLimitTierType, UserRole } from '../types/rateLimit';

export const DEFAULT_RATE_LIMIT_TIERS: Record<RateLimitTierType, RateLimitTier> = {
  [RateLimitTierType.FREE]: {
    name: RateLimitTierType.FREE,
    requestsPerWindow: 100,
    windowMs: 15 * 60 * 1000, // 15 minutes
    burstCapacity: 20,
    priority: 1,
    features: {
      burstHandling: true,
      analytics: false,
      customRules: false,
      endpointSpecific: false,
      methodSpecific: false,
      roleBased: false,
      breachAlerts: false
    }
  },
  
  [RateLimitTierType.BASIC]: {
    name: RateLimitTierType.BASIC,
    requestsPerWindow: 500,
    windowMs: 15 * 60 * 1000, // 15 minutes
    burstCapacity: 100,
    priority: 2,
    features: {
      burstHandling: true,
      analytics: true,
      customRules: false,
      endpointSpecific: true,
      methodSpecific: false,
      roleBased: true,
      breachAlerts: true
    }
  },
  
  [RateLimitTierType.PREMIUM]: {
    name: RateLimitTierType.PREMIUM,
    requestsPerWindow: 2000,
    windowMs: 15 * 60 * 1000, // 15 minutes
    burstCapacity: 400,
    priority: 3,
    features: {
      burstHandling: true,
      analytics: true,
      customRules: true,
      endpointSpecific: true,
      methodSpecific: true,
      roleBased: true,
      breachAlerts: true
    }
  },
  
  [RateLimitTierType.ENTERPRISE]: {
    name: RateLimitTierType.ENTERPRISE,
    requestsPerWindow: 10000,
    windowMs: 15 * 60 * 1000, // 15 minutes
    burstCapacity: 2000,
    priority: 4,
    features: {
      burstHandling: true,
      analytics: true,
      customRules: true,
      endpointSpecific: true,
      methodSpecific: true,
      roleBased: true,
      breachAlerts: true
    }
  },
  
  [RateLimitTierType.UNLIMITED]: {
    name: RateLimitTierType.UNLIMITED,
    requestsPerWindow: Number.MAX_SAFE_INTEGER,
    windowMs: 15 * 60 * 1000, // 15 minutes
    burstCapacity: Number.MAX_SAFE_INTEGER,
    priority: 5,
    features: {
      burstHandling: true,
      analytics: true,
      customRules: true,
      endpointSpecific: true,
      methodSpecific: true,
      roleBased: true,
      breachAlerts: true
    }
  }
};

export const ENDPOINT_SPECIFIC_RULES = [
  {
    endpoint: '/api/auth/login',
    method: 'POST',
    tier: RateLimitTierType.FREE,
    customLimit: 5,
    windowMs: 15 * 60 * 1000,
    burstCapacity: 2
  },
  {
    endpoint: '/api/auth/register',
    method: 'POST',
    tier: RateLimitTierType.FREE,
    customLimit: 3,
    windowMs: 60 * 60 * 1000, // 1 hour
    burstCapacity: 1
  },
  {
    endpoint: '/api/payment/process',
    method: 'POST',
    tier: RateLimitTierType.BASIC,
    customLimit: 10,
    windowMs: 5 * 60 * 1000, // 5 minutes
    burstCapacity: 3
  },
  {
    endpoint: '/api/analytics/dashboard',
    method: 'GET',
    userRole: UserRole.ADMIN,
    tier: RateLimitTierType.PREMIUM,
    customLimit: 100,
    windowMs: 15 * 60 * 1000,
    burstCapacity: 20
  },
  {
    endpoint: '/api/documents/upload',
    method: 'POST',
    tier: RateLimitTierType.BASIC,
    customLimit: 20,
    windowMs: 60 * 60 * 1000, // 1 hour
    burstCapacity: 5
  }
];

export const ROLE_BASED_MULTIPLIERS: Record<UserRole, number> = {
  [UserRole.USER]: 1.0,
  [UserRole.ADMIN]: 2.0,
  [UserRole.SUPER_ADMIN]: 5.0
};

export const HTTP_METHOD_MULTIPLIERS: Record<string, number> = {
  'GET': 1.0,
  'POST': 1.5,
  'PUT': 1.5,
  'PATCH': 1.5,
  'DELETE': 2.0
};

export const RATE_LIMIT_CONFIG = {
  DEFAULT_TIER: RateLimitTierType.FREE,
  REDIS_PREFIX: 'rate_limit:',
  METRICS_PREFIX: 'rate_metrics:',
  BREACH_PREFIX: 'breach:',
  ANALYTICS_RETENTION_DAYS: 30,
  BREACH_RETENTION_DAYS: 7,
  BURST_DECAY_FACTOR: 0.8,
  SUSPICIOUS_THRESHOLD: 0.7,
  DDOS_THRESHOLD: 100,
  BLOCK_DURATION: 5 * 60 * 1000, // 5 minutes
  ALERT_COOLDOWN: 10 * 60 * 1000 // 10 minutes
};
