import { CacheStrategyConfig } from '../services/cache/CacheStrategy';
import { WarmupConfig } from '../services/cache/CacheWarmupService';
import { MonitoringConfig } from '../services/cache/CacheMonitoringService';

export interface ComprehensiveCacheConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
    keyPrefix: string;
    retryDelayOnFailover: number;
    maxRetriesPerRequest: number;
    lazyConnect: boolean;
    cluster?: {
      enabled: boolean;
      nodes: Array<{ host: string; port: number }>;
    };
  };
  strategy: CacheStrategyConfig;
  warmup: WarmupConfig;
  monitoring: MonitoringConfig;
  microservices: {
    [serviceName: string]: {
      enabled: boolean;
      patterns: string[];
      defaultTTL: number;
      maxMemory: number;
    };
  };
  performance: {
    compressionEnabled: boolean;
    compressionThreshold: number;
    batchSize: number;
    maxConcurrency: number;
  };
  security: {
    encryptSensitiveData: boolean;
    allowedOrigins: string[];
    rateLimiting: {
      enabled: boolean;
      maxRequestsPerMinute: number;
    };
  };
}

/**
 * Comprehensive cache configuration for NEPA application
 */
export const cacheConfig: ComprehensiveCacheConfig = {
  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_CACHE_DB || '1'),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'nepa:cache:',
    retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY || '100'),
    maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES || '3'),
    lazyConnect: process.env.REDIS_LAZY_CONNECT === 'true',
    cluster: {
      enabled: process.env.REDIS_CLUSTER_ENABLED === 'true',
      nodes: process.env.REDIS_CLUSTER_NODES ? 
        JSON.parse(process.env.REDIS_CLUSTER_NODES) : []
    }
  },

  // Cache Strategy Configuration
  strategy: {
    defaultTTL: parseInt(process.env.CACHE_DEFAULT_TTL || '3600'), // 1 hour
    maxMemoryUsage: parseInt(process.env.CACHE_MAX_MEMORY || (512 * 1024 * 1024).toString()), // 512MB
    compressionThreshold: parseInt(process.env.CACHE_COMPRESSION_THRESHOLD || '1024'), // 1KB
    warmupEnabled: process.env.CACHE_WARMUP_ENABLED !== 'false',
    monitoringEnabled: process.env.CACHE_MONITORING_ENABLED !== 'false'
  },

  // Cache Warmup Configuration
  warmup: {
    enabled: process.env.CACHE_WARMUP_ENABLED !== 'false',
    scheduleInterval: parseInt(process.env.CACHE_WARMUP_INTERVAL || '30'), // 30 minutes
    batchSize: parseInt(process.env.CACHE_WARMUP_BATCH_SIZE || '50'),
    maxConcurrency: parseInt(process.env.CACHE_WARMUP_CONCURRENCY || '5'),
    priorities: {
      high: process.env.CACHE_WARMUP_HIGH !== 'false',
      medium: process.env.CACHE_WARMUP_MEDIUM !== 'false',
      low: process.env.CACHE_WARMUP_LOW === 'true'
    }
  },

  // Cache Monitoring Configuration
  monitoring: {
    enabled: process.env.CACHE_MONITORING_ENABLED !== 'false',
    alertThresholds: {
      hitRate: parseFloat(process.env.CACHE_ALERT_HIT_RATE || '0.7'), // 70%
      responseTime: parseInt(process.env.CACHE_ALERT_RESPONSE_TIME || '1000'), // 1 second
      memoryUsage: parseInt(process.env.CACHE_ALERT_MEMORY || (512 * 1024 * 1024).toString()), // 512MB
      errorRate: parseFloat(process.env.CACHE_ALERT_ERROR_RATE || '0.05') // 5%
    },
    metricsRetention: parseInt(process.env.CACHE_METRICS_RETENTION || '7'), // 7 days
    alertCooldown: parseInt(process.env.CACHE_ALERT_COOLDOWN || '15') // 15 minutes
  },

  // Microservice-specific Configuration
  microservices: {
    'user-service': {
      enabled: process.env.CACHE_USER_SERVICE_ENABLED !== 'false',
      patterns: ['user:session', 'user:profile', 'user:preferences', 'user:active_sessions'],
      defaultTTL: parseInt(process.env.CACHE_USER_TTL || '3600'), // 1 hour
      maxMemory: parseInt(process.env.CACHE_USER_MEMORY || (128 * 1024 * 1024).toString()) // 128MB
    },
    'payment-service': {
      enabled: process.env.CACHE_PAYMENT_SERVICE_ENABLED !== 'false',
      patterns: ['payment:history', 'payment:recent'],
      defaultTTL: parseInt(process.env.CACHE_PAYMENT_TTL || '900'), // 15 minutes
      maxMemory: parseInt(process.env.CACHE_PAYMENT_MEMORY || (64 * 1024 * 1024).toString()) // 64MB
    },
    'billing-service': {
      enabled: process.env.CACHE_BILLING_SERVICE_ENABLED !== 'false',
      patterns: ['bill:user', 'bill:status'],
      defaultTTL: parseInt(process.env.CACHE_BILLING_TTL || '1800'), // 30 minutes
      maxMemory: parseInt(process.env.CACHE_BILLING_MEMORY || (64 * 1024 * 1024).toString()) // 64MB
    },
    'webhook-service': {
      enabled: process.env.CACHE_WEBHOOK_SERVICE_ENABLED !== 'false',
      patterns: ['webhook:config', 'webhook:user', 'webhook:events'],
      defaultTTL: parseInt(process.env.CACHE_WEBHOOK_TTL || '3600'), // 1 hour
      maxMemory: parseInt(process.env.CACHE_WEBHOOK_MEMORY || (32 * 1024 * 1024).toString()) // 32MB
    },
    'analytics-service': {
      enabled: process.env.CACHE_ANALYTICS_SERVICE_ENABLED !== 'false',
      patterns: ['analytics:dashboard', 'analytics:revenue', 'analytics:user_growth'],
      defaultTTL: parseInt(process.env.CACHE_ANALYTICS_TTL || '1800'), // 30 minutes
      maxMemory: parseInt(process.env.CACHE_ANALYTICS_MEMORY || (128 * 1024 * 1024).toString()) // 128MB
    },
    'utility-service': {
      enabled: process.env.CACHE_UTILITY_SERVICE_ENABLED !== 'false',
      patterns: ['utility:providers', 'utility:types'],
      defaultTTL: parseInt(process.env.CACHE_UTILITY_TTL || '86400'), // 24 hours
      maxMemory: parseInt(process.env.CACHE_UTILITY_MEMORY || (16 * 1024 * 1024).toString()) // 16MB
    },
    'notification-service': {
      enabled: process.env.CACHE_NOTIFICATION_SERVICE_ENABLED !== 'false',
      patterns: ['notification:preferences', 'notification:templates'],
      defaultTTL: parseInt(process.env.CACHE_NOTIFICATION_TTL || '3600'), // 1 hour
      maxMemory: parseInt(process.env.CACHE_NOTIFICATION_MEMORY || (32 * 1024 * 1024).toString()) // 32MB
    },
    'document-service': {
      enabled: process.env.CACHE_DOCUMENT_SERVICE_ENABLED !== 'false',
      patterns: ['document:metadata', 'document:user'],
      defaultTTL: parseInt(process.env.CACHE_DOCUMENT_TTL || '7200'), // 2 hours
      maxMemory: parseInt(process.env.CACHE_DOCUMENT_MEMORY || (64 * 1024 * 1024).toString()) // 64MB
    }
  },

  // Performance Configuration
  performance: {
    compressionEnabled: process.env.CACHE_COMPRESSION_ENABLED !== 'false',
    compressionThreshold: parseInt(process.env.CACHE_COMPRESSION_THRESHOLD || '1024'), // 1KB
    batchSize: parseInt(process.env.CACHE_BATCH_SIZE || '100'),
    maxConcurrency: parseInt(process.env.CACHE_MAX_CONCURRENCY || '10')
  },

  // Security Configuration
  security: {
    encryptSensitiveData: process.env.CACHE_ENCRYPT_SENSITIVE === 'true',
    allowedOrigins: process.env.CACHE_ALLOWED_ORIGINS ? 
      process.env.CACHE_ALLOWED_ORIGINS.split(',') : ['*'],
    rateLimiting: {
      enabled: process.env.CACHE_RATE_LIMITING_ENABLED !== 'false',
      maxRequestsPerMinute: parseInt(process.env.CACHE_RATE_LIMIT || '1000')
    }
  }
};

