// ── Mock instances (defined before imports so they're available in mock factories) ──
const mockBillingServiceInstance = {
  processPayment: jest.fn(),
  getBill: jest.fn(),
  getPaymentHistory: jest.fn(),
};

const mockNotificationServiceInstance = {
  sendSystemAlert: jest.fn(),
  sendPaymentConfirmed: jest.fn(),
  sendBillCreated: jest.fn(),
  sendBillOverdue: jest.fn(),
};

const mockPrismaInstance = {
  scheduledPayment: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  paymentExecutionLog: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  wallet: {
    findUnique: jest.fn(),
  },
  $disconnect: jest.fn(),
};

// Mock NotificationService with a proper constructor
jest.mock('../../../services/NotificationService', () => ({
  NotificationService: jest.fn().mockImplementation(() => mockNotificationServiceInstance),
}));

// Mock BillingService with a proper constructor using shared instance
jest.mock('../../../BillingService', () => ({
  BillingService: jest.fn().mockImplementation(() => mockBillingServiceInstance),
}));

jest.mock('node-cron', () => ({
  schedule: jest.fn().mockReturnValue({ start: jest.fn(), stop: jest.fn(), destroy: jest.fn() }),
}));

// Mock PrismaClient
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrismaInstance),
}));

// Now import the service under test
import { ScheduledPaymentService } from '../../../services/ScheduledPaymentService';

