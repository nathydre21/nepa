import { FraudReviewService } from '../../../src/fraud/FraudReviewService';
import { FraudRiskLevel, FraudDetectionStatus, FraudType } from '../../../src/fraud/types';
import type { PrismaClient } from '@prisma/client';

const mockDetectionResult = {
  riskScore: 75,
  riskLevel: FraudRiskLevel.HIGH,
  detectedFraudTypes: [FraudType.VELOCITY_ATTACK],
  requiresManualReview: true,
  shouldBlock: false,
  modelVersion: '1.0.0',
  reasons: ['High velocity'],
};

describe('FraudReviewService', () => {
  let mockPrisma: jest.Mocked<PrismaClient>;
  let service: FraudReviewService;

  beforeEach(() => {
    mockPrisma = {
      fraudCase: {
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
      },
      manualReviewWorkflow: { upsert: jest.fn().mockResolvedValue({}) },
      fraudAlert: { upsert: jest.fn().mockResolvedValue({}) },
      mLTrainingData: { upsert: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as jest.Mocked<PrismaClient>;
    service = new FraudReviewService(mockPrisma as any);
  });

  describe('createFraudCase', () => {
    it('should create fraud case and persist via Prisma', async () => {
      const fraudCase = await service.createFraudCase(
        mockDetectionResult,
        'txn-123',
        'user-123'
      );

      expect(fraudCase).toBeDefined();
      expect(fraudCase.transactionId).toBe('txn-123');
      expect(fraudCase.userId).toBe('user-123');
      expect(fraudCase.riskScore).toBe(75);
      expect(fraudCase.riskLevel).toBe(FraudRiskLevel.HIGH);
      expect(fraudCase.status).toBe(FraudDetectionStatus.REVIEW_REQUIRED);
      expect(fraudCase.detectedFraudTypes).toContain(FraudType.VELOCITY_ATTACK);
      expect((mockPrisma as any).fraudCase.upsert).toHaveBeenCalled();
    });

    it('should use fraudCaseId when provided for Payment relation', async () => {
      const fraudCase = await service.createFraudCase(
        mockDetectionResult,
        'txn-pay-1',
        'user-1',
        { fraudCaseId: 'txn-pay-1' }
      );

      expect(fraudCase.id).toBe('txn-pay-1');
    });
  });

  describe('updateReviewWorkflow', () => {
    it('should throw when workflow not found', async () => {
      await expect(
        service.updateReviewWorkflow('nonexistent', 'reviewer-1', { status: 'in_progress' })
      ).rejects.toThrow('Review workflow not found');
    });
  });

  describe('completeReview', () => {
    it('should throw when workflow not found', async () => {
      (mockPrisma as any).fraudCase.findUnique.mockResolvedValue(null);

      await expect(
        service.completeReview('nonexistent', 'reviewer-1', 'legitimate', 'Notes')
      ).rejects.toThrow('Review workflow not found');
    });
  });
});
