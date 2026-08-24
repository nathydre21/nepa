import { getCacheStrategy } from './CacheStrategy';
import { getCacheManager } from '../RedisCacheManager';
import { logger } from '../logger';

export interface CacheAlert {
  id: string;
  type: 'performance' | 'memory' | 'error' | 'health';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  resolved: boolean;
  metadata?: Record<string, any>;
}

export interface CacheHealthMetrics {
  redis: {
    connected: boolean;
    memoryUsage: number;
    keyCount: number;
    hitRate: number;
    avgResponseTime: number;
    errorRate: number;
  };
  patterns: Record<string, {
    hitRate: number;
    avgResponseTime: number;
    keyCount: number;
    errorCount: number;
    lastAccessed: Date;
  }>;
  alerts: CacheAlert[];
  performance: {
    slowQueries: Array<{
      pattern: string;
      responseTime: number;
      timestamp: Date;
    }>;
    memoryTrends: Array<{
      timestamp: Date;
      usage: number;
    }>;
    hitRateTrends: Array<{
      timestamp: Date;
      hitRate: number;
    }>;
  };
}

export interface MonitoringConfig {
  enabled: boolean;
  alertThresholds: {
    hitRate: number; // Alert if hit rate drops below this
    responseTime: number; // Alert if response time exceeds this (ms)
    memoryUsage: number; // Alert if memory usage exceeds this (bytes)
    errorRate: number; // Alert if error rate exceeds this (%)
  };
  metricsRetention: number; // Days to retain metrics
  alertCooldown: number; // Minutes between similar alerts
}

/**
 * Comprehensive cache monitoring and alerting service
 * Tracks performance, health, and provides proactive alerts
 */
export class CacheMonitoringService {
  private cacheStrategy = getCacheStrategy();
  private cacheManager = getCacheManager();
  private config: MonitoringConfig;
  private alerts: Map<string, CacheAlert> = new Map();
  private metrics: CacheHealthMetrics;
  private metricsHistory: Array<{
    timestamp: Date;
    metrics: Partial<CacheHealthMetrics>;
  }> = [];
  private lastAlertTimes: Map<string, Date> = new Map();

  constructor(config: Partial<MonitoringConfig> = {}) {
    this.config = {
      enabled: true,
      alertThresholds: {
        hitRate: 0.7, // 70%
        responseTime: 1000, // 1 second
        memoryUsage: 512 * 1024 * 1024, // 512MB
        errorRate: 0.05 // 5%
      },
      metricsRetention: 7, // 7 days
      alertCooldown: 15, // 15 minutes
      ...config
    };

    this.metrics = this.initializeMetrics();

    if (this.config.enabled) {
      this.startMonitoring();
    }
  }

  /**
   * Initialize metrics structure
   */
  private initializeMetrics(): CacheHealthMetrics {
    return {
      redis: {
        connected: false,
        memoryUsage: 0,
        keyCount: 0,
        hitRate: 0,
        avgResponseTime: 0,
        errorRate: 0
      },
      patterns: {},
      alerts: [],
      performance: {
        slowQueries: [],
        memoryTrends: [],
        hitRateTrends: []
      }
    };
  }

  /**
   * Start monitoring with periodic health checks
   */
  private startMonitoring(): void {
    // Collect metrics every minute
    setInterval(async () => {
      await this.collectMetrics();
    }, 60000);

    // Check alerts every 5 minutes
    setInterval(async () => {
      await this.checkAlerts();
    }, 300000);

    // Cleanup old metrics daily
    setInterval(() => {
      this.cleanupOldMetrics();
    }, 24 * 60 * 60 * 1000);

    logger.info('Cache monitoring started');
  }

