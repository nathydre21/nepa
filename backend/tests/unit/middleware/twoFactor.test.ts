import { Request, Response, NextFunction } from 'express';
import { requireTwoFactor, optionalTwoFactor, requireTwoFactorForSensitive, AuthenticatedRequest } from '../../../middleware/authentication';
import { AuthenticationService } from '../../../services/AuthenticationService';
import { TwoFactorMethod } from '@prisma/client';

jest.mock('../../../services/AuthenticationService');

const mockAuthService = AuthenticationService as jest.MockedClass<typeof AuthenticationService>;

describe('Two-Factor Authentication Middleware Unit Tests', () => {
  let req: AuthenticatedRequest;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    
    req = {
      headers: {},
      body: {},
      params: {},
      query: {},
      method: 'POST',
      path: '/api/sensitive'
    } as AuthenticatedRequest;
    
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    } as any;
    
    next = jest.fn();
  });

  describe('requireTwoFactor', () => {
    it('should allow access with valid 2FA code', async () => {
      req.user = {
        id: 'user-1',
        twoFactorEnabled: true,
        twoFactorMethod: TwoFactorMethod.AUTHENTICATOR_APP,
        twoFactorSecret: 'test-secret'
      };
      req.headers['x-2fa-code'] = '123456';
      mockAuthService.prototype.verifyTwoFactor.mockResolvedValue(true);

      await requireTwoFactor(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should deny access for unauthenticated users', async () => {
      await requireTwoFactor(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should deny access when 2FA is not enabled', async () => {
      req.user = {
        id: 'user-1',
        twoFactorEnabled: false
      };

      await requireTwoFactor(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Two-factor authentication not enabled',
        requiresTwoFactorSetup: true
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should deny access when 2FA code is missing', async () => {
      req.user = {
        id: 'user-1',
        twoFactorEnabled: true,
        twoFactorMethod: TwoFactorMethod.AUTHENTICATOR_APP,
        twoFactorSecret: 'test-secret'
      };

      await requireTwoFactor(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Two-factor authentication code required',
        requiresTwoFactorCode: true
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should deny access with invalid 2FA code', async () => {
      req.user = {
        id: 'user-1',
        twoFactorEnabled: true,
        twoFactorMethod: TwoFactorMethod.AUTHENTICATOR_APP,
        twoFactorSecret: 'test-secret'
      };
      req.headers['x-2fa-code'] = '000000';
      mockAuthService.prototype.verifyTwoFactor.mockResolvedValue(false);

      await requireTwoFactor(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid two-factor authentication code'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle 2FA verification errors gracefully', async () => {
      req.user = {
        id: 'user-1',
        twoFactorEnabled: true,
        twoFactorMethod: TwoFactorMethod.AUTHENTICATOR_APP,
        twoFactorSecret: 'test-secret'
      };
      req.headers['x-2fa-code'] = '123456';
      mockAuthService.prototype.verifyTwoFactor.mockRejectedValue(new Error('Service error'));

      await requireTwoFactor(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Two-factor authentication verification failed'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('optionalTwoFactor', () => {
    it('should allow access when 2FA is not enabled', async () => {
      req.user = {
        id: 'user-1',
        twoFactorEnabled: false
      };

      await optionalTwoFactor(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow access with valid 2FA code when enabled', async () => {
      req.user = {
        id: 'user-1',
        twoFactorEnabled: true,
        twoFactorMethod: TwoFactorMethod.AUTHENTICATOR_APP,
        twoFactorSecret: 'test-secret'
      };
      req.headers['x-2fa-code'] = '123456';
      mockAuthService.prototype.verifyTwoFactor.mockResolvedValue(true);

      await optionalTwoFactor(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should deny access when 2FA is enabled but code is missing', async () => {
      req.user = {
        id: 'user-1',
        twoFactorEnabled: true,
        twoFactorMethod: TwoFactorMethod.AUTHENTICATOR_APP,
        twoFactorSecret: 'test-secret'
      };

      await optionalTwoFactor(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Two-factor authentication code required',
        requiresTwoFactorCode: true
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should deny access with invalid 2FA code when enabled', async () => {
      req.user = {
        id: 'user-1',
        twoFactorEnabled: true,
        twoFactorMethod: TwoFactorMethod.AUTHENTICATOR_APP,
        twoFactorSecret: 'test-secret'
      };
      req.headers['x-2fa-code'] = '000000';
      mockAuthService.prototype.verifyTwoFactor.mockResolvedValue(false);

      await optionalTwoFactor(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid two-factor authentication code'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should deny access for unauthenticated users', async () => {
      await optionalTwoFactor(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireTwoFactorForSensitive', () => {
    it('should allow access for non-sensitive operations without 2FA', async () => {
      req.user = {
        id: 'user-1',
        twoFactorEnabled: false
      };
      req.path = '/api/regular';

      const middleware = requireTwoFactorForSensitive(['sensitive', 'delete']);
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should require 2FA for sensitive operations when enabled', async () => {
      req.user = {
        id: 'user-1',
        twoFactorEnabled: true,
        twoFactorMethod: TwoFactorMethod.AUTHENTICATOR_APP,
        twoFactorSecret: 'test-secret'
      };
      req.path = '/api/sensitive/delete';
      req.headers['x-2fa-code'] = '123456';
      mockAuthService.prototype.verifyTwoFactor.mockResolvedValue(true);

      const middleware = requireTwoFactorForSensitive(['delete', 'transfer']);
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should deny sensitive operations without 2FA setup', async () => {
      req.user = {
        id: 'user-1',
        twoFactorEnabled: false
      };
      req.path = '/api/sensitive/delete';

      const middleware = requireTwoFactorForSensitive(['delete']);
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Two-factor authentication required for this operation',
        requiresTwoFactorSetup: true
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should deny sensitive operations without 2FA code', async () => {
      req.user = {
        id: 'user-1',
        twoFactorEnabled: true,
        twoFactorMethod: TwoFactorMethod.AUTHENTICATOR_APP,
        twoFactorSecret: 'test-secret'
      };
      req.path = '/api/sensitive/delete';

      const middleware = requireTwoFactorForSensitive(['delete']);
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Two-factor authentication code required for this operation',
        requiresTwoFactorCode: true
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should deny sensitive operations with invalid 2FA code', async () => {
      req.user = {
        id: 'user-1',
        twoFactorEnabled: true,
        twoFactorMethod: TwoFactorMethod.AUTHENTICATOR_APP,
        twoFactorSecret: 'test-secret'
      };
      req.path = '/api/sensitive/delete';
      req.headers['x-2fa-code'] = '000000';
      mockAuthService.prototype.verifyTwoFactor.mockResolvedValue(false);

      const middleware = requireTwoFactorForSensitive(['delete']);
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid two-factor authentication code'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should match sensitive actions case-insensitively', async () => {
      req.user = {
        id: 'user-1',
        twoFactorEnabled: true,
        twoFactorMethod: TwoFactorMethod.AUTHENTICATOR_APP,
        twoFactorSecret: 'test-secret'
      };
      req.path = '/api/SENSITIVE/DELETE';
      req.headers['x-2fa-code'] = '123456';
      mockAuthService.prototype.verifyTwoFactor.mockResolvedValue(true);

      const middleware = requireTwoFactorForSensitive(['delete']);
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should handle method and path combination', async () => {
      req.user = {
        id: 'user-1',
        twoFactorEnabled: true,
        twoFactorMethod: TwoFactorMethod.AUTHENTICATOR_APP,
        twoFactorSecret: 'test-secret'
      };
      req.method = 'DELETE';
      req.path = '/api/users/123';
      req.headers['x-2fa-code'] = '123456';
      mockAuthService.prototype.verifyTwoFactor.mockResolvedValue(true);

      const middleware = requireTwoFactorForSensitive(['delete', 'users']);
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should deny access for unauthenticated users', async () => {
      const middleware = requireTwoFactorForSensitive(['delete']);
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
