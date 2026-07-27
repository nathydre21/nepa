import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { apiLimiter, ddosDetector, checkBlockedIP, ipRestriction, progressiveLimiter, authLimiter } from './middleware/rateLimiter';
import { endpointRateLimiter, userRateLimiter, ipRateLimiter, getRateLimitStatus } from './middleware/apiRateLimiter';
import { configureSecurity } from './middleware/security';
import { apiKeyAuth } from './src/config/auth';
import { authenticate, authorize, optionalAuth } from './middleware/authentication';
import { loggingMiddleware, setupGlobalErrorHandling, errorTracker, logger } from './middleware/logger';
import { errorTracker as abuseDetector } from './middleware/abuseDetection';
import { sanitizeInput } from './middleware/inputSanitization';
import { captureAuditContext, auditRateLimit, auditAuth, auditAdmin, auditPayment, auditDocument } from './middleware/auditMiddleware';
import auditRoutes from './routes/auditRoutes';
import fraudRoutes from './routes/fraudRoutes';
import { swaggerSpec, getVersionedSwaggerSpec } from './swagger';
import { apiVersioningConfig } from './config/api-versioning';
import { AuthenticationController } from './controllers/AuthenticationController';
import { UserController } from './controllers/UserController';
import { upload } from './middleware/upload';
import { uploadDocument } from './controllers/DocumentController';
import { getDashboardData, generateReport, exportData } from './controllers/AnalyticsController';
import { applyPaymentSecurity, processPayment, getPaymentHistory, validatePayment } from './controllers/PaymentController';
import exportRoutes from './routes/export';
// Rate limit routes are set up below after middleware initialization
import { performanceMonitor } from './services/performanceMonitoring';
import analyticsService from './services/analytics';
import { appConfig } from './src/config/environment';
import ConnectionPoolMonitor from './databases/monitoring/ConnectionPoolMonitor';
import DatabaseHealthCheck from './databases/monitoring/DatabaseHealthCheck';
import { MemoryMonitor } from './MemoryMonitor';
import { AuditAction } from './services/AuditService';
import { UserRole } from './middleware/authentication';
import { errorHandler, getErrorStats, getErrorLogs } from './middleware/centralizedErrorHandler';
import ConnectionPoolManager from './databases/ConnectionPoolManager';
import scheduledPaymentRoutes from './routes/scheduledPaymentRoutes';
import { scheduledPaymentService } from './services/ScheduledPaymentService';
import { initializeCacheSystem } from './services/cache/CacheInitializer';
import { requestTimeout } from './middleware/requestTimeout';

// Create controller instances (Issue #407: re-enabled)
const authController = new AuthenticationController();
const userController = new UserController();

// Auth flag: when AUTH_ENABLED=false, skip auth middleware (dev only)
const AUTH_ENABLED = process.env.AUTH_ENABLED !== 'false';

const app = express();

// Initialize Connection Pool Manager
ConnectionPoolManager.startHealthMonitoring(60000); // Monitor every minute

// Initialize logging and monitoring
logger.info('Application starting up', {
  nodeEnv: appConfig.nodeEnv,
  version: process.env.npm_package_version,
  enablePerformanceMetrics: appConfig.enablePerformanceMetrics,
  enableDbPoolMonitoring: appConfig.enableDbPoolMonitoring,
});

// Initialize error tracking if DSN is provided
if (appConfig.sentryDsn) {
  errorTracker.initialize({
    dsn: appConfig.sentryDsn,
    environment: appConfig.nodeEnv,
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    release: process.env.npm_package_version
  });
}

// Initialize Cache System
initializeCacheSystem()
  .then((result) => {
    if (result.success) {
      logger.info('Cache system initialized successfully', {
        services: result.services,
        initializationTime: result.metrics.initializationTime
      });
    } else {
      logger.error('Cache system initialization failed', {
        errors: result.errors,
        services: result.services
      });
    }
  })
  .catch((error) => {
    logger.error('Cache system initialization error:', error);
  });

if (appConfig.enableDbPoolMonitoring) {
  ConnectionPoolMonitor.startMonitoring(appConfig.dbPoolMonitoringInterval);
  logger.info('Database connection pool monitoring enabled', {
    intervalMs: appConfig.dbPoolMonitoringInterval
  });
}

// 1. Comprehensive logging middleware (should be first)
app.use(...loggingMiddleware);
configureSecurity(app);

// 2. Global request timeout (prevents hung Stellar/network calls)
app.use(requestTimeout(30000));

// 4. Body Parsing
app.use(express.json({ limit: '10kb' })); // Limit body size for security

// 5. Input Sanitization
app.use('/api', sanitizeInput);

// 6. Progressive Rate Limiting
app.use('/api', progressiveLimiter);

// 6. Audit Context Capture (before rate limiting to capture all requests)
if (AUTH_ENABLED) {
  app.use('/api', captureAuditContext);
}

// 7. Advanced rate limiting is applied by setupRateLimitRoutes(app)

// 8. Audit rate limit breaches
if (AUTH_ENABLED) {
  app.use('/api', auditRateLimit);
}

// 9. Error tracking for abuse detection
app.use(abuseDetector);

