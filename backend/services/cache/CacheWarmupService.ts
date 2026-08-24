import { getCacheStrategy } from './CacheStrategy';
import { getSessionCacheService } from './SessionCacheService';
import { logger } from '../logger';

// Mock Prisma client for now - replace with actual database client
const prisma = {
  userSession: {
    findMany: async (options: any) => [],
  },
  user: {
    findMany: async (options: any) => [],
    count: async (options?: any) => 0,
    groupBy: async (options: any) => [],
  },
  userProfile: {
    findMany: async (options: any) => [],
  },
  payment: {
    findMany: async (options: any) => [],
    count: async (options?: any) => 0,
    aggregate: async (options: any) => ({ _sum: { amount: 0 } }),
    groupBy: async (options: any) => [],
  },
  webhook: {
    findMany: async (options: any) => [],
  },
  utility: {
    findMany: async (options: any) => [],
  },
};

export interface WarmupConfig {
  enabled: boolean;
  scheduleInterval: number; // minutes
  batchSize: number;
  maxConcurrency: number;
  priorities: {
    high: boolean;
    medium: boolean;
    low: boolean;
  };
}

export interface WarmupJob {
  id: string;
  name: string;
  priority: 'high' | 'medium' | 'low';
  loader: () => Promise<any>;
  cachePattern: string;
  cacheParams: Record<string, string>;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  runCount: number;
  errorCount: number;
}

export interface WarmupStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  avgExecutionTime: number;
  lastRunTime: Date;
  nextScheduledRun: Date;
  cacheHitImprovement: number;
}

/**
 * Cache warming service to preload critical data
 * Reduces cold start times and improves user experience
 */
export class CacheWarmupService {
  private cacheStrategy = getCacheStrategy();
  private sessionCache = getSessionCacheService();
  private config: WarmupConfig;
  private jobs: Map<string, WarmupJob> = new Map();
  private isRunning = false;
  private stats: WarmupStats = {
    totalJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    avgExecutionTime: 0,
    lastRunTime: new Date(),
    nextScheduledRun: new Date(),
    cacheHitImprovement: 0
  };

  constructor(config: Partial<WarmupConfig> = {}) {
    this.config = {
      enabled: true,
      scheduleInterval: 30, // 30 minutes
      batchSize: 50,
      maxConcurrency: 5,
      priorities: {
        high: true,
        medium: true,
        low: false
      },
      ...config
    };

    this.initializeJobs();
    
    if (this.config.enabled) {
      this.startScheduler();
    }
  }

  /**
   * Initialize warmup jobs for different data types
   */
  private initializeJobs(): void {
    // High: Active user sessions
    this.addJob({
      id: 'active_sessions',
      name: 'Active User Sessions',
      priority: 'high',
      loader: () => this.loadActiveSessions(),
      cachePattern: 'user:session',
      cacheParams: {},
      enabled: true,
      runCount: 0,
      errorCount: 0
    });

    // High: Recent active users
    this.addJob({
      id: 'recent_users',
      name: 'Recent Active Users',
      priority: 'high',
      loader: () => this.loadRecentUsers(),
      cachePattern: 'user:profile',
      cacheParams: {},
      enabled: true,
      runCount: 0,
      errorCount: 0
    });

    // High: User preferences for active users
    this.addJob({
      id: 'user_preferences',
      name: 'User Preferences',
      priority: 'high',
      loader: () => this.loadUserPreferences(),
      cachePattern: 'user:preferences',
      cacheParams: {},
      enabled: true,
      runCount: 0,
      errorCount: 0
    });

    // High: Recent payment history
    this.addJob({
      id: 'recent_payments',
      name: 'Recent Payment History',
      priority: 'high',
      loader: () => this.loadRecentPayments(),
      cachePattern: 'payment:recent',
      cacheParams: {},
      enabled: true,
      runCount: 0,
      errorCount: 0
    });

    // High: Active webhook configurations
    this.addJob({
      id: 'webhook_configs',
      name: 'Webhook Configurations',
      priority: 'high',
      loader: () => this.loadWebhookConfigs(),
      cachePattern: 'webhook:config',
      cacheParams: {},
      enabled: true,
      runCount: 0,
      errorCount: 0
    });

    // Medium: Utility providers (static data)
    this.addJob({
      id: 'utility_providers',
      name: 'Utility Providers',
      priority: 'medium',
      loader: () => this.loadUtilityProviders(),
      cachePattern: 'utility:providers',
      cacheParams: {},
      enabled: true,
      runCount: 0,
      errorCount: 0
    });

    // Medium: Dashboard analytics for admin users
    this.addJob({
      id: 'admin_analytics',
      name: 'Admin Dashboard Analytics',
      priority: 'medium',
      loader: () => this.loadAdminAnalytics(),
      cachePattern: 'analytics:dashboard',
      cacheParams: {},
      enabled: true,
      runCount: 0,
      errorCount: 0
    });

    // Low: Historical analytics data
    this.addJob({
      id: 'historical_analytics',
      name: 'Historical Analytics',
      priority: 'low',
      loader: () => this.loadHistoricalAnalytics(),
      cachePattern: 'analytics:revenue',
      cacheParams: {},
      enabled: false, // Disabled by default
      runCount: 0,
      errorCount: 0
    });
  }

