import { Request, Response } from 'express';
import { scheduledPaymentController } from '../../../controllers/ScheduledPaymentController';
import { scheduledPaymentService } from '../../../services/ScheduledPaymentService';
import { mockRequest, mockResponse, createMockAuth } from '../../mocks';

// Mock external dependencies
jest.mock('../../../services/ScheduledPaymentService', () => ({
  scheduledPaymentService: {
    createScheduledPayment: jest.fn(),
    getUserScheduledPayments: jest.fn(),
    getScheduledPaymentById: jest.fn(),
    pauseScheduledPayment: jest.fn(),
    resumeScheduledPayment: jest.fn(),
    cancelScheduledPayment: jest.fn(),
    getPaymentExecutionHistory: jest.fn(),
  },
}));

jest.mock('../../../services/cache/MicroserviceCacheService', () => ({
  getMicroserviceCacheService: jest.fn(() => ({
    getScheduledPayments: jest.fn(),
    cacheScheduledPayments: jest.fn(),
    invalidateScheduledPaymentCache: jest.fn(),
  })),
}));

const mockedService = scheduledPaymentService as jest.Mocked<typeof scheduledPaymentService>;

describe('ScheduledPaymentController', () => {
  let req: Request;
  let res: Response;

  beforeEach(() => {
    jest.clearAllMocks();
    req = mockRequest();
    res = mockResponse();
  });

  // ── Create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    const validBody = {
      billId: 'bill-123',
      amount: 100,
      paymentMethod: 'CREDIT_CARD',
      frequency: 'MONTHLY',
      startDate: '2024-01-15',
      endDate: '2025-01-15',
      maxRetries: 3,
    };

    it('should create a scheduled payment successfully', async () => {
      (req as any).user = createMockAuth('user-123');
      req.body = validBody;

      const mockScheduled = { id: 'sched-1', ...validBody, status: 'ACTIVE' };
      mockedService.createScheduledPayment.mockResolvedValue(mockScheduled);

      await scheduledPaymentController.create(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        status: 201,
        message: 'Scheduled payment created successfully',
        data: mockScheduled,
      });
      expect(mockedService.createScheduledPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          billId: 'bill-123',
          amount: 100,
          paymentMethod: 'CREDIT_CARD',
          frequency: 'MONTHLY',
          startDate: expect.any(Date),
          endDate: expect.any(Date),
          maxRetries: 3,
        }),
      );
    });

    it('should return 401 when user is not authenticated', async () => {
      req.body = validBody;
      // No user set

      await scheduledPaymentController.create(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Authentication required' });
    });

    it('should return 400 for missing required fields', async () => {
      (req as any).user = createMockAuth('user-123');
      req.body = { amount: 100 }; // Missing billId, paymentMethod, frequency, startDate

      await scheduledPaymentController.create(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Missing required fields: billId, amount, paymentMethod, frequency, startDate' });
    });

    it('should return 400 for invalid frequency', async () => {
      (req as any).user = createMockAuth('user-123');
      req.body = { ...validBody, frequency: 'INVALID' };

      await scheduledPaymentController.create(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Invalid frequency value' });
    });

    it('should return 400 for zero amount', async () => {
      (req as any).user = createMockAuth('user-123');
      req.body = { ...validBody, amount: 0 };

      await scheduledPaymentController.create(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Amount must be greater than 0' });
    });

    it('should return 400 for negative amount', async () => {
      (req as any).user = createMockAuth('user-123');
      req.body = { ...validBody, amount: -50 };

      await scheduledPaymentController.create(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Amount must be greater than 0' });
    });

    it('should handle service errors with 500', async () => {
      (req as any).user = createMockAuth('user-123');
      req.body = validBody;

      mockedService.createScheduledPayment.mockRejectedValue(new Error('DB error'));

      await scheduledPaymentController.create(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Failed to create scheduled payment' });
    });

    it('should default maxRetries to 3 when not provided', async () => {
      (req as any).user = createMockAuth('user-123');
      const { maxRetries, ...bodyWithoutRetries } = validBody;
      req.body = bodyWithoutRetries;

      mockedService.createScheduledPayment.mockResolvedValue({ id: 'sched-1' });

      await scheduledPaymentController.create(req, res);

      expect(mockedService.createScheduledPayment).toHaveBeenCalledWith(
        expect.objectContaining({ maxRetries: 3 }),
      );
    });

    it('should return 201 for valid daily frequency', async () => {
      (req as any).user = createMockAuth('user-123');
      req.body = { ...validBody, frequency: 'DAILY' };
      mockedService.createScheduledPayment.mockResolvedValue({ id: 'sched-daily' });

      await scheduledPaymentController.create(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should return 201 for valid weekly frequency', async () => {
      (req as any).user = createMockAuth('user-123');
      req.body = { ...validBody, frequency: 'WEEKLY' };
      mockedService.createScheduledPayment.mockResolvedValue({ id: 'sched-weekly' });

      await scheduledPaymentController.create(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should return 201 for valid biweekly frequency', async () => {
      (req as any).user = createMockAuth('user-123');
      req.body = { ...validBody, frequency: 'BIWEEKLY' };
      mockedService.createScheduledPayment.mockResolvedValue({ id: 'sched-biweekly' });

      await scheduledPaymentController.create(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should return 201 for valid quarterly frequency', async () => {
      (req as any).user = createMockAuth('user-123');
      req.body = { ...validBody, frequency: 'QUARTERLY' };
      mockedService.createScheduledPayment.mockResolvedValue({ id: 'sched-quarterly' });

      await scheduledPaymentController.create(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should return 201 for valid annually frequency', async () => {
      (req as any).user = createMockAuth('user-123');
      req.body = { ...validBody, frequency: 'ANNUALLY' };
      mockedService.createScheduledPayment.mockResolvedValue({ id: 'sched-annually' });

      await scheduledPaymentController.create(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  // ── GetAll ──────────────────────────────────────────────────────────────────

  describe('getAll', () => {
    it('should return all scheduled payments for the user', async () => {
      (req as any).user = createMockAuth('user-123');
      const mockPayments = [
        { id: 'sched-1', userId: 'user-123', status: 'ACTIVE' },
        { id: 'sched-2', userId: 'user-123', status: 'PAUSED' },
      ];
      mockedService.getUserScheduledPayments.mockResolvedValue(mockPayments);

      await scheduledPaymentController.getAll(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 200,
        data: mockPayments,
      });
      expect(mockedService.getUserScheduledPayments).toHaveBeenCalledWith('user-123');
    });

    it('should return 401 for unauthenticated user', async () => {
      await scheduledPaymentController.getAll(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Authentication required' });
    });

    it('should handle service errors with 500', async () => {
      (req as any).user = createMockAuth('user-123');
      mockedService.getUserScheduledPayments.mockRejectedValue(new Error('DB error'));

      await scheduledPaymentController.getAll(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should return empty array when no schedules exist', async () => {
      (req as any).user = createMockAuth('user-456');
      mockedService.getUserScheduledPayments.mockResolvedValue([]);

      await scheduledPaymentController.getAll(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 200,
        data: [],
      });
    });
  });

  // ── GetById ─────────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('should return a specific scheduled payment by ID', async () => {
      (req as any).user = createMockAuth('user-123');
      req.params = { id: 'sched-1' };

      const mockPayment = { id: 'sched-1', userId: 'user-123', status: 'ACTIVE' };
      mockedService.getScheduledPaymentById.mockResolvedValue(mockPayment);

      await scheduledPaymentController.getById(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 200,
        data: mockPayment,
      });
    });

    it('should return 401 for unauthenticated user', async () => {
      req.params = { id: 'sched-1' };

      await scheduledPaymentController.getById(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 404 when payment not found', async () => {
      (req as any).user = createMockAuth('user-123');
      req.params = { id: 'nonexistent' };

      mockedService.getScheduledPaymentById.mockResolvedValue(null);

      await scheduledPaymentController.getById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Scheduled payment not found' });
    });

    it('should return 404 when payment belongs to different user', async () => {
      (req as any).user = createMockAuth('user-456');
      req.params = { id: 'sched-1' };

      mockedService.getScheduledPaymentById.mockResolvedValue(null);

      await scheduledPaymentController.getById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  // ── Pause ───────────────────────────────────────────────────────────────────

  describe('pause', () => {
    it('should pause a scheduled payment', async () => {
      (req as any).user = createMockAuth('user-123');
      req.params = { id: 'sched-1' };

      mockedService.pauseScheduledPayment.mockResolvedValue({ count: 1 });

      await scheduledPaymentController.pause(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 200,
        message: 'Scheduled payment paused successfully',
      });
    });

    it('should return 404 when payment not found or already paused', async () => {
      (req as any).user = createMockAuth('user-123');
      req.params = { id: 'sched-1' };

      mockedService.pauseScheduledPayment.mockResolvedValue({ count: 0 });

      await scheduledPaymentController.pause(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Scheduled payment not found or already paused' });
    });

    it('should return 401 for unauthenticated user', async () => {
      req.params = { id: 'sched-1' };

      await scheduledPaymentController.pause(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  // ── Resume ──────────────────────────────────────────────────────────────────

  describe('resume', () => {
    it('should resume a paused scheduled payment', async () => {
      (req as any).user = createMockAuth('user-123');
      req.params = { id: 'sched-1' };

      mockedService.resumeScheduledPayment.mockResolvedValue({ count: 1 });

      await scheduledPaymentController.resume(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 200,
        message: 'Scheduled payment resumed successfully',
      });
    });

    it('should return 404 when payment not found or not paused', async () => {
      (req as any).user = createMockAuth('user-123');
      req.params = { id: 'sched-1' };

      mockedService.resumeScheduledPayment.mockResolvedValue({ count: 0 });

      await scheduledPaymentController.resume(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Scheduled payment not found or not paused' });
    });
  });

  // ── Cancel ──────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('should cancel a scheduled payment', async () => {
      (req as any).user = createMockAuth('user-123');
      req.params = { id: 'sched-1' };

      mockedService.cancelScheduledPayment.mockResolvedValue({ count: 1 });

      await scheduledPaymentController.cancel(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 200,
        message: 'Scheduled payment cancelled successfully',
      });
    });

    it('should return 404 when payment not found or already cancelled', async () => {
      (req as any).user = createMockAuth('user-123');
      req.params = { id: 'sched-1' };

      mockedService.cancelScheduledPayment.mockResolvedValue({ count: 0 });

      await scheduledPaymentController.cancel(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Scheduled payment not found or already cancelled' });
    });
  });

  // ── GetHistory ──────────────────────────────────────────────────────────────

  describe('getHistory', () => {
    it('should return execution history for a scheduled payment', async () => {
      (req as any).user = createMockAuth('user-123');
      req.params = { id: 'sched-1' };

      const mockLogs = [
        { id: 'log-1', scheduledPaymentId: 'sched-1', status: 'SUCCESS' },
        { id: 'log-2', scheduledPaymentId: 'sched-1', status: 'FAILED' },
      ];
      mockedService.getPaymentExecutionHistory.mockResolvedValue(mockLogs);

      await scheduledPaymentController.getHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 200,
        data: mockLogs,
      });
      expect(mockedService.getPaymentExecutionHistory).toHaveBeenCalledWith('sched-1', 'user-123');
    });

    it('should return empty array when no history exists', async () => {
      (req as any).user = createMockAuth('user-123');
      req.params = { id: 'sched-1' };

      mockedService.getPaymentExecutionHistory.mockResolvedValue([]);

      await scheduledPaymentController.getHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 200,
        data: [],
      });
    });

    it('should return 401 for unauthenticated user', async () => {
      req.params = { id: 'sched-1' };

      await scheduledPaymentController.getHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should handle service errors with 500', async () => {
      (req as any).user = createMockAuth('user-123');
      req.params = { id: 'sched-1' };

      mockedService.getPaymentExecutionHistory.mockRejectedValue(new Error('DB error'));

      await scheduledPaymentController.getHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
