import { Request, Response } from 'express';
import { BaseController } from '../BaseController';
import { ApiResponse, ResponseBuilder, HttpStatus, ErrorCode } from '../../interfaces/ApiResponse';
import { AuthenticationService, LoginCredentials, RegisterData } from '../../services/AuthenticationService';
import { TwoFactorMethod } from '@prisma/client';
import Joi from 'joi';
import { RequestValidation, CommonSchemas } from '../../middleware/RequestValidation';

/**
 * Standardized Authentication Controller v1
 * Implements REST API best practices with standardized responses
 */
export class AuthenticationController extends BaseController {
  private authService: AuthenticationService;

  constructor() {
    super();
    this.authService = new AuthenticationService();
  }

  /**
   * Register a new user
   * POST /api/v1/auth/register
   */
  register = this.asyncHandler(async (req: Request, res: Response) => {
    // Validate request body
    const registerData = this.validateBody<RegisterData>(req, CommonSchemas.register);

    // Check if user already exists
    const existingUser = await this.authService.findByEmail(registerData.email);
    if (existingUser) {
      return res.conflict('A user with this email already exists');
    }

    // Register user
    const result = await this.authService.register(registerData);
    
    if (!result.success) {
      return res.error(
        ErrorCode.EMAIL_ALREADY_EXISTS,
        result.error || 'Registration failed',
        HttpStatus.BAD_REQUEST
      );
    }

    // Return success response
    res.created({
      message: 'Registration successful. Please check your email for verification.',
      user: {
        id: result.user!.id,
        email: result.user!.email,
        username: result.user!.username,
        name: result.user!.name,
        status: result.user!.status,
        isEmailVerified: result.user!.isEmailVerified
      }
    });
  });

  /**
   * Authenticate user
   * POST /api/v1/auth/login
   */
  login = this.asyncHandler(async (req: Request, res: Response) => {
    // Validate request body
    const credentials = this.validateBody<LoginCredentials>(req, CommonSchemas.login);

    // Get request metadata
    const userAgent = req.headers['user-agent'] || 'unknown';
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';

    // Authenticate user
    const result = await this.authService.login(credentials, userAgent, ipAddress);
    
    if (!result.success) {
      if (result.requiresTwoFactor) {
        return res.error(
          ErrorCode.TWO_FACTOR_REQUIRED,
          'Two-factor authentication required',
          HttpStatus.UNAUTHORIZED,
          {
            requiresTwoFactor: true,
            twoFactorMethods: result.twoFactorMethods,
            tempToken: result.tempToken
          }
        );
      }

      return res.error(
        ErrorCode.INVALID_CREDENTIALS,
        result.error || 'Authentication failed',
        HttpStatus.UNAUTHORIZED
      );
    }

    // Set secure headers for tokens
    this.setNoCacheHeaders(res);
    
    // Return success response
    res.success({
      message: 'Login successful',
      user: {
        id: result.user!.id,
        email: result.user!.email,
        username: result.user!.username,
        name: result.user!.name,
        role: result.user!.role,
        status: result.user!.status,
        isEmailVerified: result.user!.isEmailVerified,
        twoFactorEnabled: result.user!.twoFactorEnabled,
        lastLoginAt: result.user!.lastLoginAt
      },
      tokens: {
        accessToken: result.token,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
        tokenType: 'Bearer'
      }
    });
  });

  /**
   * Login with wallet
   * POST /api/v1/auth/wallet
   */
  loginWithWallet = this.asyncHandler(async (req: Request, res: Response) => {
    // Validate request body
    const { walletAddress } = this.validateBody(req, Joi.object({
      walletAddress: Joi.string().required().pattern(/^0x[a-fA-F0-9]{40}$/)
    }));

    // Get request metadata
    const userAgent = req.headers['user-agent'] || 'unknown';
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';

    // Authenticate with wallet
    const result = await this.authService.loginWithWallet(walletAddress, userAgent, ipAddress);
    
    if (!result.success) {
      return res.error(
        ErrorCode.INVALID_CREDENTIALS,
        result.error || 'Wallet authentication failed',
        HttpStatus.UNAUTHORIZED
      );
    }

    // Set secure headers for tokens
    this.setNoCacheHeaders(res);
    
    // Return success response
    res.success({
      message: 'Wallet login successful',
      user: {
        id: result.user!.id,
        email: result.user!.email,
        username: result.user!.username,
        name: result.user!.name,
        role: result.user!.role,
        status: result.user!.status,
        walletAddress: result.user!.walletAddress
      },
      tokens: {
        accessToken: result.token,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
        tokenType: 'Bearer'
      }
    });
  });

