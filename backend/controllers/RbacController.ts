import { Request, Response } from 'express';
import { rbacService } from '../services/RbacService';
import { AuthenticatedRequest, requirePermission } from '../middleware/authentication';
import { ResourceType, PermissionScope } from '@prisma/client';
import { errorResponse } from '../utils/errorResponse';

export class RoleController {
  // Create a new role
  async createRole(req: AuthenticatedRequest, res: Response) {
    try {
      const { name, description, scope } = req.body;

      if (!name) {
        return errorResponse(res, 400, 'Role name is required');
      }

      const role = await rbacService.createRole({
        name,
        description,
        scope
      });

      res.status(201).json({
        success: true,
        data: role
      });
    } catch (error: any) {
      console.error('Create role error:', error);
      errorResponse(res, 400, error.message || 'Failed to create role');
    }
  }

  // Update an existing role
  async updateRole(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name, description, scope, isActive } = req.body;

      const role = await rbacService.updateRole(id, {
        name,
        description,
        scope,
        isActive
      });

      res.json({
        success: true,
        data: role
      });
    } catch (error: any) {
      console.error('Update role error:', error);
      errorResponse(res, 400, error.message || 'Failed to update role');
    }
  }

  // Delete a role
  async deleteRole(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;

      await rbacService.deleteRole(id);

      res.json({
        success: true,
        message: 'Role deleted successfully'
      });
    } catch (error: any) {
      console.error('Delete role error:', error);
      errorResponse(res, 400, error.message || 'Failed to delete role');
    }
  }

  // Get all roles
  async getRoles(req: AuthenticatedRequest, res: Response) {
    try {
      const includePermissions = req.query.includePermissions === 'true';
      const roles = await rbacService.getRoles(includePermissions);

      res.json({
        success: true,
        data: roles
      });
    } catch (error: any) {
      console.error('Get roles error:', error);
      errorResponse(res, 500, error.message || 'Failed to get roles');
    }
  }

  // Get role by ID
  async getRoleById(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const includePermissions = req.query.includePermissions === 'true';
      
      const role = await rbacService.getRoleById(id, includePermissions);

      if (!role) {
        return errorResponse(res, 404, 'Role not found');
      }

      res.json({
        success: true,
        data: role
      });
    } catch (error: any) {
      console.error('Get role by ID error:', error);
      errorResponse(res, 500, error.message || 'Failed to get role');
    }
  }

  // Assign permission to role
  async assignPermissionToRole(req: AuthenticatedRequest, res: Response) {
    try {
      const { roleId } = req.params;
      const { permissionId } = req.body;

      if (!permissionId) {
        return errorResponse(res, 400, 'Permission ID is required');
      }

      await rbacService.assignPermissionToRole(roleId, permissionId);

      res.json({
        success: true,
        message: 'Permission assigned to role successfully'
      });
    } catch (error: any) {
      console.error('Assign permission to role error:', error);
      errorResponse(res, 400, error.message || 'Failed to assign permission to role');
    }
  }

  // Remove permission from role
  async removePermissionFromRole(req: AuthenticatedRequest, res: Response) {
    try {
      const { roleId, permissionId } = req.params;

      await rbacService.removePermissionFromRole(roleId, permissionId);

      res.json({
        success: true,
        message: 'Permission removed from role successfully'
      });
    } catch (error: any) {
      console.error('Remove permission from role error:', error);
      errorResponse(res, 400, error.message || 'Failed to remove permission from role');
    }
  }

  // Assign role to user
  async assignRoleToUser(req: AuthenticatedRequest, res: Response) {
    try {
      const { userId, roleId } = req.body;
      const assignedBy = req.user?.id;

      if (!userId || !roleId) {
        return errorResponse(res, 400, 'User ID and Role ID are required');
      }

      const assignment = await rbacService.assignRoleToUser({
        userId,
        roleId,
        assignedBy: assignedBy!,
        expiresAt: req.body.expiresAt
      });

      res.status(201).json({
        success: true,
        data: assignment
      });
    } catch (error: any) {
      console.error('Assign role to user error:', error);
      errorResponse(res, 400, error.message || 'Failed to assign role to user');
    }
  }

  // Remove role from user
  async removeRoleFromUser(req: AuthenticatedRequest, res: Response) {
    try {
      const { userId, roleId } = req.params;

      await rbacService.removeRoleFromUser(userId, roleId);

      res.json({
        success: true,
        message: 'Role removed from user successfully'
      });
    } catch (error: any) {
      console.error('Remove role from user error:', error);
      errorResponse(res, 400, error.message || 'Failed to remove role from user');
    }
  }

  // Get user roles
  async getUserRoles(req: AuthenticatedRequest, res: Response) {
    try {
      const { userId } = req.params;

      const roles = await rbacService.getUserRoles(userId);

      res.json({
        success: true,
        data: roles
      });
    } catch (error: any) {
      console.error('Get user roles error:', error);
      errorResponse(res, 500, error.message || 'Failed to get user roles');
    }
  }

  // Get user permissions
  async getUserPermissions(req: AuthenticatedRequest, res: Response) {
    try {
      const { userId } = req.params;

      const permissions = await rbacService.getUserPermissions(userId);

      res.json({
        success: true,
        data: permissions
      });
    } catch (error: any) {
      console.error('Get user permissions error:', error);
      errorResponse(res, 500, error.message || 'Failed to get user permissions');
    }
  }
}

