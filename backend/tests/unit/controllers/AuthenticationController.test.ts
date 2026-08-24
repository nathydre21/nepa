import { Request, Response } from 'express';
import { TwoFactorMethod } from '@prisma/client';
import { mockRequest, mockResponse, mockNext, createMockAuth } from '../../mocks';

jest.mock('@prisma/client', () => ({
  TwoFactorMethod: {
    TOTP: 'TOTP',
    SMS: 'SMS',
    EMAIL: 'EMAIL',
    AUTHENTICATOR_APP: 'AUTHENTICATOR_APP',
  },
}));


jest.mock('../../../services/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    logError: jest.fn(),
  },
}));

jest.mock('../../../services/AuthenticationService', () => {
  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    loginWithWallet: jest.fn(),
    refreshToken: jest.fn(),
    logout: jest.fn(),
    enableTwoFactor: jest.fn(),
    verifyTwoFactor: jest.fn(),
    getTokenStatus: jest.fn(),
    disableTwoFactor: jest.fn(),
  };
  return {
    AuthenticationService: Object.assign(
      jest.fn(() => mockAuthService),
      { __mockInstance: mockAuthService }
    ),
  };
});

import { AuthenticationController } from '../../../controllers/AuthenticationController';
import { AuthenticationService } from '../../../services/AuthenticationService';

const mockAuthService = (AuthenticationService as any).__mockInstance;

