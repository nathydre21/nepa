import { Request, Response, NextFunction } from 'express';
import { auditService, AuditContext, AuditAction, AuditSeverity, AuditStatus } from '../services/AuditService';
import { logger } from '../services/logger';

// Optional import for cls-rtracer
let rTracer: any;
try {
  rTracer = require('cls-rtracer');
} catch (error) {
  logger.debug('cls-rtracer not available');
}

// Extend Request interface to include audit context
declare global {
  namespace Express {
    interface Request {
      auditContext?: AuditContext;
      startTime?: number;
    }
  }
}

/**
 * Middleware to capture audit context from request
 */
export const captureAuditContext = (req: Request, res: Response, next: NextFunction) => {
  req.startTime = Date.now();
  
  req.auditContext = {
    userId: (req as any).user?.id || (req as any).userId,
    sessionId: (req as any).sessionId,
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    endpoint: req.originalUrl,
    method: req.method,
    correlationId: rTracer ? rTracer.id() : undefined
  };

  next();
};

/**
 * Middleware to automatically audit sensitive operations
 */
export const auditSensitiveOperations = (
  action: AuditAction,
  resource: string,
  options: {
    severity?: AuditSeverity;
    captureBody?: boolean;
    captureResponse?: boolean;
    getResourceId?: (req: Request) => string;
    getDescription?: (req: Request) => string;
  } = {}
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    let responseData: any;
    let beforeState: any;

    // Capture request body if needed
    if (options.captureBody && req.body) {
      beforeState = { ...req.body };
      // Remove sensitive fields
      delete beforeState.password;
      delete beforeState.currentPassword;
      delete beforeState.newPassword;
    }

    // Override res.send to capture response
    if (options.captureResponse) {
      res.send = function(data: any) {
        responseData = data;
        return originalSend.call(this, data);
      };
    }

    // Continue with the request
    next();

    // Log audit after response is sent
    res.on('finish', async () => {
      try {
        const resourceId = options.getResourceId ? options.getResourceId(req) : req.params.id;
        const description = options.getDescription ? options.getDescription(req) : 
          `${action} on ${resource}${resourceId ? ` (${resourceId})` : ''}`;

        const status = res.statusCode >= 400 ? AuditStatus.FAILURE : AuditStatus.SUCCESS;
        const severity = options.severity || 
          (res.statusCode >= 500 ? AuditSeverity.HIGH : 
           res.statusCode >= 400 ? AuditSeverity.MEDIUM : AuditSeverity.LOW);

        const metadata: any = {
          statusCode: res.statusCode,
          duration: req.startTime ? Date.now() - req.startTime : undefined
        };

        if (options.captureResponse && responseData) {
          metadata.response = responseData;
        }

        await auditService.logAudit({
          action,
          resource,
          resourceId,
          description,
          status,
          severity,
          beforeState,
          metadata,
          context: req.auditContext
        });

      } catch (error) {
        logger.error('Failed to log audit in middleware:', error as any);
      }
    });
  };
};

/**
 * Middleware to audit authentication events
 */
export const auditAuth = (action: AuditAction) => {
  return auditSensitiveOperations(action, 'user', {
    severity: AuditSeverity.MEDIUM,
    captureBody: false, // Don't capture passwords
    getResourceId: (req) => req.auditContext?.userId || 'unknown',
    getDescription: (req) => {
      switch (action) {
        case AuditAction.USER_LOGIN:
          return `User login attempt from ${req.auditContext?.ipAddress}`;
        case AuditAction.USER_LOGOUT:
          return `User logout from ${req.auditContext?.ipAddress}`;
        case AuditAction.USER_REGISTER:
          return `New user registration from ${req.auditContext?.ipAddress}`;
        default:
          return `Authentication action: ${action}`;
      }
    }
  });
};

/**
 * Middleware to audit admin operations
 */
export const auditAdmin = (action: AuditAction, resource: string = 'user') => {
  return auditSensitiveOperations(action, resource, {
    severity: AuditSeverity.HIGH,
    captureBody: true,
    captureResponse: true,
    getResourceId: (req) => req.params.id || req.params.userId,
    getDescription: (req) => {
      const targetUserId = req.params.id || req.params.userId;
      return `Admin ${req.auditContext?.userId} performed ${action} on ${resource} ${targetUserId}`;
    }
  });
};