  /**
   * Add a warmup job
   */
  addJob(job: WarmupJob): void {
    this.jobs.set(job.id, job);
    this.stats.totalJobs = this.jobs.size;
    logger.debug(`Added warmup job: ${job.name}`);
  }

  /**
   * Remove a warmup job
   */
  removeJob(jobId: string): boolean {
    const removed = this.jobs.delete(jobId);
    this.stats.totalJobs = this.jobs.size;
    return removed;
  }

  /**
   * Run all enabled warmup jobs
   */
  async runWarmup(): Promise<WarmupStats> {
    if (this.isRunning) {
      logger.warn('Warmup already running, skipping');
      return this.stats;
    }

    this.isRunning = true;
    const startTime = Date.now();
    
    logger.info('Starting cache warmup');

    try {
      const enabledJobs = Array.from(this.jobs.values())
        .filter(job => job.enabled && this.config.priorities[job.priority])
        .sort((a, b) => this.getPriorityWeight(a.priority) - this.getPriorityWeight(b.priority));

      // Run jobs in batches with concurrency control
      const batches = this.chunkArray(enabledJobs, this.config.batchSize);
      
      for (const batch of batches) {
        await this.runJobBatch(batch);
      }

      const executionTime = Date.now() - startTime;
      this.stats.avgExecutionTime = (this.stats.avgExecutionTime + executionTime) / 2;
      this.stats.lastRunTime = new Date();
      this.stats.nextScheduledRun = new Date(Date.now() + this.config.scheduleInterval * 60 * 1000);

      logger.info(`Cache warmup completed in ${executionTime}ms`);
    } catch (error) {
      logger.error('Cache warmup error:', error as any);
    } finally {
      this.isRunning = false;
    }

    return this.stats;
  }

  /**
   * Run a batch of jobs with concurrency control
   */
  private async runJobBatch(jobs: WarmupJob[]): Promise<void> {
    const semaphore = new Array(this.config.maxConcurrency).fill(null);
    
    const promises = jobs.map(async (job) => {
      // Wait for available slot
      await new Promise(resolve => {
        const checkSlot = () => {
          const index = semaphore.findIndex(slot => slot === null);
          if (index !== -1) {
            semaphore[index] = job.id;
            resolve(index);
          } else {
            setTimeout(checkSlot, 10);
          }
        };
        checkSlot();
      });

      try {
        await this.runJob(job);
        this.stats.completedJobs++;
      } catch (error) {
        this.stats.failedJobs++;
        job.errorCount++;
        logger.error(`Warmup job ${job.name} failed:`, error as any);
      } finally {
        // Release slot
        const index = semaphore.indexOf(job.id);
        if (index !== -1) {
          semaphore[index] = null;
        }
      }
    });

    await Promise.all(promises);
  }

  /**
   * Run a single warmup job
   */
  private async runJob(job: WarmupJob): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.debug(`Running warmup job: ${job.name}`);
      
      const data = await job.loader();
      
      if (Array.isArray(data)) {
        // Batch cache multiple items
        const promises = data.map((item, index) => {
          const params = { ...job.cacheParams, index: index.toString() };
          return this.cacheStrategy.set(job.cachePattern, params, item);
        });
        await Promise.all(promises);
      } else if (data) {
        // Cache single item
        await this.cacheStrategy.set(job.cachePattern, job.cacheParams, data);
      }

      job.runCount++;
      job.lastRun = new Date();
      
