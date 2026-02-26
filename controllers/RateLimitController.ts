import { Request, Response } from 'express';
import { AdvancedRateLimitService } from '../services/AdvancedRateLimitService';
import { authenticate, authorize } from '../middleware/authentication';
import { UserRole } from '../types/rateLimit';
import { apiKeyAuth } from '../src/config/auth';
import { APIKeyManagementService } from '../services/APIKeyManagementService';
import { IPBlockingService } from '../services/IPBlockingService';
import { RateLimitBreachNotificationService } from '../services/RateLimitBreachNotificationService';

const rateLimitService = new AdvancedRateLimitService();
const apiKeyService = new APIKeyManagementService();
const ipBlockingService = new IPBlockingService();
const notificationService = new RateLimitBreachNotificationService();

/**
 * @openapi
 * /api/rate-limit/analytics:
 *   get:
 *     summary: Get rate limiting analytics and metrics
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: start
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start time for analytics window
 *       - in: query
 *         name: end
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End time for analytics window
 *     responses:
 *       200:
 *         description: Analytics data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/RateLimitAnalytics'
 *                 generated_at:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
export const getRateLimitAnalytics = async (req: Request, res: Response) => {
  try {
    const { start, end } = req.query as { start?: string; end?: string };
    
    const timeWindow = {
      start: start ? new Date(start) : new Date(Date.now() - 24 * 60 * 60 * 1000),
      end: end ? new Date(end) : new Date()
    };

    const analytics = await rateLimitService.getAnalytics(timeWindow);
    
    res.json({
      success: true,
      data: analytics,
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate analytics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * @openapi
 * /api/rate-limit/breaches:
 *   get:
 *     summary: Get rate limiting breach history
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of breaches to return
 *     responses:
 *       200:
 *         description: Breach history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/RateLimitBreach'
 *                 count:
 *                   type: integer
 *                 generated_at:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
export const getBreachHistory = async (req: Request, res: Response) => {
  try {
    const { limit = 50 } = req.query as { limit?: string };
    
    const breaches = await rateLimitService.getBreachHistory(parseInt(limit.toString()));
    
    res.json({
      success: true,
      data: breaches,
      count: breaches.length,
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Breach history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch breach history',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * @openapi
 * /api/rate-limit/profile:
 *   get:
 *     summary: Get current user's rate limit profile
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/UserRateLimitProfile'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
export const getUserRateLimitProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const profile = await rateLimitService.getUserRateLimitProfile(userId);
    
    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user profile',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * @openapi
 * /api/rate-limit/profile/{userId}:
 *   get:
 *     summary: Get user's rate limit profile (admin only)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to fetch profile for
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Internal server error
 */
export const getAnyUserRateLimitProfile = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID required'
      });
    }

    const profile = await rateLimitService.getUserRateLimitProfile(userId);
    
    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user profile',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * @openapi
 * /api/rate-limit/profile/{userId}:
 *   put:
 *     summary: Update user's rate limit profile (admin only)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to update profile for
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tier:
 *                 type: string
 *                 enum: [FREE, BASIC, PREMIUM, ENTERPRISE, UNLIMITED]
 *               whitelist:
 *                 type: boolean
 *               blacklist:
 *                 type: boolean
 *               customLimits:
 *                 type: object
 *                 additionalProperties:
 *                   type: number
 *               metadata:
 *                 type: object
 *                 additionalProperties:
 *                   type: any
 *     responses:
 *       200:
 *         description: User profile updated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Internal server error
 */
