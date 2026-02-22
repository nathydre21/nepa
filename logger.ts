import { Request, Response, NextFunction } from 'express';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms - IP: ${req.ip}`
    );
  });

  next();
};

// Simple logger instance for application logging
export const logger = {
  info: (message: string) => {
    console.log(`[${new Date().toISOString()}] INFO: ${message}`);
  },
  error: (message: string) => {
    console.error(`[${new Date().toISOString()}] ERROR: ${message}`);
  },
  warn: (message: string) => {
    console.warn(`[${new Date().toISOString()}] WARN: ${message}`);
  },
  debug: (message: string) => {
    console.debug(`[${new Date().toISOString()}] DEBUG: ${message}`);
  },
};