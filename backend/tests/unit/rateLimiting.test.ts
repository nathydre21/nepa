import { APIKeyManagementService } from '../services/APIKeyManagementService';
import { IPBlockingService } from '../services/IPBlockingService';
import { RateLimitBreachNotificationService } from '../services/RateLimitBreachNotificationService';
import { AdvancedRateLimitService } from '../services/AdvancedRateLimitService';

/**
 * Unit Tests for Rate Limiting Services
 * Issue #269: Fix Missing API Rate Limiting
 * Run with: npm test -- tests/unit/rateLimiting.test.ts
 */

describe('APIKeyManagementService', () => {
  let apiKeyService: APIKeyManagementService;
  const testUserId = 'test-user-123';

  beforeEach(() => {
    apiKeyService = new APIKeyManagementService('redis://localhost:6379');
  });

  afterEach(async () => {
    // Cleanup Redis
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('generateAPIKey', () => {
    it('should generate a valid API key with proper format', async () => {
      const { apiKey, keyId } = await apiKeyService.generateAPIKey(testUserId, 'Test Key', {
        tier: 'BASIC',
        rateLimit: 500
      });

      expect(apiKey).toMatch(/^[a-f0-9-]+\.[a-f0-9]+$/);
      expect(keyId).toBeDefined();
      expect(keyId.length).toBeGreaterThan(0);
    });

    it('should set correct tier-based limits', async () => {
      const tiers = ['FREE', 'BASIC', 'PREMIUM', 'ENTERPRISE'] as const;
      const expectedLimits = [100, 500, 2000, 10000];

      for (let i = 0; i < tiers.length; i++) {
        const { keyId } = await apiKeyService.generateAPIKey(testUserId, `Key ${i}`, {
          tier: tiers[i]
        });

        const details = await apiKeyService.getAPIKeyDetails(keyId);
        expect(details?.rateLimit).toBe(expectedLimits[i]);
      }
    });

    it('should allow custom rate limits to override tier defaults', async () => {
      const { keyId } = await apiKeyService.generateAPIKey(testUserId, 'Custom Limit Key', {
        tier: 'BASIC',
        rateLimit: 1500 // Override default 500
      });

      const details = await apiKeyService.getAPIKeyDetails(keyId);
      expect(details?.rateLimit).toBe(1500);
    });

    it('should set expiration if provided', async () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      const { keyId } = await apiKeyService.generateAPIKey(testUserId, 'Expiring Key', {
        tier: 'BASIC',
        expiresAt
      });

      const details = await apiKeyService.getAPIKeyDetails(keyId);
      expect(details?.expiresAt).toBeDefined();
    });
  });

  describe('validateAPIKey', () => {
    it('should validate a correctly formatted valid key', async () => {
      const { apiKey } = await apiKeyService.generateAPIKey(testUserId, 'Valid Key', {
        tier: 'BASIC'
      });

      const mockReq = {
        headers: { 'x-api-key': apiKey }
      } as any;

      const result = await apiKeyService.validateAPIKey(mockReq);
      expect(result.valid).toBe(true);
      expect(result.keyData).toBeDefined();
    });

    it('should reject invalid API keys', async () => {
      const mockReq = {
        headers: { 'x-api-key': 'invalid-key-format' }
      } as any;

      const result = await apiKeyService.validateAPIKey(mockReq);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject expired API keys', async () => {
      const expiredDate = new Date(Date.now() - 1000); // 1 second ago

      const { apiKey } = await apiKeyService.generateAPIKey(testUserId, 'Expired Key', {
        tier: 'BASIC',
        expiresAt: expiredDate
      });

      const mockReq = {
        headers: { 'x-api-key': apiKey }
      } as any;

      const result = await apiKeyService.validateAPIKey(mockReq);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });
  });

  describe('checkRateLimit', () => {
    it('should allow requests within rate limit', async () => {
      const { keyId } = await apiKeyService.generateAPIKey(testUserId, 'Test Key', {
        tier: 'BASIC',
        rateLimit: 5 // Low limit for testing
      });

      const keyData = await apiKeyService.getAPIKeyDetails(keyId);
      expect(keyData).toBeDefined();

      for (let i = 0; i < 3; i++) {
        const result = await apiKeyService.checkRateLimit(keyId, keyData!);
        expect(result.allowed).toBe(true);
      }
    });

    it('should block requests exceeding rate limit', async () => {
      const { keyId } = await apiKeyService.generateAPIKey(testUserId, 'Limited Key', {
        tier: 'BASIC',
        rateLimit: 2, // Very low limit
        windowMs: 1000
      });

      const keyData = await apiKeyService.getAPIKeyDetails(keyId);
      expect(keyData).toBeDefined();

      // Make limit+1 requests
      let blockedRequest = false;
      for (let i = 0; i < 4; i++) {
        const result = await apiKeyService.checkRateLimit(keyId, keyData!);
        if (!result.allowed) {
          blockedRequest = true;
          break;
        }
      }

      expect(blockedRequest).toBe(true);
    });

    it('should return correct remaining count', async () => {
      const { keyId } = await apiKeyService.generateAPIKey(testUserId, 'Remaining Test', {
        tier: 'BASIC',
        rateLimit: 10
      });

      const keyData = await apiKeyService.getAPIKeyDetails(keyId);
      expect(keyData).toBeDefined();

      const result = await apiKeyService.checkRateLimit(keyId, keyData!);
      expect(result.remaining).toBeLessThan(10);
    });
  });

  describe('revokeAPIKey', () => {
    it('should revoke an active API key', async () => {
      const { keyId, apiKey } = await apiKeyService.generateAPIKey(testUserId, 'Revoke Test', {
        tier: 'BASIC'
      });

      const activeCheck = await apiKeyService.getAPIKeyDetails(keyId);
      expect(activeCheck?.isActive).toBe(true);

      await apiKeyService.revokeAPIKey(keyId);

      const mockReq = {
        headers: { 'x-api-key': apiKey }
      } as any;

      const result = await apiKeyService.validateAPIKey(mockReq);
      expect(result.valid).toBe(false);
    });
  });

  describe('getUserAPIKeys', () => {
    it('should return all keys for a user', async () => {
      const userId = 'user-for-listing';

      // Create multiple keys
      await apiKeyService.generateAPIKey(userId, 'Key 1', { tier: 'BASIC' });
      await apiKeyService.generateAPIKey(userId, 'Key 2', { tier: 'PREMIUM' });

      const keys = await apiKeyService.getUserAPIKeys(userId);
      expect(keys.length).toBeGreaterThanOrEqual(2);
      expect(keys.every(k => k.userId === userId)).toBe(true);
    });
  });

  describe('getAPIKeyUsage', () => {
    it('should track API key usage', async () => {
      const { keyId } = await apiKeyService.generateAPIKey(testUserId, 'Usage Test', {
        tier: 'BASIC',
        rateLimit: 100
      });

      const keyData = await apiKeyService.getAPIKeyDetails(keyId);
      expect(keyData).toBeDefined();

      // Make some requests
      for (let i = 0; i < 5; i++) {
        await apiKeyService.checkRateLimit(keyId, keyData!);
      }

      const usage = await apiKeyService.getAPIKeyUsage(keyId);
      expect(usage.requests).toBeGreaterThan(0);
    });
  });
});

describe('IPBlockingService', () => {
  let ipBlockingService: IPBlockingService;
  const testIP = '192.168.1.100';

  beforeEach(() => {
    ipBlockingService = new IPBlockingService('redis://localhost:6379');
  });

  describe('blockIP', () => {
    it('should block an IP with provided reason', async () => {
      const reason = 'Suspicious activity detected';

      const record = await ipBlockingService.blockIP(testIP, reason, 'HIGH');

      expect(record.ip).toBe(testIP);
      expect(record.reason).toBe(reason);
      expect(record.severity).toBe('HIGH');
      expect(record.autoBlock).toBe(false);
    });

    it('should set appropriate block duration based on severity', async () => {
      const severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
      const durations = [15, 60, 24 * 60, 30 * 24 * 60]; // minutes

      for (let i = 0; i < severities.length; i++) {
        const ip = `192.168.1.${100 + i}`;
        const record = await ipBlockingService.blockIP(ip, 'Test', severities[i]);

        const blockDurationMs = record.expiresAt.getTime() - record.blockedAt.getTime();
        const blockDurationMinutes = blockDurationMs / (60 * 1000);

        // Allow some variance
        expect(blockDurationMinutes).toBeGreaterThanOrEqual(durations[i] * 0.9);
        expect(blockDurationMinutes).toBeLessThanOrEqual(durations[i] * 1.1);
      }
    });
  });

  describe('isIPBlocked', () => {
    it('should detect blocked IPs', async () => {
      const testIP2 = '192.168.1.101';
      await ipBlockingService.blockIP(testIP2, 'Test block', 'MEDIUM');

      const blockRecord = await ipBlockingService.isIPBlocked(testIP2);
      expect(blockRecord).toBeDefined();
      expect(blockRecord?.ip).toBe(testIP2);
    });

    it('should return null for unblocked IPs', async () => {
      const randomIP = '203.0.113.' + Math.floor(Math.random() * 256);
      const blockRecord = await ipBlockingService.isIPBlocked(randomIP);

      expect(blockRecord).toBeNull();
    });
  });

  describe('recordAbuse', () => {
    it('should record abuse patterns', async () => {
      const testIP3 = '192.168.1.102';

      await ipBlockingService.recordAbuse(testIP3, 'RATE_LIMIT_BREACH', {
        endpoint: '/api/users'
      });

      const stats = await ipBlockingService.getAbuseStats(testIP3);
      expect(stats['RATE_LIMIT_BREACH']).toBeGreaterThan(0);
    });

    it('should auto-block when abuse threshold exceeded', async () => {
      const testIP4 = '192.168.1.103';

      // Record enough abuse to trigger threshold
      for (let i = 0; i < 11; i++) {
        await ipBlockingService.recordAbuse(testIP4, 'RATE_LIMIT_BREACH');
      }

      // Wait a moment for the blocking logic
      await new Promise(resolve => setTimeout(resolve, 100));

      const blockRecord = await ipBlockingService.isIPBlocked(testIP4);
      expect(blockRecord).toBeDefined();
    });
  });

  describe('whitelisting', () => {
    it('should add IPs to whitelist', async () => {
      const whitelistIP = '203.0.113.1';

      await ipBlockingService.whitelistIP(whitelistIP);
      const isWhitelisted = await ipBlockingService.isIPWhitelisted(whitelistIP);

      expect(isWhitelisted).toBe(true);
    });

    it('should remove IPs from whitelist', async () => {
      const whitelistIP2 = '203.0.113.2';

      await ipBlockingService.whitelistIP(whitelistIP2);
      await ipBlockingService.removeFromWhitelist(whitelistIP2);

      const isWhitelisted = await ipBlockingService.isIPWhitelisted(whitelistIP2);
      expect(isWhitelisted).toBe(false);
    });
  });

  describe('unblockIP', () => {
    it('should unblock a blocked IP', async () => {
      const testIP5 = '192.168.1.105';

      await ipBlockingService.blockIP(testIP5, 'Test', 'MEDIUM');
      let blockRecord = await ipBlockingService.isIPBlocked(testIP5);
      expect(blockRecord).toBeDefined();

      await ipBlockingService.unblockIP(testIP5);
      blockRecord = await ipBlockingService.isIPBlocked(testIP5);
      expect(blockRecord).toBeNull();
    });
  });

  describe('analyzeDDOSPattern', () => {
    it('should detect DDOS patterns', async () => {
      const ddosIP = '192.168.1.106';

      let isDDOS = false;
      // Make requests fast enough to trigger DDOS (100 in 10 seconds threshold)
      for (let i = 0; i < 101; i++) {
        const result = await ipBlockingService.analyzeDDOSPattern(ddosIP, '/api/endpoint', 'GET');
        if (result) {
          isDDOS = true;
          break;
        }
      }

      expect(isDDOS).toBe(true);
    });
  });
});

describe('RateLimitBreachNotificationService', () => {
  let notificationService: RateLimitBreachNotificationService;

  beforeEach(() => {
    notificationService = new RateLimitBreachNotificationService('redis://localhost:6379');
  });

  describe('getNotificationPreferences', () => {
    it('should return default global preferences', async () => {
      const prefs = await notificationService.getNotificationPreferences();

      expect(prefs).toBeDefined();
      expect(prefs.channels).toBeInstanceOf(Array);
      expect(prefs.channels.length).toBeGreaterThan(0);
      expect(prefs.enabled).toBe(true);
    });
  });

  describe('setNotificationPreferences', () => {
    it('should save custom preferences', async () => {
      const customPrefs = {
        channels: [
          {
            type: 'email' as const,
            config: { recipients: 'test@example.com' },
            enabled: true,
            minSeverity: 'HIGH' as const
          }
        ],
        breachThreshold: 2,
        enabled: true
      };

      await notificationService.setNotificationPreferences(customPrefs);
      const savedPrefs = await notificationService.getNotificationPreferences();

      expect(savedPrefs.channels[0].config.recipients).toBe('test@example.com');
      expect(savedPrefs.breachThreshold).toBe(2);
    });
  });

  describe('notifyBreach', () => {
    it('should cache breach for history', async () => {
      const breach = {
        id: 'test-breach-123',
        ip: '192.168.1.200',
        endpoint: '/api/users',
        breachType: 'RATE_LIMIT' as const,
        severity: 'HIGH' as const,
        timestamp: new Date(),
        details: { limit: 100, actual: 250 },
        resolved: false
      };

      // Mock the notification sending to avoid SMTP errors
      await notificationService.notifyBreach(breach);

      const history = await notificationService.getBreachHistory(10);
      const found = history.some(h => h.id === breach.id);

      expect(found).toBe(true);
    });
  });

  describe('getBreachHistory', () => {
    it('should return paginated breach history', async () => {
      const history = await notificationService.getBreachHistory(50, 0);

      expect(history).toBeInstanceOf(Array);
      expect(history.length).toBeLessThanOrEqual(50);
    });
  });
});

describe('Integration Tests', () => {
  let apiKeyService: APIKeyManagementService;
  let ipBlockingService: IPBlockingService;
  let notificationService: RateLimitBreachNotificationService;

  beforeEach(() => {
    apiKeyService = new APIKeyManagementService('redis://localhost:6379');
    ipBlockingService = new IPBlockingService('redis://localhost:6379');
    notificationService = new RateLimitBreachNotificationService('redis://localhost:6379');
  });

  it('should handle complete flow: key generation -> rate limit -> breach notification', async () => {
    // 1. Generate API key
    const { apiKey, keyId } = await apiKeyService.generateAPIKey('test-user', 'Integration Test', {
      tier: 'BASIC',
      rateLimit: 2,
      windowMs: 1000
    });

    expect(apiKey).toBeDefined();

    // 2. Validate key
    const mockReq = {
      headers: { 'x-api-key': apiKey }
    } as any;

    const validation = await apiKeyService.validateAPIKey(mockReq);
    expect(validation.valid).toBe(true);

    // 3. Check rate limit multiple times to trigger breach
    const keyData = validation.keyData!;
    let breached = false;

    for (let i = 0; i < 5; i++) {
      const result = await apiKeyService.checkRateLimit(keyId, keyData);
      if (!result.allowed) {
        breached = true;
        // 4. Record abuse for IP
        await ipBlockingService.recordAbuse('192.168.1.55', 'RATE_LIMIT_BREACH', {
          keyId,
          endpoint: '/api/test'
        });
      }
    }

    expect(breached).toBe(true);

    // 5. Send breach notification
    await notificationService.notifyBreach({
      id: `test-${Date.now()}`,
      ip: '192.168.1.55',
      endpoint: '/api/test',
      breachType: 'RATE_LIMIT',
      severity: 'MEDIUM',
      timestamp: new Date(),
      details: { keyId, reason: 'exceeded limit' },
      resolved: false
    });

    // 6. Verify history was recorded
    const history = await notificationService.getBreachHistory(10);
    expect(history.length).toBeGreaterThan(0);
  });
});
