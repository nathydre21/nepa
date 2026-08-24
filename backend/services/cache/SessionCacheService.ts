import { getCacheStrategy } from './CacheStrategy';
import { logger } from '../logger';

export interface CachedSession {
  id: string;
  userId: string;
  token: string;
  refreshToken: string;
  userAgent?: string;
  ipAddress?: string;
  expiresAt: Date;
  isActive: boolean;
  createdAt: Date;
  lastAccessedAt: Date;
}

export interface CachedUser {
  id: string;
  email: string;
  username?: string;
  name?: string;
  role: string;
  status: string;
  walletAddress?: string;
  isEmailVerified: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt?: Date;
}

export interface UserPreferences {
  userId: string;
  language: string;
  timezone: string;
  currency: string;
  notifications: {
    email: boolean;
    sms: boolean;
    push: boolean;
  };
  dashboard: {
    theme: 'light' | 'dark';
    layout: 'compact' | 'expanded';
  };
}

/**
 * Specialized cache service for user sessions and authentication data
 * Optimized for high-frequency access patterns
 */
export class SessionCacheService {
  private cacheStrategy = getCacheStrategy();

  /**
   * Cache user session with optimized TTL
   */
  async cacheSession(session: CachedSession): Promise<boolean> {
    try {
      const result = await this.cacheStrategy.set('user:session', 
        { sessionId: session.id }, 
        session
      );

      // Also cache by token for quick lookups
      await this.cacheStrategy.set('user:session', 
        { sessionId: `token:${session.token}` }, 
        session
      );

      logger.debug(`Cached session for user ${session.userId}`);
      return result;
    } catch (error) {
      logger.error('Session cache error:', error as any);
      return false;
    }
  }

  /**
   * Get cached session by session ID
   */
  async getSession(sessionId: string): Promise<CachedSession | null> {
    return await this.cacheStrategy.get<CachedSession>(
      'user:session',
      { sessionId },
      null as any // No fallback - sessions should be explicitly cached
    );
  }

  /**
   * Get cached session by token
   */
  async getSessionByToken(token: string): Promise<CachedSession | null> {
    return await this.cacheStrategy.get<CachedSession>(
      'user:session',
      { sessionId: `token:${token}` },
      undefined // No fallback - sessions should be explicitly cached
    );
  }

  /**
   * Cache user profile data
   */
  async cacheUser(user: CachedUser): Promise<boolean> {
    try {
      const result = await this.cacheStrategy.set('user:profile', 
        { userId: user.id }, 
        user
      );

      // Also cache by email for login lookups
      await this.cacheStrategy.set('user:profile', 
        { userId: `email:${user.email}` }, 
        user
      );

      logger.debug(`Cached user profile for ${user.id}`);
      return result;
    } catch (error) {
      logger.error('User cache error:', error as any);
      return false;
    }
  }

  /**
   * Get cached user by ID with database fallback
   */
  async getUser(userId: string, fallback?: () => Promise<CachedUser>): Promise<CachedUser | null> {
    return await this.cacheStrategy.get<CachedUser>(
      'user:profile',
      { userId },
      fallback
    );
  }

  /**
   * Get cached user by email
   */
  async getUserByEmail(email: string, fallback?: () => Promise<CachedUser>): Promise<CachedUser | null> {
    return await this.cacheStrategy.get<CachedUser>(
      'user:profile',
      { userId: `email:${email}` },
      fallback
    );
  }

  /**
   * Cache user preferences
   */
  async cacheUserPreferences(preferences: UserPreferences): Promise<boolean> {
    try {
      const result = await this.cacheStrategy.set('user:preferences', 
        { userId: preferences.userId }, 
        preferences
      );

      logger.debug(`Cached preferences for user ${preferences.userId}`);
      return result;
    } catch (error) {
      logger.error('User preferences cache error:', error as any);
      return false;
    }
  }

  /**
   * Get cached user preferences with database fallback
   */
  async getUserPreferences(userId: string, fallback?: () => Promise<UserPreferences>): Promise<UserPreferences | null> {
    return await this.cacheStrategy.get<UserPreferences>(
      'user:preferences',
      { userId },
      fallback
    );
  }

  /**
   * Cache user's active sessions list
   */
  async cacheActiveSessions(userId: string, sessions: CachedSession[]): Promise<boolean> {
    try {
      const result = await this.cacheStrategy.set('user:active_sessions', 
        { userId }, 
        sessions
      );

      logger.debug(`Cached ${sessions.length} active sessions for user ${userId}`);
      return result;
    } catch (error) {
      logger.error('Active sessions cache error:', error as any);
      return false;
    }
  }

