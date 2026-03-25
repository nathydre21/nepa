import { logger } from './logger';
import prisma from './prismaClient';

/**
 * Database Connection Pool Manager
 * Monitors and manages database connection pool health
 */
export class DatabasePoolManager {
  private static instance: DatabasePoolManager;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isHealthy = true;
  private lastCheckTime = new Date();
  private connectionMetrics = {
    activeConnections: 0,
    idleConnections: 0,
    totalConnections: 0,
    failedConnections: 0
  };

  private constructor() {
    this.startHealthMonitoring();
  }

  public static getInstance(): DatabasePoolManager {
    if (!DatabasePoolManager.instance) {
      DatabasePoolManager.instance = new DatabasePoolManager();
    }
    return DatabasePoolManager.instance;
  }

  /**
   * Start monitoring database connection pool health
   */
  private startHealthMonitoring(): void {
    // Check pool health every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      await this.checkPoolHealth();
    }, 30000);
  }

  /**
   * Check database connection pool health
   */
  private async checkPoolHealth(): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Simple health check query
      await prisma.$queryRaw`SELECT 1`;
      
      const responseTime = Date.now() - startTime;
      this.lastCheckTime = new Date();
      
      // Log slow queries
      if (responseTime > 1000) {
        logger.warn('Slow database query detected', {
          responseTime,
          query: 'health_check'
        });
      }

      // Update health status
      this.isHealthy = true;
      
      logger.debug('Database pool health check passed', {
        responseTime,
        timestamp: this.lastCheckTime
      });
    } catch (error) {
      this.isHealthy = false;
      this.connectionMetrics.failedConnections++;
      
      logger.error('Database pool health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: this.lastCheckTime
      });
    }
  }

  /**
   * Get current pool health status
   */
  public getPoolHealth(): {
    isHealthy: boolean;
    lastCheckTime: Date;
    metrics: typeof this.connectionMetrics;
  } {
    return {
      isHealthy: this.isHealthy,
      lastCheckTime: this.lastCheckTime,
      metrics: { ...this.connectionMetrics }
    };
  }

  /**
   * Execute database operation with retry logic
   */
  public async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    retryDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown database error');
        
        if (attempt === maxRetries) {
          logger.error('Database operation failed after all retry attempts', {
            error: lastError.message,
            attempts: maxRetries
          });
          throw lastError;
        }

        const delay = retryDelay * attempt;
        logger.warn(`Database operation failed, retrying in ${delay}ms`, {
          error: lastError.message,
          attempt,
          maxRetries
        });

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  /**
   * Batch database operations to reduce connection overhead
   */
  public async batchOperations<T>(
    operations: Array<() => Promise<T>>,
    batchSize: number = 10
  ): Promise<T[]> {
    const results: T[] = [];
    
    for (let i = 0; i < operations.length; i += batchSize) {
      const batch = operations.slice(i, i + batchSize);
      
      try {
        const batchResults = await Promise.all(batch.map(op => this.executeWithRetry(op)));
        results.push(...batchResults);
      } catch (error) {
        logger.error('Batch operation failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
          batchSize: batch.length,
          batchIndex: Math.floor(i / batchSize)
        });
        throw error;
      }
    }
    
    return results;
  }

  /**
   * Graceful shutdown cleanup
   */
  public async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    try {
      await prisma.$disconnect();
      logger.info('Database pool manager shutdown completed');
    } catch (error) {
      logger.error('Error during database pool shutdown', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get connection pool statistics
   */
  public async getPoolStats(): Promise<{
    activeConnections: number;
    idleConnections: number;
    totalConnections: number;
    isHealthy: boolean;
    lastCheckTime: Date;
  }> {
    try {
      // Get connection info from database
      const result = await prisma.$queryRaw`SELECT count(*) as total_connections FROM pg_stat_activity WHERE state = 'active'`;
      
      return {
        activeConnections: Array.isArray(result) && result.length > 0 ? Number(result[0]?.total_connections || 0) : 0,
        idleConnections: Math.max(0, this.connectionMetrics.totalConnections - this.connectionMetrics.activeConnections),
        totalConnections: this.connectionMetrics.totalConnections,
        isHealthy: this.isHealthy,
        lastCheckTime: this.lastCheckTime
      };
    } catch (error) {
      logger.error('Failed to get pool statistics', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        activeConnections: 0,
        idleConnections: 0,
        totalConnections: this.connectionMetrics.totalConnections,
        isHealthy: false,
        lastCheckTime: this.lastCheckTime
      };
    }
  }
}

export const databasePoolManager = DatabasePoolManager.getInstance();
