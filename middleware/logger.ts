/**
 * Comprehensive Logging System
 * 
 * Features:
 * - Structured logging with JSON format
 * - Multiple log levels (error, warn, info, http, debug, verbose, silly)
 * - Log rotation with daily files and size limits
 * - Log aggregation with correlation IDs
 * - Performance monitoring
 * - Security audit logging
 * - Business metrics tracking
 * - Error tracking with stack traces
 * - Context propagation across async operations
 * - Multiple transport options (console, file, external services)
 */

import { Request, Response, NextFunction } from 'express';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import * as rTracer from 'cls-rtracer';
import { AsyncLocalStorage } from 'async_hooks';

// ============================================================================
// Types and Interfaces
// ============================================================================

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  HTTP = 'http',
  VERBOSE = 'verbose',
  DEBUG = 'debug',
  SILLY = 'silly'
}

export enum LogCategory {
  APPLICATION = 'application',
  SECURITY = 'security',
  AUDIT = 'audit',
  PERFORMANCE = 'performance',
  BUSINESS = 'business',
  DATABASE = 'database',
  EXTERNAL_API = 'external_api',
  WEBHOOK = 'webhook'
}

export interface LogContext {
  correlationId?: string;
  traceId?: string;
  spanId?: string;
  userId?: string;
  sessionId?: string;
  ip?: string;
  userAgent?: string;
  method?: string;
  url?: string;
  statusCode?: number;
  duration?: number;
  error?: Error | ErrorDetails;
  category?: LogCategory;
  tags?: Record<string, string>;
  [key: string]: any;
}

export interface ErrorDetails {
  name: string;
  message: string;
  stack?: string;
  code?: string;
  statusCode?: number;
}

export interface MetricData {
  name: string;
  value: number;
  unit?: string;
  tags?: Record<string, string>;
  timestamp?: Date;
}

export interface AuditLogData {
  action: string;
  resource: string;
  resourceId?: string;
  userId?: string;
  changes?: any;
  result?: 'success' | 'failure';
  reason?: string;
}

export interface PerformanceLogData {
  operation: string;
  duration: number;
  threshold?: number;
  metadata?: any;
}

// ============================================================================
// Context Storage for Async Operations
// ============================================================================

export const contextStorage = new AsyncLocalStorage<LogContext>();

// ============================================================================
// Custom Winston Formats
// ============================================================================

const structuredFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'label'] }),
  winston.format.json(),
  winston.format.printf((info: any) => {
    const context = contextStorage.getStore() || {};
    const correlationId = info.correlationId || context.correlationId || rTracer.id();
    
    const logEntry: any = {
      timestamp: info.timestamp,
      level: info.level,
      message: info.message,
      service: process.env.SERVICE_NAME || 'nepa-backend',
      environment: process.env.NODE_ENV || 'development',
      correlationId,
      traceId: info.traceId || context.traceId,
      spanId: info.spanId || context.spanId,
      category: info.category || context.category || LogCategory.APPLICATION,
      ...info.metadata
    };

    // Add error details if present
    if (info.error) {
      logEntry.error = {
        name: info.error.name,
        message: info.error.message,
        stack: info.error.stack,
        code: info.error.code
      };
    }

    return JSON.stringify(logEntry);
  })
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
  winston.format.colorize(),
  winston.format.printf((info: any) => {
    const context = contextStorage.getStore() || {};
    const correlationId = info.correlationId || context.correlationId || rTracer.id();
    const cid = correlationId ? `[${String(correlationId).substring(0, 8)}]` : '';
    const category = info.category ? `[${info.category}]` : '';
    
    let message = `${info.timestamp} ${info.level}${cid}${category}: ${info.message}`;
    
    // Add metadata if present
    if (info.metadata && Object.keys(info.metadata).length > 0) {
      const meta = { ...info.metadata };
      delete meta.correlationId;
      delete meta.traceId;
      delete meta.spanId;
      delete meta.category;
      
      if (Object.keys(meta).length > 0) {
        message += ` ${JSON.stringify(meta)}`;
      }
    }
    
    return message;
  })
);

// ============================================================================
// Logger Class
// ============================================================================

