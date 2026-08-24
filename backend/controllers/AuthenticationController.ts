import { Request, Response } from 'express';
import { AuthenticationService, LoginCredentials, RegisterData } from '../services/AuthenticationService';
import { TwoFactorMethod } from '@prisma/client';
import Joi from 'joi';
import logger from '../services/logger';
import { errorResponse } from '../utils/errorResponse';

// Initialize authentication service instance
const authService = new AuthenticationService();

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  username: Joi.string().alphanum().min(3).max(30).optional(),
  name: Joi.string().min(1).max(100).optional(),
  phoneNumber: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
  twoFactorCode: Joi.string().optional()
});

const walletLoginSchema = Joi.object({
  walletAddress: Joi.string().required()
});

const enable2FASchema = Joi.object({
  method: Joi.string().valid(...Object.values(TwoFactorMethod)).required()
});

const verify2FASchema = Joi.object({
  code: Joi.string().required()
});

export class AuthenticationController {
  /**
   * Handles user registration
   * @param req Express request object with registration data
   * @param res Express response object
   */
  async register(req: Request, res: Response) {
    try {
      // Validate registration input
      const { error, value } = registerSchema.validate(req.body);
      if (error) {
        logger.warn('Registration validation failed', {
          method: req.method,
          url: req.url,
          ip: req.ip,
          error: error.details[0].message
        });
        return errorResponse(res, 400, error.details[0].message);
      }

      // Call authentication service to register user
      const result = await authService.register(value as RegisterData);
      
      if (result.success) {
        logger.info('User registered successfully', {
          method: req.method,
          url: req.url,
          ip: req.ip,
          userId: result.user?.id,
          email: result.user?.email
        });
        res.status(201).json({
          message: 'Registration successful. Please verify your email.',
          user: {
            id: result.user!.id,
            email: result.user!.email,
            username: result.user!.username,
            name: result.user!.name,
            status: result.user!.status
          }
        });
      } else {
        logger.warn('Registration failed', {
          method: req.method,
          url: req.url,
          ip: req.ip,
          error: result.error
        });
        errorResponse(res, 400, result.error);
      }
    } catch (error) {
      logger.logError(error as Error, {
        method: req.method,
        url: req.url,
        ip: req.ip
      });
      errorResponse(res, 500, 'Internal server error');
    }
  }

  /**
   * Handles user login with email/password
   * @param req Express request object with login credentials
   * @param res Express response object
   */
  async login(req: Request, res: Response) {
    try {
      // Validate login input
      const { error, value } = loginSchema.validate(req.body);
      if (error) {
        logger.warn('Login validation failed', {
          method: req.method,
          url: req.url,
          ip: req.ip,
          error: error.details[0].message
        });
        return errorResponse(res, 400, error.details[0].message);
      }

      // Get user agent and IP for audit
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip || req.connection.remoteAddress;

      // Call authentication service to login
      const result = await authService.login(value as LoginCredentials, userAgent, ipAddress);
      
      if (result.success) {
        logger.info('User logged in successfully', {
          method: req.method,
          url: req.url,
          ip: req.ip,
          userId: result.user?.id,
          email: result.user?.email
        });
        res.json({
          message: 'Login successful',
          user: {
            id: result.user!.id,
            email: result.user!.email,
            username: result.user!.username,
            name: result.user!.name,
            role: result.user!.role,
            walletAddress: result.user!.walletAddress
          },
          token: result.token,
          refreshToken: result.refreshToken
        });
      } else if (result.requiresTwoFactor) {
        logger.info('Login requires two-factor authentication', {
          method: req.method,
          url: req.url,
          ip: req.ip,
          email: value.email
        });
        // Not an error response — challenge payload for 2FA continuation
        res.status(200).json({
          requiresTwoFactor: true,
          twoFactorMethods: result.twoFactorMethods,
          error: result.error
        });
      } else {
        logger.warn('Login failed', {
          method: req.method,
          url: req.url,
          ip: req.ip,
          email: value.email,
          error: result.error
        });
        errorResponse(res, 401, result.error);
      }
    } catch (error) {
      logger.logError(error as Error, {
        method: req.method,
        url: req.url,
        ip: req.ip
      });
      errorResponse(res, 500, 'Internal server error');
    }
  }

