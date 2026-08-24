import { Router } from 'express';
import { apiKeyAuth } from '../middleware/auth';
import {
  detectFraud,
  getFraudStats,
  getFraudCases,
  getFraudCase,
  updateFraudReview,
  completeFraudReview,
  escalateFraudCase,
  getReviewerWorkload,
  trainFraudModel,
  getFraudAnalytics,
  getFraudAlerts,
  acknowledgeFraudAlert,
} from '../src/fraud/FraudDetectionController';
import { sanitizeInput } from '../middleware/inputSanitization';

const router = Router();

router.use(apiKeyAuth);
router.use(sanitizeInput);

// Real-time fraud scoring (0-100) and pattern analysis
router.post('/detect', detectFraud);

// Manual review workflow
router.get('/stats', getFraudStats);
router.get('/cases', getFraudCases);
router.get('/cases/:caseId', getFraudCase);
router.put('/cases/:caseId/review', updateFraudReview);
router.post('/cases/:caseId/complete', completeFraudReview);
router.post('/cases/:caseId/escalate', escalateFraudCase);
router.get('/reviewers/:reviewerId/workload', getReviewerWorkload);

// Model training and adaptive learning
router.post('/model/train', trainFraudModel);

// Analytics and alerts
router.get('/analytics', getFraudAnalytics);
router.get('/alerts', getFraudAlerts);
router.post('/alerts/:alertId/acknowledge', acknowledgeFraudAlert);

export default router;
