import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { rateLimit } from 'express-rate-limit';

// JWT payload interface
interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  permissions: string[];
  iat: number;
  exp: number;
}

// User interface
interface User {
  id: string;
  email: string;
  role: string;
  permissions: string[];
  isActive: boolean;
  lastLogin: Date;
}

// Authentication configuration
const authConfig = {
  jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
  jwtExpiration: process.env.JWT_EXPIRATION || '24h',
  refreshTokenExpiration: process.env.REFRESH_TOKEN_EXPIRATION || '7d',
  bcryptRounds: 12,
  maxLoginAttempts: 5,
  lockoutTime: 15 * 60 * 1000, // 15 minutes
};

// In-memory store for refresh tokens (in production, use Redis or database)
const refreshTokens = new Map<string, { userId: string; expires: Date }>();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 auth attempts per 15 minutes
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true,
});

// Login attempt tracking
const loginAttempts = new Map<string, { attempts: number; lockUntil?: Date }>();

// Generate JWT tokens
export const generateTokens = (user: User) => {
  const payload: JWTPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    permissions: user.permissions,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
  };

  const accessToken = jwt.sign(payload, authConfig.jwtSecret, {
    expiresIn: authConfig.jwtExpiration,
    algorithm: 'HS256',
  });

  const refreshTokenPayload = {
    userId: user.id,
    type: 'refresh',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days
  };

  const refreshToken = jwt.sign(refreshTokenPayload, authConfig.jwtSecret, {
    expiresIn: authConfig.refreshTokenExpiration,
    algorithm: 'HS256',
  });

  // Store refresh token
  const refreshTokenId = Math.random().toString(36).substring(2, 15);
  refreshTokens.set(refreshTokenId, {
    userId: user.id,
    expires: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)),
  });

  return {
    accessToken,
    refreshToken,
    refreshTokenId,
    expiresIn: 24 * 60 * 60, // 24 hours in seconds
  };
};

// Verify JWT token
export const verifyToken = (token: string): JWTPayload | null => {
  try {
    const decoded = jwt.verify(token, authConfig.jwtSecret, {
      algorithms: ['HS256'],
    }) as JWTPayload;

    return decoded;
  } catch (error) {
    console.error('JWT verification error:', error);
    return null;
  }
};

// Check if user is locked out
export const isUserLocked = (email: string): boolean => {
  const attempts = loginAttempts.get(email);
  if (!attempts) return false;

  if (attempts.lockUntil && attempts.lockUntil > new Date()) {
    return true;
  }

  return false;
};

// Update login attempts
export const updateLoginAttempts = (email: string, success: boolean) => {
  const attempts = loginAttempts.get(email) || { attempts: 0 };

  if (success) {
    // Reset on successful login
    loginAttempts.delete(email);
  } else {
    attempts.attempts++;

    // Lock user after max attempts
    if (attempts.attempts >= authConfig.maxLoginAttempts) {
      attempts.lockUntil = new Date(Date.now() + authConfig.lockoutTime);
    }

    loginAttempts.set(email, attempts);
  }
};

// Extract token from Authorization header
export const extractToken = (authHeader: string | undefined): string | null => {
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;

  return parts[1];
};

// Authentication middleware
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Skip auth for certain endpoints
  const publicPaths = ['/api/docs', '/health', '/api/v1/auth/login', '/api/v1/auth/register', '/api/v1/auth/refresh'];

  if (publicPaths.some(path => req.path.startsWith(path))) {
    return next();
  }

  // Extract token from Authorization header
  const authHeader = req.headers.authorization;
  const token = extractToken(authHeader);

  if (!token) {
    return res.status(401).json({
      error: 'No token provided',
      message: 'Authorization header is required',
      code: 'AUTH_MISSING',
    });
  }

  // Verify token
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({
      error: 'Invalid token',
      message: 'JWT token is invalid or expired',
      code: 'AUTH_INVALID',
    });
  }

  // Add user info to request
  req.user = {
    id: decoded.userId,
    email: decoded.email,
    role: decoded.role,
    permissions: decoded.permissions,
  };

  next();
};

// Role-based access control
export const requireRole = (roles: string | string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'User must be authenticated',
      });
    }

    const userRoles = Array.isArray(roles) ? roles : [roles];
    const hasRole = userRoles.includes(req.user.role);

    if (!hasRole) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: `User role '${req.user.role}' is not authorized for this resource`,
        requiredRoles: userRoles,
        currentRole: req.user.role,
      });
    }

    next();
  };
};

// Permission-based access control
export const requirePermission = (permissions: string | string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'User must be authenticated',
      });
    }

    const userPermissions = req.user.permissions || [];
    const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];
    const hasPermission = requiredPermissions.every(permission =>
      userPermissions.includes(permission)
    );

    if (!hasPermission) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: 'User does not have required permissions',
        requiredPermissions,
        userPermissions,
      });
    }

    next();
  };
};

// Optional authentication (doesn't fail if no token)
export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = extractToken(authHeader);

  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = {
        id: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        permissions: decoded.permissions,
      };
    }
  }

  next();
};

// Refresh token middleware
export const refreshTokenMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const { refreshToken, refreshTokenId } = req.body;

  if (!refreshToken || !refreshTokenId) {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'Refresh token and token ID are required',
    });
  }

  // Verify refresh token
  try {
    const decoded = jwt.verify(refreshToken, authConfig.jwtSecret) as any;

    if (decoded.type !== 'refresh') {
      return res.status(400).json({
        error: 'Invalid token type',
        message: 'Token must be a refresh token',
      });
    }

    const storedToken = refreshTokens.get(refreshTokenId);
    if (!storedToken || storedToken.userId !== decoded.userId || storedToken.expires < new Date()) {
      return res.status(400).json({
        error: 'Invalid refresh token',
        message: 'Refresh token is invalid or expired',
      });
    }

    // Generate new tokens
    // In a real implementation, you'd fetch user from database
    const mockUser: User = {
      id: decoded.userId,
      email: `user-${decoded.userId}@example.com`,
      role: 'user',
      permissions: ['read:own', 'write:own'],
      isActive: true,
      lastLogin: new Date(),
    };

    const newTokens = generateTokens(mockUser);

    // Remove old refresh token
    refreshTokens.delete(refreshTokenId);

    res.json({
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
      refreshTokenId: newTokens.refreshTokenId,
      expiresIn: newTokens.expiresIn,
    });
  } catch (error) {
    return res.status(400).json({
      error: 'Token refresh failed',
      message: 'Invalid refresh token',
    });
  }
};

// Apply rate limiting to auth endpoints
export const authRateLimit = authLimiter;
