import pino from 'pino';

const isDevelopment = process.env.NODE_ENV !== 'production';

export const createLogger = (serviceName: string) => {
  return pino({
    level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
    name: serviceName,
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
  });
};
