import * as crypto from 'crypto';
import { logger } from './logger';
import prisma from '../src/config/prismaClient';

export interface WebhookSecurityConfig {
  allowedIPs?: string[];
  allowedDomains?: string[];
  rateLimitPerMinute?: number;
  rateLimitPerHour?: number;
  requireHTTPS?: boolean;
  maxPayloadSize?: number;
  signatureAlgorithm?: 'sha256' | 'sha512';
  allowedEventTypes?: string[];
}

export interface WebhookAuthentication {
  type: 'NONE' | 'API_KEY' | 'BEARER_TOKEN' | 'BASIC_AUTH' | 'OAUTH2';
  credentials?: {
    apiKey?: string;
    token?: string;
    username?: string;
    password?: string;
    clientId?: string;
    clientSecret?: string;
    scope?: string;
  };
}

export interface SecurityAuditLog {
  id: string;
  webhookId: string;
  action: string;
  ipAddress: string;
  userAgent: string;
  status: 'SUCCESS' | 'FAILURE' | 'BLOCKED';
  reason?: string;
  timestamp: Date;
}

export class WebhookSecurityService {
  private rateLimitStore: Map<string, { count: number; resetTime: number }> = new Map();
  private blockedIPs: Set<string> = new Set();
  private auditLogs: SecurityAuditLog[] = [];

  /**
   * Validate webhook signature
   */
  static validateSignature(
    payload: string,
    signature: string,
    secret: string,
    algorithm: 'sha256' | 'sha512' = 'sha256'
  ): boolean {
    try {
      const expectedSignature = crypto
        .createHmac(algorithm, secret)
        .update(payload)
        .digest('hex');

      // Use constant-time comparison to prevent timing attacks
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      logger.error(`Signature validation error: ${error}`);
      return false;
    }
  }

  /**
   * Generate secure webhook secret
   */
  static generateSecureSecret(length: number = 64): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Hash sensitive credentials using crypto
   */
  static async hashCredential(credential: string): Promise<string> {
    return crypto.createHash('sha256').update(credential).digest('hex');
  }

  /**
   * Verify hashed credentials
   */
  static async verifyCredential(credential: string, hash: string): Promise<boolean> {
    const credentialHash = crypto.createHash('sha256').update(credential).digest('hex');
    return credentialHash === hash;
  }

  /**
   * Validate webhook URL security
   */
  static validateWebhookURL(url: string, config: WebhookSecurityConfig): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    try {
      const parsedUrl = new URL(url);

      // Check HTTPS requirement
      if (config.requireHTTPS && parsedUrl.protocol !== 'https:') {
        errors.push('HTTPS is required for webhook URLs');
      }

      // Check allowed domains
      if (config.allowedDomains && config.allowedDomains.length > 0) {
        const domain = parsedUrl.hostname;
        if (!config.allowedDomains.some(allowed => domain === allowed || domain.endsWith(`.${allowed}`))) {
          errors.push(`Domain ${domain} is not in the allowed list`);
        }
      }

      // Check for localhost in production
      if (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1') {
        errors.push('Localhost URLs are not allowed in production');
      }

      // Check for private IP ranges
      if (this.isPrivateIP(parsedUrl.hostname)) {
        errors.push('Private IP addresses are not allowed');
      }

    } catch (error) {
      errors.push('Invalid URL format');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if IP is private
   */
  private static isPrivateIP(hostname: string): boolean {
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^127\./,
      /^169\.254\./,
    ];

    return privateRanges.some(range => range.test(hostname));
  }

  /**
   * Rate limiting check
   */
  checkRateLimit(webhookId: string, config: WebhookSecurityConfig): boolean {
    const now = Date.now();
    const key = webhookId;

    // Clean up expired entries
    const keysToDelete: string[] = [];
    this.rateLimitStore.forEach((v, k) => {
      if (now > v.resetTime) {
        keysToDelete.push(k);
      }
    });
    keysToDelete.forEach(k => this.rateLimitStore.delete(k));

    const current = this.rateLimitStore.get(key);

    if (!current) {
      // First request
      this.rateLimitStore.set(key, {
        count: 1,
        resetTime: now + 60 * 1000, // 1 minute
      });
      return true;
    }

    // Check per-minute limit
    if (config.rateLimitPerMinute && current.count >= config.rateLimitPerMinute) {
      this.logSecurityEvent(webhookId, 'RATE_LIMIT_EXCEEDED', 'unknown', 'unknown', 'BLOCKED', 'Per-minute rate limit exceeded');
      return false;
    }

    current.count++;
    return true;
  }

