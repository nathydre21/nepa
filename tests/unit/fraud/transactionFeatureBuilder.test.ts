import { buildTransactionFeatures } from '../../../src/fraud/transactionFeatureBuilder';
import type { PrismaClient } from '@prisma/client';

describe('transactionFeatureBuilder', () => {
  let mockPrisma: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
      payment: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      fraudBlacklist: {
        findMany: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaClient>;
  });

  it('should build features with minimal data', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.payment.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.payment.count as jest.Mock).mockResolvedValue(0);
    (mockPrisma.fraudBlacklist.findMany as jest.Mock).mockResolvedValue([]);

    const result = await buildTransactionFeatures({
      prisma: mockPrisma,
      userId: 'user-1',
      transactionId: 'txn-1',
      amount: 100,
    });

    expect(result).toBeDefined();
    expect(result.amount).toBe(100);
    expect(result.currency).toBe('USD');
    expect(result.network).toBe('stellar');
    expect(result.userId).toBe('user-1');
    expect(result.userTransactionCount24h).toBe(0);
    expect(result.userTransactionCount30d).toBe(0);
    expect(result.userAccountAge).toBe(0);
    expect(typeof result.hourOfDay).toBe('number');
    expect(typeof result.dayOfWeek).toBe('number');
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { createdAt: true, lastLoginAt: true },
    });
    expect(mockPrisma.payment.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { amount: true, createdAt: true, status: true },
    });
  });

  it('should build features with user and payment history', async () => {
    const now = new Date();
    const userCreated = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      createdAt: userCreated,
      lastLoginAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    });
    (mockPrisma.payment.findMany as jest.Mock).mockResolvedValue([
      { amount: 50, createdAt: new Date(now.getTime() - 60 * 60 * 1000), status: 'SUCCESS' },
      { amount: 75, createdAt: new Date(now.getTime() - 25 * 60 * 60 * 1000), status: 'SUCCESS' },
    ]);
    (mockPrisma.payment.count as jest.Mock).mockResolvedValue(1);
    (mockPrisma.fraudBlacklist.findMany as jest.Mock).mockResolvedValue([]);

    const result = await buildTransactionFeatures({
      prisma: mockPrisma,
      userId: 'user-2',
      transactionId: 'txn-2',
      amount: 80,
      ipAddress: '10.0.0.1',
      userAgent: 'Mozilla/5.0',
      deviceId: 'dev-1',
    });

    expect(result.userAccountAge).toBeGreaterThan(0);
    expect(result.userTransactionCount24h).toBe(1);
    expect(result.userTransactionCount7d).toBe(2);
    expect(result.userTransactionCount30d).toBe(2);
    expect(result.userAvgTransactionAmount).toBe(62.5);
    expect(result.hasFailedTransactions).toBe(true);
    expect(result.failedTransactionCount).toBe(1);
  });

  it('should set blacklist flags when IP or device is blacklisted', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.payment.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.payment.count as jest.Mock).mockResolvedValue(0);
    (mockPrisma.fraudBlacklist.findMany as jest.Mock).mockResolvedValue([
      { type: 'ip', value: '10.0.0.2' },
      { type: 'device', value: 'dev-bad' },
    ]);

    const result = await buildTransactionFeatures({
      prisma: mockPrisma,
      userId: 'user-3',
      transactionId: 'txn-3',
      amount: 200,
      ipAddress: '10.0.0.2',
      deviceId: 'dev-bad',
    });

    expect(result.isBlacklistedIP).toBe(true);
    expect(result.isBlacklistedDevice).toBe(true);
  });
});
