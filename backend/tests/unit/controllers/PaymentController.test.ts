import { Request, Response } from 'express';
import { mockRequest, mockResponse, createMockAuth } from '../../mocks';

// Mock NotificationService with a proper constructor to support `new NotificationService()` calls
jest.mock('../../../services/NotificationService', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    sendSystemAlert: jest.fn(),
    sendPaymentConfirmed: jest.fn(),
    sendBillCreated: jest.fn(),
    sendBillOverdue: jest.fn(),
  })),
}));

jest.mock('../../../BillingService', () => {
  const mockBillingService = {
    processPayment: jest.fn(),
    getPaymentHistory: jest.fn(),
    getBill: jest.fn(),
    getPaymentByTransactionId: jest.fn(),
  };
  return {
    BillingService: jest.fn().mockImplementation(() => mockBillingService),
    __mockBillingService: mockBillingService,
  };
});

jest.mock('../../../services/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    logError: jest.fn(),
  },
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../services/RedisCacheManager', () => {
  const mockCacheManager = {
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  return {
    getCacheManager: jest.fn(() => mockCacheManager),
    __mockCacheManager: mockCacheManager,
  };
});

// Mock stellar-sdk to avoid constructor issues at module load
jest.mock('stellar-sdk', () => {
  const mockSubmitTransaction = jest.fn();
  const mockTransactionCall = jest.fn();
  return {
    Server: jest.fn().mockImplementation(() => ({
      loadAccount: jest.fn(),
      submitTransaction: mockSubmitTransaction,
      transactions: jest.fn(() => ({
        transaction: jest.fn(() => ({
          call: mockTransactionCall,
        })),
      })),
    })),
    TransactionBuilder: jest.fn(),
    Networks: { TESTNET: 'testnet' },
    BASE_FEE: '100',
    Asset: { native: jest.fn() },
    Transaction: jest.fn().mockImplementation(() => ({
      signatures: [{ hint: () => Buffer.alloc(4) }],
    })),
    __mockSubmitTransaction: mockSubmitTransaction,
    __mockTransactionCall: mockTransactionCall,
  };
});

// Mock the rate limiter and abuse detection middleware
jest.mock('../../../middleware/rateLimiter', () => ({
  paymentLimiter: jest.fn((_req: any, _res: any, next: any) => next()),
  transactionLimiter: jest.fn((_req: any, _res: any, next: any) => next()),
}));

jest.mock('../../../middleware/abuseDetection', () => ({
  abuseDetector: jest.fn((_req: any, _res: any, next: any) => next()),
}));

jest.mock('../../../middleware/captcha', () => ({
  conditionalCaptcha: jest.fn((_req: any, _res: any, next: any) => next()),
}));

jest.mock('../../../middleware/cache', () => ({
  invalidateUserCache: jest.fn().mockResolvedValue(undefined),
  invalidateCacheByPattern: jest.fn().mockResolvedValue(undefined),
}));

// Now import the controller and dependencies
import { processPayment, getPaymentHistory, validatePayment } from '../../../controllers/PaymentController';

const mockCacheManager = (require('../../../services/RedisCacheManager') as any).__mockCacheManager;
const mockSubmitTransaction = (require('stellar-sdk') as any).__mockSubmitTransaction;
const mockBillingService = (require('../../../BillingService') as any).__mockBillingService;