/**
 * Middleware to audit payment operations
 */
export const auditPayment = (action: AuditAction) => {
  return auditSensitiveOperations(action, 'payment', {
    severity: AuditSeverity.HIGH,
    captureBody: true,
    captureResponse: true,
    getResourceId: (req) => req.body.paymentId || req.params.paymentId,
    getDescription: (req) => {
      const amount = req.body.amount;
      const billId = req.body.billId;
      return `Payment ${action.toLowerCase()} - Amount: ${amount}, Bill: ${billId}`;
    }
  });
};

/**
 * Middleware to audit document operations
 */
export const auditDocument = (action: AuditAction) => {
  return auditSensitiveOperations(action, 'document', {
    severity: AuditSeverity.MEDIUM,
    getResourceId: (req) => req.params.documentId || req.body.documentId,
    getDescription: (req) => {
      const filename = req.file?.originalname || req.body.filename;
      return `Document ${action.toLowerCase()}${filename ? ` - ${filename}` : ''}`;
    }
  });
};

/**
 * Middleware to audit webhook operations
 */
export const auditWebhook = (action: AuditAction) => {
  return auditSensitiveOperations(action, 'webhook', {
    severity: AuditSeverity.MEDIUM,
    captureBody: true,
    getResourceId: (req) => req.params.webhookId || req.body.webhookId,
    getDescription: (req) => {
      const url = req.body.url;
      return `Webhook ${action.toLowerCase()}${url ? ` - ${url}` : ''}`;
    }
  });
};

/**
 * Middleware to audit rate limit breaches
 */
export const auditRateLimit = async (req: Request, res: Response, next: NextFunction) => {
  // This will be called when rate limit is exceeded
  try {
    await auditService.logAudit({
      action: AuditAction.RATE_LIMIT_BREACH,
      resource: 'system',
      description: `Rate limit exceeded for endpoint ${req.originalUrl}`,
      severity: AuditSeverity.MEDIUM,
      status: AuditStatus.SUCCESS,
      metadata: {
        endpoint: req.originalUrl,
        method: req.method,
        rateLimitType: 'api'
      },
      context: req.auditContext
    });
  } catch (error) {
    logger.error('Failed to audit rate limit breach:', error as any);
  }

  next();
};

/**
 * Middleware to audit security alerts
 */
export const auditSecurityAlert = (alertType: string, severity: AuditSeverity = AuditSeverity.HIGH) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await auditService.logAudit({
        action: AuditAction.SECURITY_ALERT,
        resource: 'system',
        description: `Security alert: ${alertType}`,
        severity,
        status: AuditStatus.SUCCESS,
        metadata: {
          alertType,
          endpoint: req.originalUrl,
          method: req.method
        },
        context: req.auditContext
      });
    } catch (error) {
      logger.error('Failed to audit security alert:', error as any);
    }

    next();
  };
};

/**
 * Middleware to audit failed login attempts
 */
export const auditLoginFailure = async (req: Request, email: string, reason: string) => {
  try {
    await auditService.logAudit({
      action: AuditAction.LOGIN_FAILURE,
      resource: 'user',
      description: `Failed login attempt for ${email}: ${reason}`,
      severity: AuditSeverity.MEDIUM,
      status: AuditStatus.FAILURE,
      errorMessage: reason,
      metadata: {
        email,
        reason,
        attemptCount: (req as any).loginAttempts || 1
      },
      context: req.auditContext
    });
  } catch (error) {
    logger.error('Failed to audit login failure:', error as any);
  }
};

/**
 * Middleware to audit account lockouts
 */
export const auditAccountLockout = async (req: Request, userId: string, reason: string) => {
  try {
    await auditService.logAudit({
      action: AuditAction.ACCOUNT_LOCKOUT,
      resource: 'user',
      resourceId: userId,
      description: `Account locked: ${reason}`,
      severity: AuditSeverity.HIGH,
      status: AuditStatus.SUCCESS,
      metadata: {
        reason,
        lockoutDuration: '30 minutes' // Default lockout duration
      },
      context: req.auditContext
    });
  } catch (error) {
    logger.error('Failed to audit account lockout:', error as any);
  }
};