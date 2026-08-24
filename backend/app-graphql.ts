import express from 'express';
import { GraphQLServer } from './src/graphql';
import swaggerUi from 'swagger-ui-express';
import { apiLimiter, ddosDetector, checkBlockedIP, ipRestriction, progressiveLimiter, authLimiter } from './middleware/rateLimiter';
import { configureSecurity } from './middleware/security';
import { apiKeyAuth } from './src/config/auth';
import { authenticate, authorize } from './middleware/authentication';
import { loggingMiddleware, setupGlobalErrorHandling, errorTracker } from './middleware/logger';
import { swaggerSpec } from './swagger';
import { upload } from './middleware/upload';
import { uploadDocument } from './controllers/DocumentController';
import { getDashboardData, generateReport, exportData } from './controllers/AnalyticsController';
import { applyPaymentSecurity, processPayment, getPaymentHistory, validatePayment } from './controllers/PaymentController';
import { setupRateLimitRoutes } from './routes/rateLimitRoutes';
import { sanitizeInput } from './middleware/inputSanitization';

const app = express();

// Initialize logging and monitoring
logger.info('GraphQL Application starting up', { 
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

// Initialize GraphQL Server
const graphqlServer = new GraphQLServer(app);

// Initialize controllers
const authController = new AuthenticationController();
const userController = new UserController();

// 1. Comprehensive logging middleware (should be first)
app.use(...loggingMiddleware);

// 2. DDoS Protection and IP Blocking
app.use(ddosDetector);
app.use(checkBlockedIP);
app.use(ipRestriction);

// 3. Security Headers & CORS
configureSecurity(app);

// 4. Body Parsing
app.use(express.json({ limit: '10kb' }));

// 5. Input Sanitization
app.use('/api', sanitizeInput);

// 6. Progressive Rate Limiting
app.use('/api', progressiveLimiter);

// 6. Advanced Rate Limiting
app.use('/api', apiLimiter);

// 7. Error tracking for abuse detection
app.use(abuseDetector);

// 8. Setup rate limiting routes
setupRateLimitRoutes(app);

// 9. API Documentation (REST endpoints still available)
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 10. Enhanced Health Check
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
    graphql: {
      status: 'ACTIVE',
      endpoint: '/graphql',
      subscriptions: 'ENABLED'
    },
    analytics: {
      totalEvents: analyticsService.getAnalyticsData().userEvents.length,
      activeUsers: analyticsService.getAnalyticsData().activeUsers
    }
  });
});

// 11. Monitoring endpoints
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

// 12. Protected API Routes (REST endpoints still available for backward compatibility)
app.use('/api', apiKeyAuth);

// Authentication endpoints with stricter rate limiting
app.post('/api/auth/register', authLimiter, authController.register.bind(authController));
app.post('/api/auth/login', authLimiter, authController.login.bind(authController));
app.post('/api/auth/wallet', authLimiter, authController.loginWithWallet.bind(authController));
app.post('/api/auth/refresh', authLimiter, authController.refreshToken.bind(authController));
app.post('/api/auth/logout', authenticate, authController.logout.bind(authController));

// User profile endpoints
app.get('/api/user/profile', authenticate, authController.getProfile.bind(authController));
app.put('/api/user/profile', authenticate, userController.updateProfile.bind(userController));
app.get('/api/user/preferences', authenticate, userController.getPreferences.bind(userController));
app.put('/api/user/preferences', authenticate, userController.updatePreferences.bind(userController));
app.post('/api/user/change-password', authenticate, userController.changePassword.bind(userController));

// Two-factor authentication endpoints
app.post('/api/user/2fa/enable', authenticate, authController.enableTwoFactor.bind(authController));
app.post('/api/user/2fa/verify', authenticate, authController.verifyTwoFactor.bind(authController));

// User sessions
app.get('/api/user/sessions', authenticate, userController.getUserSessions.bind(userController));
app.delete('/api/user/sessions/:sessionId', authenticate, userController.revokeSession.bind(userController));

// Admin user management endpoints
app.get('/api/admin/users', authenticate, authorize(UserRole.ADMIN), userController.getAllUsers.bind(userController));
app.get('/api/admin/users/:id', authenticate, authorize(UserRole.ADMIN), userController.getUserById.bind(userController));
app.put('/api/admin/users/:id/role', authenticate, authorize(UserRole.ADMIN), userController.updateUserRole.bind(userController));
app.delete('/api/admin/users/:id', authenticate, authorize(UserRole.ADMIN), userController.deleteUser.bind(userController));

// Payment endpoints with enhanced security
app.post('/api/payment/process', ...applyPaymentSecurity, processPayment);
app.get('/api/payment/history', apiKeyAuth, getPaymentHistory);
app.post('/api/payment/validate', ...applyPaymentSecurity, validatePayment);

// Document Upload Route
app.post('/api/documents/upload', apiKeyAuth, upload.single('file'), uploadDocument);

// Analytics Routes
app.get('/api/analytics/dashboard', apiKeyAuth, getDashboardData);
app.post('/api/analytics/reports', apiKeyAuth, generateReport);
app.get('/api/analytics/export', apiKeyAuth, exportData);

// 13. Start GraphQL Server
async function startServer() {
  try {
    await graphqlServer.start();
    
    const httpServer = graphqlServer.getHttpServer();
    const PORT = process.env.PORT || 4000;
    
    httpServer.listen(PORT, () => {
      logger.info(`🚀 GraphQL Server ready at http://localhost:${PORT}/graphql`);
      logger.info(`📊 GraphQL Playground available at http://localhost:${PORT}/graphql`);
      logger.info(`📚 REST API Documentation at http://localhost:${PORT}/api-docs`);
      logger.info(`🏥 Health check at http://localhost:${PORT}/health`);
    });
    
    // Setup global error handling
    setupGlobalErrorHandling(app);
    
  } catch (error) {
    logger.error('Failed to start GraphQL server', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await graphqlServer.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await graphqlServer.stop();
  process.exit(0);
});

// Start the server
startServer().catch((error) => {
  logger.error('Failed to start application', { error: error.message });
  process.exit(1);
});

export default app;
