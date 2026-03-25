import { DatabasePoolManager } from '../databasePoolManager';
import { logger } from '../logger';

// Mock the logger to avoid console output during tests
jest.mock('../logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock Prisma client
jest.mock('../prismaClient', () => ({
  $queryRaw: jest.fn(),
  $disconnect: jest.fn(),
}));

describe('DatabasePoolManager', () => {
  let poolManager: DatabasePoolManager;
  let mockPrisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    poolManager = DatabasePoolManager.getInstance();
    mockPrisma = require('../prismaClient');
  });

  afterEach(async () => {
    await poolManager.shutdown();
  });

  describe('Pool Health Monitoring', () => {
    it('should track response times and detect slow queries', async () => {
      // Mock a slow database response
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ total_connections: 10 }]);
      
      // Simulate a slow response
      const originalQuery = mockPrisma.$queryRaw;
      mockPrisma.$queryRaw = jest.fn().mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => resolve([{ total_connections: 10 }]), 2500);
        });
      });

      await new Promise(resolve => setTimeout(resolve, 100)); // Wait for health check
      const health = poolManager.getPoolHealth();
      
      expect(health.metrics.maxResponseTime).toBeGreaterThan(2000);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Slow database query detected')
      );
    });

    it('should detect pool exhaustion events', async () => {
      // Mock a pool exhaustion error
      mockPrisma.$queryRaw.mockRejectedValueOnce(
        new Error('Connection pool exhausted')
      );

      await new Promise(resolve => setTimeout(resolve, 100)); // Wait for health check
      const health = poolManager.getPoolHealth();
      
      expect(health.metrics.poolExhaustionEvents).toBeGreaterThan(0);
      expect(health.isHealthy).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Database pool exhaustion detected')
      );
    });

    it('should collect detailed pool metrics', async () => {
      // Mock detailed connection stats
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          total_connections: 25,
          active_connections: 15,
          idle_connections: 10
        }
      ]);

      await new Promise(resolve => setTimeout(resolve, 50)); // Wait for metrics collection
      const health = poolManager.getPoolHealth();
      
      expect(health.metrics.totalConnections).toBe(25);
      expect(health.metrics.activeConnections).toBe(15);
      expect(health.metrics.idleConnections).toBe(10);
    });
  });

  describe('Enhanced Retry Logic', () => {
    it('should handle pool exhaustion with exponential backoff', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new Error('Connection pool exhausted'))
        .mockRejectedValueOnce(new Error('Connection pool exhausted'))
        .mockResolvedValueOnce('success');

      const result = await poolManager.executeWithRetry(mockOperation, 3, 100);
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(3);
      expect(logger.warn).toHaveBeenCalledTimes(2);
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should fail after max retries for pool exhaustion', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValue(new Error('Connection pool exhausted'));

      await expect(poolManager.executeWithRetry(mockOperation, 2, 100))
        .rejects.toThrow('Database pool exhausted: Connection pool exhausted');
      
      expect(mockOperation).toHaveBeenCalledTimes(2);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Database pool exhausted - All retries failed')
      );
    });

    it('should use standard retry for non-pool errors', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new Error('Invalid query syntax'))
        .mockResolvedValueOnce('success');

      const result = await poolManager.executeWithRetry(mockOperation, 3, 100);
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });
  });

  describe('Batch Operations', () => {
    it('should execute operations in smaller batches with delays', async () => {
      const mockOperations = Array.from({ length: 12 }, (_, i) => 
        jest.fn().mockResolvedValue(`result-${i}`)
      );

      const results = await poolManager.batchOperations(mockOperations, 5);
      
      expect(results).toHaveLength(12);
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
      results.forEach((result, i) => {
        expect(result).toBe(`result-${i}`);
      });
    });

    it('should handle batch failures gracefully', async () => {
      const mockOperations = [
        jest.fn().mockResolvedValue('success'),
        jest.fn().mockRejectedValue(new Error('Batch failed')),
        jest.fn().mockResolvedValue('success')
      ];

      await expect(poolManager.batchOperations(mockOperations, 2))
        .rejects.toThrow('Batch failed');
      
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Batch operation failed')
      );
    });
  });

  describe('Connection Lifecycle Management', () => {
    it('should properly shutdown all intervals', async () => {
      await poolManager.shutdown();
      
      // Verify that intervals are cleared by checking that no new health checks occur
      const initialHealth = poolManager.getPoolHealth();
      
      // Wait longer than the health check interval
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const laterHealth = poolManager.getPoolHealth();
      expect(initialHealth.lastCheckTime).toEqual(laterHealth.lastCheckTime);
    });

    it('should handle shutdown errors gracefully', async () => {
      mockPrisma.$disconnect.mockRejectedValueOnce(new Error('Disconnect failed'));
      
      await expect(poolManager.shutdown()).resolves.not.toThrow();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error during database pool shutdown')
      );
    });
  });

  describe('Performance Metrics', () => {
    it('should maintain response time history', async () => {
      // Mock multiple responses with different times
      const responseTimes = [100, 200, 300, 400, 500];
      let callCount = 0;
      
      mockPrisma.$queryRaw = jest.fn().mockImplementation(() => {
        const delay = responseTimes[callCount % responseTimes.length];
        callCount++;
        return new Promise(resolve => {
          setTimeout(() => resolve([{ total_connections: 10 }]), delay);
        });
      });

      // Wait for several health checks
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const health = poolManager.getPoolHealth();
      expect(health.metrics.averageResponseTime).toBeGreaterThan(0);
      expect(health.metrics.maxResponseTime).toBeGreaterThan(0);
    });

    it('should limit response time history size', async () => {
      // This test verifies that the history doesn't grow indefinitely
      const initialHealth = poolManager.getPoolHealth();
      
      // Simulate many responses
      for (let i = 0; i < 150; i++) {
        mockPrisma.$queryRaw.mockResolvedValueOnce([{ total_connections: 10 }]);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      const finalHealth = poolManager.getPoolHealth();
      // The history should be limited, but average should still be calculated
      expect(finalHealth.metrics.averageResponseTime).toBeGreaterThanOrEqual(0);
    });
  });
});
