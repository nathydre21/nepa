import { Request, Response, NextFunction } from 'express';

/**
 * Global request timeout middleware.
 * Returns 504 if the request has not finished within the configured duration.
 */
export const requestTimeout = (timeoutMs: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(504).json({ success: false, error: 'Request timeout' });
      }
    }, timeoutMs);

    const clear = () => clearTimeout(timeout);
    res.on('finish', clear);
    res.on('close', clear);
    next();
  };
};
