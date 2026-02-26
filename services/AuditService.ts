import auditClient from '../databases/clients/auditClient';
import { logger } from './logger';

function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

// Optional imports - will be handled gracefully if not available
let rTracer: any;
let uuidv4: any;

try {
  rTracer = require('cls-rtracer');
} catch (error) {
  logger.debug('cls-rtracer not available');
}

try {
  const uuid = require('uuid');
  uuidv4 = uuid.v4;
} catch (error) {
  logger.debug('uuid not available');
  uuidv4 = () => Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Define audit enums locally since we can't import from Prisma schema directly
export enum AuditAction {
  // User Actions
  USER_REGISTER = 'USER_REGISTER',
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
  USER_UPDATE_PROFILE = 'USER_UPDATE_PROFILE',
  USER_CHANGE_PASSWORD = 'USER_CHANGE_PASSWORD',
  USER_ENABLE_2FA = 'USER_ENABLE_2FA',
  USER_DISABLE_2FA = 'USER_DISABLE_2FA',
  USER_VERIFY_EMAIL = 'USER_VERIFY_EMAIL',
  USER_RESET_PASSWORD = 'USER_RESET_PASSWORD',
  USER_REVOKE_SESSION = 'USER_REVOKE_SESSION',
  USER_UPDATE_WALLET = 'USER_UPDATE_WALLET',
  
  // Admin Actions
  ADMIN_UPDATE_USER_ROLE = 'ADMIN_UPDATE_USER_ROLE',
  ADMIN_SUSPEND_USER = 'ADMIN_SUSPEND_USER',
  ADMIN_ACTIVATE_USER = 'ADMIN_ACTIVATE_USER',
  ADMIN_DELETE_USER = 'ADMIN_DELETE_USER',
  ADMIN_VIEW_USER_DATA = 'ADMIN_VIEW_USER_DATA',
  ADMIN_EXPORT_DATA = 'ADMIN_EXPORT_DATA',
  ADMIN_SYSTEM_CONFIG = 'ADMIN_SYSTEM_CONFIG',
  
  // Payment Actions
  PAYMENT_INITIATE = 'PAYMENT_INITIATE',
  PAYMENT_SUCCESS = 'PAYMENT_SUCCESS',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  PAYMENT_RETRY = 'PAYMENT_RETRY',
  PAYMENT_REFUND = 'PAYMENT_REFUND',
  PAYMENT_CANCEL = 'PAYMENT_CANCEL',
  
  // Billing Actions
  BILL_CREATE = 'BILL_CREATE',
  BILL_UPDATE = 'BILL_UPDATE',
  BILL_PAY = 'BILL_PAY',
  BILL_CANCEL = 'BILL_CANCEL',
  COUPON_APPLY = 'COUPON_APPLY',
  COUPON_REMOVE = 'COUPON_REMOVE',
  
  // Document Actions
  DOCUMENT_UPLOAD = 'DOCUMENT_UPLOAD',
  DOCUMENT_DOWNLOAD = 'DOCUMENT_DOWNLOAD',
  DOCUMENT_DELETE = 'DOCUMENT_DELETE',
  DOCUMENT_VIEW = 'DOCUMENT_VIEW',
  
  // Webhook Actions
  WEBHOOK_CREATE = 'WEBHOOK_CREATE',
  WEBHOOK_UPDATE = 'WEBHOOK_UPDATE',
  WEBHOOK_DELETE = 'WEBHOOK_DELETE',
  WEBHOOK_TRIGGER = 'WEBHOOK_TRIGGER',
  WEBHOOK_RETRY = 'WEBHOOK_RETRY',
  
  // System Events
  RATE_LIMIT_BREACH = 'RATE_LIMIT_BREACH',
  SECURITY_ALERT = 'SECURITY_ALERT',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  ACCOUNT_LOCKOUT = 'ACCOUNT_LOCKOUT',
  DATA_EXPORT = 'DATA_EXPORT',
  SYSTEM_ERROR = 'SYSTEM_ERROR'
}

export enum AuditSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum AuditStatus {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  PENDING = 'PENDING',
  ERROR = 'ERROR'
}

export interface AuditContext {
  userId?: string;
  adminId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  endpoint?: string;
  method?: string;
  correlationId?: string;
}

export interface AuditLogData {
  action: AuditAction;
  resource: string;
  resourceId?: string;
  description?: string;
  status?: AuditStatus;
  severity?: AuditSeverity;
  errorMessage?: string;
  beforeState?: any;
  afterState?: any;
  metadata?: any;
  context?: AuditContext;
}

export interface AuditEventData {
  eventType: string;
  aggregateId: string;
  aggregateType: string;
  eventData: any;
  eventVersion?: number;
  causationId?: string;
}

export interface AuditSearchFilters {
  userId?: string;
  adminId?: string;
  action?: AuditAction;
  resource?: string;
  resourceId?: string;
  severity?: AuditSeverity;
  status?: AuditStatus;
  startDate?: Date;
  endDate?: Date;
  ipAddress?: string;
  correlationId?: string;
  limit?: number;
  offset?: number;
}

export interface ComplianceReportOptions {
  reportType: string;
  startDate: Date;
  endDate: Date;
  includeUserActions?: boolean;
  includeAdminActions?: boolean;
  includeSystemEvents?: boolean;
  includeFailures?: boolean;
  resourceTypes?: string[];
}

export class AuditService {
  private retentionPolicies: Map<string, number> = new Map();

  constructor() {
    this.loadRetentionPolicies();
  }

  /**
   * Log an audit event
   */
  async logAudit(data: AuditLogData): Promise<void> {
    try {
      // Ensure audit client is initialized
      await auditClient.ensureInitialized();
      
      const correlationId = data.context?.correlationId || 
                           (rTracer ? rTracer.id() : null) || 
                           uuidv4();
      
      const auditLog = await auditClient.auditLog!.create({
        data: {
          correlationId,
          userId: data.context?.userId,
          adminId: data.context?.adminId,
          sessionId: data.context?.sessionId,
          action: data.action,
          resource: data.resource,
          resourceId: data.resourceId,
          description: data.description,
          ipAddress: data.context?.ipAddress,
          userAgent: data.context?.userAgent,
          endpoint: data.context?.endpoint,
          method: data.context?.method,
          status: data.status || AuditStatus.SUCCESS,
          severity: data.severity || AuditSeverity.LOW,
          errorMessage: data.errorMessage,
          beforeState: data.beforeState,
          afterState: data.afterState,
          metadata: data.metadata,
          retentionDate: this.calculateRetentionDate(data.resource)
        }
      });

      // Publish audit event for real-time monitoring (if event bus is available)
      try {
        const EventBus = (await import('../databases/event-patterns/EventBus')).default;
        EventBus.publish({
          eventId: auditLog.id,
          eventType: 'audit.logged',
          aggregateId: auditLog.id,
          timestamp: auditLog.createdAt,
          payload: {
            auditLogId: auditLog.id,
            action: data.action,
            resource: data.resource,
            severity: data.severity || AuditSeverity.LOW,
            userId: data.context?.userId
          },
          metadata: {
            userId: data.context?.userId,
            correlationId
          }
        });
      } catch (error) {
        // Event bus not available, continue without publishing
        logger.debug('Event bus not available for audit event publishing');
      }

      // Log high severity events immediately
      if (data.severity === AuditSeverity.HIGH || data.severity === AuditSeverity.CRITICAL) {
        logger.warn('High severity audit event', {
          auditLogId: auditLog.id,
          action: data.action,
          resource: data.resource,
          severity: data.severity,
          userId: data.context?.userId,
          correlationId
        });
      }

    } catch (error) {
      logger.error('Failed to log audit event:', {
        error: toError(error),
        action: data.action,
        resource: data.resource,
        userId: data.context?.userId
      });

      // Don't throw - audit logging should not break the main flow
      // But log to application logs for monitoring
    }
  }

  /**
   * Log an event sourcing event
   */
  async logEvent(data: AuditEventData, context?: AuditContext): Promise<void> {
    try {
      // Ensure audit client is initialized
      await auditClient.ensureInitialized();
      
      const correlationId = context?.correlationId || 
                           (rTracer ? rTracer.id() : null) || 
                           uuidv4();
      
      await auditClient.auditEvent!.create({
        data: {
          eventType: data.eventType,
          aggregateId: data.aggregateId,
          aggregateType: data.aggregateType,
          eventData: data.eventData,
          eventVersion: data.eventVersion || 1,
          correlationId,
          causationId: data.causationId,
          userId: context?.userId
        }
      });

    } catch (error) {
      logger.error('Failed to log audit event:', {
        error: toError(error),
        eventType: data.eventType,
        aggregateId: data.aggregateId,
        userId: context?.userId
      });
    }
  }

  /**
   * Search audit logs with filters
   */
  async searchAuditLogs(filters: AuditSearchFilters) {
    try {
      // Ensure audit client is initialized
      await auditClient.ensureInitialized();
      
      const where: any = {};
      
      if (filters.userId) where.userId = filters.userId;
      if (filters.adminId) where.adminId = filters.adminId;
      if (filters.action) where.action = filters.action;
      if (filters.resource) where.resource = filters.resource;
      if (filters.resourceId) where.resourceId = filters.resourceId;
      if (filters.severity) where.severity = filters.severity;
      if (filters.status) where.status = filters.status;
      if (filters.ipAddress) where.ipAddress = filters.ipAddress;
      if (filters.correlationId) where.correlationId = filters.correlationId;
      
      if (filters.startDate || filters.endDate) {
        where.createdAt = {};
        if (filters.startDate) where.createdAt.gte = filters.startDate;
        if (filters.endDate) where.createdAt.lte = filters.endDate;
      }

      const [logs, total] = await Promise.all([
        auditClient.auditLog!.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: filters.limit || 100,
          skip: filters.offset || 0
        }),
        auditClient.auditLog!.count({ where })
      ]);

      return {
        logs,
        total,
        hasMore: (filters.offset || 0) + logs.length < total
      };

    } catch (error) {
      logger.error('Failed to search audit logs:', { error: toError(error) });
      throw new Error('Failed to search audit logs');
    }
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(options: ComplianceReportOptions, generatedBy: string) {
    try {
      const where: any = {
        createdAt: {
          gte: options.startDate,
          lte: options.endDate
        }
      };

      // Filter by action types based on options
      const actionFilters: AuditAction[] = [];
      
      if (options.includeUserActions) {
        actionFilters.push(
          AuditAction.USER_REGISTER,
          AuditAction.USER_LOGIN,
          AuditAction.USER_LOGOUT,
          AuditAction.USER_UPDATE_PROFILE,
          AuditAction.USER_CHANGE_PASSWORD,
          AuditAction.PAYMENT_INITIATE,
          AuditAction.DOCUMENT_UPLOAD,
          AuditAction.DOCUMENT_DOWNLOAD
        );
      }

      if (options.includeAdminActions) {
        actionFilters.push(
          AuditAction.ADMIN_UPDATE_USER_ROLE,
          AuditAction.ADMIN_SUSPEND_USER,
          AuditAction.ADMIN_DELETE_USER,
          AuditAction.ADMIN_VIEW_USER_DATA,
          AuditAction.ADMIN_EXPORT_DATA
        );
      }

      if (options.includeSystemEvents) {
        actionFilters.push(
          AuditAction.RATE_LIMIT_BREACH,
          AuditAction.SECURITY_ALERT,
          AuditAction.LOGIN_FAILURE,
          AuditAction.ACCOUNT_LOCKOUT,
          AuditAction.SYSTEM_ERROR
        );
      }

      if (actionFilters.length > 0) {
        where.action = { in: actionFilters };
      }

      if (options.resourceTypes && options.resourceTypes.length > 0) {
        where.resource = { in: options.resourceTypes };
      }

      if (options.includeFailures === false) {
        where.status = { not: AuditStatus.FAILURE };
      }

      // Generate report data
      const [logs, summary] = await Promise.all([
        auditClient.auditLog!.findMany({
          where,
          orderBy: { createdAt: 'desc' }
        }),
        this.generateReportSummary(where)
      ]);

      const reportData = {
        summary,
        totalEvents: logs.length,
        eventsByAction: this.groupByAction(logs),
        eventsByResource: this.groupByResource(logs),
        eventsBySeverity: this.groupBySeverity(logs),
        eventsByStatus: this.groupByStatus(logs),
        timelineData: this.generateTimeline(logs),
        topUsers: this.getTopUsers(logs),
        failureAnalysis: this.analyzeFailures(logs)
      };

      // Save report
      const report = await auditClient.complianceReport!.create({
        data: {
          reportType: options.reportType,
          startDate: options.startDate,
          endDate: options.endDate,
          generatedBy,
          totalEvents: logs.length,
          reportData
        }
      });

      return {
        reportId: report.id,
        reportData,
        generatedAt: report.createdAt
      };

    } catch (error) {
      logger.error('Failed to generate compliance report:', { error: toError(error) });
      throw new Error('Failed to generate compliance report');
    }
  }

  /**
   * Get user activity timeline
   */
  async getUserActivityTimeline(userId: string, startDate?: Date, endDate?: Date) {
    try {
      const where: any = { userId };
      
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = startDate;
        if (endDate) where.createdAt.lte = endDate;
      }

      const activities = await auditClient.auditLog!.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 1000 // Limit for performance
      });

      return activities.map(activity => ({
        id: activity.id,
        action: activity.action,
        resource: activity.resource,
        resourceId: activity.resourceId,
        description: activity.description,
        status: activity.status,
        severity: activity.severity,
        ipAddress: activity.ipAddress,
        timestamp: activity.createdAt,
        metadata: activity.metadata
      }));

    } catch (error) {
      logger.error('Failed to get user activity timeline:', { error: toError(error) });
      throw new Error('Failed to get user activity timeline');
    }
  }

  /**
   * Clean up expired audit logs based on retention policies
   */
  async cleanupExpiredLogs(): Promise<number> {
    try {
      const cutoffDate = new Date();
      
      const result = await auditClient.auditLog!.deleteMany({
        where: {
          retentionDate: {
            lt: cutoffDate
          },
          isArchived: false
        }
      });

      logger.info(`Cleaned up ${result.count} expired audit logs`);
      return result.count;

    } catch (error) {
      logger.error('Failed to cleanup expired audit logs:', { error: toError(error) });
      throw new Error('Failed to cleanup expired audit logs');
    }
  }

  /**
   * Archive old audit logs instead of deleting
   */
  async archiveOldLogs(daysOld: number = 365): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await auditClient.auditLog!.updateMany({
        where: {
          createdAt: {
            lt: cutoffDate
          },
          isArchived: false
        },
        data: {
          isArchived: true
        }
      });

      logger.info(`Archived ${result.count} old audit logs`);
      return result.count;

    } catch (error) {
      logger.error('Failed to archive old audit logs:', { error: toError(error) });
      throw new Error('Failed to archive old audit logs');
    }
  }

  // Private helper methods
  private async loadRetentionPolicies(): Promise<void> {
    try {
      const policies = await auditClient.auditRetentionPolicy!.findMany({
        where: { isActive: true }
      });

      policies.forEach(policy => {
        this.retentionPolicies.set(policy.resourceType, policy.retentionDays);
      });

      // Set default retention policies if none exist
      if (this.retentionPolicies.size === 0) {
        await this.setDefaultRetentionPolicies();
      }

    } catch (error) {
      logger.error('Failed to load retention policies:', { error: toError(error) });
      // Set fallback retention period
      this.retentionPolicies.set('default', 90);
    }
  }

  private async setDefaultRetentionPolicies(): Promise<void> {
    const defaultPolicies = [
      { resourceType: 'user', retentionDays: 365 },
      { resourceType: 'payment', retentionDays: 2555 }, // 7 years for financial records
      { resourceType: 'bill', retentionDays: 2555 },
      { resourceType: 'document', retentionDays: 1095 }, // 3 years
      { resourceType: 'webhook', retentionDays: 90 },
      { resourceType: 'system', retentionDays: 180 },
      { resourceType: 'default', retentionDays: 90 }
    ];

    for (const policy of defaultPolicies) {
      await auditClient.auditRetentionPolicy!.upsert({
        where: { resourceType: policy.resourceType },
        update: { retentionDays: policy.retentionDays },
        create: policy
      });
      
      this.retentionPolicies.set(policy.resourceType, policy.retentionDays);
    }
  }

  private calculateRetentionDate(resource: string): Date {
    const retentionDays = this.retentionPolicies.get(resource) || 
                         this.retentionPolicies.get('default') || 90;
    
    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() + retentionDays);
    return retentionDate;
  }

  private async generateReportSummary(where: any) {
    const [
      totalEvents,
      successEvents,
      failureEvents,
      uniqueUsers,
      uniqueResources
    ] = await Promise.all([
      auditClient.auditLog!.count({ where }),
      auditClient.auditLog!.count({ where: { ...where, status: AuditStatus.SUCCESS } }),
      auditClient.auditLog!.count({ where: { ...where, status: AuditStatus.FAILURE } }),
      auditClient.auditLog!.findMany({
        where,
        select: { userId: true },
        distinct: ['userId']
      }),
      auditClient.auditLog!.findMany({
        where,
        select: { resource: true },
        distinct: ['resource']
      })
    ]);

    return {
      totalEvents,
      successEvents,
      failureEvents,
      successRate: totalEvents > 0 ? (successEvents / totalEvents) * 100 : 0,
      uniqueUsers: uniqueUsers.length,
      uniqueResources: uniqueResources.length
    };
  }

  private groupByAction(logs: any[]) {
    return logs.reduce((acc, log) => {
      acc[log.action] = (acc[log.action] || 0) + 1;
      return acc;
    }, {});
  }

  private groupByResource(logs: any[]) {
    return logs.reduce((acc, log) => {
      acc[log.resource] = (acc[log.resource] || 0) + 1;
      return acc;
    }, {});
  }

  private groupBySeverity(logs: any[]) {
    return logs.reduce((acc, log) => {
      acc[log.severity] = (acc[log.severity] || 0) + 1;
      return acc;
    }, {});
  }

  private groupByStatus(logs: any[]) {
    return logs.reduce((acc, log) => {
      acc[log.status] = (acc[log.status] || 0) + 1;
      return acc;
    }, {});
  }

  private generateTimeline(logs: any[]) {
    // Group by day
    const timeline = logs.reduce((acc, log) => {
      const date = log.createdAt.toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(timeline).map(([date, count]) => ({
      date,
      count
    }));
  }

  private getTopUsers(logs: any[]) {
    const userCounts = logs.reduce((acc, log) => {
      if (log.userId) {
        acc[log.userId] = (acc[log.userId] || 0) + 1;
      }
      return acc;
    }, {});

    return Object.entries(userCounts)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .slice(0, 10)
      .map(([userId, count]) => ({ userId, count }));
  }

  private analyzeFailures(logs: any[]) {
    const failures = logs.filter(log => log.status === AuditStatus.FAILURE);
    
    const failuresByAction = this.groupByAction(failures);
    const failuresByResource = this.groupByResource(failures);
    
    return {
      totalFailures: failures.length,
      failuresByAction,
      failuresByResource,
      commonErrors: this.getCommonErrors(failures)
    };
  }

  private getCommonErrors(failures: any[]) {
    const errorCounts = failures.reduce((acc, failure) => {
      if (failure.errorMessage) {
        acc[failure.errorMessage] = (acc[failure.errorMessage] || 0) + 1;
      }
      return acc;
    }, {});

    return Object.entries(errorCounts)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .slice(0, 5)
      .map(([error, count]) => ({ error, count }));
  }
}

export const auditService = new AuditService();