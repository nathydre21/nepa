/**
 * Comprehensive Logging System - Usage Examples
 * 
 * This file demonstrates how to use all features of the logging system
 */

import express, { Request, Response, NextFunction } from 'express';
import {
  logger,
  loggingMiddleware,
  setupGlobalErrorHandling,
  LogLevel,
  LogCategory,
  logContextStorage
} from './logger';
import { createLogMonitor } from './logMonitoring';
import { createLogAggregator } from './logAggregation';
import { loggingConfig } from '../config/loggingConfig';

// ============================================================================
// Setup Express Application
// ============================================================================

export function setupLogging(app: express.Application) {
  // 1. Apply logging middleware (should be one of the first middleware)
  app.use(loggingMiddleware);

  // 2. Setup global error handling
  setupGlobalErrorHandling(app);

  // 3. Initialize monitoring (optional)
  if (loggingConfig.monitoring.enabled) {
    const monitor = createLogMonitor(loggingConfig.monitoring);
    
    // Listen for alerts
    monitor.on('alert', (alert) => {
      logger.error(`Alert triggered: ${alert.pattern.name}`, {
        category: LogCategory.SECURITY,
        alert
      });
    });

    // Add custom patterns
    monitor.addPattern({
      id: 'high-error-rate',
      name: 'High Error Rate',
      pattern: /error/i,
      level: LogLevel.ERROR,
      threshold: 10,
      timeWindow: 60000,
      action: 'alert'
    });
  }

  // 4. Initialize aggregation (optional)
  if (loggingConfig.aggregation.enabled) {
    const aggregator = createLogAggregator(
      loggingConfig.aggregation.maxLogs,
      loggingConfig.aggregation.aggregationWindow
    );

    // Expose aggregation endpoint for monitoring
    app.get('/api/logs/stats', (req, res) => {
      const stats = aggregator.getStats();
      res.json(stats);
    });

    app.get('/api/logs/query', (req, res) => {
      const { level, category, search, limit } = req.query;
      const logs = aggregator.query({
        level: level as LogLevel,
        category: category as LogCategory,
        search: search as string,
        limit: limit ? parseInt(limit as string) : undefined
      });
      res.json(logs);
    });
  }

  logger.info('Logging system initialized', {
    category: LogCategory.APPLICATION,
    monitoring: loggingConfig.monitoring.enabled,
    aggregation: loggingConfig.aggregation.enabled
  });
}

// ============================================================================
// Example 1: Basic Logging
// ============================================================================

export function basicLoggingExample() {
  // Simple messages
  logger.info('Application started');
  logger.debug('Debug information');
  logger.warn('Warning message');
  logger.error('Error occurred');

  // With context
  logger.info('User action', {
    userId: '123',
    action: 'login',
    ip: '192.168.1.1'
  });
}

// ============================================================================
// Example 2: Error Logging
// ============================================================================

export function errorLoggingExample() {
  try {
    throw new Error('Something went wrong');
  } catch (error) {
    // Log error with full stack trace
    logger.logError(error as Error, {
      userId: '123',
      operation: 'data-processing',
      category: LogCategory.APPLICATION
    });
  }
}

// ============================================================================
// Example 3: Security Logging
// ============================================================================

export function securityLoggingExample(req: Request) {
  // Failed authentication
  logger.security('Failed login attempt', {
    userId: req.body.email,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    reason: 'invalid_credentials'
  });

  // Successful authentication
  logger.security('User authenticated', {
    userId: '123',
    ip: req.ip,
    method: '2fa'
  });

  // Suspicious activity
  logger.security('Suspicious activity detected', {
    userId: '123',
    ip: req.ip,
    activity: 'multiple_failed_attempts',
    count: 5
  });
}

// ============================================================================
// Example 4: Audit Logging
// ============================================================================

export function auditLoggingExample() {
  // User actions
  logger.audit({
    action: 'user.create',
    resource: 'user',
    resourceId: '123',
    userId: 'admin',
    changes: {
      email: 'user@example.com',
      role: 'user'
    },
    result: 'success'
  });

  // Data modifications
  logger.audit({
    action: 'payment.process',
    resource: 'payment',
    resourceId: 'pay_123',
    userId: '123',
    changes: {
      amount: 99.99,
      status: 'completed'
    },
    result: 'success'
  });

  // Failed operations
  logger.audit({
    action: 'user.delete',
    resource: 'user',
    resourceId: '456',
    userId: 'admin',
    result: 'failure',
    reason: 'insufficient_permissions'
  });
}

// ============================================================================
// Example 5: Performance Logging
// ============================================================================

export async function performanceLoggingExample() {
  const start = Date.now();

  // Simulate operation
  await new Promise(resolve => setTimeout(resolve, 1500));

  const duration = Date.now() - start;

  logger.performance({
    operation: 'database-query',
    duration,
    threshold: 1000
  }, {
    query: 'SELECT * FROM users WHERE active = true',
    rowCount: 150
  });
}

// ============================================================================
// Example 6: Business Metrics
// ============================================================================

