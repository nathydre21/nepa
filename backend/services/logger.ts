import pino from 'pino';
import { Request, Response, NextFunction } from 'express';
import * as rTracer from 'cls-rtracer';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  HTTP = 'http',
  VERBOSE = 'verbose',
  DEBUG = 'debug',
  SILLY = 'silly'
}

export interface LogContext {
  correlationId?: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
  method?: string;
  url?: string;
  statusCode?: number;
  duration?: number;
  error?: Error;
  [key: string]: any;
}

const isDevelopment = process.env.NODE_ENV !== 'production';

class Logger {
  private logger: pino.Logger;

  constructor() {
    this.logger = pino({
      level: isDevelopment ? 'debug' : 'info',
      transport: isDevelopment
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
        return {
          correlationId: rTracer.id(),
        };
      },
    });
  }

  error(message: string, context?: LogContext): void {
    this.logger.error(context, message);
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(context, message);
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(context, message);
  }

  http(message: string, context?: LogContext): void {
    this.logger.info(context, message);
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug(context, message);
  }

  verbose(message: string, context?: LogContext): void {
    this.logger.trace(context, message);
  }

  silly(message: string, context?: LogContext): void {
    this.logger.trace(context, message);
  }

  logError(error: Error, context?: LogContext): void {
    this.error(error.message, {
      ...context,
      err: error,
    });
  }

  child(context: LogContext): Logger {
    const child = new Logger();
    child.logger = this.logger.child(context);
    return child;
  }
}

export const logger = new Logger();

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const correlationId = rTracer.id();

  logger.http('Request started', {
    correlationId: (correlationId as string) || undefined,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: (req as any).user?.id
  });

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? 'warn' : 'info';

    logger[level]('Request completed', {
      correlationId: (correlationId as string) || undefined,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: (req as any).user?.id
    });
  });

  res.on('error', (error) => {
    logger.logError(error, {
      correlationId: (correlationId as string) || undefined,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: (req as any).user?.id
    });
  });

  next();
};

export const correlationIdMiddleware = rTracer.expressMiddleware();

export default logger;
