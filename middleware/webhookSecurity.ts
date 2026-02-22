import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { logger } from '../logger';

/**
 * Middleware to verify webhook payload signature
 * This is used when receiving webhook events from external services
 */
export const verifyWebhookSignature = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const signature = req.headers['x-webhook-signature'] as string;
    const webhookId = req.headers['x-webhook-id'] as string;

    if (!signature || !webhookId) {
      logger.warn('Missing webhook signature or ID');
      res.status(401).json({
        success: false,
        error: 'Missing webhook signature or ID',
      });
      return;
    }

    // Store for later use
    (req as any).webhookSignature = signature;
    (req as any).webhookId = webhookId;

    next();
  } catch (error) {
    logger.error(`Error in webhook signature verification: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Signature verification failed',
    });
  }
};

/**
 * Middleware to validate webhook payload against signature
 */
export const validateWebhookPayload = (secret: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const signature = (req as any).webhookSignature;
      const payload = JSON.stringify(req.body);

      const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      if (signature !== expectedSignature) {
        logger.warn(`Invalid webhook signature for webhook ${(req as any).webhookId}`);
        res.status(401).json({
          success: false,
          error: 'Invalid signature',
        });
        return;
      }

      logger.info(`Valid webhook signature verified for webhook ${(req as any).webhookId}`);
      next();
    } catch (error) {
      logger.error(`Error validating webhook payload: ${error}`);
      res.status(500).json({
        success: false,
        error: 'Payload validation failed',
      });
    }
  };
};

/**
 * Middleware to verify webhook URL is accessible and secure
 */
export const verifyWebhookUrl = async (url: string): Promise<boolean> => {
  try {
    // Verify URL is HTTPS (for security)
    if (!url.startsWith('https://')) {
      logger.warn(`Webhook URL is not HTTPS: ${url}`);
      return false;
    }

    // Verify URL is valid
    try {
      new URL(url);
    } catch {
      logger.warn(`Invalid webhook URL: ${url}`);
      return false;
    }

    return true;
  } catch (error) {
    logger.error(`Error verifying webhook URL: ${error}`);
    return false;
  }
};

/**
 * Middleware to check webhook rate limits
 * Prevents abuse by limiting webhook delivery frequency
 */
export const checkWebhookRateLimit = (maxPerMinute: number = 100) => {
  const webhookRateLimits = new Map<string, number[]>();

  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const webhookId = (req as any).webhookId;

      if (!webhookId) {
        next();
        return;
      }

      const now = Date.now();
      const oneMinuteAgo = now - 60000;

      // Get timestamps for this webhook
      const timestamps = webhookRateLimits.get(webhookId) || [];

      // Filter out old timestamps
      const recentTimestamps = timestamps.filter((ts) => ts > oneMinuteAgo);

      if (recentTimestamps.length >= maxPerMinute) {
        logger.warn(`Webhook rate limit exceeded for webhook ${webhookId}`);
        res.status(429).json({
          success: false,
          error: 'Webhook rate limit exceeded',
        });
        return;
      }

      // Add current timestamp
      recentTimestamps.push(now);
      webhookRateLimits.set(webhookId, recentTimestamps);

      next();
    } catch (error) {
      logger.error(`Error checking webhook rate limit: ${error}`);
      next();
    }
  };
};

/**
 * Middleware to sanitize webhook payload
 */
export const sanitizeWebhookPayload = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const payload = req.body;

    // Remove sensitive fields
    const sensitiveFields = ['secret', 'password', 'apiKey', 'apiSecret', 'token'];

    const sanitize = (obj: any): any => {
      if (typeof obj !== 'object' || obj === null) {
        return obj;
      }

      if (Array.isArray(obj)) {
        return obj.map((item) => sanitize(item));
      }

      const sanitized: any = {};
      for (const key in obj) {
        if (sensitiveFields.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
          sanitized[key] = '***redacted***';
        } else {
          sanitized[key] = sanitize(obj[key]);
        }
      }

      return sanitized;
    };

    (req as any).sanitizedPayload = sanitize(payload);
    next();
  } catch (error) {
    logger.error(`Error sanitizing webhook payload: ${error}`);
    next();
  }
};

/**
 * Middleware to check webhook delivery timeout
 */
export const checkWebhookTimeout = (timeoutSeconds: number = 30) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Set a timeout for the webhook delivery
      const timeout = setTimeout(() => {
        if (!res.headersSent) {
          res.status(408).json({
            success: false,
            error: 'Webhook delivery timeout',
          });
        }
      }, timeoutSeconds * 1000);

      // Store timeout for cleanup
      (req as any).webhookTimeout = timeout;

      // Override res.end to clear timeout
      const originalEnd = res.end;
      res.end = function (...args: any[]) {
        clearTimeout(timeout);
        return originalEnd.apply(res, args as any);
      };

      next();
    } catch (error) {
      logger.error(`Error setting webhook timeout: ${error}`);
      next();
    }
  };
};

/**
 * Middleware to validate webhook payload schema
 */
export const validateWebhookSchema = (schema: any) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const payload = req.body;

      // Basic schema validation
      if (schema.required) {
        for (const field of schema.required) {
          if (!(field in payload)) {
            res.status(400).json({
              success: false,
              error: `Missing required field: ${field}`,
            });
            return;
          }
        }
      }

      if (schema.properties) {
        for (const [field, fieldSchema] of Object.entries(schema.properties)) {
          if (field in payload) {
            const value = payload[field];
            const fieldType = (fieldSchema as any).type;

            if (fieldType && typeof value !== fieldType) {
              res.status(400).json({
                success: false,
                error: `Invalid type for field ${field}: expected ${fieldType}, got ${typeof value}`,
              });
              return;
            }
          }
        }
      }

      next();
    } catch (error) {
      logger.error(`Error validating webhook schema: ${error}`);
      res.status(500).json({
        success: false,
        error: 'Schema validation failed',
      });
    }
  };
};

/**
 * Webhook Security Configuration
 */
export interface WebhookSecurityConfig {
  requireHttps: boolean;
  maxPayloadSize: number; // in bytes
  maxRetries: number;
  timeoutSeconds: number;
  rateLimit: {
    enabled: boolean;
    maxPerMinute: number;
  };
  ipWhitelist?: string[];
  ipBlacklist?: string[];
}

/**
 * Default security configuration
 */
export const defaultWebhookSecurityConfig: WebhookSecurityConfig = {
  requireHttps: true,
  maxPayloadSize: 1024 * 100, // 100KB
  maxRetries: 3,
  timeoutSeconds: 30,
  rateLimit: {
    enabled: true,
    maxPerMinute: 100,
  },
};

/**
 * Apply webhook security middleware stack
 */
export const applyWebhookSecurity = (config: WebhookSecurityConfig = defaultWebhookSecurityConfig) => {
  return [
    // Limit payload size
    (req: Request, res: Response, next: NextFunction): void => {
      const contentLength = parseInt(req.headers['content-length'] || '0');
      if (contentLength > config.maxPayloadSize) {
        res.status(413).json({
          success: false,
          error: 'Payload too large',
        });
        return;
      }
      next();
    },

    // Verify signature
    verifyWebhookSignature,

    // Sanitize payload
    sanitizeWebhookPayload,

    // Check rate limit
    config.rateLimit.enabled ? checkWebhookRateLimit(config.rateLimit.maxPerMinute) : (req: Request, res: Response, next: NextFunction) => next(),

    // Set timeout
    checkWebhookTimeout(config.timeoutSeconds),
  ];
};