export function businessMetricsExample() {
  // Payment processed
  logger.metric({
    name: 'payment.processed',
    value: 99.99,
    unit: 'USD',
    tags: {
      method: 'credit_card',
      status: 'success',
      provider: 'stripe'
    }
  });

  // User registration
  logger.metric({
    name: 'user.registered',
    value: 1,
    tags: {
      source: 'web',
      plan: 'premium'
    }
  });

  // API usage
  logger.metric({
    name: 'api.calls',
    value: 1,
    tags: {
      endpoint: '/api/users',
      method: 'GET',
      status: '200'
    }
  });
}

// ============================================================================
// Example 7: Database Logging
// ============================================================================

export async function databaseLoggingExample() {
  const start = Date.now();

  logger.database('Executing query', {
    query: 'SELECT * FROM users',
    params: { active: true }
  });

  // Simulate query
  await new Promise(resolve => setTimeout(resolve, 100));

  const duration = Date.now() - start;

  logger.database('Query completed', {
    query: 'SELECT * FROM users',
    duration,
    rowCount: 42
  });
}

// ============================================================================
// Example 8: External API Logging
// ============================================================================

export async function externalApiLoggingExample() {
  const start = Date.now();

  logger.externalApi('Calling payment gateway', {
    provider: 'stripe',
    endpoint: '/v1/charges',
    method: 'POST'
  });

  try {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 250));

    const duration = Date.now() - start;

    logger.externalApi('Payment gateway responded', {
      provider: 'stripe',
      duration,
      statusCode: 200,
      success: true
    });
  } catch (error) {
    logger.externalApi('Payment gateway failed', {
      provider: 'stripe',
      error: (error as Error).message
    });
  }
}

// ============================================================================
// Example 9: Webhook Logging
// ============================================================================

export async function webhookLoggingExample() {
  logger.webhook('Webhook received', {
    source: 'stripe',
    event: 'payment.succeeded',
    webhookId: 'wh_123'
  });

  logger.webhook('Webhook delivered', {
    url: 'https://example.com/webhook',
    event: 'payment.succeeded',
    statusCode: 200,
    duration: 150
  });
}

// ============================================================================
// Example 10: Context Propagation
// ============================================================================

export async function contextPropagationExample(userId: string) {
  // Set context for this operation
  return logContextStorage.run({
    userId,
    operation: 'user-workflow',
    correlationId: `wf_${Date.now()}`
  }, async () => {
    // All logs within this scope will include the context
    logger.info('Starting user workflow');

    await step1();
    await step2();
    await step3();

    logger.info('User workflow completed');
  });
}

async function step1() {
  logger.info('Executing step 1');
  await new Promise(resolve => setTimeout(resolve, 100));
}

async function step2() {
  logger.info('Executing step 2');
  await new Promise(resolve => setTimeout(resolve, 100));
}

async function step3() {
  logger.info('Executing step 3');
  await new Promise(resolve => setTimeout(resolve, 100));
}

// ============================================================================
// Example 11: Child Logger
// ============================================================================

export function childLoggerExample() {
  // Create a child logger with default context
  const userServiceLogger = logger.child({
    service: 'user-service',
    version: '1.0.0'
  });

  // All logs from this logger will include service and version
  userServiceLogger.info('User service started');
  userServiceLogger.debug('Processing user request');
  userServiceLogger.error('User service error');
}

// ============================================================================
// Example 12: Request Handler with Logging
// ============================================================================

export const exampleRequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user?.id;

    logger.info('Processing request', {
      userId,
      endpoint: req.originalUrl,
      method: req.method
    });

    // Simulate business logic
    const result = await processBusinessLogic(userId);

    // Log success metric
    logger.metric({
      name: 'request.success',
      value: 1,
      tags: {
        endpoint: req.originalUrl,
        method: req.method
      }
    });

    res.json(result);
  } catch (error) {
    logger.logError(error as Error, {
      userId: (req as any).user?.id,
      endpoint: req.originalUrl,
      method: req.method,
      category: LogCategory.APPLICATION
    });

    next(error);
  }
};

async function processBusinessLogic(userId: string) {
  logger.debug('Processing business logic', { userId });
  return { success: true };
}

// ============================================================================
// Example 13: Complete Application Setup
// ============================================================================

export function createApplicationWithLogging() {
  const app = express();

  // Setup logging
  setupLogging(app);

  // Example routes
  app.get('/api/users', exampleRequestHandler);

  app.post('/api/login', (req, res) => {
    securityLoggingExample(req);
    res.json({ success: true });
  });

  app.post('/api/payment', async (req, res) => {
    await performanceLoggingExample();
    businessMetricsExample();
    res.json({ success: true });
  });

  return app;
}

export default {
  setupLogging,
  basicLoggingExample,
  errorLoggingExample,
  securityLoggingExample,
  auditLoggingExample,
  performanceLoggingExample,
  businessMetricsExample,
  databaseLoggingExample,
  externalApiLoggingExample,
  webhookLoggingExample,
  contextPropagationExample,
  childLoggerExample,
  createApplicationWithLogging
};
