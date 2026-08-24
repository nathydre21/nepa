import { Router } from 'express';
import {
  startExport,
  getExportProgress,
  getAllExports,
  downloadExport,
  cleanupExports,
  getExportTemplates
} from '../controllers/ExportController';
import { authenticateToken } from '../middleware/auth';
import { exportLimiter, downloadLimiter } from '../middleware/comprehensiveRateLimiter';
import { sanitizeInput } from '../middleware/inputSanitization';

const router = Router();

// Apply authentication to all export routes
router.use(authenticateToken);
router.use(sanitizeInput);

// Export routes
router.post('/', exportLimiter, startExport);
router.get('/progress/:exportId', getExportProgress);
router.get('/progress', getAllExports);
router.get('/templates', getExportTemplates);
router.get('/download/:exportId', downloadLimiter, downloadExport);
router.post('/cleanup', cleanupExports);

export default router;
