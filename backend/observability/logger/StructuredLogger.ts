import pino from 'pino';
import { AsyncLocalStorage } from 'async_hooks';

export const contextStorage = new AsyncLocalStorage<{
  correlationId?: string;
  traceId?: string;
  spanId?: string;
  userId?: string;
}>();

const isDevelopment = process.env.NODE_ENV !== 'production';

export class StructuredLogger {
  private logger: pino.Logger;
  private serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;

    this.logger = pino({
      name: serviceName,
      level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
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
        const context = contextStorage.getStore();
        return {
          service: process.env.SERVICE_NAME || 'nepa-service',
          ...context,
        };
      },
    });
  }

  info(message: string, metadata?: any) {
    this.logger.info(metadata, message);
  }

  warn(message: string, metadata?: any) {
    this.logger.warn(metadata, message);
  }

  error(message: string, error?: Error, metadata?: any) {
    this.logger.error({ ...metadata, err: error }, message);
  }

  debug(message: string, metadata?: any) {
    this.logger.debug(metadata, message);
  }

  metric(metricName: string, value: number, tags?: Record<string, string>) {
    this.info(`Metric: ${metricName}`, {
      metric: metricName,
      value,
      tags,
      type: 'metric',
    });
  }

  audit(action: string, resource: string, metadata?: any) {
    this.info(`Audit: ${action} on ${resource}`, {
      action,
      resource,
      ...metadata,
      type: 'audit',
    });
  }

  performance(operation: string, duration: number, metadata?: any) {
    this.info(`Performance: ${operation}`, {
      operation,
      duration,
      ...metadata,
      type: 'performance',
    });
  }
}

export const createLogger = (serviceName: string) => new StructuredLogger(serviceName);

export default createLogger;