export class ComprehensiveLogger {
  private logger: winston.Logger;
  private isDevelopment: boolean;
  private metricsBuffer: MetricData[] = [];
  private metricsFlushInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV !== 'production';
    this.setupLogger();
    this.setupMetricsAggregation();
  }

  private setupLogger(): void {
    const transports: winston.transport[] = [
      // Console transport
      new winston.transports.Console({
        format: this.isDevelopment ? consoleFormat : structuredFormat,
        level: this.isDevelopment ? 'debug' : 'info'
      })
    ];

    // File transports for production
    if (!this.isDevelopment) {
      // Application logs
      transports.push(
        new DailyRotateFile({
          filename: 'logs/application-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '50m',
          maxFiles: '30d',
          level: 'info',
          format: structuredFormat
        })
      );

      // Error logs
      transports.push(
        new DailyRotateFile({
          filename: 'logs/error-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '50m',
          maxFiles: '90d',
          level: 'error',
          format: structuredFormat
        })
      );

      // Security & Audit logs
      transports.push(
        new DailyRotateFile({
          filename: 'logs/security-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '50m',
          maxFiles: '365d',
          level: 'info',
          format: structuredFormat,
          filter: (info: any) => {
            return info.category === LogCategory.SECURITY || 
                   info.category === LogCategory.AUDIT;
          }
        })
      );

      // Performance logs
      transports.push(
        new DailyRotateFile({
          filename: 'logs/performance-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '50m',
          maxFiles: '14d',
          level: 'info',
          format: structuredFormat,
          filter: (info: any) => {
            return info.category === LogCategory.PERFORMANCE;
          }
        })
      );

      // Business metrics logs
      transports.push(
        new DailyRotateFile({
          filename: 'logs/metrics-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '50m',
          maxFiles: '30d',
          level: 'info',
          format: structuredFormat,
          filter: (info: any) => {
            return info.category === LogCategory.BUSINESS;
          }
        })
      );
    }

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || (this.isDevelopment ? 'debug' : 'info'),
      format: structuredFormat,
      transports,
      exitOnError: false,
      silent: process.env.LOG_SILENT === 'true'
    });
  }

  private setupMetricsAggregation(): void {
    // Flush metrics every 60 seconds
    this.metricsFlushInterval = setInterval(() => {
      this.flushMetrics();
    }, 60000);
  }

  private flushMetrics(): void {
    if (this.metricsBuffer.length === 0) return;

    const metrics = [...this.metricsBuffer];
    this.metricsBuffer = [];

    // Aggregate metrics by name
    const aggregated = metrics.reduce((acc, metric) => {
      const key = `${metric.name}:${JSON.stringify(metric.tags || {})}`;
      if (!acc[key]) {
        acc[key] = {
          name: metric.name,
          values: [],
          tags: metric.tags,
          unit: metric.unit
        };
      }
      acc[key].values.push(metric.value);
      return acc;
    }, {} as Record<string, any>);

    // Log aggregated metrics
    Object.values(aggregated).forEach((agg: any) => {
      const sum = agg.values.reduce((a: number, b: number) => a + b, 0);
      const avg = sum / agg.values.length;
      const min = Math.min(...agg.values);
      const max = Math.max(...agg.values);

      this.info(`Metric aggregation: ${agg.name}`, {
        category: LogCategory.BUSINESS,
        metric: agg.name,
        count: agg.values.length,
        sum,
        avg,
        min,
        max,
        unit: agg.unit,
        tags: agg.tags
      });
    });
  }

  // ============================================================================
  // Core Logging Methods
  // ============================================================================

  private log(level: LogLevel, message: string, context?: LogContext): void {
    const ctx = contextStorage.getStore() || {};
    this.logger.log(level, message, {
      ...context,
      correlationId: context?.correlationId || ctx.correlationId || rTracer.id(),
      traceId: context?.traceId || ctx.traceId,
      spanId: context?.spanId || ctx.spanId,
      userId: context?.userId || ctx.userId,
      category: context?.category || ctx.category
    });
  }

  error(message: string, context?: LogContext): void {
    this.log(LogLevel.ERROR, message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  http(message: string, context?: LogContext): void {
    this.log(LogLevel.HTTP, message, context);
  }

  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  verbose(message: string, context?: LogContext): void {
    this.log(LogLevel.VERBOSE, message, context);
  }

  silly(message: string, context?: LogContext): void {
    this.log(LogLevel.SILLY, message, context);
  }

  // ============================================================================
  // Specialized Logging Methods
  // ============================================================================

  logError(error: Error, context?: LogContext): void {
    this.error(error.message, {
      ...context,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
        statusCode: (error as any).statusCode
      }
    });
  }

  /**
   * Log security-related events
   */
  security(message: string, context?: LogContext): void {
    this.info(message, {
      ...context,
      category: LogCategory.SECURITY
    });
  }

  /**
   * Log audit trail events
   */
  audit(data: AuditLogData, context?: LogContext): void {
    this.info(`Audit: ${data.action} on ${data.resource}`, {
      ...context,
      ...data,
      category: LogCategory.AUDIT
    });
  }

  /**
   * Log performance metrics
   */
  performance(data: PerformanceLogData, context?: LogContext): void {
    const level = data.threshold && data.duration > data.threshold ? LogLevel.WARN : LogLevel.INFO;
    
    this.log(level, `Performance: ${data.operation} took ${data.duration}ms`, {
      ...context,
      ...data,
      category: LogCategory.PERFORMANCE,
      exceededThreshold: data.threshold ? data.duration > data.threshold : false
    });
  }

  /**
   * Log business metrics
   */
  metric(data: MetricData, context?: LogContext): void {
    // Buffer metrics for aggregation
    this.metricsBuffer.push({
      ...data,
      timestamp: data.timestamp || new Date()
    });

    // Also log immediately for real-time monitoring
    this.info(`Metric: ${data.name} = ${data.value}${data.unit || ''}`, {
      ...context,
      ...data,
      category: LogCategory.BUSINESS
    });
  }

  /**
   * Log database operations
   */
  database(message: string, context?: LogContext): void {
    this.debug(message, {
      ...context,
      category: LogCategory.DATABASE
    });
  }

  /**
   * Log external API calls
   */
  externalApi(message: string, context?: LogContext): void {
    this.info(message, {
      ...context,
      category: LogCategory.EXTERNAL_API
    });
  }

  /**
   * Log webhook events
   */
  webhook(message: string, context?: LogContext): void {
    this.info(message, {
      ...context,
      category: LogCategory.WEBHOOK
    });
  }

  /**
   * Create a child logger with default context
   */
  child(defaultContext: LogContext): any {
    const childLogger = new ComprehensiveLogger();
    const originalLogMethod = (childLogger as any).log.bind(childLogger);
    
    (childLogger as any).log = (level: LogLevel, message: string, context?: LogContext) => {
      originalLogMethod(level, message, { ...defaultContext, ...context });
    };
    
    return childLogger;
  }

  /**
   * Cleanup resources
   */
  close(): void {
    if (this.metricsFlushInterval) {
      clearInterval(this.metricsFlushInterval);
    }
    this.flushMetrics();
    this.logger.close();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const logger = new ComprehensiveLogger();

// ============================================================================
// Express Middleware
// ============================================================================

/**
 * Correlation ID middleware - tracks requests across services
 */
export const correlationIdMiddleware = rTracer.expressMiddleware({
  useHeader: true,
  headerName: 'X-Correlation-ID'
});

/**
 * Request logging middleware
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  const correlationId = rTracer.id();
  
  // Store request context
  const context: LogContext = {
    correlationId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.get('User-Agent'),
    userId: (req as any).user?.id,
    sessionId: (req as any).session?.id
  };

  contextStorage.run(context, () => {
    logger.http('Request started', context);

    // Log response
    res.on('finish', () => {
      const duration = Date.now() - start;
      const level = res.statusCode >= 400 ? LogLevel.WARN : LogLevel.HTTP;
      
      logger.log(level, 'Request completed', {
        ...context,
        statusCode: res.statusCode,
        duration,
        contentLength: res.get('Content-Length')
      });

      // Log performance warning for slow requests
      if (duration > 1000) {
        logger.performance({
          operation: `${req.method} ${req.originalUrl}`,
          duration,
          threshold: 1000
        }, context);
      }
    });

    // Log errors
    res.on('error', (error: Error) => {
      logger.logError(error, context);
    });

    next();
  });
};

/**
 * Error logging middleware
 */
export const errorLogger = (err: Error, req: Request, res: Response, next: NextFunction): void => {
  const context: LogContext = {
    correlationId: rTracer.id(),
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: (req as any).user?.id,
    statusCode: (err as any).statusCode || 500
  };

  logger.logError(err, context);
  next(err);
};

/**
 * Combined logging middleware
 */
export const loggingMiddleware = [
  correlationIdMiddleware,
  requestLogger
];

// ============================================================================
// Global Error Handling
// ============================================================================

export const setupGlobalErrorHandling = (app: any): void => {
  // Add error logger before error handler
  app.use(errorLogger);
  
  // Uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception', {
      category: LogCategory.APPLICATION,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    });
    
    // Give logger time to write
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });

  // Unhandled promise rejections
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logger.error('Unhandled Promise Rejection', {
      category: LogCategory.APPLICATION,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      promise: String(promise)
    });
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, closing logger');
    logger.close();
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, closing logger');
    logger.close();
  });
};

// ============================================================================
// Exports
// ============================================================================

export {
  contextStorage as logContextStorage
};

export default logger;