/**
 * Environment-specific cache configurations
 */
export const environmentConfigs = {
  development: {
    ...cacheConfig,
    strategy: {
      ...cacheConfig.strategy,
      defaultTTL: 300, // 5 minutes for faster development
      monitoringEnabled: true
    },
    warmup: {
      ...cacheConfig.warmup,
      enabled: false, // Disable warmup in development
      scheduleInterval: 60 // 1 hour if enabled
    }
  },

  test: {
    ...cacheConfig,
    redis: {
      ...cacheConfig.redis,
      db: 15, // Use separate DB for tests
      keyPrefix: 'test:cache:'
    },
    strategy: {
      ...cacheConfig.strategy,
      defaultTTL: 60, // 1 minute for tests
      monitoringEnabled: false
    },
    warmup: {
      ...cacheConfig.warmup,
      enabled: false
    },
    monitoring: {
      ...cacheConfig.monitoring,
      enabled: false
    }
  },

  staging: {
    ...cacheConfig,
    strategy: {
      ...cacheConfig.strategy,
      defaultTTL: 1800, // 30 minutes
      maxMemoryUsage: 256 * 1024 * 1024 // 256MB
    },
    warmup: {
      ...cacheConfig.warmup,
      scheduleInterval: 60, // 1 hour
      batchSize: 25
    }
  },

  production: {
    ...cacheConfig,
    strategy: {
      ...cacheConfig.strategy,
      defaultTTL: 3600, // 1 hour
      maxMemoryUsage: 1024 * 1024 * 1024 // 1GB
    },
    warmup: {
      ...cacheConfig.warmup,
      scheduleInterval: 30, // 30 minutes
      batchSize: 100,
      maxConcurrency: 10
    },
    monitoring: {
      ...cacheConfig.monitoring,
      alertThresholds: {
        ...cacheConfig.monitoring.alertThresholds,
        hitRate: 0.8, // Higher threshold for production
        responseTime: 500 // Stricter response time
      }
    }
  }
};

