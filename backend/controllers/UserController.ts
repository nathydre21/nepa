import { Request, Response } from 'express';
import { PrismaClient, UserStatus, UserRole } from '@prisma/client';
import Joi from 'joi';
import bcrypt from 'bcryptjs';
import { invalidateUserCache, invalidateCacheByPattern, GraphQLCache, CachePresets } from '../middleware/cache';
import { errorResponse } from '../utils/errorResponse';

// User profile cache (in-memory, TTL 5 minutes)
const userCache = new GraphQLCache({ ...CachePresets.production, ttl: 300 });

const prisma = new PrismaClient();

// Validation schemas
const idParamSchema = Joi.object({
  id: Joi.string().uuid().required()
});

const sessionIdParamSchema = Joi.object({
  sessionId: Joi.string().uuid().required()
});

const updateProfileSchema = Joi.object({
  name: Joi.string().min(1).max(100).optional(),
  username: Joi.string().alphanum().min(3).max(30).optional(),
  phoneNumber: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
  avatar: Joi.string().uri().optional()
});

const updatePreferencesSchema = Joi.object({
  bio: Joi.string().max(500).optional(),
  location: Joi.string().max(100).optional(),
  website: Joi.string().uri().optional(),
  timezone: Joi.string().optional(),
  language: Joi.string().optional(),
  currency: Joi.string().optional(),
  theme: Joi.string().valid('light', 'dark', 'auto').optional(),
  layout: Joi.string().valid('compact', 'comfortable', 'spacious').optional(),
  sidebarCollapsed: Joi.boolean().optional(),
  notificationsEnabled: Joi.boolean().optional(),
  autoSave: Joi.boolean().optional(),
  preferences: Joi.object().optional()
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).required()
});

const updateUserRoleSchema = Joi.object({
  role: Joi.string().valid(...Object.values(UserRole)).required(),
  status: Joi.string().valid(...Object.values(UserStatus)).optional()
});

const searchSchema = Joi.object({
  search: Joi.string().max(100).optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  role: Joi.string().valid(...Object.values(UserRole)).optional(),
  status: Joi.string().valid(...Object.values(UserStatus)).optional()
});

export class UserController {
  async getAllUsers(req: Request, res: Response) {
    try {
      const { error, value } = searchSchema.validate(req.query);
      if (error) {
        return errorResponse(res, 400, error.details[0].message);
      }

      const { page, limit, search, role, status } = value;
      const skip = (page - 1) * limit;

      const where: any = {};
      
      if (search) {
        where.OR = [
          { email: { contains: search as string, mode: 'insensitive' } },
          { username: { contains: search as string, mode: 'insensitive' } },
          { name: { contains: search as string, mode: 'insensitive' } }
        ];
      }

      if (role) {
        where.role = role;
      }

      if (status) {
        where.status = status;
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: Number(limit),
          select: {
            id: true,
            email: true,
            username: true,
            name: true,
            role: true,
            status: true,
            walletAddress: true,
            isEmailVerified: true,
            isPhoneVerified: true,
            twoFactorEnabled: true,
            lastLoginAt: true,
            createdAt: true,
            _count: {
              select: {
                bills: true,
                payments: true,
                sessions: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.user.count({ where })
      ]);

      res.json({
        users,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Get all users error:', error);
      errorResponse(res, 500, 'Internal server error');
    }
  }

  async getUserById(req: Request, res: Response) {
    try {
      const { error, value } = idParamSchema.validate(req.params, { abortEarly: false });
      if (error) {
        return errorResponse(res, 400, 'Validation failed');
      }
      const { id } = value;

      // Cache read-through for user profiles
      const cacheKey = `user:${id}:profile`;
      const cached = await userCache.get<{ user: any }>(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          username: true,
          name: true,
          phoneNumber: true,
          avatar: true,
          role: true,
          status: true,
          walletAddress: true,
          isEmailVerified: true,
          isPhoneVerified: true,
          twoFactorEnabled: true,
          twoFactorMethod: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          profile: true,
          _count: {
            select: {
              bills: true,
              payments: true,
              sessions: true,
              auditLogs: true
            }
          }
        }
      });

      if (!user) {
        return errorResponse(res, 404, 'User not found');
      }

      const response = { user };
      await userCache.set(cacheKey, response);
      res.json(response);
    } catch (error) {
      console.error('Get user by ID error:', error);
      errorResponse(res, 500, 'Internal server error');
    }
  }

  async updateProfile(req: Request, res: Response) {
    try {
      const { error, value } = updateProfileSchema.validate(req.body);
      if (error) {
        return errorResponse(res, 400, error.details[0].message);
      }

      const user = (req as any).user;
      const updateData: any = {};

      // Check if username is already taken
      if (value.username) {
        const existingUser = await prisma.user.findFirst({
          where: {
            username: value.username,
            id: { not: user.id }
          }
        });

        if (existingUser) {
          return errorResponse(res, 400, 'Username already taken');
        }
      }

      Object.assign(updateData, value);

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: updateData,
        select: {
          id: true,
          email: true,
          username: true,
          name: true,
          phoneNumber: true,
          avatar: true,
          updatedAt: true
        }
      });

      // Invalidate user cache after profile update
      await invalidateUserCache(user.id);

      res.json({
        message: 'Profile updated successfully',
        user: updatedUser
      });
    } catch (error) {
      console.error('Update profile error:', error);
      errorResponse(res, 500, 'Internal server error');
    }
  }

