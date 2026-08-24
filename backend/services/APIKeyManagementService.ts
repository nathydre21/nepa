import Redis from 'ioredis';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
// TODO: Fix missing database client
// import prisma from '../databases/clients/user-service';

interface APIKey {
  id: string;
  keyHash: string;
  name: string;
  description?: string;
  userId: string;
  tier: 'FREE' | 'BASIC' | 'PREMIUM' | 'ENTERPRISE';
  rateLimit: number;
  windowMs: number;
  endpoints: string[] | '*';
  isActive: boolean;
  lastUsed?: Date;
  createdAt: Date;
  expiresAt?: Date;
  metadata: Record<string, any>;
}

interface APIKeyUsage {
  keyId: string;
  requests: number;
  blockedRequests: number;
  lastReset: Date;
}

/**
 * API Key Management Service
 * Handles creation, validation, and management of API keys for external integrations
 */
export class APIKeyManagementService {
  private redis: Redis;
  private readonly API_KEY_PREFIX = 'api_key';
  private readonly API_KEY_USAGE_PREFIX = 'api_key_usage';
  private readonly API_KEY_HASH_PREFIX = 'api_key_hash';

  constructor(redisUrl?: string) {
    this.redis = new Redis(redisUrl || process.env.REDIS_URL || 'redis://localhost:6379');
  }

