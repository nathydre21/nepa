import { Request, Response, NextFunction } from 'express';
import pino from 'pino';
import * as rTracer from 'cls-rtracer';
import { AsyncLocalStorage } from 'async_hooks';

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
  error?: Error | any;
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

export const contextStorage = new AsyncLocalStorage<LogContext>();

const isDevelopment = process.env.NODE_ENV !== 'production';

export class ComprehensiveLogger {
  private logger: pino.Logger;
  private isDevelopment: boolean;
  private metricsBuffer: MetricData[] = [];
  private metricsFlushInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.isDevelopment = isDevelopment;
    this.setupLogger();
    this.setupMetricsAggregation();
  }

  private setupLogger(): void {
    this.logger = pino({
      level: process.env.LOG_LEVEL || (this.isDevelopment ? 'debug' : 'info'),
      transport: this.isDevelopment
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
      timestamp: pino.stdTimeFunctions.isoTime,
      mixin() {
        const ctx = contextStorage.getStore() || {};
        return {
          service: process.env.SERVICE_NAME || 'nepa-backend',
          environment: process.env.NODE_ENV || 'development',
          correlationId: ctx.correlationId || rTracer.id(),
          traceId: ctx.traceId,
          spanId: ctx.spanId,
          category: ctx.category,
        };
      },
    });
  }

  private setupMetricsAggregation(): void {
    this.metricsFlushInterval = setInterval(() => {
      this.flushMetrics();
    }, 60000);
  }

  private flushMetrics(): void {
    if (this.metricsBuffer.length === 0) return;

    const metrics = [...this.metricsBuffer];
    this.metricsBuffer = [];

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

  private log(level: LogLevel, message: string, context?: LogContext): void {
    const ctx = contextStorage.getStore() || {};
    this.logger[level]({
      ...context,
      userId: context?.userId || ctx.userId,
    }, message);
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
    this.log(LogLevel.INFO, message, context);
  }

  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  verbose(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  silly(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  logError(error: Error, context?: LogContext): void {
    this.error(error.message, {
      ...context,
      err: error,
    });
  }

  security(message: string, context?: LogContext): void {
    this.info(message, {
      ...context,
      category: LogCategory.SECURITY
    });
  }

  audit(data: AuditLogData, context?: LogContext): void {
    this.info(`Audit: ${data.action} on ${data.resource}`, {
      ...context,
      ...data,
      category: LogCategory.AUDIT
    });
  }

  performance(data: PerformanceLogData, context?: LogContext): void {
    const level = data.threshold && data.duration > data.threshold ? LogLevel.WARN : LogLevel.INFO;

    this.log(level, `Performance: ${data.operation} took ${data.duration}ms`, {
      ...context,
      ...data,
      category: LogCategory.PERFORMANCE,
      exceededThreshold: data.threshold ? data.duration > data.threshold : false
    });
  }

  metric(data: MetricData, context?: LogContext): void {
    this.metricsBuffer.push({
      ...data,
      timestamp: data.timestamp || new Date()
    });

    this.info(`Metric: ${data.name} = ${data.value}${data.unit || ''}`, {
      ...context,
      ...data,
      category: LogCategory.BUSINESS
    });
  }

  database(message: string, context?: LogContext): void {
    this.debug(message, {
      ...context,
      category: LogCategory.DATABASE
    });
  }

  externalApi(message: string, context?: LogContext): void {
    this.info(message, {
      ...context,
      category: LogCategory.EXTERNAL_API
    });
  }

  webhook(message: string, context?: LogContext): void {
    this.info(message, {
      ...context,
      category: LogCategory.WEBHOOK
    });
  }

  child(defaultContext: LogContext): any {
    const childLogger = new ComprehensiveLogger();
    const originalLogMethod = (childLogger as any).log.bind(childLogger);

    (childLogger as any).log = (level: LogLevel, message: string, context?: LogContext) => {
      originalLogMethod(level, message, { ...defaultContext, ...context });
    };

    return childLogger;
  }

  close(): void {
    if (this.metricsFlushInterval) {
      clearInterval(this.metricsFlushInterval);
    }
    this.flushMetrics();
  }
}

export const logger = new ComprehensiveLogger();

export const correlationIdMiddleware = rTracer.expressMiddleware({
  useHeader: true,
  headerName: 'X-Correlation-ID'
});

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  const correlationId = rTracer.id();

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

    res.on('finish', () => {
      const duration = Date.now() - start;
      const level = res.statusCode >= 400 ? LogLevel.WARN : LogLevel.INFO;

      logger.log(level, 'Request completed', {
        ...context,
        statusCode: res.statusCode,
        duration,
        contentLength: res.get('Content-Length')
      });

      if (duration > 1000) {
        logger.performance({
          operation: `${req.method} ${req.originalUrl}`,
          duration,
          threshold: 1000
        }, context);
      }
    });

    res.on('error', (error: Error) => {
      logger.logError(error, context);
    });

    next();
  });
};

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

export const loggingMiddleware = [
  correlationIdMiddleware,
  requestLogger
];

export const setupGlobalErrorHandling = (app: any): void => {
  app.use(errorLogger);

  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception', {
      category: LogCategory.APPLICATION,
      err: error
    });

    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });

  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logger.error('Unhandled Promise Rejection', {
      category: LogCategory.APPLICATION,
      err: error,
      promise: String(promise)
    });
  });

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, closing logger');
    logger.close();
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, closing logger');
    logger.close();
  });
};

export {
  contextStorage as logContextStorage
};

export default logger;
