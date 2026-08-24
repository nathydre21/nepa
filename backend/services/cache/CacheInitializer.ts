import { getCacheConfig, validateCacheConfig } from '../../config/cacheConfig';
import { getCacheStrategy } from './CacheStrategy';
import { getSessionCacheService } from './SessionCacheService';
import { getCacheWarmupService } from './CacheWarmupService';
import { getCacheMonitoringService } from './CacheMonitoringService';
import { getMicroserviceCacheService } from './MicroserviceCacheService';
import { getCacheManager } from '../RedisCacheManager';
import { logger } from '../logger';
import { startTransactionCleanup } from '../TransactionCleanupService';

export interface CacheInitializationResult {
  success: boolean;
  services: {
    redis: boolean;
    strategy: boolean;
    session: boolean;
    warmup: boolean;
    monitoring: boolean;
    microservices: boolean;
  };
  errors: string[];
  warnings: string[];
  metrics: {
    initializationTime: number;
    redisConnectionTime: number;
    warmupTime: number;
  };
}

/**
 * Comprehensive cache system initializer
 * Handles startup, configuration validation, and service coordination
 */
export class CacheInitializer {
  private config = getCacheConfig();
  private initializationStartTime = 0;

  /**
   * Initialize the complete cache system
   */
  async initialize(): Promise<CacheInitializationResult> {
    this.initializationStartTime = Date.now();
    
    const result: CacheInitializationResult = {
      success: false,
      services: {
        redis: false,
        strategy: false,
        session: false,
        warmup: false,
        monitoring: false,
        microservices: false
      },
      errors: [],
      warnings: [],
      metrics: {
        initializationTime: 0,
        redisConnectionTime: 0,
        warmupTime: 0
      }
    };

    logger.info('Starting cache system initialization');

    try {
      // 1. Validate configuration
      const configValidation = validateCacheConfig(this.config);
      if (!configValidation.valid) {
        result.errors.push(...configValidation.errors);
        return result;
      }

      // 2. Initialize Redis connection
      const redisStartTime = Date.now();
      result.services.redis = await this.initializeRedis();
      result.metrics.redisConnectionTime = Date.now() - redisStartTime;

      if (!result.services.redis) {
        result.errors.push('Failed to initialize Redis connection');
        return result;
      }

      // 3. Initialize cache strategy
      result.services.strategy = await this.initializeCacheStrategy();
      if (!result.services.strategy) {
        result.errors.push('Failed to initialize cache strategy');
        return result;
      }

      // 4. Initialize session cache service
      result.services.session = await this.initializeSessionCache();
      if (!result.services.session) {
        result.warnings.push('Session cache service initialization failed');
      }

      // 5. Initialize microservices cache
      result.services.microservices = await this.initializeMicroservicesCache();
      if (!result.services.microservices) {
        result.warnings.push('Microservices cache initialization failed');
      }

      // 6. Initialize monitoring (optional)
      if (this.config.monitoring.enabled) {
        result.services.monitoring = await this.initializeMonitoring();
        if (!result.services.monitoring) {
          result.warnings.push('Cache monitoring initialization failed');
        }
      } else {
        result.services.monitoring = true; // Not required
      }

      // 7. Initialize warmup service (optional)
      if (this.config.warmup.enabled) {
        const warmupStartTime = Date.now();
        result.services.warmup = await this.initializeWarmup();
        result.metrics.warmupTime = Date.now() - warmupStartTime;
        
        if (!result.services.warmup) {
          result.warnings.push('Cache warmup initialization failed');
        }
      } else {
        result.services.warmup = true; // Not required
      }

      // 8. Perform initial health check
      const healthCheck = await this.performHealthCheck();
      if (!healthCheck.healthy) {
        result.warnings.push(...healthCheck.issues);
      }

      // 9. Set up graceful shutdown
      this.setupGracefulShutdown();

      result.success = result.services.redis && result.services.strategy;
      result.metrics.initializationTime = Date.now() - this.initializationStartTime;

      if (result.success) {
        logger.info('Cache system initialization completed successfully', {
          initializationTime: result.metrics.initializationTime,
          services: result.services,
          warnings: result.warnings.length
        });
        // Start background cleanup job for transaction entries
        try {
          startTransactionCleanup();
        } catch (e) {
          logger.error('Failed to start transaction cleanup job:', e as any);
        }
      } else {
        logger.error('Cache system initialization failed', {
          errors: result.errors,
          services: result.services
        });
      }

    } catch (error) {
      result.errors.push(`Initialization error: ${(error as Error).message}`);
      logger.error('Cache initialization error:', error as any);
    }

    return result;
  }