  /**
   * Generate a new API key for a user
   */
  async generateAPIKey(
    userId: string,
    name: string,
    config: {
      tier: 'FREE' | 'BASIC' | 'PREMIUM' | 'ENTERPRISE';
      rateLimit?: number;
      windowMs?: number;
      endpoints?: string[];
      description?: string;
      expiresAt?: Date;
      metadata?: Record<string, any>;
    }
  ): Promise<{ apiKey: string; keyId: string }> {
    const keyId = uuidv4();
    const rawKey = `${keyId}.${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = this.hashAPIKey(rawKey);

    // Set default rate limits based on tier
    const tierDefaults = {
      FREE: { rateLimit: 100, windowMs: 15 * 60 * 1000 },
      BASIC: { rateLimit: 500, windowMs: 15 * 60 * 1000 },
      PREMIUM: { rateLimit: 2000, windowMs: 15 * 60 * 1000 },
      ENTERPRISE: { rateLimit: 10000, windowMs: 15 * 60 * 1000 }
    };

    const { rateLimit = tierDefaults[config.tier].rateLimit, windowMs = tierDefaults[config.tier].windowMs } =
      config;

    const apiKeyData: APIKey = {
      id: keyId,
      keyHash,
      name,
      description: config.description,
      userId,
      tier: config.tier,
      rateLimit,
      windowMs,
      endpoints: config.endpoints || '*',
      isActive: true,
      createdAt: new Date(),
      expiresAt: config.expiresAt,
      metadata: config.metadata || {}
    };

    // Store in Redis with TTL if expiration is set
    const ttl = config.expiresAt ? Math.ceil((config.expiresAt.getTime() - Date.now()) / 1000) : null;
    const redisKey = `${this.API_KEY_PREFIX}:${keyId}`;

    if (ttl && ttl > 0) {
      await this.redis.setex(redisKey, ttl, JSON.stringify(apiKeyData));
    } else {
      await this.redis.set(redisKey, JSON.stringify(apiKeyData));
    }

    // Create hash index for quick lookup
    await this.redis.set(`${this.API_KEY_HASH_PREFIX}:${keyHash}`, keyId);

    // Also store in persistent database
    try {
      // Assuming you have a similar structure in your user-service database
      // This is a placeholder - adjust based on your actual schema
      console.log(`API Key stored for user ${userId}: ${keyId}`);
    } catch (error) {
      console.error('Error storing API key in database:', error);
    }

    return {
      apiKey: rawKey,
      keyId
    };
  }

  /**
   * Validate an API key from a request
   */
  async validateAPIKey(req: Request): Promise<{ valid: boolean; keyData?: APIKey; error?: string }> {
    const apiKey = this.extractAPIKeyFromRequest(req);

    if (!apiKey) {
      return { valid: false, error: 'No API key provided' };
    }

    const keyHash = this.hashAPIKey(apiKey);

    // Try to get key ID from hash index
    const keyId = await this.redis.get(`${this.API_KEY_HASH_PREFIX}:${keyHash}`);

    if (!keyId) {
      return { valid: false, error: 'Invalid API key' };
    }

    // Get full key data
    const keyDataStr = await this.redis.get(`${this.API_KEY_PREFIX}:${keyId}`);

    if (!keyDataStr) {
      return { valid: false, error: 'API key not found' };
    }

    const keyData: APIKey = JSON.parse(keyDataStr);

    // Check if key is active
    if (!keyData.isActive) {
      return { valid: false, error: 'API key is deactivated' };
    }

    // Check if key has expired
    if (keyData.expiresAt && new Date(keyData.expiresAt) < new Date()) {
      return { valid: false, error: 'API key has expired' };
    }

    // Check if endpoint is allowed
    if (keyData.endpoints !== '*' && !keyData.endpoints.includes(req.path)) {
      return { valid: false, error: 'API key does not have access to this endpoint' };
    }

    // Update last used timestamp
    await this.updateLastUsed(keyId);

    return { valid: true, keyData };
  }

  /**
   * Check rate limit for an API key
   */
  async checkRateLimit(
    keyId: string,
    keyData: APIKey
  ): Promise<{ allowed: boolean; remaining: number; resetTime: Date }> {
    const key = `${this.API_KEY_USAGE_PREFIX}:${keyId}`;
    const now = Date.now();
    const windowStart = Math.floor(now / keyData.windowMs) * keyData.windowMs;
    const windowKey = `${key}:${windowStart}`;

    // Get current count
    let count = await this.redis.get(windowKey);
    let requestCount = count ? parseInt(count) : 0;

    // Check if allowed
    const allowed = requestCount < keyData.rateLimit;

    if (allowed) {
      // Increment and set expiry
      await this.redis.multi().incr(windowKey).expire(windowKey, Math.ceil(keyData.windowMs / 1000)).exec();
    }

    // Calculate reset time
    const resetTime = new Date(windowStart + keyData.windowMs);

    return {
      allowed,
      remaining: Math.max(0, keyData.rateLimit - requestCount - 1),
      resetTime
    };
  }

  /**
   * Revoke an API key
   */
  async revokeAPIKey(keyId: string): Promise<boolean> {
    const keyData = await this.redis.get(`${this.API_KEY_PREFIX}:${keyId}`);

    if (!keyData) {
      return false;
    }

    const data: APIKey = JSON.parse(keyData);
    data.isActive = false;

    await this.redis.set(`${this.API_KEY_PREFIX}:${keyId}`, JSON.stringify(data));
    await this.redis.del(`${this.API_KEY_HASH_PREFIX}:${data.keyHash}`);

    return true;
  }

  /**
   * Get API key details (without exposing the raw key)
   */
  async getAPIKeyDetails(keyId: string): Promise<APIKey | null> {
    const keyDataStr = await this.redis.get(`${this.API_KEY_PREFIX}:${keyId}`);

    if (!keyDataStr) {
      return null;
    }

    return JSON.parse(keyDataStr);
  }

  /**
   * Get all API keys for a user
   */
  async getUserAPIKeys(userId: string): Promise<APIKey[]> {
    const keys = await this.redis.keys(`${this.API_KEY_PREFIX}:*`);
    const apiKeys: APIKey[] = [];

    for (const key of keys) {
      const dataStr = await this.redis.get(key);
      if (dataStr) {
        const data: APIKey = JSON.parse(dataStr);
        if (data.userId === userId) {
          apiKeys.push(data);
        }
      }
    }

    return apiKeys;
  }

  /**
   * Get usage statistics for an API key
   */
  async getAPIKeyUsage(keyId: string, lookbackMs: number = 24 * 60 * 60 * 1000): Promise<APIKeyUsage> {
    const now = Date.now();
    const startTime = now - lookbackMs;
    const keyData = await this.getAPIKeyDetails(keyId);

    if (!keyData) {
      throw new Error('API key not found');
    }

    let totalRequests = 0;
    let blockedRequests = 0;

    // Iterate through all windows in the lookback period
    for (let windowStart = Math.floor(startTime / keyData.windowMs); windowStart <= Math.floor(now / keyData.windowMs);
      windowStart++) {
      const windowStartTime = windowStart * keyData.windowMs;
      const windowKey = `${this.API_KEY_USAGE_PREFIX}:${keyId}:${windowStartTime}`;

      const count = await this.redis.get(windowKey);
      if (count) {
        const requests = parseInt(count);
        totalRequests += requests;

        if (requests > keyData.rateLimit) {
          blockedRequests += requests - keyData.rateLimit;
        }
      }
    }

    return {
      keyId,
      requests: totalRequests,
      blockedRequests,
      lastReset: new Date()
    };
  }

  /**
   * Update tier and limits for an API key
   */
  async updateAPIKeyTier(keyId: string, tier: 'FREE' | 'BASIC' | 'PREMIUM' | 'ENTERPRISE'): Promise<APIKey | null> {
    const keyData = await this.getAPIKeyDetails(keyId);

    if (!keyData) {
      return null;
    }

    // Update tier-based limits
    const tierDefaults = {
      FREE: { rateLimit: 100, windowMs: 15 * 60 * 1000 },
      BASIC: { rateLimit: 500, windowMs: 15 * 60 * 1000 },
      PREMIUM: { rateLimit: 2000, windowMs: 15 * 60 * 1000 },
      ENTERPRISE: { rateLimit: 10000, windowMs: 15 * 60 * 1000 }
    };

    keyData.tier = tier;
    keyData.rateLimit = tierDefaults[tier].rateLimit;
    keyData.windowMs = tierDefaults[tier].windowMs;

    await this.redis.set(`${this.API_KEY_PREFIX}:${keyId}`, JSON.stringify(keyData));

    return keyData;
  }

  /**
   * Extract API key from request headers
   */
  private extractAPIKeyFromRequest(req: Request): string | null {
    // Check Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check X-API-Key header
    if (req.headers['x-api-key']) {
      return req.headers['x-api-key'] as string;
    }

    return null;
  }

  /**
   * Hash API key for secure storage
   */
  private hashAPIKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * Update last used timestamp
   */
  private async updateLastUsed(keyId: string): Promise<void> {
    const keyData = await this.getAPIKeyDetails(keyId);

    if (keyData) {
      keyData.lastUsed = new Date();
      await this.redis.set(`${this.API_KEY_PREFIX}:${keyId}`, JSON.stringify(keyData));
    }
  }

  /**
   * Clean up expired keys
   */
  async cleanupExpiredKeys(): Promise<number> {
    const keys = await this.redis.keys(`${this.API_KEY_PREFIX}:*`);
    let cleaned = 0;

    for (const key of keys) {
      const dataStr = await this.redis.get(key);
      if (dataStr) {
        const data: APIKey = JSON.parse(dataStr);

        if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
          await this.redis.del(key);
          await this.redis.del(`${this.API_KEY_HASH_PREFIX}:${data.keyHash}`);
          cleaned++;
        }
      }
    }

    return cleaned;
  }
}
