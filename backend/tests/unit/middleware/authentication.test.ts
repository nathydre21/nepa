import { Request, Response, NextFunction } from 'express';
import { authenticate, authenticateToken, requireRole, requirePermission, ResourceType, PermissionScope, AuthenticatedRequest } from '../../../middleware/authentication';
import { AuthenticationService } from '../../../services/AuthenticationService';
import { rbacService } from '../../../services/RbacService';
import jwt from 'jsonwebtoken';
import { PrismaClient, UserRole } from '@prisma/client';

jest.mock('../../../services/AuthenticationService');
jest.mock('../../../services/RbacService');
jest.mock('jsonwebtoken');
jest.mock('@prisma/client');

const mockAuthService = AuthenticationService as jest.MockedClass<typeof AuthenticationService>;
const mockRbacService = rbacService as jest.Mocked<typeof rbacService>;
const mockJwt = jwt as jest.Mocked<typeof jwt>;
const MockedPrisma = PrismaClient as jest.MockedClass<typeof PrismaClient>;

describe('Authentication Middleware Unit Tests', () => {
  let req: AuthenticatedRequest;
  let res: Response;
  let next: NextFunction;
  let mockPrismaClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    req = {
      headers: {},
      body: {},
      params: {},
      query: {}
    } as AuthenticatedRequest;
    
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    } as any;
    
    next = jest.fn();

    mockPrismaClient = {
      user: {
        findUnique: jest.fn()
      },
      userSession: {
        findUnique: jest.fn(),
        update: jest.fn()
      }
    };

    MockedPrisma.mockImplementation(() => mockPrismaClient);
  });

  describe('authenticate', () => {
    it('should authenticate user with valid token', async () => {
      const mockToken = 'valid-jwt-token';
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        role: UserRole.USER,
        status: 'ACTIVE'
      };

      req.headers.authorization = `Bearer ${mockToken}`;
      mockAuthService.prototype.verifyToken.mockResolvedValue({ user: mockUser });

      await authenticate(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.user).toEqual(mockUser);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject request with missing token', async () => {
      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'No token provided'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request with invalid token', async () => {
      const mockToken = 'invalid-jwt-token';
      req.headers.authorization = `Bearer ${mockToken}`;
      mockAuthService.prototype.verifyToken.mockResolvedValue({ error: 'Invalid token' });

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid token'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle authentication errors gracefully', async () => {
      const mockToken = 'valid-jwt-token';
      req.headers.authorization = `Bearer ${mockToken}`;
      mockAuthService.prototype.verifyToken.mockRejectedValue(new Error('Service error'));

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication failed'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireRole', () => {
    it('should allow access to users with required role', async () => {
      const middleware = requireRole(UserRole.ADMIN);
      req.user = { id: 'user-1', role: UserRole.ADMIN };
      mockAuthService.prototype.hasPermission.mockResolvedValue(true);

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should deny access to users without required role', async () => {
      const middleware = requireRole(UserRole.ADMIN);
      req.user = { id: 'user-1', role: UserRole.USER };
      mockAuthService.prototype.hasPermission.mockResolvedValue(false);

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Insufficient permissions'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should deny access to unauthenticated users', async () => {
      const middleware = requireRole(UserRole.ADMIN);
      // No user set on request

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requirePermission', () => {
    it('should allow access to users with required permission', async () => {
      const middleware = requirePermission({
        resource: ResourceType.USER,
        action: 'read',
        scope: PermissionScope.GLOBAL
      });
      req.user = { id: 'user-1' };
      mockRbacService.hasPermission.mockResolvedValue(true);

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should deny access to users without required permission', async () => {
      const middleware = requirePermission({
        resource: ResourceType.USER,
        action: 'delete',
        scope: PermissionScope.GLOBAL
      });
      req.user = { id: 'user-1' };
      mockRbacService.hasPermission.mockResolvedValue(false);

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Insufficient permissions',
        required: {
          resource: ResourceType.USER,
          action: 'delete',
          scope: PermissionScope.GLOBAL
        }
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should deny access to unauthenticated users', async () => {
      const middleware = requirePermission({
        resource: ResourceType.USER,
        action: 'read',
        scope: PermissionScope.GLOBAL
      });
      // No user set on request

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle permission check errors gracefully', async () => {
      const middleware = requirePermission({
        resource: ResourceType.USER,
        action: 'read',
        scope: PermissionScope.GLOBAL
      });
      req.user = { id: 'user-1' };
      mockRbacService.hasPermission.mockRejectedValue(new Error('Database error'));

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Permission check failed'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('optionalAuth', () => {
    it('should continue without authentication when no token provided', async () => {
      await authenticate(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.user).toBeUndefined();
    });

    it('should authenticate user when valid token provided', async () => {
      const mockToken = 'valid-jwt-token';
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        role: UserRole.USER,
        status: 'ACTIVE'
      };

      req.headers.authorization = `Bearer ${mockToken}`;
      mockAuthService.prototype.verifyToken.mockResolvedValue({ user: mockUser });

      await authenticate(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.user).toEqual(mockUser);
    });

    it('should continue without authentication when invalid token provided', async () => {
      const mockToken = 'invalid-jwt-token';
      req.headers.authorization = `Bearer ${mockToken}`;
      mockAuthService.prototype.verifyToken.mockResolvedValue({ error: 'Invalid token' });

      await authenticate(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.user).toBeUndefined();
    });
  });
});
