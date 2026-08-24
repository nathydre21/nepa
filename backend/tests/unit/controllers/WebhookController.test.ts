import { Request, Response } from 'express';
import { mockRequest, mockResponse, createMockAuth } from '../../mocks';

// Mock prisma — defined inside factory to avoid TDZ issue
jest.mock('../../../prismaClient', () => {
  const mockPrisma = {
    webhook: {
      findUnique: jest.fn(),
    },
    webhookEvent: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
  };
  return { __esModule: true, default: mockPrisma, mockPrisma };
});

jest.mock('../../../WebhookService', () => ({
  webhookService: {
    processWebhookEvent: jest.fn(),
    registerWebhook: jest.fn(),
    getUserWebhooks: jest.fn(),
    updateWebhook: jest.fn(),
    deleteWebhook: jest.fn(),
    getWebhookEvents: jest.fn(),
    getWebhookStats: jest.fn(),
    testWebhook: jest.fn(),
    retryWebhookEvent: jest.fn(),
    getWebhookLogs: jest.fn(),
  },
}));

jest.mock('../../../logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Helper to get the mocked prisma
function getMockPrisma() {
  const m = require('../../../prismaClient');
  return (m as any).mockPrisma;
}

const mockWebhookService = require('../../../WebhookService').webhookService;

// Import the controller AFTER mocks
import { WebhookController } from '../../../controllers/WebhookController';

describe('WebhookController', () => {
  let req: Request;
  let res: Response;

  beforeEach(() => {
    jest.clearAllMocks();
    req = mockRequest();
    res = mockResponse();
  });

  // ── receiveWebhook ──────────────────────────────────────────────────────────

  describe('receiveWebhook', () => {
    it('should reject request without signature verification', async () => {
      req.body = { eventType: 'payment.success', data: {} };

      await WebhookController.receiveWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Webhook signature verification is required',
      });
    });

    it('should reject request with only webhookId but no verification flag', async () => {
      req.body = { eventType: 'payment.success', data: {} };
      (req as any).webhookId = 'wh-123';

      await WebhookController.receiveWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 400 when eventType is missing', async () => {
      const mockPrisma = getMockPrisma();
      (req as any).webhookId = 'wh-123';
      (req as any).webhookVerified = true;
      req.body = { data: {} };

      mockPrisma.webhook.findUnique.mockResolvedValue({
        id: 'wh-123',
        events: ['payment.success'],
        userId: 'user-1',
      });

      await WebhookController.receiveWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'eventType is required in webhook payload',
      });
    });

    it('should return 404 when webhook not found', async () => {
      const mockPrisma = getMockPrisma();
      (req as any).webhookId = 'wh-nonexistent';
      (req as any).webhookVerified = true;
      req.body = { eventType: 'payment.success', data: {} };

      mockPrisma.webhook.findUnique.mockResolvedValue(null);

      await WebhookController.receiveWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Webhook not found',
      });
    });

    it('should return 400 when webhook is not subscribed to event type', async () => {
      const mockPrisma = getMockPrisma();
      (req as any).webhookId = 'wh-123';
      (req as any).webhookVerified = true;
      req.body = { eventType: 'unauthorized.event', data: {} };

      mockPrisma.webhook.findUnique.mockResolvedValue({
        id: 'wh-123',
        events: ['payment.success', 'bill.created'],
        userId: 'user-1',
      });

      await WebhookController.receiveWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Webhook is not subscribed to event type: unauthorized.event',
      });
    });

    it('should process verified webhook event successfully', async () => {
      const mockPrisma = getMockPrisma();
      (req as any).webhookId = 'wh-123';
      (req as any).webhookVerified = true;
      req.body = { eventType: 'payment.success', data: { amount: 100 } };

      mockPrisma.webhook.findUnique.mockResolvedValue({
        id: 'wh-123',
        events: ['payment.success', 'bill.created'],
        userId: 'user-1',
      });

      const mockEvent = {
        id: 'evt-456',
        webhookId: 'wh-123',
        eventType: 'payment.success',
        status: 'PENDING',
      };
      mockPrisma.webhookEvent.create.mockResolvedValue(mockEvent);
      mockWebhookService.processWebhookEvent.mockResolvedValue(undefined);

      await WebhookController.receiveWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Webhook received and verified successfully',
        eventId: 'evt-456',
        eventType: 'payment.success',
      });
    });

    it('should still return 200 even if async processing fails', async () => {
      const mockPrisma = getMockPrisma();
      (req as any).webhookId = 'wh-123';
      (req as any).webhookVerified = true;
      req.body = { eventType: 'payment.success', data: { amount: 100 } };

      mockPrisma.webhook.findUnique.mockResolvedValue({
        id: 'wh-123',
        events: ['payment.success'],
        userId: 'user-1',
      });

      mockPrisma.webhookEvent.create.mockResolvedValue({
        id: 'evt-789',
        webhookId: 'wh-123',
        eventType: 'payment.success',
      });

      mockWebhookService.processWebhookEvent.mockRejectedValue(new Error('Processing failed'));

      await WebhookController.receiveWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Webhook received and verified successfully',
        eventId: 'evt-789',
        eventType: 'payment.success',
      });
    });

    it('should handle unexpected errors with 500', async () => {
      const mockPrisma = getMockPrisma();
      (req as any).webhookId = 'wh-123';
      (req as any).webhookVerified = true;
      req.body = { eventType: 'payment.success', data: {} };

      mockPrisma.webhook.findUnique.mockRejectedValue(new Error('Database error'));

      await WebhookController.receiveWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Database error',
      });
    });
  });

  // ── registerWebhook ─────────────────────────────────────────────────────────

  describe('registerWebhook', () => {
    const validBody = {
      url: 'https://example.com/webhook',
      events: ['payment.success', 'bill.created'],
    };

    it('should register a webhook successfully', async () => {
      (req as any).user = { id: 'user-123' };
      req.body = validBody;

      const mockWebhook = {
        id: 'wh-new',
        url: validBody.url,
        events: validBody.events,
        secret: 'secret-abc123',
        createdAt: new Date(),
      };

      mockWebhookService.registerWebhook.mockResolvedValue(mockWebhook);

      await WebhookController.registerWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          webhook: expect.objectContaining({
            id: 'wh-new',
            secret: 'secret-abc123',
          }),
        }),
      );
    });

    it('should return 400 when URL is missing', async () => {
      (req as any).user = { id: 'user-123' };
      req.body = { events: ['payment.success'] };

      await WebhookController.registerWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'URL and events array are required',
      });
    });

    it('should return 400 when events is not an array', async () => {
      (req as any).user = { id: 'user-123' };
      req.body = { url: 'https://example.com/webhook', events: 'payment.success' };

      await WebhookController.registerWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Events must be an array',
      });
    });

    it('should handle registration errors with 500', async () => {
      (req as any).user = { id: 'user-123' };
      req.body = validBody;

      mockWebhookService.registerWebhook.mockRejectedValue(new Error('Registration failed'));

      await WebhookController.registerWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ── getUserWebhooks ─────────────────────────────────────────────────────────

  describe('getUserWebhooks', () => {
    it('should return all webhooks for the user', async () => {
      (req as any).user = { id: 'user-123' };

      const mockWebhooks = [
        { id: 'wh-1', url: 'https://example.com/hook1', events: ['payment.success'], description: 'Hook 1', isActive: true, retryPolicy: 'EXPONENTIAL', maxRetries: 3, createdAt: new Date(), updatedAt: new Date() },
        { id: 'wh-2', url: 'https://example.com/hook2', events: ['bill.created'], description: 'Hook 2', isActive: false, retryPolicy: 'FIXED', maxRetries: 5, createdAt: new Date(), updatedAt: new Date() },
      ];

      mockWebhookService.getUserWebhooks.mockResolvedValue(mockWebhooks);

      await WebhookController.getUserWebhooks(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        webhooks: expect.arrayContaining([
          expect.objectContaining({ id: 'wh-1' }),
          expect.objectContaining({ id: 'wh-2' }),
        ]),
      });
    });

    it('should return empty array when user has no webhooks', async () => {
      (req as any).user = { id: 'user-456' };
      mockWebhookService.getUserWebhooks.mockResolvedValue([]);

      await WebhookController.getUserWebhooks(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        webhooks: [],
      });
    });

    it('should handle service errors with 500', async () => {
      (req as any).user = { id: 'user-123' };
      mockWebhookService.getUserWebhooks.mockRejectedValue(new Error('DB error'));

      await WebhookController.getUserWebhooks(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ── updateWebhook ───────────────────────────────────────────────────────────

  describe('updateWebhook', () => {
    it('should update a webhook successfully', async () => {
      const mockPrisma = getMockPrisma();
      (req as any).user = { id: 'user-123' };
      req.params = { webhookId: 'wh-1' };
      req.body = { url: 'https://example.com/new-hook' };

      mockPrisma.webhook.findUnique.mockResolvedValue({
        id: 'wh-1',
        userId: 'user-123',
        url: 'https://example.com/old-hook',
      });

      mockWebhookService.updateWebhook.mockResolvedValue({
        id: 'wh-1',
        url: 'https://example.com/new-hook',
        events: ['payment.success'],
        isActive: true,
        updatedAt: new Date(),
      });

      await WebhookController.updateWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Webhook updated successfully',
        webhook: expect.objectContaining({
          id: 'wh-1',
          url: 'https://example.com/new-hook',
        }),
      });
    });

    it('should return 403 when user does not own the webhook', async () => {
      const mockPrisma = getMockPrisma();
      (req as any).user = { id: 'user-456' };
      req.params = { webhookId: 'wh-1' };
      req.body = { url: 'https://example.com/new-hook' };

      mockPrisma.webhook.findUnique.mockResolvedValue({
        id: 'wh-1',
        userId: 'user-123',
      });

      await WebhookController.updateWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  // ── deleteWebhook ───────────────────────────────────────────────────────────

  describe('deleteWebhook', () => {
    it('should delete a webhook successfully', async () => {
      const mockPrisma = getMockPrisma();
      (req as any).user = { id: 'user-123' };
      req.params = { webhookId: 'wh-1' };

      mockPrisma.webhook.findUnique.mockResolvedValue({
        id: 'wh-1',
        userId: 'user-123',
      });

      mockWebhookService.deleteWebhook.mockResolvedValue(undefined);

      await WebhookController.deleteWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Webhook deleted successfully',
      });
    });

    it('should return 403 when user does not own the webhook', async () => {
      const mockPrisma = getMockPrisma();
      (req as any).user = { id: 'user-456' };
      req.params = { webhookId: 'wh-1' };

      mockPrisma.webhook.findUnique.mockResolvedValue({
        id: 'wh-1',
        userId: 'user-123',
      });

      await WebhookController.deleteWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  // ── getWebhookEvents ────────────────────────────────────────────────────────

  describe('getWebhookEvents', () => {
    it('should return webhook events with default limit', async () => {
      const mockPrisma = getMockPrisma();
      (req as any).user = { id: 'user-123' };
      req.params = { webhookId: 'wh-1' };
      req.query = {};

      mockPrisma.webhook.findUnique.mockResolvedValue({
        id: 'wh-1',
        userId: 'user-123',
      });

      const mockEvents = [
        { id: 'evt-1', eventType: 'payment.success', status: 'DELIVERED', attempts: 1, lastAttempt: new Date(), nextRetry: null, createdAt: new Date(), deliveryAttempts: [] },
      ];
      mockWebhookService.getWebhookEvents.mockResolvedValue(mockEvents);

      await WebhookController.getWebhookEvents(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockWebhookService.getWebhookEvents).toHaveBeenCalledWith('wh-1', 50);
    });

    it('should use custom limit from query', async () => {
      const mockPrisma = getMockPrisma();
      (req as any).user = { id: 'user-123' };
      req.params = { webhookId: 'wh-1' };
      req.query = { limit: '10' };

      mockPrisma.webhook.findUnique.mockResolvedValue({
        id: 'wh-1',
        userId: 'user-123',
      });

      mockWebhookService.getWebhookEvents.mockResolvedValue([]);

      await WebhookController.getWebhookEvents(req, res);

      expect(mockWebhookService.getWebhookEvents).toHaveBeenCalledWith('wh-1', 10);
    });
  });

  // ── getWebhookStats ─────────────────────────────────────────────────────────

  describe('getWebhookStats', () => {
    it('should return webhook statistics', async () => {
      const mockPrisma = getMockPrisma();
      (req as any).user = { id: 'user-123' };
      req.params = { webhookId: 'wh-1' };

      mockPrisma.webhook.findUnique.mockResolvedValue({
        id: 'wh-1',
        userId: 'user-123',
      });

      const mockStats = {
        totalEvents: 100,
        successfulDeliveries: 95,
        failedDeliveries: 3,
        pendingDeliveries: 2,
        successRate: 95,
        averageResponseTime: 250,
      };
      mockWebhookService.getWebhookStats.mockResolvedValue(mockStats);

      await WebhookController.getWebhookStats(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        stats: mockStats,
      });
    });
  });

  // ── testWebhook ─────────────────────────────────────────────────────────────

  describe('testWebhook', () => {
    it('should test webhook delivery successfully', async () => {
      const mockPrisma = getMockPrisma();
      (req as any).user = { id: 'user-123' };
      req.params = { webhookId: 'wh-1' };

      mockPrisma.webhook.findUnique.mockResolvedValue({
        id: 'wh-1',
        userId: 'user-123',
      });

      mockWebhookService.testWebhook.mockResolvedValue({
        success: true,
        responseTime: 200,
      });

      await WebhookController.testWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        result: expect.objectContaining({ success: true }),
      });
    });
  });

  // ── retryWebhookEvent ───────────────────────────────────────────────────────

  describe('retryWebhookEvent', () => {
    it('should retry a failed webhook event', async () => {
      const mockPrisma = getMockPrisma();
      (req as any).user = { id: 'user-123' };
      req.params = { webhookId: 'wh-1', eventId: 'evt-failed' };

      mockPrisma.webhook.findUnique.mockResolvedValue({
        id: 'wh-1',
        userId: 'user-123',
      });

      mockPrisma.webhookEvent.findUnique.mockResolvedValue({
        id: 'evt-failed',
        webhookId: 'wh-1',
      });

      mockWebhookService.retryWebhookEvent.mockResolvedValue(undefined);

      await WebhookController.retryWebhookEvent(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Webhook event retry initiated',
      });
    });

    it('should return 404 when event belongs to different webhook', async () => {
      const mockPrisma = getMockPrisma();
      (req as any).user = { id: 'user-123' };
      req.params = { webhookId: 'wh-1', eventId: 'evt-other' };

      mockPrisma.webhook.findUnique.mockResolvedValue({
        id: 'wh-1',
        userId: 'user-123',
      });

      mockPrisma.webhookEvent.findUnique.mockResolvedValue({
        id: 'evt-other',
        webhookId: 'wh-different',
      });

      await WebhookController.retryWebhookEvent(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  // ── getWebhookLogs ──────────────────────────────────────────────────────────

  describe('getWebhookLogs', () => {
    it('should return webhook logs with default limit', async () => {
      const mockPrisma = getMockPrisma();
      (req as any).user = { id: 'user-123' };
      req.params = { webhookId: 'wh-1' };
      req.query = {};

      mockPrisma.webhook.findUnique.mockResolvedValue({
        id: 'wh-1',
        userId: 'user-123',
      });

      const mockLogs = [
        { id: 'log-1', action: 'TRIGGERED', details: 'Event delivered', status: 'SUCCESS' },
      ];
      mockWebhookService.getWebhookLogs.mockResolvedValue(mockLogs);

      await WebhookController.getWebhookLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        logs: mockLogs,
      });
      expect(mockWebhookService.getWebhookLogs).toHaveBeenCalledWith('wh-1', 100);
    });
  });
});