// 10. Setup rate limiting routes
import { setupRateLimitRoutes } from './routes/rateLimitRoutes';
setupRateLimitRoutes(app);

// 11. Rate limiting monitoring endpoint
app.get('/api/monitoring/rate-limit', getRateLimitStatus);

// 11. Audit Routes
if (AUTH_ENABLED) {
  app.use('/api/audit', auditRoutes);
}

// 13. Fraud detection API (ML scoring 0-100, manual review workflow, adaptive learning)
if (AUTH_ENABLED) {
  app.use('/api/fraud', fraudRoutes);
}

// 14. API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api-docs/v1', swaggerUi.serve, swaggerUi.setup(getVersionedSwaggerSpec('v1')));
app.use('/api-docs/v2', swaggerUi.serve, swaggerUi.setup(getVersionedSwaggerSpec('v2')));

// 15. Enhanced Health Check
app.get('/health', (req, res) => {
  const healthStatus = performanceMonitor.getHealthStatus();
  const memoryUsage = performanceMonitor.getMemoryUsage();

  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    healthStatus,
    memoryUsage
  });
});

// 10. Monitoring endpoints (unversioned)
app.get('/api/monitoring/metrics', apiKeyAuth, async (req, res) => {
  // const analytics = analyticsService.getAnalyticsData();
  const performance = performanceMonitor.getHealthStatus();
  const dbPoolMetrics = await ConnectionPoolMonitor.getAllPoolMetrics();
  const databaseHealth = await DatabaseHealthCheck.getHealthReport();

  res.json({
    analytics: { message: 'Analytics service temporarily disabled' },
    performance,
    requestMetrics: performanceMonitor.getRequestMetrics(100),
    customMetrics: performanceMonitor.getCustomMetrics(100),
    dbPoolMetrics,
    databaseHealth
  });
});

app.get('/api/monitoring/db-pools', apiKeyAuth, async (_req, res) => {
  const dbPoolMetrics = await ConnectionPoolMonitor.getAllPoolMetrics();
  res.json({ status: 'ok', dbPoolMetrics });
});

app.get('/api/monitoring/db-health', apiKeyAuth, async (_req, res) => {
  const databaseHealth = await DatabaseHealthCheck.getHealthReport();
  res.json({ status: 'ok', databaseHealth });
});

// Memory monitoring endpoints
app.get('/api/monitoring/memory', apiKeyAuth, (_req, res) => {
  const memoryMonitor = MemoryMonitor.getInstance();
  const healthMetrics = memoryMonitor.getHealthMetrics();
  const memoryTrend = memoryMonitor.getMemoryTrend();
  const connectionTrend = memoryMonitor.getConnectionTrend();
  const leakDetection = memoryMonitor.detectMemoryLeaks();

  res.json({
    status: 'ok',
    healthMetrics,
    memoryTrend,
    connectionTrend,
    leakDetection,
    timestamp: new Date().toISOString()
  });
});