  async updatePreferences(req: Request, res: Response) {
    try {
      const { error, value } = updatePreferencesSchema.validate(req.body);
      if (error) {
        return errorResponse(res, 400, error.details[0].message);
      }

      const user = (req as any).user;

      const updatedProfile = await prisma.userProfile.upsert({
        where: { userId: user.id },
        update: value,
        create: {
          userId: user.id,
          ...value
        }
      });

      // Invalidate user cache after preferences update
      await invalidateUserCache(user.id);

      res.json({
        message: 'Preferences updated successfully',
        profile: updatedProfile
      });
    } catch (error) {
      console.error('Update preferences error:', error);
      errorResponse(res, 500, 'Internal server error');
    }
  }

  async getPreferences(req: Request, res: Response) {
    try {
      const user = (req as any).user;

      // Cache read-through for user preferences
      const cacheKey = `user:${user.id}:preferences`;
      const cached = await userCache.get<{ profile: any }>(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      const profile = await prisma.userProfile.findUnique({
        where: { userId: user.id }
      });

      const response = { profile };
      await userCache.set(cacheKey, response);
      res.json(response);
    } catch (error) {
      console.error('Get preferences error:', error);
      errorResponse(res, 500, 'Internal server error');
    }
  }

  async changePassword(req: Request, res: Response) {
    try {
      const { error, value } = changePasswordSchema.validate(req.body);
      if (error) {
        return errorResponse(res, 400, error.details[0].message);
      }

      const user = (req as any).user;

      // Get current user with password hash
      const currentUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { passwordHash: true }
      });

      if (!currentUser?.passwordHash) {
        return errorResponse(res, 400, 'No password set for this account');
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(value.currentPassword, currentUser.passwordHash);
      if (!isValidPassword) {
        return errorResponse(res, 400, 'Current password is incorrect');
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(value.newPassword, 12);

      // Update password
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newPasswordHash }
      });

      // Invalidate user cache after password change
      await invalidateUserCache(user.id);

      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      console.error('Change password error:', error);
      errorResponse(res, 500, 'Internal server error');
    }
  }

  async updateUserRole(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { error, value } = updateUserRoleSchema.validate(req.body);
      if (error) {
        return errorResponse(res, 400, error.details[0].message);
      }

      const currentUser = (req as any).user;

      // Check if current user has permission to update roles
      if (currentUser.role === UserRole.USER) {
        return errorResponse(res, 403, 'Insufficient permissions');
      }

      // Prevent users from promoting themselves to higher roles
      if (currentUser.role === UserRole.ADMIN && value.role === UserRole.SUPER_ADMIN) {
        return errorResponse(res, 403, 'Cannot promote to Super Admin');
      }

      const updatedUser = await prisma.user.update({
        where: { id },
        data: {
          role: value.role,
          ...(value.status && { status: value.status })
        },
        select: {
          id: true,
          email: true,
          username: true,
          name: true,
          role: true,
          status: true,
          updatedAt: true
        }
      });

      // Invalidate cache for the updated user
      await invalidateUserCache(id);

      res.json({
        message: 'User role updated successfully',
        user: updatedUser
      });
    } catch (error) {
      console.error('Update user role error:', error);
      errorResponse(res, 500, 'Internal server error');
    }
  }

  async getUserSessions(req: Request, res: Response) {
    try {
      const user = (req as any).user;

      const sessions = await prisma.userSession.findMany({
        where: {
          userId: user.id,
          isActive: true
        },
        select: {
          id: true,
          userAgent: true,
          ipAddress: true,
          createdAt: true,
          expiresAt: true
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json({ sessions });
    } catch (error) {
      console.error('Get user sessions error:', error);
      errorResponse(res, 500, 'Internal server error');
    }
  }

  async revokeSession(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const user = (req as any).user;

      const session = await prisma.userSession.findFirst({
        where: {
          id: sessionId,
          userId: user.id
        }
      });

      if (!session) {
        return errorResponse(res, 404, 'Session not found');
      }

      await prisma.userSession.update({
        where: { id: sessionId },
        data: { isActive: false }
      });

      // Invalidate user cache after session revocation
      await invalidateUserCache(user.id);

      res.json({ message: 'Session revoked successfully' });
    } catch (error) {
      console.error('Revoke session error:', error);
      errorResponse(res, 500, 'Internal server error');
    }
  }

  async deleteUser(req: Request, res: Response) {
    try {
      const { error, value } = idParamSchema.validate(req.params, { abortEarly: false });
      if (error) {
        return errorResponse(res, 400, 'Validation failed');
      }
      const { id } = value;
      const currentUser = (req as any).user;

      // Users can only delete themselves, admins can delete other users, super admins can delete anyone
      if (currentUser.role === UserRole.USER && currentUser.id !== id) {
        return errorResponse(res, 403, 'Cannot delete other users');
      }

      if (currentUser.role === UserRole.ADMIN && currentUser.id !== id) {
        const targetUser = await prisma.user.findUnique({
          where: { id },
          select: { role: true }
        });

        if (targetUser?.role === UserRole.ADMIN || targetUser?.role === UserRole.SUPER_ADMIN) {
          return errorResponse(res, 403, 'Cannot delete admin users');
        }
      }

      // Soft delete by setting status to INACTIVE
      await prisma.user.update({
        where: { id },
        data: { 
          status: UserStatus.INACTIVE,
          email: `deleted_${Date.now()}_${id}`,
          username: null,
          walletAddress: null
        }
      });

      // Deactivate all sessions
      await prisma.userSession.updateMany({
        where: { userId: id },
        data: { isActive: false }
      });

      // Invalidate cache for the deleted user
      await invalidateUserCache(id);

      res.json({ message: 'User deleted successfully' });
    } catch (error) {
      console.error('Delete user error:', error);
      errorResponse(res, 500, 'Internal server error');
    }
  }
}
