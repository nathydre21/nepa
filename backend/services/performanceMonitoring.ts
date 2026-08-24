import performanceNow from 'performance-now';
import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';
import { errorTracker } from './errorTracking';

export interface PerformanceMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  memoryUsage?: NodeJS.MemoryUsage;
  cpuUsage?: NodeJS.CpuUsage;
}

export interface RequestMetrics extends PerformanceMetrics {
  method: string;
  url: string;
  statusCode?: number;
  ip?: string;
  userAgent?: string;
  userId?: string;
  correlationId?: string;
}

export interface DatabaseMetrics extends PerformanceMetrics {
  query: string;
  parameters?: any[];
  affectedRows?: number;
}

export interface CustomMetrics {
  name: string;
  value: number;
  unit: string;
  tags?: Record<string, string>;
  timestamp: Date;
}

class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetrics> = new Map();
  private requestMetrics: RequestMetrics[] = [];
  private customMetrics: CustomMetrics[] = [];
  private maxMetricsHistory: number = 1000;

  startTimer(id: string): string {
    const startTime = performanceNow();
    this.metrics.set(id, {
      startTime,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    });

    logger.debug('Timer started', { timerId: id, startTime });
    return id;
  }

  endTimer(id: string): number | null {
    const metric = this.metrics.get(id);
    if (!metric) {
      logger.warn('Timer not found', { timerId: id });
      return null;
    }

    const endTime = performanceNow();
    const duration = endTime - metric.startTime;

    const completedMetric = {
      ...metric,
      endTime,
      duration,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(metric.cpuUsage)
    };

    this.metrics.set(id, completedMetric);

    logger.debug('Timer ended', {
      timerId: id,
      duration: parseFloat(duration.toFixed(2)),
      memoryDelta: {
        rss: (completedMetric.memoryUsage?.rss || 0) - (metric.memoryUsage?.rss || 0),
        heapUsed: (completedMetric.memoryUsage?.heapUsed || 0) - (metric.memoryUsage?.heapUsed || 0)
      }
    });

    return duration;
  }

  recordRequestMetric(metric: RequestMetrics): void {
    this.requestMetrics.push(metric);
    
    if (this.requestMetrics.length > this.maxMetricsHistory) {
      this.requestMetrics = this.requestMetrics.slice(-this.maxMetricsHistory);
    }

    logger.debug('Request metric recorded', {
      method: metric.method,
      url: metric.url,
      duration: metric.duration,
      statusCode: metric.statusCode
    });

    if (metric.duration && metric.duration > 1000) {
      logger.warn('Slow request detected', {
        method: metric.method,
        url: metric.url,
        duration: metric.duration,
        statusCode: metric.statusCode
      });
    }
  }

  recordCustomMetric(name: string, value: number, unit: string, tags?: Record<string, string>): void {
    const metric: CustomMetrics = {
      name,
      value,
      unit,
      tags,
      timestamp: new Date()
    };

    this.customMetrics.push(metric);
    
    if (this.customMetrics.length > this.maxMetricsHistory) {
      this.customMetrics = this.customMetrics.slice(-this.maxMetricsHistory);
    }

    logger.debug('Custom metric recorded', { name, value, unit, tags });
  }

  getRequestMetrics(limit?: number): RequestMetrics[] {
    return limit ? this.requestMetrics.slice(-limit) : this.requestMetrics;
  }

  getCustomMetrics(limit?: number): CustomMetrics[] {
    return limit ? this.customMetrics.slice(-limit) : this.customMetrics;
  }

  getAverageResponseTime(): number {
    if (this.requestMetrics.length === 0) return 0;
    
    const total = this.requestMetrics.reduce((sum, metric) => sum + (metric.duration || 0), 0);
    return total / this.requestMetrics.length;
  }

  getErrorRate(): number {
    if (this.requestMetrics.length === 0) return 0;
    
    const errors = this.requestMetrics.filter(metric => 
      metric.statusCode && metric.statusCode >= 400
    ).length;
    
    return (errors / this.requestMetrics.length) * 100;
  }

  getRequestsPerMinute(): number {
    if (this.requestMetrics.length === 0) return 0;
    
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    const recentRequests = this.requestMetrics.filter(metric => 
      metric.endTime && metric.endTime > oneMinuteAgo
    );
    
    return recentRequests.length;
  }

  getMemoryUsage(): NodeJS.MemoryUsage {
    return process.memoryUsage();
  }

  getCpuUsage(): NodeJS.CpuUsage {
    return process.cpuUsage();
  }

  clearMetrics(): void {
    this.metrics.clear();
    this.requestMetrics = [];
    this.customMetrics = [];
    logger.info('Performance metrics cleared');
  }

  getHealthStatus(): {
    status: 'healthy' | 'warning' | 'critical';
    metrics: {
      averageResponseTime: number;
      errorRate: number;
      requestsPerMinute: number;
      memoryUsage: NodeJS.MemoryUsage;
    };
  } {
    const avgResponseTime = this.getAverageResponseTime();
    const errorRate = this.getErrorRate();
    const requestsPerMinute = this.getRequestsPerMinute();
    const memoryUsage = this.getMemoryUsage();

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    if (avgResponseTime > 2000 || errorRate > 10) {
      status = 'critical';
    } else if (avgResponseTime > 1000 || errorRate > 5) {
      status = 'warning';
    }

    return {
      status,
      metrics: {
        averageResponseTime: avgResponseTime,
        errorRate,
        requestsPerMinute,
        memoryUsage
      }
    };
  }
}

export const performanceMonitor = new PerformanceMonitor();

export const performanceMiddleware = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    const timerId = performanceMonitor.startTimer(`req_${Date.now()}_${Math.random()}`);
    
    res.on('finish', () => {
      const duration = performanceMonitor.endTimer(timerId);
      
      if (duration !== null) {
        performanceMonitor.recordRequestMetric({
          startTime: 0,
          endTime: Date.now(),
          duration,
          method: req.method,
          url: req.originalUrl,
          statusCode: res.statusCode,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          userId: (req as any).user?.id,
          correlationId: (req as any).correlationId
        });
      }
    });

    next();
  };
};

export const databasePerformanceMonitor = () => {
  return (target: any, propertyName: string, descriptor: PropertyDescriptor) => {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const timerId = performanceMonitor.startTimer(`db_${propertyName}_${Date.now()}`);
      
      try {
        const result = await method.apply(this, args);
        const duration = performanceMonitor.endTimer(timerId);
        
        if (duration !== null) {
          logger.debug('Database operation completed', {
            operation: propertyName,
            duration: parseFloat(duration.toFixed(2))
          });
        }
        
        return result;
      } catch (error) {
        const duration = performanceMonitor.endTimer(timerId);
        
        logger.logError(error as Error, {
          operation: propertyName,
          duration: duration ? parseFloat(duration.toFixed(2)) : undefined
        });
        
        throw error;
      }
    };

    return descriptor;
  };
};

export default performanceMonitor;
