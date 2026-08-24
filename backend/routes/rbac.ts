import { Router } from 'express';
import { roleController, permissionController, rbacController } from '../controllers/RbacController';
import { authenticate, requirePermission } from '../middleware/authentication';
import { ResourceType, PermissionScope } from '@prisma/client';
import { sanitizeInput } from '../middleware/inputSanitization';

const router = Router();

// Apply authentication to all RBAC routes
router.use(authenticate);
router.use(sanitizeInput);

// ROLE ROUTES

// Create role - requires role management permission
router.post('/roles', 
  requirePermission({
    resource: ResourceType.ROLE,
    action: 'create',
    scope: PermissionScope.GLOBAL
  }),
  roleController.createRole
);

// Get all roles - requires role read permission
router.get('/roles',
  requirePermission({
    resource: ResourceType.ROLE,
    action: 'read',
    scope: PermissionScope.GLOBAL
  }),
  roleController.getRoles
);

// Get role by ID - requires role read permission
router.get('/roles/:id',
  requirePermission({
    resource: ResourceType.ROLE,
    action: 'read',
    scope: PermissionScope.GLOBAL
  }),
  roleController.getRoleById
);

// Update role - requires role update permission
router.put('/roles/:id',
  requirePermission({
    resource: ResourceType.ROLE,
    action: 'update',
    scope: PermissionScope.GLOBAL
  }),
  roleController.updateRole
);

// Delete role - requires role delete permission
router.delete('/roles/:id',
  requirePermission({
    resource: ResourceType.ROLE,
    action: 'delete',
    scope: PermissionScope.GLOBAL
  }),
  roleController.deleteRole
);

// Assign permission to role - requires permission management
router.post('/roles/:roleId/permissions',
  requirePermission({
    resource: ResourceType.PERMISSION,
    action: 'manage',
    scope: PermissionScope.GLOBAL
  }),
  roleController.assignPermissionToRole
);

// Remove permission from role - requires permission management
router.delete('/roles/:roleId/permissions/:permissionId',
  requirePermission({
    resource: ResourceType.PERMISSION,
    action: 'manage',
    scope: PermissionScope.GLOBAL
  }),
  roleController.removePermissionFromRole
);

// PERMISSION ROUTES

// Create permission - requires permission management
router.post('/permissions',
  requirePermission({
    resource: ResourceType.PERMISSION,
    action: 'create',
    scope: PermissionScope.GLOBAL
  }),
  permissionController.createPermission
);

// Get all permissions - requires permission read
router.get('/permissions',
  requirePermission({
    resource: ResourceType.PERMISSION,
    action: 'read',
    scope: PermissionScope.GLOBAL
  }),
  permissionController.getPermissions
);

// Update permission - requires permission management
router.put('/permissions/:id',
  requirePermission({
    resource: ResourceType.PERMISSION,
    action: 'update',
    scope: PermissionScope.GLOBAL
  }),
  permissionController.updatePermission
);

// Delete permission - requires permission management
router.delete('/permissions/:id',
  requirePermission({
    resource: ResourceType.PERMISSION,
    action: 'delete',
    scope: PermissionScope.GLOBAL
  }),
  permissionController.deletePermission
);

// USER ROLE ASSIGNMENT ROUTES

// Assign role to user - requires user management
router.post('/users/:userId/roles',
  requirePermission({
    resource: ResourceType.USER,
    action: 'manage',
    scope: PermissionScope.GLOBAL
  }),
  roleController.assignRoleToUser
);

// Remove role from user - requires user management
router.delete('/users/:userId/roles/:roleId',
  requirePermission({
    resource: ResourceType.USER,
    action: 'manage',
    scope: PermissionScope.GLOBAL
  }),
  roleController.removeRoleFromUser
);

// Get user roles - requires user read or self-access
router.get('/users/:userId/roles',
  requirePermission({
    resource: ResourceType.USER,
    action: 'read',
    scope: PermissionScope.GLOBAL
  }),
  roleController.getUserRoles
);

// Get user permissions - requires user read or self-access
router.get('/users/:userId/permissions',
  requirePermission({
    resource: ResourceType.USER,
    action: 'read',
    scope: PermissionScope.GLOBAL
  }),
  roleController.getUserPermissions
);

// RBAC CHECK ROUTES

// Check if user has specific permission - for testing and debugging
router.post('/users/:userId/check-permission',
  requirePermission({
    resource: ResourceType.SYSTEM,
    action: 'debug',
    scope: PermissionScope.GLOBAL
  }),
  rbacController.checkPermission
);

// Check if user has any of specified permissions
router.post('/users/:userId/check-any-permission',
  requirePermission({
    resource: ResourceType.SYSTEM,
    action: 'debug',
    scope: PermissionScope.GLOBAL
  }),
  rbacController.checkAnyPermission
);

// Check if user has all specified permissions
router.post('/users/:userId/check-all-permissions',
  requirePermission({
    resource: ResourceType.SYSTEM,
    action: 'debug',
    scope: PermissionScope.GLOBAL
  }),
  rbacController.checkAllPermissions
);

// Cleanup expired assignments - system maintenance
router.post('/cleanup-expired-assignments',
  requirePermission({
    resource: ResourceType.SYSTEM,
    action: 'manage',
    scope: PermissionScope.GLOBAL
  }),
  rbacController.cleanupExpiredAssignments
);

export default router;