  /**
   * IP whitelist/blacklist check
   */
  isIPAllowed(ipAddress: string, config: WebhookSecurityConfig): boolean {
    // Check if IP is blocked
    if (this.blockedIPs.has(ipAddress)) {
      return false;
    }

    // Check whitelist
    if (config.allowedIPs && config.allowedIPs.length > 0) {
      return config.allowedIPs.includes(ipAddress);
    }

    return true;
  }

  /**
   * Validate payload size
   */
  validatePayloadSize(payloadSize: number, config: WebhookSecurityConfig): boolean {
    const maxSize = config.maxPayloadSize || 1024 * 1024; // Default 1MB
    return payloadSize <= maxSize;
  }

  /**
   * Sanitize webhook payload
   */
  sanitizePayload(payload: any): any {
    if (typeof payload !== 'object' || payload === null) {
      return payload;
    }

    // Remove potentially sensitive fields
    const sensitiveFields = [
      'password',
      'secret',
      'token',
      'key',
      'credential',
      'auth',
      'private',
    ];

    const sanitized = { ...payload };

    const sanitizeObject = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
      }

      if (typeof obj === 'object' && obj !== null) {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
          const lowerKey = key.toLowerCase();
          
          if (sensitiveFields.some(field => lowerKey.includes(field))) {
            result[key] = '[REDACTED]';
          } else if (typeof value === 'object') {
            result[key] = sanitizeObject(value);
          } else {
            result[key] = value;
          }
        }
        return result;
      }

      return obj;
    };

    return sanitizeObject(sanitized);
  }

  /**
   * Setup webhook authentication
   */
  async setupWebhookAuthentication(
    webhookId: string,
    authConfig: WebhookAuthentication
  ): Promise<void> {
    try {
      const hashedCredentials: any = {};

      if (authConfig.credentials) {
        if (authConfig.credentials.apiKey) {
          hashedCredentials.apiKey = await WebhookSecurityService.hashCredential(authConfig.credentials.apiKey);
        }
        if (authConfig.credentials.token) {
          hashedCredentials.token = await WebhookSecurityService.hashCredential(authConfig.credentials.token);
        }
        if (authConfig.credentials.password) {
          hashedCredentials.password = await WebhookSecurityService.hashCredential(authConfig.credentials.password);
        }
        if (authConfig.credentials.clientSecret) {
          hashedCredentials.clientSecret = await WebhookSecurityService.hashCredential(authConfig.credentials.clientSecret);
        }
      }

      await prisma.webhook.update({
        where: { id: webhookId },
        data: {
          authType: authConfig.type,
          authCredentials: JSON.stringify(hashedCredentials),
        },
      });

      this.logSecurityEvent(webhookId, 'AUTH_SETUP', 'system', 'system', 'SUCCESS', `Authentication type: ${authConfig.type}`);
    } catch (error) {
      logger.error(`Failed to setup webhook authentication: ${error}`);
      throw error;
    }
  }

  /**
   * Verify webhook authentication
   */
  async verifyWebhookAuthentication(
    webhookId: string,
    authConfig: WebhookAuthentication,
    headers: Record<string, string>
  ): Promise<boolean> {
    try {
      const webhook = await prisma.webhook.findUnique({
        where: { id: webhookId },
      });

      if (!webhook || !webhook.authCredentials) {
        return false;
      }

      const storedCredentials = JSON.parse(webhook.authCredentials as any);

      switch (authConfig.type) {
        case 'API_KEY':
          const apiKey = headers['x-api-key'] || headers['authorization']?.replace('Bearer ', '');
          if (!apiKey) return false;
          return await WebhookSecurityService.verifyCredential(apiKey, storedCredentials.apiKey);

        case 'BEARER_TOKEN':
          const token = headers['authorization']?.replace('Bearer ', '');
          if (!token) return false;
          return await WebhookSecurityService.verifyCredential(token, storedCredentials.token);

        case 'BASIC_AUTH':
          const authHeader = headers['authorization'];
          if (!authHeader || !authHeader.startsWith('Basic ')) return false;
          
          const credentials = Buffer.from(authHeader.slice(6), 'base64').toString();
          const [username, password] = credentials.split(':');
          
          return username === webhook.userId && 
                 await WebhookSecurityService.verifyCredential(password, storedCredentials.password);

        case 'OAUTH2':
          // OAuth2 verification would require additional token validation logic
          // This is a simplified version
          const oauthToken = headers['authorization']?.replace('Bearer ', '');
          return oauthToken && oauthToken.length > 10; // Basic validation

        case 'NONE':
        default:
          return true;
      }
    } catch (error) {
      logger.error(`Authentication verification error: ${error}`);
      return false;
    }
  }

  /**
   * Block IP address
   */
  blockIP(ipAddress: string, reason: string): void {
    this.blockedIPs.add(ipAddress);
    logger.warn(`IP blocked: ${ipAddress}, reason: ${reason}`);
  }

  /**
   * Unblock IP address
   */
  unblockIP(ipAddress: string): void {
    this.blockedIPs.delete(ipAddress);
    logger.info(`IP unblocked: ${ipAddress}`);
  }

  /**
   * Log security events
   */
  private logSecurityEvent(
    webhookId: string,
    action: string,
    ipAddress: string,
    userAgent: string,
    status: 'SUCCESS' | 'FAILURE' | 'BLOCKED',
    reason?: string
  ): void {
    const logEntry: SecurityAuditLog = {
      id: crypto.randomUUID(),
      webhookId,
      action,
      ipAddress,
      userAgent,
      status,
      reason,
      timestamp: new Date(),
    };

    this.auditLogs.push(logEntry);

    // Keep only last 1000 logs in memory
    if (this.auditLogs.length > 1000) {
      this.auditLogs = this.auditLogs.slice(-1000);
    }

    logger.info(`Security event: ${action} for webhook ${webhookId} from ${ipAddress} - ${status}${reason ? ` (${reason})` : ''}`);
  }

  /**
   * Get security audit logs
   */
  getSecurityAuditLogs(
    webhookId?: string,
    limit: number = 100
  ): SecurityAuditLog[] {
    let logs = this.auditLogs;

    if (webhookId) {
      logs = logs.filter(log => log.webhookId === webhookId);
    }

    return logs
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get security metrics
   */
  getSecurityMetrics(): {
    totalEvents: number;
    blockedEvents: number;
    failedEvents: number;
    successEvents: number;
    blockedIPs: number;
    topBlockedIPs: Array<{ ip: string; count: number }>;
  } {
    const totalEvents = this.auditLogs.length;
    const blockedEvents = this.auditLogs.filter(log => log.status === 'BLOCKED').length;
    const failedEvents = this.auditLogs.filter(log => log.status === 'FAILURE').length;
    const successEvents = this.auditLogs.filter(log => log.status === 'SUCCESS').length;

    // Count events by IP
    const ipCounts: Record<string, number> = {};
    this.auditLogs
      .filter(log => log.status === 'BLOCKED')
      .forEach(log => {
        ipCounts[log.ipAddress] = (ipCounts[log.ipAddress] || 0) + 1;
      });

    const topBlockedIPs = Object.entries(ipCounts)
      .map(([ip, count]) => ({ ip, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalEvents,
      blockedEvents,
      failedEvents,
      successEvents,
      blockedIPs: this.blockedIPs.size,
      topBlockedIPs,
    };
  }

  /**
   * Generate security report
   */
  generateSecurityReport(webhookId?: string): {
    summary: any;
    recentEvents: SecurityAuditLog[];
    recommendations: string[];
  } {
    const logs = webhookId 
      ? this.auditLogs.filter(log => log.webhookId === webhookId)
      : this.auditLogs;

    const recentEvents = logs
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 50);

    const metrics = this.getSecurityMetrics();
    const recommendations: string[] = [];

    if (metrics.blockedEvents > metrics.totalEvents * 0.1) {
      recommendations.push('High rate of blocked events detected. Review security policies.');
    }

    if (metrics.failedEvents > metrics.totalEvents * 0.2) {
      recommendations.push('High authentication failure rate. Check credentials and configuration.');
    }

    if (metrics.blockedIPs > 100) {
      recommendations.push('Large number of blocked IPs. Consider implementing IP whitelist.');
    }

    return {
      summary: metrics,
      recentEvents,
      recommendations,
    };
  }
}

export const webhookSecurityService = new WebhookSecurityService();
