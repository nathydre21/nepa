import { Router } from 'express';
import { AuditController } from '../controllers/AuditController';
import { authenticate, authorize } from '../middleware/authentication';
import { captureAuditContext, auditSensitiveOperations } from '../middleware/auditMiddleware';
import { AuditAction, AuditSeverity } from '../services/AuditService';
import { sanitizeInput } from '../middleware/inputSanitization';

const router = Router();

// Apply authentication and audit context to all routes
router.use(authenticate);
router.use(captureAuditContext);
router.use(sanitizeInput);

/**
 * @openapi
 * /api/audit/logs:
 *   get:
 *     summary: Search audit logs
 *     tags: [Audit]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Filter by audit action
 *       - in: query
 *         name: resource
 *         schema:
 *           type: string
 *         description: Filter by resource type
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for filtering
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for filtering
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 1000
 *           default: 100
 *         description: Number of records to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of records to skip
 *     responses:
 *       200:
 *         description: Audit logs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AuditLog'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *                     hasMore:
 *                       type: boolean
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.get('/logs', 
  authorize(['ADMIN', 'SUPER_ADMIN']),
  auditSensitiveOperations(AuditAction.ADMIN_VIEW_USER_DATA, 'audit', {
    severity: AuditSeverity.MEDIUM,
    getDescription: () => 'Admin accessed audit logs'
  }),
  AuditController.searchLogs
);

/**
 * @openapi
 * /api/audit/users/{userId}/timeline:
 *   get:
 *     summary: Get user activity timeline
 *     tags: [Audit]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for timeline
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for timeline
 *     responses:
 *       200:
 *         description: User timeline retrieved successfully
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.get('/users/:userId/timeline',
  authorize(['ADMIN', 'SUPER_ADMIN', 'USER']),
  auditSensitiveOperations(AuditAction.ADMIN_VIEW_USER_DATA, 'user', {
    severity: AuditSeverity.MEDIUM,
    getResourceId: (req) => req.params.userId,
    getDescription: (req) => `Accessed user activity timeline for ${req.params.userId}`
  }),
  AuditController.getUserTimeline
);

/**
 * @openapi
 * /api/audit/reports/compliance:
 *   post:
 *     summary: Generate compliance report
 *     tags: [Audit]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reportType
 *               - startDate
 *               - endDate
 *             properties:
 *               reportType:
 *                 type: string
 *                 enum: [SOC2, PCI_DSS, GDPR, HIPAA, CUSTOM]
 *                 description: Type of compliance report
 *               startDate:
 *                 type: string
 *                 format: date-time
 *                 description: Report start date
 *               endDate:
 *                 type: string
 *                 format: date-time
 *                 description: Report end date
 *               includeUserActions:
 *                 type: boolean
 *                 default: true
 *                 description: Include user actions in report
 *               includeAdminActions:
 *                 type: boolean
 *                 default: true
 *                 description: Include admin actions in report
 *               includeSystemEvents:
 *                 type: boolean
 *                 default: true
 *                 description: Include system events in report
 *               includeFailures:
 *                 type: boolean
 *                 default: true
 *                 description: Include failed operations in report
 *               resourceTypes:
 *                 type: string
 *                 description: Comma-separated list of resource types to include
 *     responses:
 *       200:
 *         description: Compliance report generated successfully
 *       400:
 *         description: Invalid request parameters
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.post('/reports/compliance',
  authorize(['ADMIN', 'SUPER_ADMIN']),
  auditSensitiveOperations(AuditAction.ADMIN_EXPORT_DATA, 'audit', {
    severity: AuditSeverity.HIGH,
    captureBody: true,
    getDescription: (req) => `Generated ${req.body.reportType} compliance report`
  }),
  AuditController.generateComplianceReport
);

/**
 * @openapi
 * /api/audit/stats:
 *   get:
 *     summary: Get audit statistics
 *     tags: [Audit]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [1d, 7d, 30d, 90d]
 *           default: 7d
 *         description: Time period for statistics
 *     responses:
 *       200:
 *         description: Audit statistics retrieved successfully
 *       400:
 *         description: Invalid period parameter
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.get('/stats',
  authorize(['ADMIN', 'SUPER_ADMIN']),
  auditSensitiveOperations(AuditAction.ADMIN_VIEW_USER_DATA, 'audit', {
    severity: AuditSeverity.LOW,
    getDescription: (req) => `Accessed audit statistics for period ${req.query.period || '7d'}`
  }),
  AuditController.getAuditStats
);

/**
 * @openapi
 * /api/audit/export:
 *   get:
 *     summary: Export audit logs
 *     tags: [Audit]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv]
 *           default: json
 *         description: Export format
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for export
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for export
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Filter by audit action
 *       - in: query
 *         name: resource
 *         schema:
 *           type: string
 *         description: Filter by resource type
 *     responses:
 *       200:
 *         description: Audit logs exported successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *           text/csv:
 *             schema:
 *               type: string
 *       400:
 *         description: Invalid parameters
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.get('/export',
  authorize(['ADMIN', 'SUPER_ADMIN']),
  auditSensitiveOperations(AuditAction.ADMIN_EXPORT_DATA, 'audit', {
    severity: AuditSeverity.HIGH,
    getDescription: (req) => `Exported audit logs in ${req.query.format || 'json'} format`
  }),
  AuditController.exportLogs
);

export default router;