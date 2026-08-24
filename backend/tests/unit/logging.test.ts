/**
 * Comprehensive Logging System Tests
 */

import { logger, LogLevel, LogCategory } from '../../middleware/logger';
import { createLogMonitor } from '../../middleware/logMonitoring';
import { createLogAggregator } from '../../middleware/logAggregation';

describe('Comprehensive Logging System', () => {
  describe('Logger', () => {
    it('should log messages at different levels', () => {
      expect(() => {
        logger.error('Error message');
        logger.warn('Warning message');
        logger.info('Info message');
        logger.debug('Debug message');
      }).not.toThrow();
    });

    it('should log with context', () => {
      expect(() => {
        logger.info('User action', {
          userId: '123',
          action: 'login',
          ip: '192.168.1.1'
        });
      }).not.toThrow();
    });

    it('should log errors with stack traces', () => {
      const error = new Error('Test error');
      expect(() => {
        logger.logError(error, {
          userId: '123',
          operation: 'test'
        });
      }).not.toThrow();
    });

    it('should log security events', () => {
      expect(() => {
        logger.security('Security event', {
          userId: '123',
          action: 'login_attempt'
        });
      }).not.toThrow();
    });

    it('should log audit events', () => {
      expect(() => {
        logger.audit({
          action: 'user.create',
          resource: 'user',
          resourceId: '123',
          userId: 'admin',
          result: 'success'
        });
      }).not.toThrow();
    });

    it('should log performance metrics', () => {
      expect(() => {
        logger.performance({
          operation: 'test-operation',
          duration: 1500,
          threshold: 1000
        });
      }).not.toThrow();
    });

    it('should log business metrics', () => {
      expect(() => {
        logger.metric({
          name: 'test.metric',
          value: 100,
          unit: 'count',
          tags: { type: 'test' }
        });
      }).not.toThrow();
    });

    it('should create child logger with default context', () => {
      const childLogger = logger.child({
        service: 'test-service',
        version: '1.0.0'
      });

      expect(() => {
        childLogger.info('Child logger message');
      }).not.toThrow();
    });
  });

  describe('Log Monitor', () => {
    let monitor: any;

    beforeEach(() => {
      monitor = createLogMonitor({
        enabled: true,
        alertThresholds: {
          errorRate: 10,
          slowRequestThreshold: 1000,
          memoryUsageThreshold: 85
        }
      });
    });

    afterEach(() => {
      monitor.close();
    });

    it('should create monitor instance', () => {
      expect(monitor).toBeDefined();
    });

    it('should add custom pattern', () => {
      expect(() => {
        monitor.addPattern({
          id: 'test-pattern',
          name: 'Test Pattern',
          pattern: /test/i,
          level: LogLevel.ERROR,
          threshold: 5,
          timeWindow: 60000,
          action: 'alert'
        });
      }).not.toThrow();
    });

    it('should remove pattern', () => {
      monitor.addPattern({
        id: 'test-pattern',
        name: 'Test Pattern',
        pattern: /test/i,
        level: LogLevel.ERROR,
        action: 'alert'
      });

      expect(() => {
        monitor.removePattern('test-pattern');
      }).not.toThrow();
    });

    it('should process logs', () => {
      expect(() => {
        monitor.processLog(LogLevel.INFO, 'Test message', {
          userId: '123'
        });
      }).not.toThrow();
    });

    it('should get statistics', () => {
      monitor.processLog(LogLevel.INFO, 'Test message');
      monitor.processLog(LogLevel.ERROR, 'Error message');

      const stats = monitor.getStatistics();
      expect(stats).toBeDefined();
      expect(stats.totalLogs).toBeGreaterThan(0);
    });

    it('should emit alert event when pattern threshold is reached', (done) => {
      monitor.addPattern({
        id: 'test-alert',
        name: 'Test Alert',
        pattern: /critical/i,
        level: LogLevel.ERROR,
        threshold: 2,
        timeWindow: 60000,
        action: 'alert'
      });

      monitor.on('alert', (alert: any) => {
        expect(alert).toBeDefined();
        expect(alert.pattern.id).toBe('test-alert');
        done();
      });

      monitor.processLog(LogLevel.ERROR, 'Critical error 1');
      monitor.processLog(LogLevel.ERROR, 'Critical error 2');
    });
  });

  describe('Log Aggregator', () => {
    let aggregator: any;

    beforeEach(() => {
      aggregator = createLogAggregator(1000, 60000);
    });

    it('should create aggregator instance', () => {
      expect(aggregator).toBeDefined();
    });

    it('should add logs', () => {
      expect(() => {
        aggregator.addLog(LogLevel.INFO, 'Test message', {
          userId: '123'
        });
      }).not.toThrow();
    });

    it('should query logs by level', () => {
      aggregator.addLog(LogLevel.INFO, 'Info message');
      aggregator.addLog(LogLevel.ERROR, 'Error message');

      const errors = aggregator.query({
        level: LogLevel.ERROR
      });

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].level).toBe(LogLevel.ERROR);
    });

    it('should query logs by category', () => {
      aggregator.addLog(LogLevel.INFO, 'Security message', {
        category: LogCategory.SECURITY
      });
      aggregator.addLog(LogLevel.INFO, 'Application message', {
        category: LogCategory.APPLICATION
      });

      const securityLogs = aggregator.query({
        category: LogCategory.SECURITY
      });

      expect(securityLogs.length).toBeGreaterThan(0);
      expect(securityLogs[0].category).toBe(LogCategory.SECURITY);
    });

    it('should query logs by time range', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 3600000);

      aggregator.addLog(LogLevel.INFO, 'Recent message');

      const recentLogs = aggregator.query({
        startTime: oneHourAgo,
        endTime: now
      });

      expect(recentLogs.length).toBeGreaterThan(0);
    });

    it('should query logs by search term', () => {
      aggregator.addLog(LogLevel.INFO, 'Payment processed successfully');
      aggregator.addLog(LogLevel.INFO, 'User logged in');

      const paymentLogs = aggregator.query({
        search: 'payment'
      });

      expect(paymentLogs.length).toBeGreaterThan(0);
      expect(paymentLogs[0].message.toLowerCase()).toContain('payment');
    });

    it('should limit query results', () => {
      for (let i = 0; i < 10; i++) {
        aggregator.addLog(LogLevel.INFO, `Message ${i}`);
      }

      const limitedLogs = aggregator.query({
        limit: 5
      });

      expect(limitedLogs.length).toBeLessThanOrEqual(5);
    });

    it('should get statistics', () => {
      aggregator.addLog(LogLevel.INFO, 'Info message');
      aggregator.addLog(LogLevel.ERROR, 'Error message');

      const stats = aggregator.getStats();
      expect(stats).toBeDefined();
      expect(stats.totalLogs).toBeGreaterThan(0);
      expect(stats.byLevel).toBeDefined();
      expect(stats.byCategory).toBeDefined();
    });

    it('should clear logs', () => {
      aggregator.addLog(LogLevel.INFO, 'Test message');
      aggregator.clear();

      const stats = aggregator.getStats();
      expect(stats.totalLogs).toBe(0);
    });
  });

  describe('Integration', () => {
    it('should work together - monitor and aggregator', () => {
      const monitor = createLogMonitor({
        enabled: true,
        alertThresholds: {
          errorRate: 10,
          slowRequestThreshold: 1000,
          memoryUsageThreshold: 85
        }
      });

      const aggregator = createLogAggregator();

      // Process logs through both systems
      const testLog = (level: LogLevel, message: string) => {
        monitor.processLog(level, message);
        aggregator.addLog(level, message);
      };

      testLog(LogLevel.INFO, 'Application started');
      testLog(LogLevel.ERROR, 'Database connection failed');
      testLog(LogLevel.WARN, 'High memory usage');

      const monitorStats = monitor.getStatistics();
      const aggregatorStats = aggregator.getStats();

      expect(monitorStats.totalLogs).toBe(3);
      expect(aggregatorStats.totalLogs).toBe(3);

      monitor.close();
    });
  });
});