      const executionTime = Date.now() - startTime;
      logger.debug(`Warmup job ${job.name} completed in ${executionTime}ms`);
    } catch (error) {
      logger.error(`Warmup job ${job.name} error:`, error as any);
      throw error;
    }
  }

  /**
   * Data loaders for different cache types
   */
  private async loadActiveSessions(): Promise<any[]> {
    try {
      // Load active sessions from last 24 hours
      const sessions = await prisma.userSession.findMany({
        where: {
          isActive: true,
          expiresAt: {
            gt: new Date()
          },
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        },
        take: this.config.batchSize,
        orderBy: {
          lastAccessedAt: 'desc'
        }
      });

      return sessions;
    } catch (error) {
      logger.error('Load active sessions error:', error as any);
      return [];
    }
  }

  private async loadRecentUsers(): Promise<any[]> {
    try {
      // Load users who logged in recently
      const users = await prisma.user.findMany({
        where: {
          status: 'ACTIVE',
          lastLoginAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
          }
        },
        select: {
          id: true,
          email: true,
          username: true,
          name: true,
          role: true,
          status: true,
          walletAddress: true,
          isEmailVerified: true,
          twoFactorEnabled: true,
          lastLoginAt: true
        },
        take: this.config.batchSize,
        orderBy: {
          lastLoginAt: 'desc'
        }
      });

      return users;
    } catch (error) {
      logger.error('Load recent users error:', error as any);
      return [];
    }
  }

  private async loadUserPreferences(): Promise<any[]> {
    try {
      // Load preferences for recently active users
      const preferences = await prisma.userProfile.findMany({
        where: {
          user: {
            status: 'ACTIVE',
            lastLoginAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            }
          }
        },
        take: this.config.batchSize,
        orderBy: {
          updatedAt: 'desc'
        }
      });

      return preferences;
    } catch (error) {
      logger.error('Load user preferences error:', error as any);
      return [];
    }
  }

  private async loadRecentPayments(): Promise<any[]> {
    try {
      // Load recent payments for active users
      const payments = await prisma.payment.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
          }
        },
        take: this.config.batchSize,
        orderBy: {
          createdAt: 'desc'
        }
      });

      return payments;
    } catch (error) {
      logger.error('Load recent payments error:', error as any);
      return [];
    }
  }

  private async loadWebhookConfigs(): Promise<any[]> {
    try {
      // Load active webhook configurations
      const webhooks = await prisma.webhook.findMany({
        where: {
          isActive: true
        },
        take: this.config.batchSize
      });

      return webhooks;
    } catch (error) {
      logger.error('Load webhook configs error:', error as any);
      return [];
    }
  }

  private async loadUtilityProviders(): Promise<any> {
    try {
      // Load utility providers (static data)
      const providers = await prisma.utility.findMany({
        select: {
          id: true,
          name: true,
          type: true,
          provider: true
        }
      });

      return providers;
    } catch (error) {
      logger.error('Load utility providers error:', error as any);
      return [];
    }
  }

  private async loadAdminAnalytics(): Promise<any> {
    try {
      // Load dashboard analytics for admin users
      const analytics = {
        userCount: await prisma.user.count(),
        activeUsers: await prisma.user.count({
          where: {
            status: 'ACTIVE',
            lastLoginAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            }
          }
        }),
        totalRevenue: await prisma.payment.aggregate({
          where: {
            status: 'SUCCESS'
          },
          _sum: {
            amount: true
          }
        }),
        recentPayments: await prisma.payment.count({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
            }
          }
        })
      };

      return analytics;
    } catch (error) {
      logger.error('Load admin analytics error:', error as any);
      return {};
    }
  }

  private async loadHistoricalAnalytics(): Promise<any> {
    try {
      // Load historical analytics (expensive queries)
      const historical = {
        monthlyRevenue: await prisma.payment.groupBy({
          by: ['createdAt'],
          where: {
            status: 'SUCCESS',
            createdAt: {
              gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) // Last year
            }
          },
          _sum: {
            amount: true
          }
        }),
        userGrowth: await prisma.user.groupBy({
          by: ['createdAt'],
          where: {
            createdAt: {
              gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
            }
          },
          _count: true
        })
      };

      return historical;
    } catch (error) {
      logger.error('Load historical analytics error:', error as any);
      return {};
    }
  }

  /**
   * Start the warmup scheduler
   */
  private startScheduler(): void {
    const intervalMs = this.config.scheduleInterval * 60 * 1000;
    
    setInterval(async () => {
      if (!this.isRunning) {
        await this.runWarmup();
      }
    }, intervalMs);

    logger.info(`Cache warmup scheduler started (interval: ${this.config.scheduleInterval} minutes)`);
  }

  /**
   * Get priority weight for sorting
   */
  private getPriorityWeight(priority: string): number {
    const weights = { high: 1, medium: 2, low: 3 };
    return weights[priority as keyof typeof weights] || 4;
  }

  /**
   * Chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Get warmup statistics
   */
  getStats(): WarmupStats {
    return { ...this.stats };
  }

  /**
   * Get job status
   */
  getJobs(): WarmupJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Enable/disable a job
   */
  setJobEnabled(jobId: string, enabled: boolean): boolean {
    const job = this.jobs.get(jobId);
    if (job) {
      job.enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * Manual trigger for specific job
   */
  async runJobById(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return false;
    }

    try {
      await this.runJob(job);
      return true;
    } catch (error) {
      logger.error(`Manual job run failed for ${jobId}:`, error as any);
      return false;
    }
  }
}

// Singleton instance
let cacheWarmupService: CacheWarmupService | null = null;

export function getCacheWarmupService(): CacheWarmupService {
  if (!cacheWarmupService) {
    cacheWarmupService = new CacheWarmupService();
  }
  return cacheWarmupService;
}