  /**
   * Initialize Redis connection
   */
  private async initializeRedis(): Promise<boolean> {
    try {
      const cacheManager = getCacheManager();
      await cacheManager.connect();
      
      // Test connection
      const healthCheck = await cacheManager.healthCheck();
      if (!healthCheck) {
        throw new Error('Redis health check failed');
      }

      logger.info('Redis cache manager initialized successfully');
      return true;
    } catch (error) {
      logger.error('Redis initialization error:', error as any);
      return false;
    }
  }

  /**
   * Initialize cache strategy
   */
  private async initializeCacheStrategy(): Promise<boolean> {
    try {
      const cacheStrategy = getCacheStrategy();
      
      // Verify strategy is working
      const testKey = 'init:test';
      const testData = { timestamp: Date.now() };
      
      const setResult = await cacheStrategy.set('user:session', { sessionId: testKey }, testData);
      if (!setResult) {
        throw new Error('Cache strategy set test failed');
      }

      const getData = await cacheStrategy.get('user:session', { sessionId: testKey });
      if (!getData || (getData as any).timestamp !== testData.timestamp) {
        throw new Error('Cache strategy get test failed');
      }

      // Clean up test data
      await cacheStrategy.invalidate('user:session', { sessionId: testKey });

      logger.info('Cache strategy initialized successfully');
      return true;
    } catch (error) {
      logger.error('Cache strategy initialization error:', error as any);
      return false;
    }
  }

  /**
   * Initialize session cache service
   */
  private async initializeSessionCache(): Promise<boolean> {
    try {
      const sessionCache = getSessionCacheService();
      
      // Test session cache functionality
      const testSession = {
        id: 'test-session',
        userId: 'test-user',
        token: 'test-token',
        refreshToken: 'test-refresh',
        expiresAt: new Date(Date.now() + 3600000),
        isActive: true,
        createdAt: new Date(),
        lastAccessedAt: new Date()
      };

      const cacheResult = await sessionCache.cacheSession(testSession);
      if (!cacheResult) {
        throw new Error('Session cache test failed');
      }

      const retrievedSession = await sessionCache.getSession('test-session');
      if (!retrievedSession || retrievedSession.id !== testSession.id) {
        throw new Error('Session retrieval test failed');
      }

      // Clean up test data
      await sessionCache.invalidateSession('test-session', 'test-token');

      logger.info('Session cache service initialized successfully');
      return true;
    } catch (error) {
      logger.error('Session cache initialization error:', error as any);
      return false;
    }
  }

  /**
   * Initialize microservices cache
   */
  private async initializeMicroservicesCache(): Promise<boolean> {
    try {
      const microservicesCache = getMicroserviceCacheService();
      
      // Test microservices cache functionality
      const testPayment = {
        id: 'test-payment',
        userId: 'test-user',
        billId: 'test-bill',
        amount: 100,
        status: 'SUCCESS',
        createdAt: new Date()
      };

      const cacheResult = await microservicesCache.cacheRecentPayments('test-user', [testPayment]);
      if (!cacheResult) {
        throw new Error('Microservices cache test failed');
      }

      const retrievedPayments = await microservicesCache.getRecentPayments('test-user');
      if (!retrievedPayments || retrievedPayments.length !== 1) {
        throw new Error('Microservices cache retrieval test failed');
      }

      // Clean up test data
      await microservicesCache.invalidatePaymentCache('test-user');

      logger.info('Microservices cache initialized successfully');
      return true;
    } catch (error) {
      logger.error('Microservices cache initialization error:', error as any);
      return false;
    }
  }

  /**
   * Initialize cache monitoring
   */
  private async initializeMonitoring(): Promise<boolean> {
    try {
      const monitoring = getCacheMonitoringService();
      
      // Test monitoring functionality
      const metrics = await monitoring.getHealthMetrics();
      if (!metrics || typeof metrics.redis.connected !== 'boolean') {
        throw new Error('Monitoring metrics test failed');
      }

      logger.info('Cache monitoring initialized successfully');
      return true;
    } catch (error) {
      logger.error('Cache monitoring initialization error:', error as any);
      return false;
    }
  }

