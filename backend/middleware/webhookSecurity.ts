import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { logger } from '../logger';

/**
 * SECURITY (Issue #415): Maximum allowed age of a webhook request in seconds.
 * Requests with timestamps older than this are rejected to prevent replay attacks.
 */
const MAX_WEBHOOK_AGE_SECONDS = 300; // 5 minutes

/**
 * SECURITY (Issue #415): Middleware to verify webhook payload signature.
 *
 * This middleware performs full signature verification on incoming webhook requests:
 *   1. Extracts the signature and webhook ID from request headers
 *   2. Loads the webhook's stored signing secret from the database
 *   3. Recomputes the HMAC-SHA256 of the raw request body
 *   4. Compares the computed signature with the provided one using a
 *      constant-time comparison (crypto.timingSafeEqual) to prevent timing attacks
 *   5. Validates the request timestamp to prevent replay attacks
 *   6. Logs all verification failures for security monitoring
 *
 * Required headers:
 *   - x-webhook-signature: HMAC-SHA256 signature of the raw request body
 *   - x-webhook-id: The webhook's unique identifier
 *   - x-webhook-timestamp: Unix timestamp (seconds) of when the request was sent
 *
 * @param req Express request object
 * @param res Express response object
 * @param next Express next function
 */
export const verifyWebhookSignature = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const signature = req.headers['x-webhook-signature'] as string;
    const webhookId = req.headers['x-webhook-id'] as string;
    const timestamp = req.headers['x-webhook-timestamp'] as string;

    // --- Step 1: Validate required headers are present ---
    if (!signature || !webhookId) {
      logger.warn(`[SECURITY] Webhook request missing signature or webhook ID header. IP: ${req.ip}`);
      res.status(401).json({
        success: false,
        error: 'Missing webhook signature or ID',
      });
      return;
    }

    // --- Step 2: Validate timestamp to prevent replay attacks ---
    // The timestamp header must be present and within the allowed time window.
    // Without this, an attacker who captures a legitimate webhook request
    // could replay it indefinitely.
    if (!timestamp) {
      logger.warn(`[SECURITY] Webhook ${webhookId} missing timestamp header. IP: ${req.ip}`);
      res.status(401).json({
        success: false,
        error: 'Missing webhook timestamp. Include x-webhook-timestamp header to prevent replay attacks.',
      });
      return;
    }

    const requestTime = parseInt(timestamp, 10);
    if (isNaN(requestTime)) {
      logger.warn(`[SECURITY] Webhook ${webhookId} has invalid timestamp: ${timestamp}. IP: ${req.ip}`);
      res.status(400).json({
        success: false,
        error: 'Invalid timestamp format',
      });
      return;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const ageInSeconds = Math.abs(currentTime - requestTime);

    if (ageInSeconds > MAX_WEBHOOK_AGE_SECONDS) {
      logger.warn(`[SECURITY] Webhook ${webhookId} rejected — timestamp too old (${ageInSeconds}s). IP: ${req.ip}`);
      res.status(401).json({
        success: false,
        error: `Webhook timestamp is too old. Maximum allowed age is ${MAX_WEBHOOK_AGE_SECONDS} seconds.`,
      });
      return;
    }

    // --- Step 3: Load the webhook's signing secret from the database ---
    // We need the raw body for signature verification, not the parsed JSON.
    // Express may have already parsed req.body as JSON, so we reconstruct
    // the raw body string for HMAC computation.
    const rawBody = JSON.stringify(req.body);

    // Import prisma lazily to avoid circular dependencies at module load time
    const prisma = (await import('../prismaClient')).default;

    const webhook = await prisma.webhook.findUnique({
      where: { id: webhookId },
      select: { id: true, secret: true, isActive: true, userId: true },
    });

    if (!webhook) {
      logger.warn(`[SECURITY] Webhook ${webhookId} not found. IP: ${req.ip}`);
      res.status(404).json({
        success: false,
        error: 'Webhook not found',
      });
      return;
    }

    if (!webhook.isActive) {
      logger.warn(`[SECURITY] Webhook ${webhookId} is inactive. IP: ${req.ip}`);
      res.status(403).json({
        success: false,
        error: 'Webhook is inactive',
      });
      return;
    }

    if (!webhook.secret) {
      logger.error(`[SECURITY] Webhook ${webhookId} has no signing secret configured. This is a configuration error.`);
      res.status(500).json({
        success: false,
        error: 'Webhook signing secret is not configured',
      });
      return;
    }

    // --- Step 4: Compute the expected HMAC-SHA256 signature ---
    // The signature is computed over the timestamp + raw body to bind the
    // timestamp to the payload (preventing an attacker from swapping timestamps).
    const signedPayload = `${timestamp}.${rawBody}`;
    const expectedSignature = crypto
      .createHmac('sha256', webhook.secret)
      .update(signedPayload)
      .digest('hex');

    // --- Step 5: Compare signatures using constant-time comparison ---
    // Using crypto.timingSafeEqual prevents timing attacks where an attacker
    // could determine the correct signature byte-by-byte by measuring
    // response times. We must ensure both buffers are the same length
    // before calling timingSafeEqual, otherwise it throws an error.
    const providedSignatureBuffer = Buffer.from(signature, 'hex');
    const expectedSignatureBuffer = Buffer.from(expectedSignature, 'hex');

    let signaturesMatch: boolean;
    if (providedSignatureBuffer.length !== expectedSignatureBuffer.length) {
      // Length mismatch — signatures definitely don't match
      signaturesMatch = false;
    } else {
      // Lengths match — use constant-time comparison
      signaturesMatch = crypto.timingSafeEqual(providedSignatureBuffer, expectedSignatureBuffer);
    }

    if (!signaturesMatch) {
      // SECURITY: Log the failure with details for security monitoring.
      // Do NOT include the expected signature in logs — only the fact that it failed.
      logger.warn(`[SECURITY] Invalid webhook signature for webhook ${webhookId}. IP: ${req.ip}`);
      res.status(401).json({
        success: false,
        error: 'Invalid webhook signature',
      });
      return;
    }

    // --- Step 6: Signature verified — attach webhook context and proceed ---
    logger.info(`Webhook signature verified for webhook ${webhookId}. IP: ${req.ip}`);

    // Attach verified webhook context for downstream handlers
    (req as any).webhookId = webhookId;
    (req as any).webhookUserId = webhook.userId;
    (req as any).webhookVerified = true;

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
 * SECURITY (Issue #415): Middleware to validate webhook payload against signature.
 *
 * This is a secondary validation step that can be used with a pre-shared secret
 * for scenarios where the webhook ID lookup has already been performed.
 * It uses crypto.timingSafeEqual for constant-time comparison to prevent
 * timing attacks.
 *
 * @param secret The webhook's signing secret
 */
export const validateWebhookPayload = (secret: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const signature = (req as any).webhookSignature;
      const timestamp = req.headers['x-webhook-timestamp'] as string;
      const rawBody = JSON.stringify(req.body);

      // Compute signature over timestamp + body (same format as verifyWebhookSignature)
      const signedPayload = `${timestamp}.${rawBody}`;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(signedPayload)
        .digest('hex');

      // Use constant-time comparison to prevent timing attacks
      const providedBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');

      let isValid: boolean;
      if (providedBuffer.length !== expectedBuffer.length) {
        isValid = false;
      } else {
        isValid = crypto.timingSafeEqual(providedBuffer, expectedBuffer);
      }

      if (!isValid) {
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
