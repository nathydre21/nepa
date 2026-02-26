import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
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

class Logger {
  private logger: winston.Logger;
  private isDevelopment: boolean;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV !== 'production';
    
    const logFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
      winston.format.printf(({ timestamp, level, message, correlationId, ...meta }) => {
        const logEntry = {
          timestamp,
          level,
          message,
          correlationId: correlationId || rTracer.id(),
          ...meta
        };
        return JSON.stringify(logEntry);
      })
    );

    const transports: winston.transport[] = [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple(),
          winston.format.printf(({ timestamp, level, message, correlationId, ...meta }) => {
            const cid = correlationId || rTracer.id();
            const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta, null, 2) : '';
            return `${timestamp} [${level}]${cid ? ` [${cid}]` : ''}: ${message} ${metaStr}`;
          })
        )
      })
    ];

    if (!this.isDevelopment) {
      transports.push(
        new DailyRotateFile({
          filename: 'logs/application-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '14d',
          level: 'info'
        }),
        new DailyRotateFile({
          filename: 'logs/error-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '30d',
          level: 'error'
        })
      );
    }

    this.logger = winston.createLogger({
      level: this.isDevelopment ? 'debug' : 'info',
      format: logFormat,
      transports,
      exitOnError: false
    });
  }

  private formatMessage(message: string, context?: LogContext): string {
    if (!context) return message;
    
    const contextParts = [];
    if (context.userId) contextParts.push(`user:${context.userId}`);
    if (context.ip) contextParts.push(`ip:${context.ip}`);
    if (context.method && context.url) contextParts.push(`${context.method} ${context.url}`);
    if (context.statusCode) contextParts.push(`status:${context.statusCode}`);
    if (context.duration) contextParts.push(`${context.duration}ms`);
    
    const contextStr = contextParts.length > 0 ? `[${contextParts.join(' ')}] ` : '';
    return `${contextStr}${message}`;
  }

  error(message: string, context?: LogContext): void {
    this.logger.error(this.formatMessage(message, context), {
      ...context,
      correlationId: context?.correlationId || rTracer.id()
    });
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(this.formatMessage(message, context), {
      ...context,
      correlationId: context?.correlationId || rTracer.id()
    });
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(this.formatMessage(message, context), {
      ...context,
      correlationId: context?.correlationId || rTracer.id()
    });
  }

  http(message: string, context?: LogContext): void {
    this.logger.http(this.formatMessage(message, context), {
      ...context,
      correlationId: context?.correlationId || rTracer.id()
    });
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug(this.formatMessage(message, context), {
      ...context,
      correlationId: context?.correlationId || rTracer.id()
    });
  }

  verbose(message: string, context?: LogContext): void {
    this.logger.verbose(this.formatMessage(message, context), {
      ...context,
      correlationId: context?.correlationId || rTracer.id()
    });
  }

  silly(message: string, context?: LogContext): void {
    this.logger.silly(this.formatMessage(message, context), {
      ...context,
      correlationId: context?.correlationId || rTracer.id()
    });
  }

  logError(error: Error, context?: LogContext): void {
    this.error(error.message, {
      ...context,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    });
  }

  child(context: LogContext): Logger {
    const childLogger = new Logger();
    childLogger.logger = this.logger.child(context);
    return childLogger;
  }
}

export const logger = new Logger();

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const correlationId = rTracer.id() as string | undefined;

  logger.http('Request started', {
    correlationId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: (req as any).user?.id
  });

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? 'warn' : 'http';

    logger[level]('Request completed', {
      correlationId,
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
      correlationId,
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
