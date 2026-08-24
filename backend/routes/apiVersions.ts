/**
 * Versioned API route registration.
 * v1 and v2 share the same handlers for backward compatibility; v2 can diverge later.
 */

import { Router } from 'express';
import { apiKeyAuth } from '../middleware/auth';
import { authenticate, authorize } from '../middleware/authentication';
import { authLimiter } from '../middleware/rateLimiter';
import { upload } from '../middleware/upload';
import { AuthenticationController } from '../controllers/AuthenticationController';
import { UserController } from '../controllers/UserController';
import { uploadDocument } from '../controllers/DocumentController';
import { getDashboardData, generateReport, exportData } from '../controllers/AnalyticsController';
import { applyPaymentSecurity, processPayment, getPaymentHistory, validatePayment } from '../controllers/PaymentController';
import { UserRole } from '@prisma/client';
import { sanitizeInput } from '../middleware/inputSanitization';

const authController = new AuthenticationController();
const userController = new UserController();

function registerV1Routes(router: Router): void {
  router.use(apiKeyAuth);
  router.use(sanitizeInput);

  router.post('/auth/register', authLimiter, authController.register.bind(authController));
  router.post('/auth/login', authLimiter, authController.login.bind(authController));
  router.post('/auth/wallet', authLimiter, authController.loginWithWallet.bind(authController));
  router.post('/auth/refresh', authLimiter, authController.refreshToken.bind(authController));
  router.post('/auth/logout', authenticate, authController.logout.bind(authController));

  router.get('/user/profile', authenticate, authController.getProfile.bind(authController));
  router.put('/user/profile', authenticate, userController.updateProfile.bind(userController));
  router.get('/user/preferences', authenticate, userController.getPreferences.bind(userController));
  router.put('/user/preferences', authenticate, userController.updatePreferences.bind(userController));
  router.post('/user/change-password', authenticate, userController.changePassword.bind(userController));

  router.post('/user/2fa/enable', authenticate, authController.enableTwoFactor.bind(authController));
  router.post('/user/2fa/verify', authenticate, authController.verifyTwoFactor.bind(authController));

  router.get('/user/sessions', authenticate, userController.getUserSessions.bind(userController));
  router.delete('/user/sessions/:sessionId', authenticate, userController.revokeSession.bind(userController));

  router.get('/admin/users', authenticate, authorize(UserRole.ADMIN), userController.getAllUsers.bind(userController));
  router.get('/admin/users/:id', authenticate, authorize(UserRole.ADMIN), userController.getUserById.bind(userController));
  router.put('/admin/users/:id/role', authenticate, authorize(UserRole.ADMIN), userController.updateUserRole.bind(userController));
  router.delete('/admin/users/:id', authenticate, authorize(UserRole.ADMIN), userController.deleteUser.bind(userController));

  router.post('/payment/process', ...applyPaymentSecurity, processPayment);
  router.get('/payment/history', apiKeyAuth, getPaymentHistory);
  router.post('/payment/validate', ...applyPaymentSecurity, validatePayment);

  router.get('/test', (_req, res) => res.json({ message: 'Authenticated access successful', version: 'v1' }));

  router.post('/documents/upload', apiKeyAuth, upload.single('file'), uploadDocument);

  router.get('/analytics/dashboard', apiKeyAuth, getDashboardData);
  router.post('/analytics/reports', apiKeyAuth, generateReport);
  router.get('/analytics/export', apiKeyAuth, exportData);
}

function registerV2Routes(router: Router): void {
  registerV1Routes(router);
  router.get('/test', (_req, res) => res.json({ message: 'Authenticated access successful', version: 'v2' }));
}

export function createV1Router(): Router {
  const router = Router();
  registerV1Routes(router);
  return router;
}

export function createV2Router(): Router {
  const router = Router();
  registerV2Routes(router);
  return router;
}