  /**
   * Get user's active sessions with database fallback
   */
  async getActiveSessions(userId: string, fallback?: () => Promise<CachedSession[]>): Promise<CachedSession[] | null> {
    return await this.cacheStrategy.get<CachedSession[]>(
      'user:active_sessions',
      { userId },
      fallback
    );
  }

  /**
   * Invalidate user session cache
   */
  async invalidateSession(sessionId: string, token?: string): Promise<void> {
    try {
      // Invalidate by session ID
      await this.cacheStrategy.invalidate('user:session', { sessionId });
      
      // Invalidate by token if provided
      if (token) {
        await this.cacheStrategy.invalidate('user:session', { sessionId: `token:${token}` });
      }

      logger.debug(`Invalidated session cache: ${sessionId}`);
    } catch (error) {
      logger.error('Session invalidation error:', error as any);
    }
  }

  /**
   * Invalidate all user-related cache
   */
  async invalidateUser(userId: string, email?: string): Promise<void> {
    try {
      // Invalidate user profile
      await this.cacheStrategy.invalidate('user:profile', { userId });
      
      if (email) {
        await this.cacheStrategy.invalidate('user:profile', { userId: `email:${email}` });
      }

      // Invalidate preferences
      await this.cacheStrategy.invalidate('user:preferences', { userId });

      // Invalidate active sessions
      await this.cacheStrategy.invalidate('user:active_sessions', { userId });

      // Invalidate by tags
      await this.cacheStrategy.invalidate('', {}, ['user', 'session']);

      logger.debug(`Invalidated all cache for user: ${userId}`);
    } catch (error) {
      logger.error('User cache invalidation error:', error as any);
    }
  }

  /**
   * Batch cache multiple sessions (for warmup)
   */
  async batchCacheSessions(sessions: CachedSession[]): Promise<number> {
    let cached = 0;
    
    const promises = sessions.map(async (session) => {
      const success = await this.cacheSession(session);
      if (success) cached++;
    });

    await Promise.all(promises);
    logger.info(`Batch cached ${cached}/${sessions.length} sessions`);
    
    return cached;
  }

  /**
   * Batch cache multiple users (for warmup)
   */
  async batchCacheUsers(users: CachedUser[]): Promise<number> {
    let cached = 0;
    
    const promises = users.map(async (user) => {
      const success = await this.cacheUser(user);
      if (success) cached++;
    });

    await Promise.all(promises);
    logger.info(`Batch cached ${cached}/${users.length} users`);
    
    return cached;
  }

  /**
   * Validate cached session (check expiry, etc.)
   */
  async validateCachedSession(session: CachedSession): Promise<boolean> {
    if (!session.isActive) {
      return false;
    }

    if (new Date() > new Date(session.expiresAt)) {
      // Session expired, remove from cache
      await this.invalidateSession(session.id, session.token);
      return false;
    }

    return true;
  }

  /**
   * Update session last accessed time in cache
   */
  async updateSessionAccess(sessionId: string): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (session) {
        session.lastAccessedAt = new Date();
        await this.cacheSession(session);
      }
    } catch (error) {
      logger.error('Session access update error:', error as any);
    }
  }

  /**
   * Get session cache statistics
   */
  async getSessionStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    expiredSessions: number;
    cacheHitRate: number;
  }> {
    try {
      const metrics = await this.cacheStrategy.getMetrics();
      const sessionMetrics = metrics['user:session'] || {
        hitRate: 0,
        avgResponseTime: 0,
        memoryUsage: 0,
        keyCount: 0,
        evictionRate: 0,
        compressionRatio: 0
      };

      return {
        totalSessions: sessionMetrics.keyCount,
        activeSessions: sessionMetrics.keyCount, // Simplified
        expiredSessions: 0, // Would need separate tracking
        cacheHitRate: sessionMetrics.hitRate
      };
    } catch (error) {
      logger.error('Session stats error:', error as any);
      return {
        totalSessions: 0,
        activeSessions: 0,
        expiredSessions: 0,
        cacheHitRate: 0
      };
    }
  }
}

// Singleton instance
let sessionCacheService: SessionCacheService | null = null;

export function getSessionCacheService(): SessionCacheService {
  if (!sessionCacheService) {
    sessionCacheService = new SessionCacheService();
  }
  return sessionCacheService;
}