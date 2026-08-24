import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import { PrismaClient, User, UserRole, UserStatus, TwoFactorMethod } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { auditService } from './AuditService';
import { AuditAction, AuditSeverity, AuditStatus } from '../databases/audit-service/schema.prisma';
import { emailService } from './EmailService';

const prisma = new PrismaClient();

export interface LoginCredentials {
  email: string;
  password: string;
  twoFactorCode?: string;
}

export interface RegisterData {
  email: string;
  password: string;
  username?: string;
  name?: string;
  phoneNumber?: string;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  token?: string;
  refreshToken?: string;
  requiresTwoFactor?: boolean;
  twoFactorMethods?: TwoFactorMethod[];
  error?: string;
}

export interface SessionData {
  userId: string;
  token: string;
  refreshToken: string;
  userAgent?: string;
  ipAddress?: string;
}

export class AuthenticationService {
  private readonly JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
  private readonly JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret';
  private readonly TOKEN_EXPIRY = '15m';
  private readonly REFRESH_TOKEN_EXPIRY = '7d';

  async register(data: RegisterData): Promise<AuthResult> {
    try {
      // Check if user already exists
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email: data.email },
            { username: data.username }
          ]
        }
      });

      if (existingUser) {
        return {
          success: false,
          error: existingUser.email === data.email ? 'Email already registered' : 'Username already taken'
        };
      }

      // Hash password
      const passwordHash = await bcrypt.hash(data.password, 12);

      // Create user
      const user = await prisma.user.create({
        data: {
          email: data.email,
          username: data.username,
          passwordHash,
          name: data.name,
          phoneNumber: data.phoneNumber,
          status: UserStatus.PENDING_VERIFICATION
        }
      });

      // Create user profile
      await prisma.userProfile.create({
        data: {
          userId: user.id
        }
      });

      // Log audit using new audit service
      await auditService.logAudit({
        action: AuditAction.USER_REGISTER,
        resource: 'user',
        resourceId: user.id,
        description: `New user registered - ${data.email}`,
        severity: AuditSeverity.MEDIUM,
        status: AuditStatus.SUCCESS,
        metadata: {
          email: data.email,
          username: data.username,
          registrationMethod: 'email'
        }
      });

      return {
        success: true,
        user
      };
    } catch (error) {
      console.error('Registration error:', error);
      return {
        success: false,
        error: 'Registration failed'
      };
    }
  }

  async login(credentials: LoginCredentials, userAgent?: string, ipAddress?: string): Promise<AuthResult> {
    try {
      // Find user
      const user = await prisma.user.findUnique({
        where: { email: credentials.email }
      });

      if (!user) {
        return {
          success: false,
          error: 'Invalid credentials'
        };
      }

      // Check if account is locked
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        return {
          success: false,
          error: 'Account temporarily locked. Please try again later.'
        };
      }

      // Check if user is active
      if (user.status !== UserStatus.ACTIVE) {
        return {
          success: false,
          error: 'Account is not active'
        };
      }

      // Verify password
      if (!user.passwordHash || !await bcrypt.compare(credentials.password, user.passwordHash)) {
        await this.handleFailedLogin(user.id);
        return {
          success: false,
          error: 'Invalid credentials'
        };
      }

      // Check 2FA
      if (user.twoFactorEnabled) {
        if (!credentials.twoFactorCode) {
          return {
            success: false,
            requiresTwoFactor: true,
            twoFactorMethods: [user.twoFactorMethod],
            error: 'Two-factor authentication required'
          };
        }

        const isValid2FA = await this.verifyTwoFactor(user, credentials.twoFactorCode);
        if (!isValid2FA) {
          return {
            success: false,
            error: 'Invalid two-factor code'
          };
        }
      }

      // Reset login attempts on successful login
      await prisma.user.update({
        where: { id: user.id },
        data: {
          loginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: new Date()
        }
      });

      // Create session
      const sessionData = await this.createSession(user.id, userAgent, ipAddress);

      // Log audit
      await this.logAudit(user.id, 'USER_LOGIN', 'user', user.id, {
        userAgent,
        ipAddress
      });

      return {
        success: true,
        user,
        token: sessionData.token,
        refreshToken: sessionData.refreshToken
      };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: 'Login failed'
      };
    }
  }

  async loginWithWallet(walletAddress: string, userAgent?: string, ipAddress?: string): Promise<AuthResult> {
    try {
      // Find user by wallet address
      let user = await prisma.user.findUnique({
        where: { walletAddress }
      });

      // If user doesn't exist, create one with wallet auth
      if (!user) {
        user = await prisma.user.create({
          data: {
            email: `${walletAddress}@stellar.wallet`,
            walletAddress,
            status: UserStatus.ACTIVE,
            isEmailVerified: true // Wallet users are considered verified
          }
        });

        // Create user profile
        await prisma.userProfile.create({
          data: {
            userId: user.id
          }
        });

        // Log audit using new audit service
        await auditService.logAudit({
          action: AuditAction.USER_REGISTER,
          resource: 'user',
          resourceId: user.id,
          description: `New user registered with wallet - ${walletAddress}`,
          severity: AuditSeverity.MEDIUM,
          status: AuditStatus.SUCCESS,
          metadata: {
            walletAddress,
            registrationMethod: 'wallet'
          }
        });
      }

      // Check if user is active
      if (user.status !== UserStatus.ACTIVE) {
        return {
          success: false,
          error: 'Account is not active'
        };
      }

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: {
          lastLoginAt: new Date()
        }
      });

      // Create session
      const sessionData = await this.createSession(user.id, userAgent, ipAddress);

      // Log audit
      await this.logAudit(user.id, 'USER_LOGIN_WALLET', 'user', user.id, {
        walletAddress,
        userAgent,
        ipAddress
      });

      return {
        success: true,
        user,
        token: sessionData.token,
        refreshToken: sessionData.refreshToken
      };
    } catch (error) {
      console.error('Wallet login error:', error);
      return {
        success: false,
        error: 'Wallet login failed'
      };
    }
  }

  async refreshToken(refreshToken: string): Promise<AuthResult> {
    try {
      const decoded = jwt.verify(refreshToken, this.JWT_REFRESH_SECRET) as { userId: string };
      
      // Find and validate session
      const session = await prisma.userSession.findFirst({
        where: {
          refreshToken,
          userId: decoded.userId,
          isActive: true,
          expiresAt: { gt: new Date() }
        },
        include: { user: true }
      });

      if (!session) {
        return {
          success: false,
          error: 'Invalid refresh token'
        };
      }

      // Create new session
      const newSessionData = await this.createSession(session.userId, session.userAgent, session.ipAddress);
      
      // Deactivate old session
      await prisma.userSession.update({
        where: { id: session.id },
        data: { isActive: false }
      });

      return {
        success: true,
        user: session.user,
        token: newSessionData.token,
        refreshToken: newSessionData.refreshToken
      };
    } catch (error) {
      return {
        success: false,
        error: 'Invalid refresh token'
      };
    }
  }

  async logout(token: string): Promise<boolean> {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET) as { sessionId: string };
      
      await prisma.userSession.update({
        where: { id: decoded.sessionId },
        data: { isActive: false }
      });

      const session = await prisma.userSession.findUnique({
        where: { id: decoded.sessionId }
      });

      if (session) {
        await this.logAudit(session.userId, 'USER_LOGOUT', 'user', session.userId);
      }

      return true;
    } catch (error) {
      console.error('Logout error:', error);
      return false;
    }
  }

  async enableTwoFactor(userId: string, method: TwoFactorMethod): Promise<{ secret?: string; qrCode?: string; backupCodes?: string[]; error?: string }> {
    try {
      if (method === TwoFactorMethod.AUTHENTICATOR_APP) {
        const secret = speakeasy.generateSecret({
          name: `NEPA (${userId})`,
          issuer: 'NEPA'
        });

        const qrCode = await qrcode.toDataURL(secret.otpauth_url!);

        // Generate backup codes
        const backupCodes = Array.from({ length: 10 }, () => 
          Math.random().toString(36).substring(2, 10).toUpperCase()
        );

        // Store secret and backup codes
        await prisma.user.update({
          where: { id: userId },
          data: {
            twoFactorSecret: secret.base32,
            twoFactorEnabled: true,
            twoFactorMethod: method
          }
        });

        return {
          secret: secret.base32,
          qrCode,
          backupCodes
        };
      }

      // For SMS/Email 2FA, just enable the method
      await prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: true,
          twoFactorMethod: method
        }
      });

      return {};
    } catch (error) {
      console.error('Enable 2FA error:', error);
      return { error: 'Failed to enable two-factor authentication' };
    }
  }

  async verifyTwoFactor(user: User, code: string): Promise<boolean> {
    if (user.twoFactorMethod === TwoFactorMethod.AUTHENTICATOR_APP && user.twoFactorSecret) {
      return speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: code,
        window: 2
      });
    }

    // For SMS/Email 2FA, you would verify against sent codes
    // This is a placeholder for SMS/Email verification
    return false;
  }

  async disableTwoFactor(userId: string): Promise<{ error?: string }> {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: false,
          twoFactorMethod: TwoFactorMethod.NONE,
          twoFactorSecret: null
        }
      });

      return {};
    } catch (error) {
      console.error('Disable 2FA error:', error);
      return { error: 'Failed to disable two-factor authentication' };
    }
  }

  async createSession(userId: string, userAgent?: string, ipAddress?: string): Promise<SessionData> {
    const token = jwt.sign(
      { userId, sessionId: uuidv4() },
      this.JWT_SECRET,
      { expiresIn: this.TOKEN_EXPIRY }
    );

    const refreshToken = jwt.sign(
      { userId },
      this.JWT_REFRESH_SECRET,
      { expiresIn: this.REFRESH_TOKEN_EXPIRY }
    );

    const decoded = jwt.decode(token) as any;
    const sessionId = decoded.sessionId;
    const issuedAt = new Date(decoded.iat * 1000);
    const expiresAt = new Date(decoded.exp * 1000);

    // Store session in database
    await prisma.userSession.create({
      data: {
        userId,
        token,
        refreshToken,
        sessionId,
        userAgent,
        ipAddress,
        issuedAt,
        expiresAt
      }
    });

    return {
      userId,
      token,
      refreshToken,
      userAgent,
      ipAddress
    };
  }

  private async handleFailedLogin(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const newAttempts = user.loginAttempts + 1;
    const updateData: any = { loginAttempts: newAttempts };

    // Lock account after 5 failed attempts for 30 minutes
    if (newAttempts >= 5) {
      updateData.lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData
    });
  }

  private async logAudit(userId: string, action: string, resource?: string, resourceId?: string, metadata?: any): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId,
          action,
          resource,
          resourceId,
          metadata: metadata || {}
        }
      });
    } catch (error) {
      console.error('Audit log error:', error);
    }
  }

  async verifyToken(token: string): Promise<{ user?: User; error?: string; expiresAt?: Date; timeUntilExpiry?: number }> {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET) as { userId: string; sessionId: string; exp: number };
      
      const session = await prisma.userSession.findFirst({
        where: {
          token,
          userId: decoded.userId,
          sessionId: decoded.sessionId,
          isActive: true,
          expiresAt: { gt: new Date() }
        },
        include: { user: true }
      });

      if (!session) {
        return { error: 'Invalid or expired session' };
      }

      const now = new Date();
      const expiresAt = new Date(decoded.exp * 1000);
      const timeUntilExpiry = expiresAt.getTime() - now.getTime();

      return { 
        user: session.user,
        expiresAt,
        timeUntilExpiry
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return { error: 'Token expired' };
      }
      return { error: 'Invalid token' };
    }
  }

  async hasPermission(user: User, requiredRole: UserRole): Promise<boolean> {
    const roleHierarchy = {
      [UserRole.USER]: 0,
      [UserRole.ADMIN]: 1,
      [UserRole.SUPER_ADMIN]: 2
    };

    return roleHierarchy[user.role] >= roleHierarchy[requiredRole];
  }

  async requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Find user by email
      const user = await prisma.user.findUnique({
        where: { email }
      });

      if (!user) {
        // Don't reveal that email doesn't exist for security
        return { success: true };
      }

      // Invalidate any existing reset tokens for this user
      await prisma.passwordResetToken.updateMany({
        where: { 
          userId: user.id,
          isUsed: false 
        },
        data: { 
          isUsed: true,
          updatedAt: new Date()
        }
      });

      // Generate new reset token
      const resetToken = uuidv4();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      // Store reset token
      await prisma.passwordResetToken.create({
        data: {
          token: resetToken,
          userId: user.id,
          expiresAt
        }
      });

      // Send password reset email
      const emailResult = await emailService.sendPasswordResetEmail(
        user.email,
        resetToken,
        user.name || user.username
      );

      if (!emailResult.success) {
        console.error('Failed to send password reset email:', emailResult.error);
        // Still return success to avoid revealing email existence
        return { success: true };
      }

      // Log audit
      await auditService.logAudit({
        action: AuditAction.PASSWORD_RESET_REQUESTED,
        resource: 'user',
        resourceId: user.id,
        description: `Password reset requested - ${user.email}`,
        severity: AuditSeverity.MEDIUM,
        status: AuditStatus.SUCCESS,
        metadata: {
          email: user.email,
          resetToken: resetToken.substring(0, 8) + '...' // Log partial token for security
        }
      });

      return { success: true };
    } catch (error) {
      console.error('Password reset request error:', error);
      return { success: false, error: 'Failed to process password reset request' };
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Find valid reset token
      const resetToken = await prisma.passwordResetToken.findFirst({
        where: {
          token,
          isUsed: false,
          expiresAt: { gt: new Date() }
        },
        include: { user: true }
      });

      if (!resetToken) {
        return { success: false, error: 'Invalid or expired reset token' };
      }

      // Hash new password
      const passwordHash = await bcrypt.hash(newPassword, 12);

      // Update user password
      await prisma.user.update({
        where: { id: resetToken.userId },
        data: {
          passwordHash,
          updatedAt: new Date(),
          loginAttempts: 0, // Reset login attempts
          lockedUntil: null  // Unlock account if it was locked
        }
      });

      // Mark token as used
      await prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: {
          isUsed: true,
          updatedAt: new Date()
        }
      });

      // Invalidate all user sessions (force re-login)
      await prisma.userSession.updateMany({
        where: { userId: resetToken.userId },
        data: { isActive: false }
      });

      // Log audit
      await auditService.logAudit({
        action: AuditAction.PASSWORD_RESET_COMPLETED,
        resource: 'user',
        resourceId: resetToken.userId,
        description: `Password reset completed - ${resetToken.user.email}`,
        severity: AuditSeverity.HIGH,
        status: AuditStatus.SUCCESS,
        metadata: {
          email: resetToken.user.email,
          resetToken: token.substring(0, 8) + '...' // Log partial token for security
        }
      });

      return { success: true };
    } catch (error) {
      console.error('Password reset error:', error);
      return { success: false, error: 'Failed to reset password' };
    }
  }

  async verifyResetToken(token: string): Promise<{ success: boolean; valid: boolean; email?: string; error?: string }> {
    try {
      const resetToken = await prisma.passwordResetToken.findFirst({
        where: {
          token,
          isUsed: false,
          expiresAt: { gt: new Date() }
        },
        include: { user: true }
      });

      if (!resetToken) {
        return { success: true, valid: false, error: 'Invalid or expired reset token' };
      }

      return { 
        success: true, 
        valid: true, 
        email: resetToken.user.email 
      };
    } catch (error) {
      console.error('Token verification error:', error);
      return { success: false, valid: false, error: 'Failed to verify token' };
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    try {
      return await prisma.user.findUnique({
        where: { email }
      });
    } catch (error) {
      console.error('Find user by email error:', error);
      return null;
    }
  }

  async findByUsername(username: string): Promise<User | null> {
    try {
      return await prisma.user.findUnique({
        where: { username }
      });
    } catch (error) {
      console.error('Find user by username error:', error);
      return null;
    }
  }

  async getAvailableMethods(userId: string): Promise<string[]> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { 
          twoFactorEnabled: true, 
          twoFactorMethod: true,
          walletAddress: true 
        }
      });

      if (!user) {
        return [];
      }

      const methods = ['email', 'password'];
      
      if (user.walletAddress) {
        methods.push('wallet');
      }

      if (user.twoFactorEnabled) {
        methods.push('2fa');
      }

      return methods;
    } catch (error) {
      console.error('Get available methods error:', error);
      return [];
    }
  }

  async getTokenStatus(token: string): Promise<{
    valid: boolean;
    expiresAt?: Date;
    timeUntilExpiry?: number;
    warningLevel?: 'none' | 'warning' | 'critical' | 'expired';
    error?: string;
  }> {
    try {
      const decoded = jwt.decode(token) as any;
      if (!decoded || !decoded.exp) {
        return { valid: false, error: 'Invalid token format' };
      }

      const now = new Date();
      const expiresAt = new Date(decoded.exp * 1000);
      const timeUntilExpiry = expiresAt.getTime() - now.getTime();

      if (timeUntilExpiry <= 0) {
        return { 
          valid: false, 
          expiresAt, 
          timeUntilExpiry, 
          warningLevel: 'expired',
          error: 'Token expired' 
        };
      }

      let warningLevel: 'none' | 'warning' | 'critical' = 'none';
      const fiveMinutes = 5 * 60 * 1000;
      const oneMinute = 1 * 60 * 1000;

      if (timeUntilExpiry <= oneMinute) {
        warningLevel = 'critical';
      } else if (timeUntilExpiry <= fiveMinutes) {
        warningLevel = 'warning';
      }

      return {
        valid: true,
        expiresAt,
        timeUntilExpiry,
        warningLevel
      };
    } catch (error) {
      return { valid: false, error: 'Invalid token' };
    }
  }
}