  /**
   * Collect comprehensive cache metrics
   */
  async collectMetrics(): Promise<void> {
    try {
      // Redis metrics
      const redisStats = await this.cacheManager.getStats();
      const redisHealth = await this.cacheManager.healthCheck();

      this.metrics.redis = {
        connected: redisHealth,
        memoryUsage: redisStats.memoryUsage,
        keyCount: redisStats.keyCount,
        hitRate: redisStats.hitRate,
        avgResponseTime: 0, // Would need to track separately
        errorRate: 0 // Would need to track separately
      };

      // Pattern-specific metrics
      const patternMetrics = await this.cacheStrategy.getMetrics();
      this.metrics.patterns = {};

      for (const [pattern, metrics] of Object.entries(patternMetrics)) {
        if (pattern !== '_redis') {
          this.metrics.patterns[pattern] = {
            hitRate: metrics.hitRate,
            avgResponseTime: metrics.avgResponseTime,
            keyCount: metrics.keyCount,
            errorCount: 0, // Would need to track separately
            lastAccessed: new Date()
          };
        }
      }

      // Store historical data
      this.metricsHistory.push({
        timestamp: new Date(),
        metrics: {
          redis: { ...this.metrics.redis },
          patterns: { ...this.metrics.patterns }
        }
      });

      // Update performance trends
      this.updatePerformanceTrends();

      logger.debug('Cache metrics collected', {
        redisConnected: this.metrics.redis.connected,
        memoryUsage: this.metrics.redis.memoryUsage,
        hitRate: this.metrics.redis.hitRate,
        keyCount: this.metrics.redis.keyCount
      });
    } catch (error) {
      logger.error('Metrics collection error:', error as any);
      
      // Create error alert
      const errorAlert = await this.createAlertObject({
        type: 'error',
        severity: 'high',
        message: `Metrics collection failed: ${(error as Error).message}`,
        metadata: { error: (error as Error).message }
      });
      await this.createAlert(errorAlert);
    }
  }

  /**
   * Update performance trend data
   */
  private updatePerformanceTrends(): void {
    const now = new Date();
    
    // Memory trends
    this.metrics.performance.memoryTrends.push({
      timestamp: now,
      usage: this.metrics.redis.memoryUsage
    });

    // Hit rate trends
    this.metrics.performance.hitRateTrends.push({
      timestamp: now,
      hitRate: this.metrics.redis.hitRate
    });

    // Keep only last 24 hours of trend data
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    this.metrics.performance.memoryTrends = this.metrics.performance.memoryTrends
      .filter(trend => trend.timestamp > cutoff);
    
    this.metrics.performance.hitRateTrends = this.metrics.performance.hitRateTrends
      .filter(trend => trend.timestamp > cutoff);
  }

  /**
   * Check for alert conditions
   */
  async checkAlerts(): Promise<void> {
    const alerts: CacheAlert[] = [];

    // Redis connection alert
    if (!this.metrics.redis.connected) {
      alerts.push(await this.createAlertObject({
        type: 'health',
        severity: 'critical',
        message: 'Redis connection lost',
        metadata: { component: 'redis' }
      }));
    }

    // Memory usage alert
    if (this.metrics.redis.memoryUsage > this.config.alertThresholds.memoryUsage) {
      alerts.push(await this.createAlertObject({
        type: 'memory',
        severity: 'high',
        message: `High memory usage: ${Math.round(this.metrics.redis.memoryUsage / 1024 / 1024)}MB`,
        metadata: { 
          usage: this.metrics.redis.memoryUsage,
          threshold: this.config.alertThresholds.memoryUsage
        }
      }));
    }

    // Hit rate alert
    if (this.metrics.redis.hitRate < this.config.alertThresholds.hitRate) {
      alerts.push(await this.createAlertObject({
        type: 'performance',
        severity: 'medium',
        message: `Low cache hit rate: ${Math.round(this.metrics.redis.hitRate * 100)}%`,
        metadata: { 
          hitRate: this.metrics.redis.hitRate,
          threshold: this.config.alertThresholds.hitRate
        }
      }));
    }

    // Pattern-specific alerts
    for (const [pattern, metrics] of Object.entries(this.metrics.patterns)) {
      if (metrics.hitRate < this.config.alertThresholds.hitRate) {
        alerts.push(await this.createAlertObject({
          type: 'performance',
          severity: 'low',
          message: `Low hit rate for pattern ${pattern}: ${Math.round(metrics.hitRate * 100)}%`,
          metadata: { 
            pattern,
            hitRate: metrics.hitRate,
            threshold: this.config.alertThresholds.hitRate
          }
        }));
      }

      if (metrics.avgResponseTime > this.config.alertThresholds.responseTime) {
        alerts.push(await this.createAlertObject({
          type: 'performance',
          severity: 'medium',
          message: `Slow response time for pattern ${pattern}: ${metrics.avgResponseTime}ms`,
          metadata: { 
            pattern,
            responseTime: metrics.avgResponseTime,
            threshold: this.config.alertThresholds.responseTime
          }
        }));
      }
    }

    // Process alerts
    for (const alert of alerts) {
      await this.createAlert(alert);
    }
  }