export const updateUserRateLimitProfile = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { tier, whitelist, blacklist, customLimits, metadata } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID required'
      });
    }

    const existingProfile = await rateLimitService.getUserRateLimitProfile(userId);
    const updatedProfile = {
      ...existingProfile,
      tier: tier || existingProfile.tier,
      whitelist: whitelist !== undefined ? whitelist : existingProfile.whitelist,
      blacklist: blacklist !== undefined ? blacklist : existingProfile.blacklist,
      customLimits: customLimits || existingProfile.customLimits,
      metadata: metadata || existingProfile.metadata
    };

    await rateLimitService.setUserRateLimitProfile(updatedProfile);
    
    res.json({
      success: true,
      data: updatedProfile,
      message: 'User rate limit profile updated successfully'
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user profile',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * @openapi
 * /api/rate-limit/check:
 *   post:
 *     summary: Check rate limit status for a specific request
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 description: User ID to check (optional)
 *               ip:
 *                 type: string
 *                 description: IP address to check (optional)
 *               endpoint:
 *                 type: string
 *                 description: Endpoint path to check
 *               method:
 *                 type: string
 *                 description: HTTP method to check
 *     responses:
 *       200:
 *         description: Rate limit check completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     allowed:
 *                       type: boolean
 *                     remaining:
 *                       type: integer
 *                     resetTime:
 *                       type: string
 *                       format: date-time
 *                     tier:
 *                       type: string
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
export const checkRateLimit = async (req: Request, res: Response) => {
  try {
    const { userId, ip, endpoint, method } = req.body;

    if (!endpoint || !method) {
      return res.status(400).json({
        success: false,
        error: 'Endpoint and method are required'
      });
    }

    // Create a mock request object
    const mockReq = {
      path: endpoint,
      method: method.toUpperCase(),
      ip: ip || req.ip,
      user: userId ? { id: userId } : undefined,
      get: (header: string) => req.get(header),
      headers: req.headers,
      query: req.query,
      body: req.body,
      params: req.params
    } as unknown as Request;

    // Get user profile and effective rate limit
    const userProfile = userId ? await rateLimitService.getUserRateLimitProfile(userId) : undefined;
    const effectiveLimit = await rateLimitService.getEffectiveRateLimit(mockReq, userProfile);
    
    // Check rate limit
    const result = await rateLimitService.checkRateLimit(mockReq, effectiveLimit);
    
    res.json({
      success: true,
      data: {
        allowed: result.allowed,
        remaining: result.remaining,
        resetTime: result.resetTime.toISOString(),
        tier: effectiveLimit.name,
        requestsPerWindow: effectiveLimit.requestsPerWindow,
        windowMs: effectiveLimit.windowMs,
        burstCapacity: effectiveLimit.burstCapacity,
        burstUsed: result.burstUsed
      }
    });
  } catch (error) {
    console.error('Rate limit check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check rate limit',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * @openapi
 * /api/rate-limit/tiers:
 *   get:
 *     summary: Get available rate limiting tiers
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Available tiers retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   additionalProperties:
 *                     $ref: '#/components/schemas/RateLimitTier'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
export const getRateLimitTiers = async (req: Request, res: Response) => {
  try {
    const { DEFAULT_RATE_LIMIT_TIERS } = await import('../config/rateLimitConfig');
    
    res.json({
      success: true,
      data: DEFAULT_RATE_LIMIT_TIERS
    });
  } catch (error) {
    console.error('Get tiers error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch rate limit tiers',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * @openapi
 * /api/rate-limit/rules:
 *   get:
 *     summary: Get endpoint-specific rate limiting rules
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Rules retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/EndpointRateLimitRule'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
export const getRateLimitRules = async (req: Request, res: Response) => {
  try {
    const { ENDPOINT_SPECIFIC_RULES } = await import('../config/rateLimitConfig');
    
    res.json({
      success: true,
      data: ENDPOINT_SPECIFIC_RULES
    });
  } catch (error) {
    console.error('Get rules error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch rate limit rules',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * API Key Management Endpoints
 */

/**
 * @openapi
 * /api/rate-limit/api-keys/generate:
 *   post:
 *     summary: Generate a new API key for external integrations
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               tier:
 *                 type: string
 *                 enum: [FREE, BASIC, PREMIUM, ENTERPRISE]
 *               endpoints:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: API key generated successfully
 *       401:
 *         description: Unauthorized
 *       400:
 *         description: Bad request
 */
export const generateAPIKey = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const { name, tier = 'BASIC', endpoints, description, expiresAt } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'API key name is required'
      });
    }

    const { apiKey, keyId } = await apiKeyService.generateAPIKey(userId, name, {
      tier,
      endpoints: endpoints || '*',
      description,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined
    });

    res.status(201).json({
      success: true,
      data: {
        keyId,
        apiKey,
        message: 'Keep this API key safe. You will not be able to see it again.'
      }
    });
  } catch (error) {
    console.error('Generate API key error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate API key',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * @openapi
 * /api/rate-limit/api-keys:
 *   get:
 *     summary: Get all API keys for the authenticated user
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: API keys retrieved successfully
 *       401:
 *         description: Unauthorized
 */
export const getUserAPIKeys = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const keys = await apiKeyService.getUserAPIKeys(userId);

    res.json({
      success: true,
      data: keys,
      count: keys.length
    });
  } catch (error) {
    console.error('Get API keys error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch API keys',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * @openapi
 * /api/rate-limit/api-keys/:keyId:
 *   get:
 *     summary: Get API key details
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 */
export const getAPIKeyDetails = async (req: Request, res: Response) => {
  try {
    const { keyId } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const keyData = await apiKeyService.getAPIKeyDetails(keyId);

    if (!keyData || keyData.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: 'API key not found'
      });
    }

    res.json({
      success: true,
      data: keyData
    });
  } catch (error) {
    console.error('Get API key details error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch API key details',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * @openapi
 * /api/rate-limit/api-keys/:keyId/revoke:
 *   post:
 *     summary: Revoke an API key
 *     security:
 *       - BearerAuth: []
 */
export const revokeAPIKey = async (req: Request, res: Response) => {
  try {
    const { keyId } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const keyData = await apiKeyService.getAPIKeyDetails(keyId);

    if (!keyData || keyData.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: 'API key not found'
      });
    }

    await apiKeyService.revokeAPIKey(keyId);

    res.json({
      success: true,
      message: 'API key revoked successfully'
    });
  } catch (error) {
    console.error('Revoke API key error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to revoke API key',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * @openapi
 * /api/rate-limit/api-keys/:keyId/usage:
 *   get:
 *     summary: Get API key usage statistics
 *     security:
 *       - BearerAuth: []
 */
export const getAPIKeyUsage = async (req: Request, res: Response) => {
  try {
    const { keyId } = req.params;
    const userId = (req as any).user?.id;
    const { lookbackMs = '86400000' } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const keyData = await apiKeyService.getAPIKeyDetails(keyId);

    if (!keyData || keyData.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: 'API key not found'
      });
    }

    const usage = await apiKeyService.getAPIKeyUsage(keyId, parseInt(lookbackMs as string));

    res.json({
      success: true,
      data: usage
    });
  } catch (error) {
    console.error('Get API key usage error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch API key usage',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * IP Blocking Management Endpoints
 */

/**
 * @openapi
 * /api/rate-limit/ip-blocking/blocked:
 *   get:
 *     summary: Get list of blocked IPs
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 */
export const getBlockedIPs = async (req: Request, res: Response) => {
  try {
    // Admin only
    if ((req as any).user?.role !== 'ADMIN' && (req as any).user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const { limit = 100, offset = 0 } = req.query;

    const blockedIPs = await ipBlockingService.getBlockedIPs(parseInt(limit as string), parseInt(offset as string));

    res.json({
      success: true,
      data: blockedIPs,
      count: blockedIPs.length
    });
  } catch (error) {
    console.error('Get blocked IPs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch blocked IPs',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * @openapi
 * /api/rate-limit/ip-blocking/block:
 *   post:
 *     summary: Manually block an IP address
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ip:
 *                 type: string
 *               reason:
 *                 type: string
 *               severity:
 *                 type: string
 *                 enum: [LOW, MEDIUM, HIGH, CRITICAL]
 */
export const blockIP = async (req: Request, res: Response) => {
  try {
    // Admin only
    if ((req as any).user?.role !== 'ADMIN' && (req as any).user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const { ip, reason, severity = 'MEDIUM' } = req.body;

    if (!ip || !reason) {
      return res.status(400).json({
        success: false,
        error: 'IP and reason are required'
      });
    }

    const record = await ipBlockingService.blockIP(ip, reason, severity as any, false, {
      blockedBy: (req as any).user?.id,
      timestamp: new Date()
    });

    res.status(201).json({
      success: true,
      data: record
    });
  } catch (error) {
    console.error('Block IP error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to block IP',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * @openapi
 * /api/rate-limit/ip-blocking/unblock:
 *   post:
 *     summary: Unblock an IP address
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ip:
 *                 type: string
 */
export const unblockIP = async (req: Request, res: Response) => {
  try {
    // Admin only
    if ((req as any).user?.role !== 'ADMIN' && (req as any).user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const { ip } = req.body;

    if (!ip) {
      return res.status(400).json({
        success: false,
        error: 'IP is required'
      });
    }

    const result = await ipBlockingService.unblockIP(ip);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'IP not found in blocklist'
      });
    }

    res.json({
      success: true,
      message: `IP ${ip} has been unblocked`
    });
  } catch (error) {
    console.error('Unblock IP error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to unblock IP',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * @openapi
 * /api/rate-limit/ip-blocking/whitelist:
 *   post:
 *     summary: Add IP to whitelist
 *     security:
 *       - BearerAuth: []
 */
export const whitelistIP = async (req: Request, res: Response) => {
  try {
    // Admin only
    if ((req as any).user?.role !== 'ADMIN' && (req as any).user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const { ip } = req.body;

    if (!ip) {
      return res.status(400).json({
        success: false,
        error: 'IP is required'
      });
    }

    await ipBlockingService.whitelistIP(ip);

    res.json({
      success: true,
      message: `IP ${ip} has been whitelisted`
    });
  } catch (error) {
    console.error('Whitelist IP error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to whitelist IP',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Breach Notification Management Endpoints
 */

/**
 * @openapi
 * /api/rate-limit/notifications/preferences:
 *   get:
 *     summary: Get notification preferences
 *     security:
 *       - BearerAuth: []
 */
export const getNotificationPreferences = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    const preferences = userId
      ? await notificationService.getUserNotificationPreferences(userId)
      : await notificationService.getNotificationPreferences();

    res.json({
      success: true,
      data: preferences
    });
  } catch (error) {
    console.error('Get notification preferences error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notification preferences',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * @openapi
 * /api/rate-limit/notifications/preferences:
 *   post:
 *     summary: Update notification preferences
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 */
export const updateNotificationPreferences = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const preferences = req.body;

    await notificationService.setNotificationPreferences(preferences, userId);

    res.json({
      success: true,
      message: 'Notification preferences updated successfully'
    });
  } catch (error) {
    console.error('Update notification preferences error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update notification preferences',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * @openapi
 * /api/rate-limit/breach-history:
 *   get:
 *     summary: Get breach notification history
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 */
export const getNotificationBreachHistory = async (req: Request, res: Response) => {
  try {
    const { limit = 100, offset = 0 } = req.query;

    const breaches = await notificationService.getBreachHistory(parseInt(limit as string), parseInt(offset as string));

    res.json({
      success: true,
      data: breaches,
      count: breaches.length
    });
  } catch (error) {
    console.error('Get breach history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch breach history',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