app.post('/api/monitoring/memory/cleanup', apiKeyAuth, (_req, res) => {
  const memoryMonitor = MemoryMonitor.getInstance();
  memoryMonitor.forceCleanup();
  
  res.json({
    status: 'ok',
    message: 'Memory cleanup completed',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/monitoring/memory/alerts', apiKeyAuth, (_req, res) => {
  const memoryMonitor = MemoryMonitor.getInstance();
  const alerts = memoryMonitor.getAlerts();
  const leakDetection = memoryMonitor.detectMemoryLeaks();
  
  res.json({
    status: 'ok',
    alerts,
    leakDetection,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/monitoring/memory/report', apiKeyAuth, (_req, res) => {
  const memoryMonitor = MemoryMonitor.getInstance();
  const report = memoryMonitor.generateMemoryReport();
  
  res.json({
    status: 'ok',
    report,
    timestamp: new Date().toISOString()
  });
});

app.delete('/api/monitoring/memory/alerts', apiKeyAuth, (_req, res) => {
  const memoryMonitor = MemoryMonitor.getInstance();
  memoryMonitor.clearAlerts();
  
  res.json({
    status: 'ok',
    message: 'Memory alerts cleared',
    timestamp: new Date().toISOString()
  });
});

// Connection Pool Management endpoints
app.get('/api/connection-pool/stats', async (req, res) => {
  try {
    const stats = await ConnectionPoolManager.getAllPoolStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get connection pool stats' });
  }
});

app.get('/api/connection-pool/health', async (req, res) => {
  try {
    const healthChecks = await ConnectionPoolManager.getAllHealthChecks();
    res.json(healthChecks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get connection pool health' });
  }
});

app.get('/api/connection-pool/performance', async (req, res) => {
  try {
    const metrics = await ConnectionPoolManager.getPerformanceMetrics();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get connection pool performance metrics' });
  }
});

// Cache System endpoints
app.get('/api/cache/health', async (req, res) => {
  try {
    const { getCacheInitializer } = await import('./services/cache/CacheInitializer');
    const initializer = getCacheInitializer();
    const status = await initializer.getStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get cache system status' });
  }
});

app.get('/api/cache/stats', async (req, res) => {
  try {
    const { getCacheManager } = await import('./services/RedisCacheManager');
    const cacheManager = getCacheManager();
    const stats = await cacheManager.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get cache statistics' });
  }
});

app.get('/api/cache/metrics', async (req, res) => {
  try {
    const { getCacheMonitoringService } = await import('./services/cache/CacheMonitoringService');
    const monitoring = getCacheMonitoringService();
    const metrics = monitoring.getHealthMetrics();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get cache metrics' });
  }
});

app.get('/api/cache/performance', async (req, res) => {
  try {
    const { getCacheMonitoringService } = await import('./services/cache/CacheMonitoringService');
    const monitoring = getCacheMonitoringService();
    const report = monitoring.getPerformanceReport();
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get cache performance report' });
  }
});

// 12. Authentication endpoints with comprehensive audit logging (Issue #407: re-enabled)
if (AUTH_ENABLED) {
app.post('/api/auth/register',
  authLimiter,
  auditAuth(AuditAction.USER_REGISTER),
  authController.register.bind(authController)
);
app.post('/api/auth/login',
  authLimiter,
  auditAuth(AuditAction.USER_LOGIN),
  authController.login.bind(authController)
);
app.post('/api/auth/logout',
  authenticate,
  auditAuth(AuditAction.USER_LOGOUT),
  authController.logout.bind(authController)
);

// 13. User profile endpoints with audit logging
app.get('/api/user/profile', authenticate, authController.getProfile.bind(authController));
app.put('/api/user/profile',
  authenticate,
  auditAuth(AuditAction.USER_UPDATE_PROFILE),
  userController.updateProfile.bind(userController)
);
app.post('/api/user/change-password',
  authenticate,
  auditAuth(AuditAction.USER_CHANGE_PASSWORD),
  userController.changePassword.bind(userController)
);

// 14. Admin user management endpoints with audit logging
app.get('/api/admin/users',
  authenticate,
  authorize(UserRole.ADMIN),
  auditAdmin(AuditAction.ADMIN_VIEW_USER_DATA, 'user'),
  userController.getAllUsers.bind(userController)
);
app.put('/api/admin/users/:id/role',
  authenticate,
  authorize(UserRole.ADMIN),
  auditAdmin(AuditAction.ADMIN_UPDATE_USER_ROLE, 'user'),
  userController.updateUserRole.bind(userController)
);
app.delete('/api/admin/users/:id',
  authenticate,
  authorize(UserRole.ADMIN),
  auditAdmin(AuditAction.ADMIN_DELETE_USER, 'user'),
  userController.deleteUser.bind(userController)
);
}

// 15. Payment endpoints with comprehensive audit logging (Issue #407: re-enabled)
if (AUTH_ENABLED) {
app.post('/api/payment/process',
  ...applyPaymentSecurity,
  auditPayment(AuditAction.PAYMENT_INITIATE),
  processPayment
);
}

// 16. Document upload with audit logging (Issue #407: re-enabled)
if (AUTH_ENABLED) {
app.post('/api/documents/upload',
  apiKeyAuth,
  upload.single('file'),
  auditDocument(AuditAction.DOCUMENT_UPLOAD),
  uploadDocument
);
}

app.post('/api/cache/warmup', async (req, res) => {
  try {
    const { getCacheWarmupService } = await import('./services/cache/CacheWarmupService');
    const warmupService = getCacheWarmupService();
    const stats = await warmupService.runWarmup();
    res.json({ message: 'Cache warmup completed', stats });
  } catch (error) {
    res.status(500).json({ error: 'Failed to run cache warmup' });
  }
});

app.delete('/api/cache/flush', async (req, res) => {
  try {
    const { getCacheManager } = await import('./services/RedisCacheManager');
    const cacheManager = getCacheManager();
    await cacheManager.flush();
    res.json({ message: 'Cache flushed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to flush cache' });
  }
});

/**
 * @openapi
 * /api/analytics/reports:
 *   post:
 *     summary: Generate and save a custom report
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       201:
 *         description: Report created
 */
// Analytics routes (Issue #407: re-enabled)
if (AUTH_ENABLED) {
  app.post('/api/analytics/reports', apiKeyAuth, generateReport);
  app.get('/api/analytics/export', apiKeyAuth, exportData);
}

// 17. Export endpoints (Issue #407: re-enabled)
if (AUTH_ENABLED) {
  app.use('/api/export', exportRoutes);
}

// 18. Centralized Error Handling endpoints
app.get('/api/errors/stats', apiKeyAuth, (req, res) => {
  res.json({ success: true, data: getErrorStats() });
});

app.get('/api/errors/logs', apiKeyAuth, (req, res) => {
  const { limit = '50' } = req.query as { limit?: string };
  res.json({ success: true, data: getErrorLogs(parseInt(limit.toString())) });
});


// Work #120 - Scheduled Payment Routes
app.use('/api/scheduled-payments', scheduledPaymentRoutes);

// Start the scheduled payment cron job
scheduledPaymentService.startScheduler();

// Setup global error handling
setupGlobalErrorHandling(app);

// 19. Centralized error handler as fallback
app.use(errorHandler);

export default app;