  /**
   * Initialize cache warmup
   */
  private async initializeWarmup(): Promise<boolean> {
    try {
      const warmupService = getCacheWarmupService();
      
      // Test warmup service
      const stats = warmupService.getStats();
      if (!stats || typeof stats.totalJobs !== 'number') {
        throw new Error('Warmup service test failed');
      }

      // Run initial warmup if configured
      if (this.config.warmup.enabled) {
        logger.info('Starting initial cache warmup');
        await warmupService.runWarmup();
        logger.info('Initial cache warmup completed');
      }

      logger.info('Cache warmup service initialized successfully');
      return true;
    } catch (error) {
      logger.error('Cache warmup initialization error:', error as any);
      return false;
    }
  }

  /**
   * Perform comprehensive health check
   */
  private async performHealthCheck(): Promise<{
    healthy: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    try {
      // Check Redis connection
      const cacheManager = getCacheManager();
      const redisHealthy = await cacheManager.healthCheck();
      if (!redisHealthy) {
        issues.push('Redis connection unhealthy');
      }

      // Check cache strategy
      const cacheStrategy = getCacheStrategy();
      const strategyHealth = await cacheStrategy.healthCheck();
      if (!strategyHealth.healthy) {
        issues.push(...strategyHealth.issues);
      }

      // Check monitoring if enabled
      if (this.config.monitoring.enabled) {
        const monitoring = getCacheMonitoringService();
        const monitoringHealth = await monitoring.getHealthMetrics();
        if (!monitoringHealth.redis.connected) {
          issues.push('Cache monitoring reports Redis disconnected');
        }
      }

      return {
        healthy: issues.length === 0,
        issues
      };
    } catch (error) {
      issues.push(`Health check error: ${(error as Error).message}`);
      return {
        healthy: false,
        issues
      };
    }
  }

  /**
   * Set up graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down cache system gracefully`);
      
      try {
        // Stop warmup service
        if (this.config.warmup.enabled) {
          logger.info('Stopping cache warmup service');
          // Warmup service will stop automatically
        }

        // Disconnect Redis
        const cacheManager = getCacheManager();
        await cacheManager.disconnect();
        logger.info('Redis connections closed');

        logger.info('Cache system shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during cache system shutdown:', error as any);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // For nodemon
  }

  /**
   * Get initialization status
   */
  async getStatus(): Promise<{
    initialized: boolean;
    uptime: number;
    services: Record<string, boolean>;
    health: any;
    config: any;
  }> {
    try {
      const cacheStrategy = getCacheStrategy();
      const health = await cacheStrategy.healthCheck();
      
      return {
        initialized: true,
        uptime: Date.now() - this.initializationStartTime,
        services: {
          redis: health.redis,
          strategy: health.healthy,
          session: true, // Simplified
          warmup: this.config.warmup.enabled,
          monitoring: this.config.monitoring.enabled,
          microservices: true
        },
        health,
        config: {
          environment: process.env.NODE_ENV || 'development',
          warmupEnabled: this.config.warmup.enabled,
          monitoringEnabled: this.config.monitoring.enabled,
          defaultTTL: this.config.strategy.defaultTTL,
          maxMemory: this.config.strategy.maxMemoryUsage
        }
      };
    } catch (error) {
      return {
        initialized: false,
        uptime: 0,
        services: {},
        health: { healthy: false, error: (error as Error).message },
        config: {}
      };
    }
  }

  /**
   * Reinitialize cache system (for configuration changes)
   */
  async reinitialize(): Promise<CacheInitializationResult> {
    logger.info('Reinitializing cache system');
    
    try {
      // Disconnect existing connections
      const cacheManager = getCacheManager();
      await cacheManager.disconnect();
      
      // Wait a moment for cleanup
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Reinitialize
      return await this.initialize();
    } catch (error) {
      logger.error('Cache reinitialization error:', error as any);
      return {
        success: false,
        services: {
          redis: false,
          strategy: false,
          session: false,
          warmup: false,
          monitoring: false,
          microservices: false
        },
        errors: [`Reinitialization error: ${(error as Error).message}`],
        warnings: [],
        metrics: {
          initializationTime: 0,
          redisConnectionTime: 0,
          warmupTime: 0
        }
      };
    }
  }
}

// Singleton instance
let cacheInitializer: CacheInitializer | null = null;

export function getCacheInitializer(): CacheInitializer {
  if (!cacheInitializer) {
    cacheInitializer = new CacheInitializer();
  }
  return cacheInitializer;
}

/**
 * Convenience function to initialize cache system
 */
export async function initializeCacheSystem(): Promise<CacheInitializationResult> {
  const initializer = getCacheInitializer();
  return await initializer.initialize();
}