export class PermissionController {
  // Create a new permission
  async createPermission(req: AuthenticatedRequest, res: Response) {
    try {
      const { name, description, resource, action, scope } = req.body;

      if (!name || !resource || !action) {
        return errorResponse(res, 400, 'Permission name, resource, and action are required');
      }

      const permission = await rbacService.createPermission({
        name,
        description,
        resource,
        action,
        scope
      });

      res.status(201).json({
        success: true,
        data: permission
      });
    } catch (error: any) {
      console.error('Create permission error:', error);
      errorResponse(res, 400, error.message || 'Failed to create permission');
    }
  }

  // Update an existing permission
  async updatePermission(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name, description, resource, action, scope, isActive } = req.body;

      const permission = await rbacService.updatePermission(id, {
        name,
        description,
        resource,
        action,
        scope,
        isActive
      });

      res.json({
        success: true,
        data: permission
      });
    } catch (error: any) {
      console.error('Update permission error:', error);
      errorResponse(res, 400, error.message || 'Failed to update permission');
    }
  }

  // Delete a permission
  async deletePermission(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;

      await rbacService.deletePermission(id);

      res.json({
        success: true,
        message: 'Permission deleted successfully'
      });
    } catch (error: any) {
      console.error('Delete permission error:', error);
      errorResponse(res, 400, error.message || 'Failed to delete permission');
    }
  }

  // Get all permissions
  async getPermissions(req: AuthenticatedRequest, res: Response) {
    try {
      const permissions = await rbacService.getPermissions();

      res.json({
        success: true,
        data: permissions
      });
    } catch (error: any) {
      console.error('Get permissions error:', error);
      errorResponse(res, 500, error.message || 'Failed to get permissions');
    }
  }
}

export class RbacController {
  // Check if user has specific permission
  async checkPermission(req: AuthenticatedRequest, res: Response) {
    try {
      const { userId } = req.params;
      const { resource, action, scope } = req.body;

      if (!resource || !action) {
        return errorResponse(res, 400, 'Resource and action are required');
      }

      const hasPermission = await rbacService.hasPermission(userId, {
        resource,
        action,
        scope
      });

      res.json({
        success: true,
        data: {
          hasPermission,
          resource,
          action,
          scope
        }
      });
    } catch (error: any) {
      console.error('Check permission error:', error);
      errorResponse(res, 500, error.message || 'Failed to check permission');
    }
  }

  // Check if user has any of the specified permissions
  async checkAnyPermission(req: AuthenticatedRequest, res: Response) {
    try {
      const { userId } = req.params;
      const { checks } = req.body;

      if (!checks || !Array.isArray(checks)) {
        return errorResponse(res, 400, 'Permission checks array is required');
      }

      const hasPermission = await rbacService.hasAnyPermission(userId, checks);

      res.json({
        success: true,
        data: {
          hasPermission,
          checks
        }
      });
    } catch (error: any) {
      console.error('Check any permission error:', error);
      errorResponse(res, 500, error.message || 'Failed to check permissions');
    }
  }

  // Check if user has all specified permissions
  async checkAllPermissions(req: AuthenticatedRequest, res: Response) {
    try {
      const { userId } = req.params;
      const { checks } = req.body;

      if (!checks || !Array.isArray(checks)) {
        return errorResponse(res, 400, 'Permission checks array is required');
      }

      const hasPermission = await rbacService.hasAllPermissions(userId, checks);

      res.json({
        success: true,
        data: {
          hasPermission,
          checks
        }
      });
    } catch (error: any) {
      console.error('Check all permissions error:', error);
      errorResponse(res, 500, error.message || 'Failed to check permissions');
    }
  }

  // Cleanup expired role assignments
  async cleanupExpiredAssignments(req: AuthenticatedRequest, res: Response) {
    try {
      await rbacService.cleanupExpiredAssignments();

      res.json({
        success: true,
        message: 'Expired role assignments cleaned up successfully'
      });
    } catch (error: any) {
      console.error('Cleanup expired assignments error:', error);
      errorResponse(res, 500, error.message || 'Failed to cleanup expired assignments');
    }
  }
}

export const roleController = new RoleController();
export const permissionController = new PermissionController();
export const rbacController = new RbacController();