  /**
   * Handles user login with wallet address
   * @param req Express request object with wallet address
   * @param res Express response object
   */
  async loginWithWallet(req: Request, res: Response) {
    try {
      // Validate wallet login input
      const { error, value } = walletLoginSchema.validate(req.body);
      if (error) {
        logger.warn('Wallet login validation failed', {
          method: req.method,
          url: req.url,
          ip: req.ip,
          error: error.details[0].message
        });
        return errorResponse(res, 400, error.details[0].message);
      }

      // Get user agent and IP for audit
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip || req.connection.remoteAddress;

      // Call authentication service for wallet login
      const result = await authService.loginWithWallet(value.walletAddress, userAgent, ipAddress);
      
      if (result.success) {
        logger.info('Wallet login successful', {
          method: req.method,
          url: req.url,
          ip: req.ip,
          userId: result.user?.id,
          walletAddress: value.walletAddress
        });
        res.json({
          message: 'Wallet login successful',
          user: {
            id: result.user!.id,
            email: result.user!.email,
            username: result.user!.username,
            name: result.user!.name,
            role: result.user!.role,
            walletAddress: result.user!.walletAddress
          },
          token: result.token,
          refreshToken: result.refreshToken
        });
      } else {
        logger.warn('Wallet login failed', {
          method: req.method,
          url: req.url,
          ip: req.ip,
          walletAddress: value.walletAddress,
          error: result.error
        });
        errorResponse(res, 401, result.error);
      }
    } catch (error) {
      logger.logError(error as Error, {
        method: req.method,
        url: req.url,
        ip: req.ip
      });
      errorResponse(res, 500, 'Internal server error');
    }
  }

  /**
   * Handles refreshing authentication tokens
   * @param req Express request object with refresh token
   * @param res Express response object
   */
  async refreshToken(req: Request, res: Response) {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        logger.warn('Refresh token request missing token', {
          method: req.method,
          url: req.url,
          ip: req.ip
        });
        return errorResponse(res, 400, 'Refresh token required');
      }

      // Call authentication service to refresh tokens
      const result = await authService.refreshToken(refreshToken);
      