  /**
   * Refresh JWT token
   * POST /api/v1/auth/refresh
   */
  refreshToken = this.asyncHandler(async (req: Request, res: Response) => {
    // Validate request body
    const { refreshToken } = this.validateBody(req, Joi.object({
      refreshToken: Joi.string().required()
    }));

    if (!refreshToken || refreshToken.trim().length === 0) {
      return res.error(
        ErrorCode.INVALID_INPUT,
        'Refresh token is required',
        HttpStatus.BAD_REQUEST
      );
    }

    // Refresh token
    const result = await this.authService.refreshToken(refreshToken);
    
    if (!result.success) {
      return res.error(
        ErrorCode.TOKEN_INVALID,
        result.error || 'Token refresh failed',
        HttpStatus.UNAUTHORIZED
      );
    }

    // Set secure headers for new tokens
    this.setNoCacheHeaders(res);
    
    // Return success response
    res.success({
      message: 'Token refreshed successfully',
      tokens: {
        accessToken: result.token,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
        tokenType: 'Bearer'
      },
      user: {
        id: result.user!.id,
        email: result.user!.email,
        username: result.user!.username,
        role: result.user!.role
      }
    });
  });

  /**
   * Logout user
   * POST /api/v1/auth/logout
   */
  logout = this.asyncHandler(async (req: Request, res: Response) => {
    // Get token from authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '') || authHeader?.replace('Bearer ', '');

    if (!token) {
      return res.error(
        ErrorCode.TOKEN_REQUIRED,
        'Authorization token is required',
        HttpStatus.BAD_REQUEST
      );
    }

    // Logout user
    const success = await this.authService.logout(token);
    
    if (!success) {
      return res.error(
        ErrorCode.TOKEN_INVALID,
        'Invalid token',
        HttpStatus.UNAUTHORIZED
      );
    }

    // Set no-cache headers
    this.setNoCacheHeaders(res);
    
    // Return success response
    res.success({
      message: 'Logout successful'
    });
  });