  /**
   * Create alert object with required properties
   */
  private async createAlertObject(alertData: Partial<CacheAlert>): Promise<CacheAlert> {
    const alertId = `${alertData.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      id: alertId,
      type: alertData.type || 'error',
      severity: alertData.severity || 'medium',
      message: alertData.message || 'Unknown alert',
      timestamp: new Date(),
      resolved: false,
      metadata: alertData.metadata || {}
    };
  }

  /**
   * Create and manage alerts
   */
  async createAlert(alert: CacheAlert): Promise<string> {
    // Check cooldown
    const alertKey = `${alert.type}_${alert.message}`;
    const lastAlert = this.lastAlertTimes.get(alertKey);
    const cooldownMs = this.config.alertCooldown * 60 * 1000;
    
    if (lastAlert && (Date.now() - lastAlert.getTime()) < cooldownMs) {
      logger.debug(`Alert suppressed due to cooldown: ${alert.message}`);
      return alert.id;
    }

    this.alerts.set(alert.id, alert);
    this.metrics.alerts.push(alert);
    this.lastAlertTimes.set(alertKey, new Date());

    // Log alert
    const logLevel = alert.severity === 'critical' ? 'error' : 
                    alert.severity === 'high' ? 'warn' : 'info';
    
    logger[logLevel](`Cache Alert [${alert.severity.toUpperCase()}]: ${alert.message}`, {
      alertId: alert.id,
      type: alert.type,
      metadata: alert.metadata
    });

    // Send to external monitoring (if configured)
    await this.sendExternalAlert(alert);

    return alert.id;
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string): Promise<boolean> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      return false;
    }

    alert.resolved = true;
    logger.info(`Cache alert resolved: ${alert.message}`, { alertId });
    
    return true;
  }

  /**
   * Get current health metrics
   */
  getHealthMetrics(): CacheHealthMetrics {
    return {
      ...this.metrics,
      alerts: Array.from(this.alerts.values()).filter(alert => !alert.resolved)
    };
  }

  /**
   * Get performance report
   */
  getPerformanceReport(): {
    summary: {
      overallHealth: 'excellent' | 'good' | 'fair' | 'poor';
      hitRate: number;
      avgResponseTime: number;
      memoryEfficiency: number;
      activeAlerts: number;
    };
    recommendations: string[];
    trends: {
      hitRateChange: number;
      memoryGrowth: number;
      performanceChange: number;
    };
  } {
    const activeAlerts = Array.from(this.alerts.values()).filter(alert => !alert.resolved);
    
    // Calculate overall health score
    let healthScore = 100;
    if (this.metrics.redis.hitRate < 0.8) healthScore -= 20;
    if (this.metrics.redis.memoryUsage > this.config.alertThresholds.memoryUsage * 0.8) healthScore -= 15;
    if (activeAlerts.length > 0) healthScore -= activeAlerts.length * 10;
    if (!this.metrics.redis.connected) healthScore -= 50;

    const overallHealth = healthScore >= 90 ? 'excellent' :
                         healthScore >= 70 ? 'good' :
                         healthScore >= 50 ? 'fair' : 'poor';

    // Generate recommendations
    const recommendations: string[] = [];
    
    if (this.metrics.redis.hitRate < 0.8) {
      recommendations.push('Consider increasing cache TTL for frequently accessed data');
    }
    
    if (this.metrics.redis.memoryUsage > this.config.alertThresholds.memoryUsage * 0.8) {
      recommendations.push('Memory usage is high - consider implementing cache eviction policies');
    }
    
    if (Object.values(this.metrics.patterns).some(p => p.avgResponseTime > 500)) {
      recommendations.push('Some cache patterns have slow response times - check Redis performance');
    }

    // Calculate trends (simplified)
    const trends = {
      hitRateChange: 0, // Would calculate from historical data
      memoryGrowth: 0,  // Would calculate from historical data
      performanceChange: 0 // Would calculate from historical data
    };

    return {
      summary: {
        overallHealth,
        hitRate: this.metrics.redis.hitRate,
        avgResponseTime: this.metrics.redis.avgResponseTime,
        memoryEfficiency: 1 - (this.metrics.redis.memoryUsage / this.config.alertThresholds.memoryUsage),
        activeAlerts: activeAlerts.length
      },
      recommendations,
      trends
    };
  }

  /**
   * Record slow query for monitoring
   */
  recordSlowQuery(pattern: string, responseTime: number): void {
    if (responseTime > this.config.alertThresholds.responseTime) {
      this.metrics.performance.slowQueries.push({
        pattern,
        responseTime,
        timestamp: new Date()
      });

      // Keep only last 100 slow queries
      if (this.metrics.performance.slowQueries.length > 100) {
        this.metrics.performance.slowQueries = this.metrics.performance.slowQueries.slice(-100);
      }
    }
  }

  /**
   * Send alert to external monitoring systems
   */
  private async sendExternalAlert(alert: CacheAlert): Promise<void> {
    try {
      // Integration with external monitoring (Prometheus, Grafana, etc.)
      // This would be implemented based on your monitoring stack
      
      if (process.env.WEBHOOK_ALERT_URL) {
        // Example webhook integration
        const response = await fetch(process.env.WEBHOOK_ALERT_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            service: 'nepa-cache',
            alert: {
              ...alert,
              environment: process.env.NODE_ENV || 'development'
            }
          })
        });

        if (!response.ok) {
          logger.error('Failed to send external alert:', { status: response.statusText });
        }
      }
    } catch (error) {
      logger.error('External alert error:', error as any);
    }
  }

  /**
   * Cleanup old metrics and alerts
   */
  private cleanupOldMetrics(): void {
    const cutoff = new Date(Date.now() - this.config.metricsRetention * 24 * 60 * 60 * 1000);
    
    // Cleanup metrics history
    this.metricsHistory = this.metricsHistory.filter(entry => entry.timestamp > cutoff);
    
    // Cleanup resolved alerts
    const alertsToRemove: string[] = [];
    for (const [id, alert] of Array.from(this.alerts.entries())) {
      if (alert.resolved && alert.timestamp < cutoff) {
        alertsToRemove.push(id);
      }
    }
    
    alertsToRemove.forEach(id => this.alerts.delete(id));
    this.metrics.alerts = this.metrics.alerts.filter(alert => 
      !alert.resolved || alert.timestamp > cutoff
    );

    logger.debug(`Cleaned up ${alertsToRemove.length} old alerts and ${this.metricsHistory.length} metrics entries`);
  }

  /**
   * Export metrics for external monitoring
   */
  exportMetrics(): {
    prometheus: string;
    json: CacheHealthMetrics;
  } {
    // Prometheus format
    const prometheus = `
# HELP nepa_cache_hit_rate Cache hit rate
# TYPE nepa_cache_hit_rate gauge
nepa_cache_hit_rate ${this.metrics.redis.hitRate}

# HELP nepa_cache_memory_usage Cache memory usage in bytes
# TYPE nepa_cache_memory_usage gauge
nepa_cache_memory_usage ${this.metrics.redis.memoryUsage}

# HELP nepa_cache_key_count Number of keys in cache
# TYPE nepa_cache_key_count gauge
nepa_cache_key_count ${this.metrics.redis.keyCount}

# HELP nepa_cache_connected Redis connection status
# TYPE nepa_cache_connected gauge
nepa_cache_connected ${this.metrics.redis.connected ? 1 : 0}
    `.trim();

    return {
      prometheus,
      json: this.getHealthMetrics()
    };
  }
}

// Singleton instance
let cacheMonitoringService: CacheMonitoringService | null = null;

export function getCacheMonitoringService(): CacheMonitoringService {
  if (!cacheMonitoringService) {
    cacheMonitoringService = new CacheMonitoringService();
  }
  return cacheMonitoringService;
}