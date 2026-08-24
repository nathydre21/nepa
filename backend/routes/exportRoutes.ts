import { Router } from 'express';
import {
  createExportTask,
  getExportProgress,
  downloadExport,
  getExportTemplates,
  getExportHistory,
  cancelExportTask
} from '../controllers/ExportController';
import { apiKeyAuth } from '../src/config/auth';
import { auditAdmin } from '../middleware/audit';
import { sanitizeInput } from '../middleware/inputSanitization';

const router = Router();

router.use(sanitizeInput);

/**
 * Export routes for data export functionality
 * All routes require API key authentication
 */

// Create new export task
router.post('/create', 
  apiKeyAuth,
  auditAdmin('EXPORT_CREATE', 'export'),
  createExportTask
);

// Get export task progress
router.get('/progress/:taskId',
  apiKeyAuth,
  getExportProgress
);

// Download exported file
router.get('/download/:taskId',
  apiKeyAuth,
  downloadExport
);

// Get export templates and configurations
router.get('/templates',
  apiKeyAuth,
  getExportTemplates
);

// Get export history
router.get('/history',
  apiKeyAuth,
  getExportHistory
);

// Cancel export task
router.delete('/cancel/:taskId',
  apiKeyAuth,
  auditAdmin('EXPORT_CANCEL', 'export'),
  cancelExportTask
);

export default router;
