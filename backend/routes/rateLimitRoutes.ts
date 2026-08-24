import { Request, Response, NextFunction } from 'express';
import { 
  advancedRateLimiter, 
  burstHandler, 
  roleBasedRateLimiter,
  rateLimitAnalyticsHandler,
  breachHistoryHandler,
  userProfileHandler,
  apiKeyRateLimiter
} from '../middleware/advancedRateLimiter';
import {
  globalApiLimiter,
  strictApiLimiter,
  paymentEndpointLimiter,
  authEndpointLimiter,
  userBasedRateLimiter,
  ipBasedRateLimiter,
  progressiveRateLimiter,
  rateLimitBreachMonitor,
  getRateLimitAnalytics as getComprehensiveAnalytics,
  scheduledPaymentLimiter,
  webhookLimiter,
  fileUploadLimiter,
  exportLimiter,
  downloadLimiter
} from '../middleware/comprehensiveRateLimiter';
import { 
  getRateLimitAnalytics,
  getBreachHistory,
  getUserRateLimitProfile,
  getAnyUserRateLimitProfile,
  updateUserRateLimitProfile,
  checkRateLimit,
  getRateLimitTiers,
  getRateLimitRules,
  generateAPIKey,
  getUserAPIKeys,
  getAPIKeyDetails,
  revokeAPIKey,
  getAPIKeyUsage,
  getBlockedIPs,
  blockIP,
  unblockIP,
  whitelistIP,
  getNotificationPreferences,
  updateNotificationPreferences,
  getBreachHistory as getBreachHistoryController
} from '../controllers/RateLimitController';
import { authenticate, authorize } from '../middleware/authentication';
import { UserRole } from '../types/rateLimit';
import { apiKeyAuth } from '../src/config/auth';

export function setupRateLimitRoutes(app: any) {
  // Apply advanced rate limiting to all API routes
  app.use('/api', advancedRateLimiter);
  app.use('/api', burstHandler);
  app.use('/api', apiKeyRateLimiter);

  // Apply comprehensive rate limiting middleware
  app.use('/api', ipBasedRateLimiter);
  app.use('/api', userBasedRateLimiter);
  app.use('/api', rateLimitBreachMonitor);

  // Apply specific rate limiters to endpoints
  app.use('/api/auth', authEndpointLimiter);
  app.use('/api/payment', paymentEndpointLimiter);
  app.use('/api/scheduled-payments', scheduledPaymentLimiter);
  app.use('/api/webhook', webhookLimiter);
  app.use('/api/documents/upload', fileUploadLimiter);
  app.use('/api/export', exportLimiter);
  app.use('/api/export/download', downloadLimiter);
  app.use('/api', strictApiLimiter);

  // Rate limiting analytics endpoints
  app.get('/api/rate-limit/analytics', apiKeyAuth, rateLimitAnalyticsHandler);
  app.get('/api/rate-limit/breaches', apiKeyAuth, breachHistoryHandler);

  // User profile management endpoints
  app.get('/api/rate-limit/profile', authenticate, getUserRateLimitProfile);
  app.get('/api/rate-limit/profile/:userId', authenticate, authorize(UserRole.ADMIN), getAnyUserRateLimitProfile);
  app.put('/api/rate-limit/profile/:userId', authenticate, authorize(UserRole.ADMIN), updateUserRateLimitProfile);

  // Rate limit checking endpoint
  app.post('/api/rate-limit/check', apiKeyAuth, checkRateLimit);

  // Configuration endpoints
  app.get('/api/rate-limit/tiers', apiKeyAuth, getRateLimitTiers);
  app.get('/api/rate-limit/rules', apiKeyAuth, getRateLimitRules);

  /**
   * API Key Management Routes
   */
  app.post('/api/rate-limit/api-keys/generate', authenticate, generateAPIKey);
  app.get('/api/rate-limit/api-keys', authenticate, getUserAPIKeys);
  app.get('/api/rate-limit/api-keys/:keyId', authenticate, getAPIKeyDetails);
  app.post('/api/rate-limit/api-keys/:keyId/revoke', authenticate, revokeAPIKey);
  app.get('/api/rate-limit/api-keys/:keyId/usage', authenticate, getAPIKeyUsage);

  /**
   * IP Blocking Management Routes
   */
  app.get('/api/rate-limit/ip-blocking/blocked', authenticate, authorize(UserRole.ADMIN), getBlockedIPs);
  app.post('/api/rate-limit/ip-blocking/block', authenticate, authorize(UserRole.ADMIN), blockIP);
  app.post('/api/rate-limit/ip-blocking/unblock', authenticate, authorize(UserRole.ADMIN), unblockIP);
  app.post('/api/rate-limit/ip-blocking/whitelist', authenticate, authorize(UserRole.ADMIN), whitelistIP);

  /**
   * Breach Notification Routes
   */
  app.get('/api/rate-limit/notifications/preferences', authenticate, getNotificationPreferences);
  app.post('/api/rate-limit/notifications/preferences', authenticate, updateNotificationPreferences);
  app.get('/api/rate-limit/breach-history', authenticate, getBreachHistoryController);

  // Role-specific rate limiting examples
  app.get('/api/admin/protected', authenticate, roleBasedRateLimiter(UserRole.ADMIN), (req: any, res: any) => {
    res.json({ message: 'Admin-only endpoint with role-based rate limiting' });
  });

  app.get('/api/premium/feature', authenticate, roleBasedRateLimiter(), (req: any, res: any) => {
    res.json({ message: 'Premium feature with enhanced rate limiting' });
  });
}
