import { Router } from 'express';
import { authenticate } from '../middleware/authentication';
import { verifyWebhookSignature } from '../middleware/webhookSecurity';
import { WebhookController } from '../controllers/WebhookController';
import { WebhookManagementController, WebhookTestingController } from '../controllers/WebhookManagementController';

const router = Router();

// Incoming webhook delivery receiver. Authenticated via HMAC signature
// (verifyWebhookSignature) rather than a user session — external senders
// don't have a user JWT — so this is registered before the `authenticate`
// gate below and is intentionally exempt from it.
router.post('/:webhookId/receive', verifyWebhookSignature, WebhookController.receiveWebhook);

// Everything past this point is first-party API for managing a user's own
// webhooks; ownership is enforced in the controllers via req.user.id.
router.use(authenticate);

router.get('/', WebhookController.getUserWebhooks);
router.post('/', WebhookController.registerWebhook);

// Admin/dashboard routes. The literal paths below must be registered
// before the generic '/admin/:webhookId' route, or Express would match
// e.g. '/admin/failed-deliveries' as getWebhookDetails({ webhookId:
// 'failed-deliveries' }) instead of getFailedDeliveries.
router.get('/admin/dashboard', WebhookManagementController.getDashboard);
router.get('/admin/reports/performance', WebhookManagementController.getPerformanceReport);
router.get('/admin/failed-deliveries', WebhookManagementController.getFailedDeliveries);
router.post('/admin/bulk-retry', WebhookManagementController.bulkRetryFailedEvents);
router.get('/admin/export', WebhookManagementController.exportWebhookData);
router.get('/admin/analytics', WebhookManagementController.getAnalytics);
router.get('/admin/:webhookId', WebhookManagementController.getWebhookDetails);

// Testing/debug utility routes
router.post('/testing/create-event', WebhookTestingController.createTestEvent);
router.get('/testing/history/:webhookId', WebhookTestingController.getTestHistory);
router.post('/testing/test-with-payload', WebhookTestingController.testWithPayload);
router.get('/testing/debug/:eventId', WebhookTestingController.debugDeliveryAttempt);

// Per-webhook resource routes
router.put('/:webhookId', WebhookController.updateWebhook);
router.delete('/:webhookId', WebhookController.deleteWebhook);
router.get('/:webhookId/events', WebhookController.getWebhookEvents);
router.get('/:webhookId/stats', WebhookController.getWebhookStats);
router.post('/:webhookId/test', WebhookController.testWebhook);
router.post('/:webhookId/events/:eventId/retry', WebhookController.retryWebhookEvent);
router.get('/:webhookId/logs', WebhookController.getWebhookLogs);

export default router;
