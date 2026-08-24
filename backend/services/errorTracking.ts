import * as Sentry from '@sentry/node';
import * as Tracing from '@sentry/tracing';
import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';

export interface ErrorTrackingConfig {
  dsn: string;
  environment: string;
  tracesSampleRate: number;
  release?: string;
}

class ErrorTracker {
  private isInitialized: boolean = false;

  initialize(config: ErrorTrackingConfig): void {
    if (this.isInitialized) {
      logger.warn('Error tracking already initialized');
      return;
    }

    try {
      Sentry.init({
        dsn: config.dsn,
        environment: config.environment,
        tracesSampleRate: config.tracesSampleRate,
        release: config.release,
        integrations: [
          new Sentry.Integrations.Http({ tracing: true }),
          new Tracing.Integrations.Express({ app: undefined as any }),
        ],
        beforeSend(event) {
          if (event.exception) {
            logger.error('Sentry error captured', {
              eventId: event.event_id,
              message: event.message,
              level: event.level
            });
          }
          return event;
        }
      });

      this.isInitialized = true;
      logger.info('Error tracking initialized', { environment: config.environment });
    } catch (error) {
      logger.logError(error as Error, { context: 'ErrorTracker.initialize' });
    }
  }

  captureException(error: Error, context?: Record<string, any>): string | undefined {
    if (!this.isInitialized) {
      logger.logError(error, { ...context, sentry: 'not_initialized' });
      return;
    }

    try {
      const eventId = Sentry.captureException(error, {
        contexts: context ? { custom: context } : undefined
      });

      logger.logError(error, { ...context, eventId, sentry: 'captured' });
      return eventId;
    } catch (captureError) {
      logger.logError(captureError as Error, { 
        originalError: error.message,
        context: 'ErrorTracker.captureException'
      });
    }
  }

  captureMessage(message: string, level: Sentry.SeverityLevel = 'info', context?: Record<string, any>): string | undefined {
    if (!this.isInitialized) {
      logger.info(message, { ...context, sentry: 'not_initialized' });
      return;
    }

    try {
      const eventId = Sentry.captureMessage(message, level as any);

      logger.info(message, { ...context, eventId, sentry: 'captured', level });
      return eventId;
    } catch (captureError) {
      logger.logError(captureError as Error, { 
        originalMessage: message,
        context: 'ErrorTracker.captureMessage'
      });
    }
  }

  setUser(user: { id: string; email?: string; username?: string; [key: string]: any }): void {
    if (!this.isInitialized) return;

    try {
      Sentry.setUser(user);
      logger.debug('Sentry user set', { userId: user.id });
    } catch (error) {
      logger.logError(error as Error, { context: 'ErrorTracker.setUser' });
    }
  }

  clearUser(): void {
    if (!this.isInitialized) return;

    try {
      Sentry.setUser(null);
      logger.debug('Sentry user cleared');
    } catch (error) {
      logger.logError(error as Error, { context: 'ErrorTracker.clearUser' });
    }
  }

  setTag(key: string, value: string): void {
    if (!this.isInitialized) return;

    try {
      Sentry.setTag(key, value);
      logger.debug('Sentry tag set', { key, value });
    } catch (error) {
      logger.logError(error as Error, { context: 'ErrorTracker.setTag' });
    }
  }

  setExtra(key: string, value: any): void {
    if (!this.isInitialized) return;

    try {
      Sentry.setExtra(key, value);
      logger.debug('Sentry extra set', { key });
    } catch (error) {
      logger.logError(error as Error, { context: 'ErrorTracker.setExtra' });
    }
  }

  addBreadcrumb(breadcrumb: Sentry.Breadcrumb): void {
    if (!this.isInitialized) return;

    try {
      Sentry.addBreadcrumb(breadcrumb);
      logger.debug('Sentry breadcrumb added', { message: breadcrumb.message });
    } catch (error) {
      logger.logError(error as Error, { context: 'ErrorTracker.addBreadcrumb' });
    }
  }

  configureScope(callback: (scope: Sentry.Scope) => void): void {
    if (!this.isInitialized) return;

    try {
      Sentry.configureScope(callback);
    } catch (error) {
      logger.logError(error as Error, { context: 'ErrorTracker.configureScope' });
    }
  }

  createTransaction(name: string, op: string): Sentry.Transaction | undefined {
    if (!this.isInitialized) return;

    try {
      const transaction = Sentry.startTransaction({
        name,
        op
      });

      logger.debug('Sentry transaction created', { name, op });
      return transaction;
    } catch (error) {
      logger.logError(error as Error, { context: 'ErrorTracker.createTransaction' });
    }
  }

  getMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!this.isInitialized) {
        return next();
      }

      try {
        const transaction = Sentry.startTransaction({
          name: `${req.method} ${req.route?.path || req.originalUrl}`,
          op: 'http.server'
        });

        Sentry.getCurrentHub().configureScope(scope => {
          scope.setSpan(transaction);
          scope.setUser({ id: (req as any).user?.id });
          scope.setTag('http.method', req.method);
          scope.setTag('http.url', req.originalUrl);
          scope.setExtra('http.headers', req.headers);
        });

        res.on('finish', () => {
          transaction.setHttpStatus(res.statusCode);
          transaction.finish();
        });

        next();
      } catch (error) {
        logger.logError(error as Error, { context: 'ErrorTracker.middleware' });
        next();
      }
    };
  }
}

export const errorTracker = new ErrorTracker();

export const errorHandler = (error: any, req: Request, res: Response, next: NextFunction) => {
  const eventId = errorTracker.captureException(error, {
    request: {
      method: req.method,
      url: req.originalUrl,
      headers: req.headers,
      body: req.body,
      query: req.query,
      params: req.params
    },
    user: (req as any).user
  });

  logger.logError(error, {
    eventId,
    method: req.method,
    url: req.originalUrl,
    userId: (req as any).user?.id
  });

  // Handle Multer errors
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'File too large',
      message: 'The uploaded file exceeds the maximum allowed size (10MB)',
      eventId: process.env.NODE_ENV === 'development' ? eventId : undefined
    });
  }

  if (error.name === 'MulterError') {
    return res.status(400).json({
      error: 'File upload error',
      message: error.message,
      eventId: process.env.NODE_ENV === 'development' ? eventId : undefined
    });
  }

  res.status(error.status || 500).json({
    error: error.name || 'Internal Server Error',
    message: error.message || 'An unexpected error occurred',
    eventId: process.env.NODE_ENV === 'development' ? eventId : undefined
  });
};

export default errorTracker;
