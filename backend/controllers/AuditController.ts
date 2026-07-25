import { Request, Response } from 'express';
import { auditService, AuditSearchFilters, ComplianceReportOptions, AuditAction, AuditSeverity, AuditStatus } from '../services/AuditService';
import { logger } from '../services/logger';
import { authorize } from '../middleware/authentication';
import { errorResponse } from '../utils/errorResponse';

export class AuditController {
  /**
   * Search audit logs
   * GET /api/audit/logs
   */
  static async searchLogs(req: Request, res: Response): Promise<void> {
    try {
      const {
        userId,
        adminId,
        action,
        resource,
        resourceId,
        severity,
        status,
        startDate,
        endDate,
        ipAddress,
        correlationId,
        limit = 100,
        offset = 0
      } = req.query;

      // Validate permissions - only admins can search all logs
      const currentUser = (req as any).user;
      const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN';
      
      const filters: AuditSearchFilters = {
        limit: Math.min(parseInt(limit as string) || 100, 1000), // Max 1000 records
        offset: parseInt(offset as string) || 0
      };

      // Non-admin users can only see their own logs
      if (!isAdmin) {
        filters.userId = currentUser.id;
      } else {
        if (userId) filters.userId = userId as string;
        if (adminId) filters.adminId = adminId as string;
      }

      if (action) filters.action = action as AuditAction;
      if (resource) filters.resource = resource as string;
      if (resourceId) filters.resourceId = resourceId as string;
      if (severity) filters.severity = severity as AuditSeverity;
      if (status) filters.status = status as AuditStatus;
      if (ipAddress) filters.ipAddress = ipAddress as string;
      if (correlationId) filters.correlationId = correlationId as string;

      if (startDate) {
        filters.startDate = new Date(startDate as string);
        if (isNaN(filters.startDate.getTime())) {
          errorResponse(res, 400, 'Invalid startDate format');
          return;
        }
      }

      if (endDate) {
        filters.endDate = new Date(endDate as string);
        if (isNaN(filters.endDate.getTime())) {
          errorResponse(res, 400, 'Invalid endDate format');
          return;
        }
      }

      const result = await auditService.searchAuditLogs(filters);

      res.status(200).json({
        success: true,
        data: result.logs,
        pagination: {
          total: result.total,
          limit: filters.limit,
          offset: filters.offset,
          hasMore: result.hasMore
        }
      });

    } catch (error) {
      logger.error('Failed to search audit logs:', error);
      errorResponse(res, 500, 'Failed to search audit logs');
    }
  }