  /**
   * Get current user profile
   * GET /api/v1/auth/me
   */
  getProfile = this.asyncHandler(async (req: Request, res: Response) => {
    const user = this.getUser(req);
    
    if (!user) {
      return res.unauthorized('Authentication required');
    }

    // Return user profile
    res.success({
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
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  });

  /**
   * Enable two-factor authentication
   * POST /api/v1/auth/2fa/enable
   */
  enableTwoFactor = this.asyncHandler(async (req: Request, res: Response) => {
    const user = this.getUser(req);
    
    if (!user) {
      return res.unauthorized('Authentication required');
    }

    // Validate request body
    const { method } = this.validateBody(req, Joi.object({
      method: Joi.string().valid(...Object.values(TwoFactorMethod)).required()
    }));

    // Enable 2FA
    const result = await this.authService.enableTwoFactor(user.id, method);
    
    if (!result.success) {
      return res.error(
        ErrorCode.INTERNAL_ERROR,
        result.error || 'Failed to enable two-factor authentication',
        HttpStatus.BAD_REQUEST
      );
    }

    // Return success response with 2FA setup details
    res.success({
      message: 'Two-factor authentication enabled',
      twoFactor: {
        method: result.method,
        secret: result.secret,
        qrCode: result.qrCode,
        backupCodes: result.backupCodes
      }
    });
  });

  /**
   * Verify two-factor authentication
   * POST /api/v1/auth/2fa/verify
   */
  verifyTwoFactor = this.asyncHandler(async (req: Request, res: Response) => {
    const user = this.getUser(req);
    
    if (!user) {
      return res.unauthorized('Authentication required');
    }

    // Validate request body
    const { code } = this.validateBody(req, Joi.object({
      code: Joi.string().required().length(6)
    }));

    // Verify 2FA code
    const isValid = await this.authService.verifyTwoFactor(user, code);
    
    if (!isValid) {
      return res.error(
        ErrorCode.INVALID_TWO_FACTOR,
        'Invalid two-factor authentication code',
        HttpStatus.BAD_REQUEST
      );
    }

    // Return success response
    res.success({
      message: 'Two-factor authentication verified successfully',
      user: {
        id: user.id,
        email: user.email,
        twoFactorEnabled: true,
        twoFactorMethod: user.twoFactorMethod
      }
    });
  });

  /**
   * Disable two-factor authentication
   * POST /api/v1/auth/2fa/disable
   */
  disableTwoFactor = this.asyncHandler(async (req: Request, res: Response) => {
    const user = this.getUser(req);
    
    if (!user) {
      return res.unauthorized('Authentication required');
    }

    // Validate request body (password required for security)
    const { password } = this.validateBody(req, Joi.object({
      password: Joi.string().required()
    }));

    // Disable 2FA
    const result = await this.authService.disableTwoFactor(user.id, password);
    
    if (!result.success) {
      return res.error(
        ErrorCode.INVALID_CREDENTIALS,
        result.error || 'Failed to disable two-factor authentication',
        HttpStatus.BAD_REQUEST
      );
    }

    // Return success response
    res.success({
      message: 'Two-factor authentication disabled successfully',
      user: {
        id: user.id,
        email: user.email,
        twoFactorEnabled: false
      }
    });
  });

  /**
   * Get authentication methods
   * GET /api/v1/auth/methods
   */
  getAuthMethods = this.asyncHandler(async (req: Request, res: Response) => {
    const user = this.getUser(req);
    
    if (!user) {
      return res.unauthorized('Authentication required');
    }

    // Get available authentication methods
    const methods = await this.authService.getAvailableMethods(user.id);
    
    res.success({
      methods: methods
    });
  });

  /**
   * Check if email is available
   * GET /api/v1/auth/check-email
   */
  checkEmailAvailability = this.asyncHandler(async (req: Request, res: Response) => {
    const { email } = this.validateQuery(req, Joi.object({
      email: CommonSchemas.email
    }));

    // Check email availability
    const existingUser = await this.authService.findByEmail(email);
    
    res.success({
      email,
      available: !existingUser
    });
  });

  /**
   * Check if username is available
   * GET /api/v1/auth/check-username
   */
  checkUsernameAvailability = this.asyncHandler(async (req: Request, res: Response) => {
    const { username } = this.validateQuery(req, Joi.object({
      username: CommonSchemas.username
    }));

    // Check username availability
    const existingUser = await this.authService.findByUsername(username);
    
    res.success({
      username,
      available: !existingUser
    });
  });

  /**
   * Request password reset
   * POST /api/v1/auth/forgot-password
   */
  forgotPassword = this.asyncHandler(async (req: Request, res: Response) => {
    const { email } = this.validateBody(req, Joi.object({
      email: CommonSchemas.email
    }));

    // Request password reset
    const result = await this.authService.requestPasswordReset(email);
    
    if (!result.success) {
      return res.error(
        ErrorCode.INTERNAL_ERROR,
        result.error || 'Failed to process password reset request',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }

    // Always return success to avoid revealing email existence
    res.success({
      message: 'If an account with that email exists, a password reset link has been sent.'
    });
  });

  /**
   * Reset password with token
   * POST /api/v1/auth/reset-password
   */
  resetPassword = this.asyncHandler(async (req: Request, res: Response) => {
    const { token, newPassword } = this.validateBody(req, Joi.object({
      token: Joi.string().required(),
      newPassword: Joi.string().min(8).required().pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .messages({
          'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
        })
    }));

    // Reset password
    const result = await this.authService.resetPassword(token, newPassword);
    
    if (!result.success) {
      return res.error(
        ErrorCode.INVALID_INPUT,
        result.error || 'Failed to reset password',
        HttpStatus.BAD_REQUEST
      );
    }

    res.success({
      message: 'Password reset successfully. Please log in with your new password.'
    });
  });

  /**
   * Get token status and expiration information
   * GET /api/v1/auth/token-status
   */
  getTokenStatus = this.asyncHandler(async (req: Request, res: Response) => {
    // Get token from authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace(/^Bearer\s+/i, '');

    if (!token) {
      return res.error(
        ErrorCode.TOKEN_REQUIRED,
        'Authorization token is required',
        HttpStatus.BAD_REQUEST
      );
    }

    const status = await this.authService.getTokenStatus(token);

    if (!status.valid) {
      return res.error(
        ErrorCode.TOKEN_INVALID,
        status.error || 'Token is invalid or expired',
        status.warningLevel === 'expired' ? HttpStatus.UNAUTHORIZED : HttpStatus.BAD_REQUEST,
        {
          valid: status.valid,
          warningLevel: status.warningLevel,
          expiresAt: status.expiresAt
        }
      );
    }

    const response: any = {
      valid: status.valid,
      expiresAt: status.expiresAt,
      timeUntilExpiry: status.timeUntilExpiry,
      warningLevel: status.warningLevel
    };

    if (status.warningLevel === 'critical') {
      response.message = 'Your session will expire in less than 1 minute. Please save your work.';
      response.actionRequired = true;
    } else if (status.warningLevel === 'warning') {
      response.message = 'Your session will expire in less than 5 minutes.';
      response.actionRequired = false;
    } else {
      response.message = 'Session is active';
      response.actionRequired = false;
    }

    res.success(response);
  });

  /**
   * Verify password reset token
   * POST /api/v1/auth/verify-reset-token
   */
  verifyResetToken = this.asyncHandler(async (req: Request, res: Response) => {
    const { token } = this.validateBody(req, Joi.object({
      token: Joi.string().required()
    }));

    const result = await this.authService.verifyResetToken(token);

    if (!result.success) {
      return res.error(
        ErrorCode.INTERNAL_ERROR,
        result.error || 'Failed to verify token',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }

    if (!result.valid) {
      return res.error(
        ErrorCode.INVALID_INPUT,
        result.error || 'Invalid or expired reset token',
        HttpStatus.BAD_REQUEST
      );
    }

    res.success({
      valid: true,
      email: result.email
    });
  });
}
