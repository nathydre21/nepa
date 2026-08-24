/**
 * src/utils/logger.ts
 *
 * Structured Pino logger for the NEPA backend.
 * Provides debug / info / warn / error levels plus convenience helpers
 * (child loggers, request middleware) with fully structured JSON output.
 */

import { Request, Response, NextFunction } from 'express';
import pino, { Logger } from 'pino';

// ─── Environment ──────────────────────────────────────────────────────────────

const isDevelopment = process.env.NODE_ENV !== 'production';
const LOG_LEVEL = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

// ─── Base pino instance ───────────────────────────────────────────────────────

const baseLogger: Logger = pino({
  level: LOG_LEVEL,

  // Human-readable pretty-print in development; raw JSON in production.
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      }
    : undefined,

  // ISO-8601 timestamps in every log line.
  timestamp: pino.stdTimeFunctions.isoTime,

  // Static fields present on every log entry.
  base: {
    service: process.env.SERVICE_NAME || 'nepa-backend',
    environment: process.env.NODE_ENV || 'development',
  },

  // Structured serialisers for common objects.
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});

// ─── Log-level helpers ────────────────────────────────────────────────────────

/**
 * Log a DEBUG message with optional structured context.
 *
 * @example
 * debug({ query, params }, 'Running DB query');
 * debug('Cache miss for key %s', key);
 */
const debug = (obj: Record<string, unknown> | string, msg?: string, ...args: unknown[]): void => {
  if (typeof obj === 'string') {
    baseLogger.debug(obj, msg, ...args);
  } else {
    baseLogger.debug(obj, msg ?? '', ...args);
  }
};

/**
 * Log an INFO message with optional structured context.
 *
 * @example
 * info({ userId, action }, 'User logged in');
 * info('Server started on port %d', port);
 */
const info = (obj: Record<string, unknown> | string, msg?: string, ...args: unknown[]): void => {
  if (typeof obj === 'string') {
    baseLogger.info(obj, msg, ...args);
  } else {
    baseLogger.info(obj, msg ?? '', ...args);
  }
};

/**
 * Log a WARN message with optional structured context.
 *
 * @example
 * warn({ attempts }, 'Rate limit approaching');
 */
const warn = (obj: Record<string, unknown> | string, msg?: string, ...args: unknown[]): void => {
  if (typeof obj === 'string') {
    baseLogger.warn(obj, msg, ...args);
  } else {
    baseLogger.warn(obj, msg ?? '', ...args);
  }
};

/**
 * Log an ERROR message.  Pass the Error instance under the `err` key so the
 * serialiser captures the full stack trace.
 *
 * @example
 * error({ err }, 'Unhandled exception');
 * error({ err, userId }, 'Payment failed');
 */
const error = (obj: Record<string, unknown> | string, msg?: string, ...args: unknown[]): void => {
  if (typeof obj === 'string') {
    baseLogger.error(obj, msg, ...args);
  } else {
    baseLogger.error(obj, msg ?? '', ...args);
  }
};

// ─── Child logger factory ─────────────────────────────────────────────────────

/**
 * Create a child logger that merges `bindings` into every log entry.
 * Useful for attaching a module name, request-id, or user-id once and
 * reusing throughout a scope.
 *
 * @example
 * const log = child({ module: 'PaymentService' });
 * log.info({ amount }, 'Payment initiated');
 */
const child = (bindings: Record<string, unknown>): Logger => baseLogger.child(bindings);

// ─── Express request logger middleware ────────────────────────────────────────

/**
 * Express middleware that logs every HTTP request on completion.
 * Attaches method, URL, status code, duration, and remote IP as structured
 * fields so logs can be queried without parsing strings.
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    baseLogger[level]({
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration,
      ip: req.ip ?? req.socket?.remoteAddress,
      userAgent: req.get('User-Agent'),
      userId: (req as any).user?.id,
    }, 'HTTP request');
  });

  next();
};

// ─── Named export (full pino instance) ───────────────────────────────────────

/**
 * The underlying pino Logger instance — use this when you need access to the
 * full pino API (e.g. `logger.child`, `logger.level`, `logger.flush`).
 */
export const logger = baseLogger;

// ─── Convenience namespace export ─────────────────────────────────────────────

/**
 * Convenience object that exposes the four standard log levels as standalone
 * functions plus a `child` factory.
 *
 * @example
 * import log from '@/utils/logger';
 * log.info({ userId }, 'Request received');
 */
const log = { debug, info, warn, error, child };

export { debug, info, warn, error, child };

export default log;