describe('AuthenticationController', () => {
  let authController: AuthenticationController;
  let req: Request;
  let res: Response;

  beforeEach(() => {
    jest.clearAllMocks();
    authController = new AuthenticationController();
    req = mockRequest();
    res = mockResponse();
  });

  describe('register', () => {
    const validRegisterData = {
      email: 'test@example.com',
      password: 'password123',
      username: 'testuser',
      name: 'Test User'
    };

    it('should register successfully with valid data', async () => {
      req.body = validRegisterData;

      const mockUser = {
        id: 'user-id',
        email: validRegisterData.email,
        username: validRegisterData.username,
        name: validRegisterData.name,
        status: 'PENDING_VERIFICATION'
      };

      mockAuthService.register.mockResolvedValue({
        success: true,
        user: mockUser
      });

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Registration successful. Please verify your email.',
        user: {
          id: mockUser.id,
          email: mockUser.email,
          username: mockUser.username,
          name: mockUser.name,
          status: mockUser.status
        }
      });
    });

    it('should return validation error for invalid email', async () => {
      req.body = {
        email: 'invalid-email',
        password: 'password123'
      };

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
         success: false,
        error: expect.stringContaining('email')
      });
    });

    it('should return validation error for short password', async () => {
      req.body = {
        email: 'test@example.com',
        password: '123'
      };

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
         success: false,
        error: expect.stringContaining('password')
      });
    });

    it('should handle registration failure', async () => {
      req.body = validRegisterData;

      mockAuthService.register.mockResolvedValue({
        success: false,
        error: 'Email already registered'
      });

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
         success: false,
        error: 'Email already registered'
      });
    });

    it('should handle internal server error', async () => {
      req.body = validRegisterData;

      mockAuthService.register.mockRejectedValue(new Error('Database error'));

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
         success: false,
        error: 'Internal server error'
      });
    });
  });

  describe('login', () => {
    const validLoginData = {
      email: 'test@example.com',
      password: 'password123'
    };

    it('should login successfully with valid credentials', async () => {
      req.body = validLoginData;

      const mockUser = {
        id: 'user-id',
        email: validLoginData.email,
        username: 'testuser',
        name: 'Test User',
        role: 'USER',
        walletAddress: null
      };

      mockAuthService.login.mockResolvedValue({
        success: true,
        user: mockUser,
        token: 'jwt-token',
        refreshToken: 'refresh-token'
      });

      await authController.login(req, res);

      expect(res.json).toHaveBeenCalledWith({
        message: 'Login successful',
        user: {
          id: mockUser.id,
          email: mockUser.email,
          username: mockUser.username,
          name: mockUser.name,
          role: mockUser.role,
          walletAddress: mockUser.walletAddress
        },
        token: 'jwt-token',
        refreshToken: 'refresh-token'
      });
    });

    it('should handle 2FA requirement', async () => {
      req.body = validLoginData;

      mockAuthService.login.mockResolvedValue({
        success: false,
        requiresTwoFactor: true,
        twoFactorMethods: [TwoFactorMethod.AUTHENTICATOR_APP],
        error: 'Two-factor authentication required'
      });

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        requiresTwoFactor: true,
        twoFactorMethods: [TwoFactorMethod.AUTHENTICATOR_APP],
        error: 'Two-factor authentication required'
      });
    });

    it('should handle login failure', async () => {
      req.body = validLoginData;

      mockAuthService.login.mockResolvedValue({
        success: false,
        error: 'Invalid credentials'
      });

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
         success: false,
        error: 'Invalid credentials'
      });
    });

    it('should return validation error for missing email', async () => {
      req.body = {
        password: 'password123'
      };

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
         success: false,
        error: expect.stringContaining('email')
      });
    });
  });

  describe('loginWithWallet', () => {
    const validWalletData = {
      walletAddress: 'GDTESTACCOUNT123456789'
    };

    it('should login with wallet successfully', async () => {
      req.body = validWalletData;

      const mockUser = {
        id: 'user-id',
        email: `${validWalletData.walletAddress}@stellar.wallet`,
        username: null,
        name: null,
        role: 'USER',
        walletAddress: validWalletData.walletAddress
      };

      mockAuthService.loginWithWallet.mockResolvedValue({
        success: true,
        user: mockUser,
        token: 'jwt-token',
        refreshToken: 'refresh-token'
      });

      await authController.loginWithWallet(req, res);

      expect(res.json).toHaveBeenCalledWith({
        message: 'Wallet login successful',
        user: {
          id: mockUser.id,
          email: mockUser.email,
          username: mockUser.username,
          name: mockUser.name,
          role: mockUser.role,
          walletAddress: mockUser.walletAddress
        },
        token: 'jwt-token',
        refreshToken: 'refresh-token'
      });
    });

    it('should return validation error for missing wallet address', async () => {
      req.body = {};

      await authController.loginWithWallet(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
         success: false,
        error: expect.stringContaining('walletAddress')
      });
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      req.body = { refreshToken: 'valid-refresh-token' };

      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        username: 'testuser',
        name: 'Test User',
        role: 'USER'
      };

      mockAuthService.refreshToken.mockResolvedValue({
        success: true,
        user: mockUser,
        token: 'new-jwt-token',
        refreshToken: 'new-refresh-token'
      });

      await authController.refreshToken(req, res);

      expect(res.json).toHaveBeenCalledWith({
        token: 'new-jwt-token',
        refreshToken: 'new-refresh-token',
        user: {
          id: mockUser.id,
          email: mockUser.email,
          username: mockUser.username,
          name: mockUser.name,
          role: mockUser.role
        }
      });
    });

    it('should return error for missing refresh token', async () => {
      req.body = {};

      await authController.refreshToken(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
         success: false,
        error: 'Refresh token required'
      });
    });

    it('should handle refresh token failure', async () => {
      req.body = { refreshToken: 'invalid-refresh-token' };

      mockAuthService.refreshToken.mockResolvedValue({
        success: false,
        error: 'Invalid refresh token'
      });

      await authController.refreshToken(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
         success: false,
        error: 'Invalid refresh token'
      });
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      req.headers.authorization = 'Bearer valid-token';

      mockAuthService.logout.mockResolvedValue(true);

      await authController.logout(req, res);

      expect(res.json).toHaveBeenCalledWith({
        message: 'Logout successful'
      });
    });

    it('should return error for missing token', async () => {
      req.headers.authorization = undefined;

      await authController.logout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
         success: false,
        error: 'Token required'
      });
    });

    it('should handle logout failure', async () => {
      req.headers.authorization = 'Bearer invalid-token';

      mockAuthService.logout.mockResolvedValue(false);

      await authController.logout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
         success: false,
        error: 'Logout failed'
      });
    });
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        username: 'testuser',
        name: 'Test User',
        phoneNumber: '+1234567890',
        avatar: 'avatar.jpg',
        role: 'USER',
        status: 'ACTIVE',
        walletAddress: 'GDTESTACCOUNT123456789',
        isEmailVerified: true,
        isPhoneVerified: false,
        twoFactorEnabled: false,
        twoFactorMethod: null,
        lastLoginAt: new Date(),
        createdAt: new Date()
      };

      (req as any).user = mockUser;

      await authController.getProfile(req, res);

      expect(res.json).toHaveBeenCalledWith({
        user: {
          id: mockUser.id,
          email: mockUser.email,
          username: mockUser.username,
          name: mockUser.name,
          phoneNumber: mockUser.phoneNumber,
          avatar: mockUser.avatar,
          role: mockUser.role,
          status: mockUser.status,
          walletAddress: mockUser.walletAddress,
          isEmailVerified: mockUser.isEmailVerified,
          isPhoneVerified: mockUser.isPhoneVerified,
          twoFactorEnabled: mockUser.twoFactorEnabled,
          twoFactorMethod: mockUser.twoFactorMethod,
          lastLoginAt: mockUser.lastLoginAt,
          createdAt: mockUser.createdAt
        }
      });
    });
  });

  describe('enableTwoFactor', () => {
    it('should enable 2FA successfully', async () => {
      req.body = { method: TwoFactorMethod.AUTHENTICATOR_APP };

      const mockUser = createMockAuth('user-id');
      (req as any).user = mockUser;

      mockAuthService.enableTwoFactor.mockResolvedValue({
        secret: 'secret123',
        qrCode: 'data:image/png;base64,qrdata',
        backupCodes: ['CODE1', 'CODE2']
      });

      await authController.enableTwoFactor(req, res);

      expect(res.json).toHaveBeenCalledWith({
        message: 'Two-factor authentication enabled',
        secret: 'secret123',
        qrCode: 'data:image/png;base64,qrdata',
        backupCodes: ['CODE1', 'CODE2']
      });
    });

    it('should return validation error for invalid method', async () => {
      req.body = { method: 'INVALID_METHOD' };

      await authController.enableTwoFactor(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
         success: false,
        error: expect.stringContaining('method')
      });
    });

    it('should handle 2FA enable failure', async () => {
      req.body = { method: TwoFactorMethod.AUTHENTICATOR_APP };

      const mockUser = createMockAuth('user-id');
      (req as any).user = mockUser;

      mockAuthService.enableTwoFactor.mockResolvedValue({
        error: 'Failed to enable two-factor authentication'
      });

      await authController.enableTwoFactor(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
         success: false,
        error: 'Failed to enable two-factor authentication'
      });
    });
  });

  describe('verifyTwoFactor', () => {
    it('should verify 2FA successfully', async () => {
      req.body = { code: '123456' };

      const mockUser = createMockAuth('user-id');
      (req as any).user = mockUser;

      mockAuthService.verifyTwoFactor.mockResolvedValue(true);

      await authController.verifyTwoFactor(req, res);

      expect(res.json).toHaveBeenCalledWith({
        message: 'Two-factor authentication verified'
      });
    });

    it('should return validation error for missing code', async () => {
      req.body = {};

      await authController.verifyTwoFactor(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
         success: false,
        error: expect.stringContaining('code')
      });
    });

    it('should handle invalid 2FA code', async () => {
      req.body = { code: 'invalid-code' };

      const mockUser = createMockAuth('user-id');
      (req as any).user = mockUser;

      mockAuthService.verifyTwoFactor.mockResolvedValue(false);

      await authController.verifyTwoFactor(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
         success: false,
        error: 'Invalid two-factor code'
      });
    });
  });
});