describe('PaymentController', () => {
  let req: Request;
  let res: Response;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheManager.set.mockResolvedValue(undefined);
    mockCacheManager.get.mockResolvedValue(null);
    mockBillingService.processPayment.mockReset();
    mockBillingService.getPaymentHistory.mockReset();
    mockBillingService.getBill.mockReset();
    req = mockRequest();
    res = mockResponse();
  });

  describe('processPayment', () => {
    const validPaymentData = {
      billId: 'bill-123',
      amount: 100.50,
      paymentMethod: 'CREDIT_CARD'
    };

    it('should process payment successfully', async () => {
      req.body = validPaymentData;
      (req as any).user = createMockAuth('user-123');

      const mockPaymentResult = {
        id: 'payment-123',
        status: 'COMPLETED',
        transactionId: 'txn-123'
      };

      mockBillingService.processPayment.mockResolvedValue(mockPaymentResult);

      await processPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 200,
          message: 'Payment processed successfully',
          data: expect.objectContaining({
            ...mockPaymentResult,
            status: 'completed',
            transactionId: expect.any(String),
          }),
        })
      );
    });

    it('should return error for unauthenticated user', async () => {
      req.body = validPaymentData;

      await processPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'User authentication required'
      });
    });

    it('should return error for missing billId', async () => {
      req.body = {
        amount: 100.50,
        paymentMethod: 'CREDIT_CARD'
      };
      (req as any).user = createMockAuth('user-123');

      await processPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Missing required payment fields'
      });
    });

    it('should return error for missing amount', async () => {
      req.body = {
        billId: 'bill-123',
        paymentMethod: 'CREDIT_CARD'
      };
      (req as any).user = createMockAuth('user-123');

      await processPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Missing required payment fields'
      });
    });

    it('should return error for missing payment method', async () => {
      req.body = {
        billId: 'bill-123',
        amount: 100.50
      };
      (req as any).user = createMockAuth('user-123');

      await processPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Missing required payment fields'
      });
    });

    it('should return error for zero amount treated as missing', async () => {
      req.body = {
        ...validPaymentData,
        amount: 0
      };
      (req as any).user = createMockAuth('user-123');

      await processPayment(req, res);

      // amount 0 is falsy, so it is rejected by the required-fields check
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Missing required payment fields'
      });
    });

    it('should return error for negative amount', async () => {
      req.body = {
        ...validPaymentData,
        amount: -50
      };
      (req as any).user = createMockAuth('user-123');

      await processPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Payment amount must be greater than 0'
      });
    });

    it('should handle payment processing errors', async () => {
      req.body = validPaymentData;
      (req as any).user = createMockAuth('user-123');

      mockBillingService.processPayment.mockRejectedValue(new Error('Payment gateway error'));

      await processPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Payment processing failed' });
    });



  });

  describe('getPaymentHistory', () => {
    it('should return payment history successfully', async () => {
      (req as any).user = createMockAuth('user-123');
      req.query = { limit: '5', offset: '10' };

      const mockPaymentHistory = {
        payments: [
          {
            id: 'payment-1',
            amount: 100,
            status: 'COMPLETED',
            createdAt: new Date()
          },
          {
            id: 'payment-2',
            amount: 50,
            status: 'PENDING',
            createdAt: new Date()
          }
        ],
        pagination: { limit: 5, offset: 10, total: 2 }
      };

      mockBillingService.getPaymentHistory.mockResolvedValue(mockPaymentHistory);

      await getPaymentHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 200,
        data: mockPaymentHistory.payments,
        pagination: mockPaymentHistory.pagination
      });
      expect(mockBillingService.getPaymentHistory).toHaveBeenCalledWith('user-123', 5, 10);
    });

    it('should use default limit and offset values', async () => {
      (req as any).user = createMockAuth('user-123');
      req.query = {};

      const mockPaymentHistory = { payments: [], pagination: { limit: 10, offset: 0, total: 0 } };
      mockBillingService.getPaymentHistory.mockResolvedValue(mockPaymentHistory);

      await getPaymentHistory(req, res);

      expect(mockBillingService.getPaymentHistory).toHaveBeenCalledWith('user-123', 10, 0);
    });

    it('should return error for unauthenticated user', async () => {
      req.query = { limit: '5', offset: '10' };

      await getPaymentHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'User authentication required'
      });
    });

    it('should handle payment history retrieval errors', async () => {
      (req as any).user = createMockAuth('user-123');
      req.query = { limit: '5', offset: '10' };

      mockBillingService.getPaymentHistory.mockRejectedValue(new Error('Database error'));

      await getPaymentHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Failed to retrieve payment history'
      });
    });
  });

  describe('validatePayment', () => {
    const validValidationData = {
      billId: 'bill-123',
      amount: 100.50
    };

    const mockBill = {
      id: 'bill-123',
      userId: 'user-123',
      amount: 100,
      lateFee: 5,
      status: 'PENDING'
    };

    it('should validate payment data successfully', async () => {
      req.body = validValidationData;
      (req as any).user = createMockAuth('user-123');

      mockBillingService.getBill.mockResolvedValue(mockBill);

      await validatePayment(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 200,
        message: 'Payment data is valid',
        data: {
          billAmount: mockBill.amount,
          lateFee: mockBill.lateFee,
          totalDue: 105
        }
      });
    });

    it('should return error for unauthenticated user', async () => {
      req.body = validValidationData;

      await validatePayment(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'User authentication required'
      });
    });

    it('should return error for non-existent bill', async () => {
      req.body = validValidationData;
      (req as any).user = createMockAuth('user-123');

      mockBillingService.getBill.mockResolvedValue(null);

      await validatePayment(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Bill not found or access denied'
      });
    });

    it('should return error for bill belonging to different user', async () => {
      req.body = validValidationData;
      (req as any).user = createMockAuth('user-456');

      const billForDifferentUser = {
        ...mockBill,
        userId: 'user-789'
      };

      mockBillingService.getBill.mockResolvedValue(billForDifferentUser);

      await validatePayment(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Bill not found or access denied'
      });
    });

    it('should return error for zero amount', async () => {
      req.body = {
        ...validValidationData,
        amount: 0
      };
      (req as any).user = createMockAuth('user-123');

      mockBillingService.getBill.mockResolvedValue(mockBill);

      await validatePayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Invalid payment amount'
      });
    });

    it('should return error for negative amount', async () => {
      req.body = {
        ...validValidationData,
        amount: -50
      };
      (req as any).user = createMockAuth('user-123');

      mockBillingService.getBill.mockResolvedValue(mockBill);

      await validatePayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Invalid payment amount'
      });
    });

    it('should return error for amount exceeding total due', async () => {
      req.body = {
        ...validValidationData,
        amount: 200
      };
      (req as any).user = createMockAuth('user-123');

      mockBillingService.getBill.mockResolvedValue(mockBill);

      await validatePayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Invalid payment amount'
      });
    });

    it('should handle validation errors gracefully', async () => {
      req.body = validValidationData;
      (req as any).user = createMockAuth('user-123');

      mockBillingService.getBill.mockRejectedValue(new Error('Database error'));

      await validatePayment(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Payment validation failed'
      });
    });
  });
});
