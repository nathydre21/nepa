import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { ddosDetector, checkBlockedIP, ipRestriction, progressiveLimiter } from './middleware/rateLimiter';
import { configureSecurity } from './src/config/security';
import { apiKeyAuth } from './src/config/auth';
import { loggingMiddleware, setupGlobalErrorHandling, errorTracker, logger } from './middleware/logger';
import { errorTracker as abuseDetector } from './middleware/abuseDetection';
import { captureAuditContext, auditRateLimit } from './middleware/auditMiddleware';
import { swaggerSpec, getVersionedSwaggerSpec } from './swagger';
import { upload } from './src/utils/upload';
import { uploadDocument } from './controllers/DocumentController';
import { getDashboardData, generateReport, exportData } from './controllers/AnalyticsController';
import { applyPaymentSecurity, processPayment, getPaymentHistory, validatePayment } from './controllers/PaymentController';
import { setupRateLimitRoutes } from './routes/rateLimitRoutes';
import { advancedRateLimiter } from './middleware/advancedRateLimiter';
import { apiVersioningConfig } from './config/api-versioning';
import auditRoutes from './routes/auditRoutes';
import fraudRoutes from './routes/fraudRoutes';
import cacheRoutes from './routes/cacheRoutes';
import { auditCleanupService } from './services/AuditCleanupService';
import { registerAuditHandlers } from './databases/event-patterns/handlers/auditHandlers';
import EventBus from './databases/event-patterns/EventBus';
import { initializeCacheSystem } from './services/cache/CacheInitializer';

// Mock services for now - replace with actual implementations
const performanceMonitor = {
  getHealthStatus: () => ({ status: 'healthy' }),
  getMemoryUsage: () => ({ heapUsed: 0, heapTotal: 0, external: 0 }),
  getRequestMetrics: (limit: number) => [],
  getCustomMetrics: (limit: number) => []
};

const analyticsService = {
  getAnalyticsData: () => ({ userEvents: [], activeUsers: 0 })
};

const app = express();

// Initialize cache system on startup
initializeCacheSystem().then(result => {
  if (result.success) {
    logger.info('Cache system initialized successfully', {
      initializationTime: result.metrics.initializationTime,
      services: result.services
    });
  } else {
    logger.error('Cache system initialization failed', {
      errors: result.errors,
      warnings: result.warnings
    });
  }
}).catch(error => {
  logger.error('Cache system initialization error:', error);
});

// Initialize logging and monitoring
logger.info('Application starting up', { 
  nodeEnv: process.env.NODE_ENV,
  version: process.env.npm_package_version 
});

// Initialize error tracking if DSN is provided
if (process.env.SENTRY_DSN) {
  errorTracker.initialize({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    release: process.env.npm_package_version
  });
}

// 1. Comprehensive logging middleware (should be first)
app.use(...loggingMiddleware);

// 2. DDoS Protection and IP Blocking
app.use(ddosDetector);
app.use(checkBlockedIP);
app.use(ipRestriction);

// 3. Security Headers & CORS
configureSecurity(app);

// 4. Body Parsing
app.use(express.json({ limit: '10kb' })); // Limit body size for security

// 5. Progressive Rate Limiting
app.use('/api', progressiveLimiter);

// 6. Audit Context Capture (before rate limiting to capture all requests)
app.use('/api', captureAuditContext);

// 7. Advanced Rate Limiting (replaces basic rate limiting)
app.use('/api', advancedRateLimiter);

// 8. Audit rate limit breaches
app.use('/api', auditRateLimit);

// 9. Error tracking for abuse detection
app.use(abuseDetector);

// 10. Setup rate limiting routes
setupRateLimitRoutes(app);

// 11. Audit Routes
app.use('/api/audit', auditRoutes);

// 11b. Fraud detection API (ML scoring 0-100, manual review workflow, adaptive learning)
app.use('/api/fraud', fraudRoutes);

// 12. API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api-docs/v1', swaggerUi.serve, swaggerUi.setup(getVersionedSwaggerSpec('v1')));
app.use('/api-docs/v2', swaggerUi.serve, swaggerUi.setup(getVersionedSwaggerSpec('v2')));

// 11. Enhanced Health Check
app.get('/health', (req, res) => {
  const healthStatus = performanceMonitor.getHealthStatus();
  const memoryUsage = performanceMonitor.getMemoryUsage();
  
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    performance: healthStatus,
    memory: {
      used: memoryUsage.heapUsed,
      total: memoryUsage.heapTotal,
      external: memoryUsage.external
    },
    analytics: {
      totalEvents: analyticsService.getAnalyticsData().userEvents.length,
      activeUsers: analyticsService.getAnalyticsData().activeUsers
    }
  });
});

// 10. Monitoring endpoints (unversioned)
app.get('/api/monitoring/metrics', apiKeyAuth, (req, res) => {
  const analytics = analyticsService.getAnalyticsData();
  const performance = performanceMonitor.getHealthStatus();

  res.json({
    analytics,
    performance,
    requestMetrics: performanceMonitor.getRequestMetrics(100),
    customMetrics: performanceMonitor.getCustomMetrics(100)
  });
});

// 11. API version discovery (no auth required for discovery)
app.get('/api/versions', (_req, res) => {
  res.json({
    defaultVersion: apiVersioningConfig.defaultVersion,
    latestVersion: apiVersioningConfig.latestVersion,
    supportedVersions: apiVersioningConfig.supportedVersions,
    lifecycle: apiVersioningConfig.lifecycle,
  });
});

// Document Upload Route
/**
 * @openapi
 * /api/documents/upload:
 *   post:
 *     summary: Upload a document
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               userId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Document uploaded successfully
 */
app.post('/api/documents/upload', apiKeyAuth, upload.single('file'), uploadDocument);

// Analytics Routes
/**
 * @openapi
 * /api/analytics/dashboard:
 *   get:
 *     summary: Get analytics dashboard data
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Dashboard data retrieved
 */
app.get('/api/analytics/dashboard', apiKeyAuth, getDashboardData);

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
app.post('/api/analytics/reports', apiKeyAuth, generateReport);

// Export Route
app.get('/api/analytics/export', apiKeyAuth, exportData);

// Initialize audit system
const initializeAuditSystem = async () => {
  try {
    // Register audit event handlers (EventBus default export is the singleton instance)
    registerAuditHandlers(EventBus);
    
    // Start audit cleanup service
    auditCleanupService.start();
    
    logger.info('Audit system initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize audit system:', {
      error: error instanceof Error ? error : new Error(String(error))
    });
  }
};

// Initialize audit system on startup
initializeAuditSystem();

// Cache Management Routes (Admin only)
app.use('/api/cache', cacheRoutes);

export default app;