/**
 * Get configuration for current environment
 */
export function getCacheConfig(): ComprehensiveCacheConfig {
  const env = process.env.NODE_ENV || 'development';
  return environmentConfigs[env as keyof typeof environmentConfigs] || environmentConfigs.development;
}

/**
 * Validate cache configuration
 */
export function validateCacheConfig(config: ComprehensiveCacheConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate Redis configuration
  if (!config.redis.host) {
    errors.push('Redis host is required');
  }

  if (config.redis.port < 1 || config.redis.port > 65535) {
    errors.push('Redis port must be between 1 and 65535');
  }

  // Validate strategy configuration
  if (config.strategy.defaultTTL < 1) {
    errors.push('Default TTL must be greater than 0');
  }

  if (config.strategy.maxMemoryUsage < 1024 * 1024) {
    errors.push('Max memory usage must be at least 1MB');
  }

  // Validate warmup configuration
  if (config.warmup.scheduleInterval < 1) {
    errors.push('Warmup schedule interval must be greater than 0');
  }

  if (config.warmup.batchSize < 1) {
    errors.push('Warmup batch size must be greater than 0');
  }

  // Validate monitoring configuration
  if (config.monitoring.alertThresholds.hitRate < 0 || config.monitoring.alertThresholds.hitRate > 1) {
    errors.push('Hit rate threshold must be between 0 and 1');
  }

  if (config.monitoring.alertThresholds.responseTime < 1) {
    errors.push('Response time threshold must be greater than 0');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Cache configuration presets for different use cases
 */
export const cachePresets = {
  // High-performance preset for heavy traffic
  highPerformance: {
    strategy: {
      defaultTTL: 7200, // 2 hours
      maxMemoryUsage: 2 * 1024 * 1024 * 1024, // 2GB
      compressionThreshold: 512, // 512 bytes
      warmupEnabled: true,
      monitoringEnabled: true
    },
    warmup: {
      enabled: true,
      scheduleInterval: 15, // 15 minutes
      batchSize: 200,
      maxConcurrency: 20
    }
  },

  // Memory-optimized preset for limited resources
  memoryOptimized: {
    strategy: {
      defaultTTL: 1800, // 30 minutes
      maxMemoryUsage: 128 * 1024 * 1024, // 128MB
      compressionThreshold: 256, // 256 bytes
      warmupEnabled: false,
      monitoringEnabled: true
    },
    performance: {
      compressionEnabled: true,
      compressionThreshold: 256,
      batchSize: 25,
      maxConcurrency: 3
    }
  },

  // Development preset for local development
  development: {
    strategy: {
      defaultTTL: 300, // 5 minutes
      maxMemoryUsage: 64 * 1024 * 1024, // 64MB
      compressionThreshold: 2048, // 2KB
      warmupEnabled: false,
      monitoringEnabled: false
    },
    warmup: {
      enabled: false
    },
    monitoring: {
      enabled: false
    }
  }
};