      if (result.success) {
        logger.info('Token refreshed successfully', {
          method: req.method,
          url: req.url,
          ip: req.ip,
          userId: result.user?.id
        });
        res.json({
          token: result.token,
          refreshToken: result.refreshToken,
          user: {
            id: result.user!.id,
            email: result.user!.email,
            username: result.user!.username,
            name: result.user!.name,
            role: result.user!.role
          }
        });
      } else {
        logger.warn('Token refresh failed', {
          method: req.method,
          url: req.url,
          ip: req.ip,
          error: result.error
        });
        errorResponse(res, 401, result.error);
      }
    } catch (error) {
      logger.logError(error as Error, {
        method: req.method,
        url: req.url,
        ip: req.ip
      });
      errorResponse(res, 500, 'Internal server error');
    }
  }

  /**
   * Handles user logout
   * @param req Express request object with authorization token
   * @param res Express response object
   */
  async logout(req: Request, res: Response) {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        logger.warn('Logout request missing token', {
          method: req.method,
          url: req.url,
          ip: req.ip
        });
        return errorResponse(res, 400, 'Token required');
      }

      // Call authentication service to logout
      const success = await authService.logout(token);
      
      if (success) {
        logger.info('User logged out successfully', {
          method: req.method,
          url: req.url,
          ip: req.ip,
          userId: (req as any).user?.id
        });
        res.json({ message: 'Logout successful' });
      } else {
        logger.warn('Logout failed', {
          method: req.method,
          url: req.url,
          ip: req.ip
        });
        errorResponse(res, 400, 'Logout failed');
      }
    } catch (error) {
      logger.logError(error as Error, {
        method: req.method,
        url: req.url,
        ip: req.ip
      });
      errorResponse(res, 500, 'Internal server error');
    }
  }

  /**
   * Retrieves authenticated user's profile
   * @param req Express request object with user data
   * @param res Express response object
   */
  async getProfile(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      
      logger.info('Profile retrieved', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userId: user.id
      });
      res.json({
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          name: user.name,
          phoneNumber: user.phoneNumber,
          avatar: user.avatar,
          role: user.role,
          status: user.status,
          walletAddress: user.walletAddress,
          isEmailVerified: user.isEmailVerified,
          isPhoneVerified: user.isPhoneVerified,
          twoFactorEnabled: user.twoFactorEnabled,
          twoFactorMethod: user.twoFactorMethod,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt
        }
      });
    } catch (error) {
      logger.logError(error as Error, {
        method: req.method,
        url: req.url,
        ip: req.ip
      });
      errorResponse(res, 500, 'Internal server error');
    }
  }

  /**
   * Enables two-factor authentication for a user
   * @param req Express request object with 2FA method
   * @param res Express response object
   */
  async enableTwoFactor(req: Request, res: Response) {
    try {
      // Validate 2FA enable input
      const { error, value } = enable2FASchema.validate(req.body);
      if (error) {
        logger.warn('Enable 2FA validation failed', {
          method: req.method,
          url: req.url,
          ip: req.ip,
          error: error.details[0].message
        });
        return errorResponse(res, 400, error.details[0].message);
      }

      const user = (req as any).user;
      const result = await authService.enableTwoFactor(user.id, value.method);
      
      if (result.error) {
        logger.warn('Enable 2FA failed', {
          method: req.method,
          url: req.url,
          ip: req.ip,
          userId: user.id,
          error: result.error
        });
        return errorResponse(res, 400, result.error);
      }

      logger.info('2FA enabled successfully', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userId: user.id,
        method: value.method
      });
      res.json({
        message: 'Two-factor authentication enabled',
        secret: result.secret,
        qrCode: result.qrCode,
        backupCodes: result.backupCodes
      });
    } catch (error) {
      logger.logError(error as Error, {
        method: req.method,
        url: req.url,
        ip: req.ip
      });
      errorResponse(res, 500, 'Internal server error');
    }
  }

  /**
   * Verifies two-factor authentication code
   * @param req Express request object with 2FA code
   * @param res Express response object
   */
  async verifyTwoFactor(req: Request, res: Response) {
    try {
      // Validate 2FA verify input
      const { error, value } = verify2FASchema.validate(req.body);
      if (error) {
        logger.warn('Verify 2FA validation failed', {
          method: req.method,
          url: req.url,
          ip: req.ip,
          error: error.details[0].message
        });
        return errorResponse(res, 400, error.details[0].message);
      }

      const user = (req as any).user;
      const isValid = await authService.verifyTwoFactor(user, value.code);
      
      if (isValid) {
        logger.info('2FA verified successfully', {
          method: req.method,
          url: req.url,
          ip: req.ip,
          userId: user.id
        });
        res.json({ message: 'Two-factor authentication verified' });
      } else {
        logger.warn('2FA verification failed', {
          method: req.method,
          url: req.url,
          ip: req.ip,
          userId: user.id
        });
        errorResponse(res, 400, 'Invalid two-factor code');
      }
    } catch (error) {
      logger.logError(error as Error, {
        method: req.method,
        url: req.url,
        ip: req.ip
      });
      errorResponse(res, 500, 'Internal server error');
    }
  }

  /**
   * Disables two-factor authentication for a user
   * @param req Express request object with user data
   * @param res Express response object
   */
  async disableTwoFactor(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      const result = await authService.disableTwoFactor(user.id);
      
      if (result.error) {
        logger.warn('Disable 2FA failed', {
          method: req.method,
          url: req.url,
          ip: req.ip,
          userId: user.id,
          error: result.error
        });
        return errorResponse(res, 400, result.error);
      }

      logger.info('2FA disabled successfully', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userId: user.id
      });
      res.json({ message: 'Two-factor authentication disabled successfully' });
    } catch (error) {
      logger.logError(error as Error, {
        method: req.method,
        url: req.url,
        ip: req.ip
      });
      errorResponse(res, 500, 'Internal server error');
    }
  }

  /**
   * Retrieves the status of the current authentication token
   * @param req Express request object with authorization token
   * @param res Express response object
   */
  async getTokenStatus(req: Request, res: Response) {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        logger.warn('Token status request missing token', {
          method: req.method,
          url: req.url,
          ip: req.ip
        });
        return errorResponse(res, 400, 'Token required');
      }

      // Call authentication service to get token status
      const status = await authService.getTokenStatus(token);
      
      if (status.error) {
        logger.warn('Token status check failed', {
          method: req.method,
          url: req.url,
          ip: req.ip,
          error: status.error
        });
        return errorResponse(res, 401, status.error);
      }

      logger.info('Token status retrieved', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        valid: status.valid,
        warningLevel: status.warningLevel
      });
      res.json({
        valid: status.valid,
        expiresAt: status.expiresAt,
        timeUntilExpiry: status.timeUntilExpiry,
        warningLevel: status.warningLevel,
        message: status.warningLevel === 'critical' 
          ? 'Your session will expire in less than 1 minute. Please save your work.'
          : status.warningLevel === 'warning'
          ? 'Your session will expire in less than 5 minutes.'
          : 'Session is active'
      });
    } catch (error) {
      logger.logError(error as Error, {
        method: req.method,
        url: req.url,
        ip: req.ip
      });
      errorResponse(res, 500, 'Internal server error');
    }
  }
}
