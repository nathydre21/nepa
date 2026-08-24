import { Request, Response, NextFunction } from 'express';
import { AuthenticationService } from '../services/AuthenticationService';
import { rbacService } from '../services/RbacService';
// Define missing enums locally
export enum ResourceType {
  USER = 'USER',
  BILL = 'BILL',
  PAYMENT = 'PAYMENT',
  AUDIT = 'AUDIT',
  SYSTEM = 'SYSTEM'
}

export enum PermissionScope {
  READ = 'READ',
  WRITE = 'WRITE',
  DELETE = 'DELETE',
  ADMIN = 'ADMIN',
  GLOBAL = 'GLOBAL'
}

// Define UserRole locally since Prisma client might not be generated
export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN'
}

const authService = new AuthenticationService();

export interface AuthenticatedRequest extends Request {
  user?: any;
}

export interface PermissionCheck {
  resource: ResourceType;
  action: string;
  scope?: PermissionScope;
  resourceId?: string;
}

export const authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const result = await authService.verifyToken(token);
    
    if (result.error) {
      return res.status(401).json({ error: result.error });
    }

    req.user = result.user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

export const authorize = (requiredRole: UserRole) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const hasPermission = await authService.hasPermission(req.user, requiredRole);
    
    if (!hasPermission) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

// New RBAC-based authorization middleware
export const requirePermission = (check: PermissionCheck) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const hasPermission = await rbacService.hasPermission(req.user.id, check);
      
      if (!hasPermission) {
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          required: {
            resource: check.resource,
            action: check.action,
            scope: check.scope
          }
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ error: 'Permission check failed' });
    }
  };
};

export const requireAnyPermission = (checks: PermissionCheck[]) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const hasPermission = await rbacService.hasAnyPermission(req.user.id, checks);
      
      if (!hasPermission) {
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          required: checks.map(check => ({
            resource: check.resource,
            action: check.action,
            scope: check.scope
          }))
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ error: 'Permission check failed' });
    }
  };
};

export const requireAllPermissions = (checks: PermissionCheck[]) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const hasPermission = await rbacService.hasAllPermissions(req.user.id, checks);
      
      if (!hasPermission) {
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          required: checks.map(check => ({
            resource: check.resource,
            action: check.action,
            scope: check.scope
          }))
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ error: 'Permission check failed' });
    }
  };
};

export const requireResourceAccess = (resourceIdParam: string = 'id', check: PermissionCheck) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const resourceId = req.params[resourceIdParam];
      if (!resourceId) {
        return res.status(400).json({ error: 'Resource ID required' });
      }

      const hasAccess = await rbacService.canAccessResource(req.user.id, resourceId, check);
      
      if (!hasAccess) {
        return res.status(403).json({ 
          error: 'Insufficient permissions to access this resource',
          required: {
            resource: check.resource,
            action: check.action,
            scope: check.scope,
            resourceId
          }
        });
      }

      next();
    } catch (error) {
      console.error('Resource access check error:', error);
      return res.status(500).json({ error: 'Resource access check failed' });
    }
  };
};

// Legacy role-based authorization (for backward compatibility)
export const requireRole = (minimumRole: UserRole) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const hasPermission = await authService.hasPermission(req.user, minimumRole);
    
    if (!hasPermission) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

// Self-access authorization (users can only access their own resources)
export const requireSelfAccess = (userIdParam: string = 'userId') => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const targetUserId = req.params[userIdParam] || req.body[userIdParam];
    
    if (req.user.id !== targetUserId) {
      // Check if user has admin permissions to access other users' resources
      const hasAdminAccess = await rbacService.hasPermission(req.user.id, {
        resource: ResourceType.USER,
        action: 'manage',
        scope: PermissionScope.GLOBAL
      });

      if (!hasAdminAccess) {
        return res.status(403).json({ error: 'Can only access your own resources' });
      }
    }

    next();
  };
};

export const optionalAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      const result = await authService.verifyToken(token);
      if (!result.error) {
        req.user = result.user;
      }
    }
    
    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

// Alias for authenticate function for compatibility
export const authenticateToken = authenticate;