describe('ScheduledPaymentService', () => {
  let service: ScheduledPaymentService;

  const validCreateDTO = {
    userId: 'user-123',
    billId: 'bill-123',
    amount: 100,
    paymentMethod: 'CREDIT_CARD',
    frequency: 'MONTHLY' as const,
    startDate: new Date('2024-01-15'),
    endDate: new Date('2025-01-15'),
    maxRetries: 3,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = ScheduledPaymentService.getInstance();
  });

  afterEach(() => {
    service.stopScheduler();
  });

  // ── CRUD Operations ─────────────────────────────────────────────────────────

  describe('createScheduledPayment', () => {
    it('should create a scheduled payment with valid data', async () => {
      const expected = { id: 'sched-1', ...validCreateDTO, status: 'ACTIVE' };
      mockPrismaInstance.scheduledPayment.create.mockResolvedValue(expected);

      const result = await service.createScheduledPayment(validCreateDTO);

      expect(result).toEqual(expected);
      expect(mockPrismaInstance.scheduledPayment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: validCreateDTO.userId,
          billId: validCreateDTO.billId,
          amount: validCreateDTO.amount,
          paymentMethod: validCreateDTO.paymentMethod,
          frequency: validCreateDTO.frequency,
          nextRunAt: validCreateDTO.startDate,
          endDate: validCreateDTO.endDate,
          maxRetries: validCreateDTO.maxRetries,
        }),
      });
    });

    it('should default maxRetries to 3 when not specified', async () => {
      const dto = { ...validCreateDTO };
      delete (dto as any).maxRetries;

      mockPrismaInstance.scheduledPayment.create.mockResolvedValue({ id: 'sched-2', ...dto });

      await service.createScheduledPayment(dto);

      expect(mockPrismaInstance.scheduledPayment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ maxRetries: 3 }),
      });
    });

    it('should handle null endDate', async () => {
      const dto = { ...validCreateDTO, endDate: undefined };
      mockPrismaInstance.scheduledPayment.create.mockResolvedValue({ id: 'sched-3', ...dto });

      await service.createScheduledPayment(dto);

      expect(mockPrismaInstance.scheduledPayment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ endDate: null }),
      });
    });
  });

  describe('getUserScheduledPayments', () => {
    it('should return all scheduled payments for a user', async () => {
      const mockPayments = [
        { id: 'sched-1', userId: 'user-123', status: 'ACTIVE' },
        { id: 'sched-2', userId: 'user-123', status: 'PAUSED' },
      ];
      mockPrismaInstance.scheduledPayment.findMany.mockResolvedValue(mockPayments);

      const result = await service.getUserScheduledPayments('user-123');

      expect(result).toEqual(mockPayments);
    });

    it('should return empty array when user has no scheduled payments', async () => {
      mockPrismaInstance.scheduledPayment.findMany.mockResolvedValue([]);

      const result = await service.getUserScheduledPayments('user-unknown');

      expect(result).toEqual([]);
    });
  });

  describe('getScheduledPaymentById', () => {
    it('should return null for non-existent payment', async () => {
      mockPrismaInstance.scheduledPayment.findFirst.mockResolvedValue(null);

      const result = await service.getScheduledPaymentById('nonexistent', 'user-123');

      expect(result).toBeNull();
    });
  });

  describe('pauseScheduledPayment', () => {
    it('should pause an active scheduled payment', async () => {
      mockPrismaInstance.scheduledPayment.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.pauseScheduledPayment('sched-1', 'user-123');

      expect(result.count).toBe(1);
    });
  });

  describe('resumeScheduledPayment', () => {
    it('should resume a paused scheduled payment', async () => {
      mockPrismaInstance.scheduledPayment.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.resumeScheduledPayment('sched-1', 'user-123');

      expect(result.count).toBe(1);
    });
  });

  describe('cancelScheduledPayment', () => {
    it('should cancel an active or paused scheduled payment', async () => {
      mockPrismaInstance.scheduledPayment.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.cancelScheduledPayment('sched-1', 'user-123');

      expect(result.count).toBe(1);
    });
  });

  describe('getPaymentExecutionHistory', () => {
    it('should return execution logs for a scheduled payment', async () => {
      const mockLogs = [
        { id: 'log-1', scheduledPaymentId: 'sched-1', status: 'SUCCESS' },
        { id: 'log-2', scheduledPaymentId: 'sched-1', status: 'FAILED' },
      ];
      mockPrismaInstance.paymentExecutionLog.findMany.mockResolvedValue(mockLogs);

      const result = await service.getPaymentExecutionHistory('sched-1', 'user-123');

      expect(result).toEqual(mockLogs);
    });
  });

  // ── Process Due Payments ────────────────────────────────────────────────────

  describe('processDuePayments', () => {
    it('should find and process due active scheduled payments successfully', async () => {
      const mockDuePayments = [
        {
          id: 'sched-1',
          userId: 'user-123',
          billId: 'bill-123',
          amount: 100,
          paymentMethod: 'CREDIT_CARD',
          frequency: 'MONTHLY',
          retryCount: 0,
          maxRetries: 3,
          status: 'ACTIVE',
          endDate: null,
          retryAfter: null,
          nextRunAt: new Date(Date.now() - 60000),
          lastRunAt: null,
        },
      ];

      mockPrismaInstance.scheduledPayment.findMany.mockResolvedValue(mockDuePayments);
      mockPrismaInstance.wallet.findUnique.mockResolvedValue({ balance: '500' });
      mockBillingServiceInstance.processPayment.mockResolvedValue({ transactionId: 'txn-123' });
      mockPrismaInstance.paymentExecutionLog.create.mockResolvedValue({ id: 'log-1' });
      mockPrismaInstance.scheduledPayment.update.mockResolvedValue({ id: 'sched-1', status: 'ACTIVE' });

      await service.processDuePayments();

      expect(mockBillingServiceInstance.processPayment).toHaveBeenCalled();
      expect(mockPrismaInstance.paymentExecutionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SUCCESS' }),
        }),
      );
    });

    it('should skip payment when wallet balance is insufficient', async () => {
      const mockDuePayment = {
        id: 'sched-1',
        userId: 'user-123',
        billId: 'bill-123',
        amount: 1000,
        paymentMethod: 'CREDIT_CARD',
        frequency: 'MONTHLY',
        retryCount: 0,
        maxRetries: 3,
        status: 'ACTIVE',
        endDate: null,
        retryAfter: null,
        nextRunAt: new Date(Date.now() - 60000),
        lastRunAt: null,
      };

      mockPrismaInstance.scheduledPayment.findMany.mockResolvedValue([mockDuePayment]);
      mockPrismaInstance.wallet.findUnique.mockResolvedValue({ balance: '50' });
      mockPrismaInstance.paymentExecutionLog.create.mockResolvedValue({ id: 'log-1' });
      mockPrismaInstance.scheduledPayment.update.mockResolvedValue({ id: 'sched-1' });

      await service.processDuePayments();

      expect(mockPrismaInstance.paymentExecutionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'SKIPPED',
            errorMessage: 'Insufficient wallet balance',
          }),
        }),
      );
      expect(mockNotificationServiceInstance.sendSystemAlert).toHaveBeenCalledWith(
        'user-123',
        expect.stringContaining('insufficient wallet balance'),
        'HIGH',
      );
    });

    it('should handle payment failure with retry logic', async () => {
      const mockDuePayment = {
        id: 'sched-3',
        userId: 'user-789',
        billId: 'bill-789',
        amount: 200,
        paymentMethod: 'CREDIT_CARD',
        frequency: 'MONTHLY',
        retryCount: 0,
        maxRetries: 3,
        status: 'ACTIVE',
        endDate: null,
        retryAfter: null,
        nextRunAt: new Date(Date.now() - 60000),
        lastRunAt: null,
      };

      mockPrismaInstance.scheduledPayment.findMany.mockResolvedValue([mockDuePayment]);
      mockPrismaInstance.wallet.findUnique.mockResolvedValue({ balance: '500' });
      mockBillingServiceInstance.processPayment.mockRejectedValue(new Error('Payment gateway error'));
      mockPrismaInstance.paymentExecutionLog.create.mockResolvedValue({ id: 'log-1' });
      mockPrismaInstance.scheduledPayment.update.mockResolvedValue({ id: 'sched-3' });

      await service.processDuePayments();

      expect(mockPrismaInstance.paymentExecutionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'RETRYING',
            errorMessage: 'Payment gateway error',
          }),
        }),
      );
    });

    it('should mark payment as failed after max retries exceeded', async () => {
      const mockDuePayment = {
        id: 'sched-4',
        userId: 'user-101',
        billId: 'bill-101',
        amount: 150,
        paymentMethod: 'CREDIT_CARD',
        frequency: 'MONTHLY',
        retryCount: 2,
        maxRetries: 3,
        status: 'ACTIVE',
        endDate: null,
        retryAfter: null,
        nextRunAt: new Date(Date.now() - 60000),
        lastRunAt: null,
      };

      mockPrismaInstance.scheduledPayment.findMany.mockResolvedValue([mockDuePayment]);
      mockPrismaInstance.wallet.findUnique.mockResolvedValue({ balance: '500' });
      mockBillingServiceInstance.processPayment.mockRejectedValue(new Error('Persistent failure'));
      mockPrismaInstance.paymentExecutionLog.create.mockResolvedValue({ id: 'log-1' });
      mockPrismaInstance.scheduledPayment.update.mockResolvedValue({ id: 'sched-4' });

      await service.processDuePayments();

      expect(mockPrismaInstance.paymentExecutionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FAILED',
          }),
        }),
      );
      expect(mockNotificationServiceInstance.sendSystemAlert).toHaveBeenCalledWith(
        'user-101',
        expect.stringContaining('failed after 3 attempts'),
        'URGENT',
      );
    });
  });

  // ── Scheduler Lifecycle ────────────────────────────────────────────────────

  describe('startScheduler / stopScheduler', () => {
    it('should start the scheduler only once', () => {
      const cron = require('node-cron');
      service.startScheduler();
      service.startScheduler();

      expect(cron.schedule).toHaveBeenCalledTimes(1);
      expect(cron.schedule).toHaveBeenCalledWith('* * * * *', expect.any(Function));
    });

    it('should stop the scheduler', () => {
      service.stopScheduler();
    });
  });
});