  /**
   * Get user activity timeline
   * GET /api/audit/users/:userId/timeline
   */
  static async getUserTimeline(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { startDate, endDate } = req.query;

      // Validate permissions
      const currentUser = (req as any).user;
      const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN';
      
      if (!isAdmin && currentUser.id !== userId) {
        errorResponse(res, 403, 'Insufficient permissions to view user timeline');
        return;
      }

      let start: Date | undefined;
      let end: Date | undefined;

      if (startDate) {
        start = new Date(startDate as string);
        if (isNaN(start.getTime())) {
          errorResponse(res, 400, 'Invalid startDate format');
          return;
        }
      }

      if (endDate) {
        end = new Date(endDate as string);
        if (isNaN(end.getTime())) {
          errorResponse(res, 400, 'Invalid endDate format');
          return;
        }
      }

      const timeline = await auditService.getUserActivityTimeline(userId, start, end);

      res.status(200).json({
        success: true,
        data: timeline
      });

    } catch (error) {
      logger.error('Failed to get user timeline:', error);
      errorResponse(res, 500, 'Failed to get user timeline');
    }
  }

  /**
   * Generate compliance report
   * POST /api/audit/reports/compliance
   */
  static async generateComplianceReport(req: Request, res: Response): Promise<void> {
    try {
      const {
        reportType,
        startDate,
        endDate,
        includeUserActions = true,
        includeAdminActions = true,
        includeSystemEvents = true,
        includeFailures = true,
        resourceTypes
      } = req.body;

      // Validate required fields
      if (!reportType || !startDate || !endDate) {
        errorResponse(res, 400, 'reportType, startDate, and endDate are required');
        return;
      }

      // Validate dates
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        errorResponse(res, 400, 'Invalid date format');
        return;
      }

      if (start >= end) {
        errorResponse(res, 400, 'startDate must be before endDate');
        return;
      }

      // Validate date range (max 1 year)
      const maxRange = 365 * 24 * 60 * 60 * 1000; // 1 year in milliseconds
      if (end.getTime() - start.getTime() > maxRange) {
        errorResponse(res, 400, 'Date range cannot exceed 1 year');
        return;
      }

      const currentUser = (req as any).user;
      const options: ComplianceReportOptions = {
        reportType,
        startDate: start,
        endDate: end,
        includeUserActions,
        includeAdminActions,
        includeSystemEvents,
        includeFailures,
        resourceTypes: resourceTypes ? resourceTypes.split(',') : undefined
      };

      const report = await auditService.generateComplianceReport(options, currentUser.id);

      res.status(200).json({
        success: true,
        data: report
      });

    } catch (error) {
      logger.error('Failed to generate compliance report:', error);
      errorResponse(res, 500, 'Failed to generate compliance report');
    }
  }

  /**
   * Get audit statistics
   * GET /api/audit/stats
   */
  static async getAuditStats(req: Request, res: Response): Promise<void> {
    try {
      const { period = '7d' } = req.query;

      // Calculate date range based on period
      const endDate = new Date();
      const startDate = new Date();

      switch (period) {
        case '1d':
          startDate.setDate(startDate.getDate() - 1);
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        default:
          errorResponse(res, 400, 'Invalid period. Use 1d, 7d, 30d, or 90d');
          return;
      }

      const filters: AuditSearchFilters = {
        startDate,
        endDate,
        limit: 10000 // High limit for stats
      };

      const result = await auditService.searchAuditLogs(filters);

      // Calculate statistics
      const stats = {
        totalEvents: result.total,
        period,
        eventsByAction: {},
        eventsByResource: {},
        eventsBySeverity: {},
        eventsByStatus: {},
        topUsers: {},
        recentEvents: result.logs.slice(0, 10) // Last 10 events
      };

      // Group events by various dimensions
      result.logs.forEach(log => {
        // By action
        stats.eventsByAction[log.action] = (stats.eventsByAction[log.action] || 0) + 1;
        
        // By resource
        stats.eventsByResource[log.resource] = (stats.eventsByResource[log.resource] || 0) + 1;
        
        // By severity
        stats.eventsBySeverity[log.severity] = (stats.eventsBySeverity[log.severity] || 0) + 1;
        
        // By status
        stats.eventsByStatus[log.status] = (stats.eventsByStatus[log.status] || 0) + 1;
        
        // By user
        if (log.userId) {
          stats.topUsers[log.userId] = (stats.topUsers[log.userId] || 0) + 1;
        }
      });

      // Convert topUsers to sorted array
      const topUsersArray = Object.entries(stats.topUsers)
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .slice(0, 10)
        .map(([userId, count]) => ({ userId, count }));

      stats.topUsers = topUsersArray;

      res.status(200).json({
        success: true,
        data: stats
      });

    } catch (error) {
      logger.error('Failed to get audit stats:', error);
      errorResponse(res, 500, 'Failed to get audit stats');
    }
  }

  /**
   * Export audit logs
   * GET /api/audit/export
   */
  static async exportLogs(req: Request, res: Response): Promise<void> {
    try {
      const {
        format = 'json',
        startDate,
        endDate,
        userId,
        action,
        resource
      } = req.query;

      if (!['json', 'csv'].includes(format as string)) {
        errorResponse(res, 400, 'Invalid format. Use json or csv');
        return;
      }

      const filters: AuditSearchFilters = {
        limit: 10000 // Max export limit
      };

      if (startDate) {
        filters.startDate = new Date(startDate as string);
        if (isNaN(filters.startDate.getTime())) {
          errorResponse(res, 400, 'Invalid startDate format');
          return;
        }
      }

      if (endDate) {
        filters.endDate = new Date(endDate as string);
        if (isNaN(filters.endDate.getTime())) {
          errorResponse(res, 400, 'Invalid endDate format');
          return;
        }
      }

      if (userId) filters.userId = userId as string;
      if (action) filters.action = action as AuditAction;
      if (resource) filters.resource = resource as string;

      const result = await auditService.searchAuditLogs(filters);

      if (format === 'csv') {
        // Convert to CSV
        const csvHeaders = [
          'ID', 'Timestamp', 'User ID', 'Action', 'Resource', 'Resource ID',
          'Status', 'Severity', 'IP Address', 'Description'
        ];

        const csvRows = result.logs.map(log => [
          log.id,
          log.createdAt.toISOString(),
          log.userId || '',
          log.action,
          log.resource,
          log.resourceId || '',
          log.status,
          log.severity,
          log.ipAddress || '',
          log.description || ''
        ]);

        const csvContent = [csvHeaders, ...csvRows]
          .map(row => row.map(field => `"${field}"`).join(','))
          .join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${Date.now()}.csv"`);
        res.send(csvContent);
      } else {
        // JSON format
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${Date.now()}.json"`);
        res.json({
          exportedAt: new Date().toISOString(),
          totalRecords: result.total,
          filters,
          data: result.logs
        });
      }

    } catch (error) {
      logger.error('Failed to export audit logs:', error);
      errorResponse(res, 500, 'Failed to export audit logs');
    }
  }
}

// Apply admin authorization to all audit endpoints
export const auditRoutes = [
  {
    path: '/api/audit/logs',
    method: 'get',
    handler: [authorize(['ADMIN', 'SUPER_ADMIN']), AuditController.searchLogs]
  },
  {
    path: '/api/audit/users/:userId/timeline',
    method: 'get',
    handler: [authorize(['ADMIN', 'SUPER_ADMIN', 'USER']), AuditController.getUserTimeline]
  },
  {
    path: '/api/audit/reports/compliance',
    method: 'post',
    handler: [authorize(['ADMIN', 'SUPER_ADMIN']), AuditController.generateComplianceReport]
  },
  {
    path: '/api/audit/stats',
    method: 'get',
    handler: [authorize(['ADMIN', 'SUPER_ADMIN']), AuditController.getAuditStats]
  },
  {
    path: '/api/audit/export',
    method: 'get',
    handler: [authorize(['ADMIN', 'SUPER_ADMIN']), AuditController.exportLogs]
  }
];