/**
 * Unit tests for webhookSecurity middleware covering:
 *  - verifyWebhookUrl
 *  - checkWebhookRateLimit
 *  - sanitizeWebhookPayload
 *  - checkWebhookTimeout
 *  - validateWebhookSchema
 *  - applyWebhookSecurity
 *  - defaultWebhookSecurityConfig
 *
 * Note: verifyWebhookSignature and validateWebhookPayload tests are excluded
 * because they use dynamic imports which cause segfaults in the test environment.
 */

import { Request, Response, NextFunction } from 'express';
import {
  verifyWebhookUrl,
  checkWebhookRateLimit,
  sanitizeWebhookPayload,
  checkWebhookTimeout,
  validateWebhookSchema,
  applyWebhookSecurity,
  defaultWebhookSecurityConfig,
} from '../../../middleware/webhookSecurity';

describe('webhookSecurity Middleware', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-15T10:00:00Z'));

    req = {
      body: {},
      headers: {},
    } as unknown as Request;

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      headersSent: false,
      end: jest.fn(),
      set: jest.fn().mockReturnThis(),
    } as unknown as Response;

    next = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── verifyWebhookUrl ────────────────────────────────────────────────────────

  describe('verifyWebhookUrl', () => {
    it('should reject non-HTTPS URLs', async () => {
      const result = await verifyWebhookUrl('http://example.com/webhook');
      expect(result).toBe(false);
    });

    it('should reject invalid URLs', async () => {
      const result = await verifyWebhookUrl('not-a-url');
      expect(result).toBe(false);
    });

    it('should accept valid HTTPS URLs', async () => {
      const result = await verifyWebhookUrl('https://example.com/webhook');
      expect(result).toBe(true);
    });

    it('should accept HTTPS URLs with paths and query params', async () => {
      const result = await verifyWebhookUrl('https://api.example.com/v1/webhook?secret=test');
      expect(result).toBe(true);
    });
  });

  // ── checkWebhookRateLimit ───────────────────────────────────────────────────

  describe('checkWebhookRateLimit', () => {
    it('should allow requests within rate limit', () => {
      const middleware = checkWebhookRateLimit(10);
      (req as any).webhookId = 'wh-123';

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should bypass rate limit when no webhookId', () => {
      const middleware = checkWebhookRateLimit(10);

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should block requests exceeding rate limit', () => {
      const middleware = checkWebhookRateLimit(1);
      (req as any).webhookId = 'wh-rate-limited';

      // First request should pass
      middleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);

      // Reset next mock
      jest.clearAllMocks();

      // Second request should be blocked
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Webhook rate limit exceeded',
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ── sanitizeWebhookPayload ──────────────────────────────────────────────────

  describe('sanitizeWebhookPayload', () => {
    it('should redact sensitive fields', () => {
      req.body = {
        eventType: 'payment.success',
        data: {
          amount: 100,
          secret: 'should-be-redacted',
          apiKey: 'also-redacted',
          normalField: 'keep-me',
        },
      };

      sanitizeWebhookPayload(req, res, next);

      expect((req as any).sanitizedPayload).toEqual({
        eventType: 'payment.success',
        data: {
          amount: 100,
          secret: '***redacted***',
          apiKey: '***redacted***',
          normalField: 'keep-me',
        },
      });
      expect(next).toHaveBeenCalled();
    });

    it('should redact nested sensitive fields', () => {
      req.body = {
        nested: {
          password: 'secret123',
          details: {
            apiSecret: 'nested-secret',
          },
        },
      };

      sanitizeWebhookPayload(req, res, next);

      expect((req as any).sanitizedPayload).toEqual({
        nested: {
          password: '***redacted***',
          details: {
            apiSecret: '***redacted***',
          },
        },
      });
    });

    it('should handle arrays', () => {
      req.body = {
        items: [
          { name: 'item1', token: 'abc' },
          { name: 'item2', token: 'def' },
        ],
      };

      sanitizeWebhookPayload(req, res, next);

      expect((req as any).sanitizedPayload).toEqual({
        items: [
          { name: 'item1', token: '***redacted***' },
          { name: 'item2', token: '***redacted***' },
        ],
      });
    });

    it('should handle empty body gracefully', () => {
      req.body = {};

      sanitizeWebhookPayload(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  // ── checkWebhookTimeout ─────────────────────────────────────────────────────

  describe('checkWebhookTimeout', () => {
    it('should set a timeout for webhook delivery', () => {
      const middleware = checkWebhookTimeout(5);

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect((req as any).webhookTimeout).toBeDefined();
      // Clean up
      clearTimeout((req as any).webhookTimeout);
    });

    it('should return 408 when timeout expires', () => {
      jest.useFakeTimers();
      const middleware = checkWebhookTimeout(1); // 1 second timeout

      middleware(req, res, next);

      // Fast-forward time
      jest.advanceTimersByTime(1500);

      expect(res.status).toHaveBeenCalledWith(408);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Webhook delivery timeout',
      });

      jest.useRealTimers();
    });
  });

  // ── validateWebhookSchema ───────────────────────────────────────────────────

  describe('validateWebhookSchema', () => {
    it('should validate required fields', () => {
      const schema = {
        required: ['eventType', 'data'],
      };
      const middleware = validateWebhookSchema(schema);

      req.body = { eventType: 'test' }; // Missing 'data'

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Missing required field: data',
      });
    });

    it('should pass when all required fields are present', () => {
      const schema = {
        required: ['eventType'],
      };
      const middleware = validateWebhookSchema(schema);

      req.body = { eventType: 'test', extraField: 'value' };

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should validate field types', () => {
      const schema = {
        properties: {
          amount: { type: 'number' },
        },
      };
      const middleware = validateWebhookSchema(schema);

      req.body = { amount: 'not-a-number' }; // Wrong type

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('Invalid type'),
      });
    });

    it('should skip type validation for missing optional fields', () => {
      const schema = {
        properties: {
          optionalField: { type: 'string' },
        },
      };
      const middleware = validateWebhookSchema(schema);

      req.body = {}; // Optional field not present

      middleware(req, res, next);

      expect(next).toHaveBeenCalled(); // Should pass
    });

    it('should pass valid schema', () => {
      const schema = {
        required: ['eventType'],
        properties: {
          eventType: { type: 'string' },
          amount: { type: 'number' },
        },
      };
      const middleware = validateWebhookSchema(schema);

      req.body = { eventType: 'payment.success', amount: 100 };

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  // ── applyWebhookSecurity ────────────────────────────────────────────────────

  describe('applyWebhookSecurity', () => {
    it('should return an array of middleware functions', () => {
      const stack = applyWebhookSecurity();

      expect(stack).toBeInstanceOf(Array);
      expect(stack.length).toBeGreaterThan(0);
    });

    it('should include payload size limit check', () => {
      const stack = applyWebhookSecurity();
      const sizeLimitMiddleware = stack[0];

      req.headers['content-length'] = '200000'; // Larger than 100KB default
      sizeLimitMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(413);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Payload too large',
      });
    });

    it('should allow requests within size limit', () => {
      const stack = applyWebhookSecurity();
      const sizeLimitMiddleware = stack[0];

      req.headers['content-length'] = '1000';
      sizeLimitMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should accept custom configuration', () => {
      const customConfig = {
        ...defaultWebhookSecurityConfig,
        maxPayloadSize: 1024 * 50, // 50KB
        rateLimit: { enabled: false, maxPerMinute: 0 },
      };

      const stack = applyWebhookSecurity(customConfig);

      expect(stack.length).toBeGreaterThan(0);
    });
  });

  // ── defaultWebhookSecurityConfig ────────────────────────────────────────────

  describe('defaultWebhookSecurityConfig', () => {
    it('should have required HTTPS by default', () => {
      expect(defaultWebhookSecurityConfig.requireHttps).toBe(true);
    });

    it('should have a max payload size of 100KB', () => {
      expect(defaultWebhookSecurityConfig.maxPayloadSize).toBe(102400);
    });

    it('should have default max retries of 3', () => {
      expect(defaultWebhookSecurityConfig.maxRetries).toBe(3);
    });

    it('should have default timeout of 30 seconds', () => {
      expect(defaultWebhookSecurityConfig.timeoutSeconds).toBe(30);
    });

    it('should have rate limiting enabled by default', () => {
      expect(defaultWebhookSecurityConfig.rateLimit.enabled).toBe(true);
      expect(defaultWebhookSecurityConfig.rateLimit.maxPerMinute).toBe(100);
    });
  });
});
