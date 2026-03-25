import { logger } from './logger';
import prisma from './prismaClient';

/**
 * Database Connection Pool Manager
 * Monitors and manages database connection pool health with enhanced monitoring
 */
export class DatabasePoolManager {
  private static instance: DatabasePoolManager;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;
  private isHealthy = true;
  private lastCheckTime = new Date();
  private connectionMetrics = {
    activeConnections: 0,
    idleConnections: 0,
    totalConnections: 0,
    failedConnections: 0,
    poolExhaustionEvents: 0,
    averageResponseTime: 0,
    maxResponseTime: 0
  };
  private responseTimeHistory: number[] = [];
  private readonly maxHistorySize = 100;

  private constructor() {
    this.startHealthMonitoring();
    this.startMetricsCollection();
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
    // Check pool health every 15 seconds (more frequent monitoring)
    this.healthCheckInterval = setInterval(async () => {
      await this.checkPoolHealth();
    }, 15000);
  }

  /**
   * Start collecting detailed pool metrics
   */
  private startMetricsCollection(): void {
    // Collect metrics every 30 seconds
    this.metricsInterval = setInterval(async () => {
      await this.collectPoolMetrics();
    }, 30000);
  }

  /**
   * Check database connection pool health with enhanced monitoring
   */
  private async checkPoolHealth(): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Simple health check query
      await prisma.$queryRaw`SELECT 1`;
      
      const responseTime = Date.now() - startTime;
      this.lastCheckTime = new Date();
      
      // Track response time history
      this.responseTimeHistory.push(responseTime);
      if (this.responseTimeHistory.length > this.maxHistorySize) {
        this.responseTimeHistory.shift();
      }
      
      // Update response time metrics
      this.connectionMetrics.averageResponseTime = 
        this.responseTimeHistory.reduce((a, b) => a + b, 0) / this.responseTimeHistory.length;
      this.connectionMetrics.maxResponseTime = Math.max(...this.responseTimeHistory);
      
      // Log slow queries and potential pool issues
      if (responseTime > 2000) { // Reduced threshold from 1000ms
        logger.warn(`Slow database query detected - Response: ${responseTime}ms, Avg: ${this.connectionMetrics.averageResponseTime}ms, Max: ${this.connectionMetrics.maxResponseTime}ms`);
      }

      // Check for pool exhaustion indicators
      if (responseTime > 5000 || this.connectionMetrics.averageResponseTime > 3000) {
        this.connectionMetrics.poolExhaustionEvents++;
        logger.error(`Potential database pool exhaustion detected - Response: ${responseTime}ms, Avg: ${this.connectionMetrics.averageResponseTime}ms, Events: ${this.connectionMetrics.poolExhaustionEvents}`);
      }

      // Update health status
      this.isHealthy = true;
      
      logger.debug(`Database pool health check passed - Response: ${responseTime}ms, Avg: ${this.connectionMetrics.averageResponseTime}ms`);
    } catch (error) {
      this.isHealthy = false;
      this.connectionMetrics.failedConnections++;
      
      // Check if error is pool-related
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isPoolError = errorMessage.toLowerCase().includes('pool') || 
                         errorMessage.toLowerCase().includes('connection') ||
                         errorMessage.toLowerCase().includes('timeout');
      
      if (isPoolError) {
        this.connectionMetrics.poolExhaustionEvents++;
        logger.error(`Database pool exhaustion detected - Error: ${errorMessage}, Events: ${this.connectionMetrics.poolExhaustionEvents}`);
      } else {
        logger.error(`Database pool health check failed - Error: ${errorMessage}`);
      }
    }
  }

  /**
   * Collect detailed pool metrics from database
   */
  private async collectPoolMetrics(): Promise<void> {
    try {
      // Get connection info from database
      const result = await prisma.$queryRaw`SELECT 
        count(*) as total_connections,
        count(CASE WHEN state = 'active' THEN 1 END) as active_connections,
        count(CASE WHEN state = 'idle' THEN 1 END) as idle_connections
        FROM pg_stat_activity 
        WHERE datname = current_database()`;
      
      if (Array.isArray(result) && result.length > 0) {
        const stats = result[0] as any;
        this.connectionMetrics.activeConnections = Number(stats.active_connections || 0);
        this.connectionMetrics.idleConnections = Number(stats.idle_connections || 0);
        this.connectionMetrics.totalConnections = Number(stats.total_connections || 0);
      }
      
      // Log metrics for monitoring
      logger.debug(`Database pool metrics - Active: ${this.connectionMetrics.activeConnections}, Idle: ${this.connectionMetrics.idleConnections}, Total: ${this.connectionMetrics.totalConnections}, Avg Response: ${this.connectionMetrics.averageResponseTime}ms, Pool Events: ${this.connectionMetrics.poolExhaustionEvents}`);
      
    } catch (error) {
      logger.error(`Failed to collect pool metrics - Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
   * Execute database operation with enhanced retry logic and pool exhaustion handling
   */
  public async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 5, // Increased from 3
    retryDelay: number = 2000 // Increased from 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown database error');
        
        // Check if error is pool-related
        const errorMessage = lastError.message.toLowerCase();
        const isPoolError = errorMessage.includes('pool') || 
                           errorMessage.includes('connection') ||
                           errorMessage.includes('timeout') ||
                           errorMessage.includes('too many connections');
        
        if (isPoolError) {
          this.connectionMetrics.poolExhaustionEvents++;
          
          // For pool errors, use exponential backoff with longer delays
          const exponentialDelay = retryDelay * Math.pow(2, attempt - 1);
          
          if (attempt === maxRetries) {
            logger.error(`Database pool exhausted - All retries failed - Error: ${lastError.message}, Attempts: ${maxRetries}, Events: ${this.connectionMetrics.poolExhaustionEvents}, Final Delay: ${exponentialDelay}ms`);
            throw new Error(`Database pool exhausted: ${lastError.message}`);
          }

          logger.warn(`Database pool exhausted - Retrying in ${exponentialDelay}ms - Error: ${lastError.message}, Attempt: ${attempt}/${maxRetries}, Events: ${this.connectionMetrics.poolExhaustionEvents}`);

          await new Promise(resolve => setTimeout(resolve, exponentialDelay));
        } else {
          // For non-pool errors, use standard retry logic
          if (attempt === maxRetries) {
            logger.error(`Database operation failed - All retries failed - Error: ${lastError.message}, Attempts: ${maxRetries}`);
            throw lastError;
          }

          const delay = retryDelay * attempt;
          logger.warn(`Database operation failed - Retrying in ${delay}ms - Error: ${lastError.message}, Attempt: ${attempt}/${maxRetries}`);

          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError!;
  }

  /**
   * Enhanced batch database operations with better connection management
   */
  public async batchOperations<T>(
    operations: Array<() => Promise<T>>,
    batchSize: number = 5 // Reduced from 10 to reduce connection pressure
  ): Promise<T[]> {
    const results: T[] = [];
    
    for (let i = 0; i < operations.length; i += batchSize) {
      const batch = operations.slice(i, i + batchSize);
      
      try {
        // Execute batch with connection pool awareness
        const batchResults = await Promise.all(
          batch.map(op => this.executeWithRetry(op))
        );
        results.push(...batchResults);
        
        // Add small delay between batches to prevent pool exhaustion
        if (i + batchSize < operations.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        logger.error(`Batch operation failed - Error: ${error instanceof Error ? error.message : 'Unknown error'}, Batch Size: ${batch.length}, Batch Index: ${Math.floor(i / batchSize)}, Remaining: ${operations.length - i}`);
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
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    try {
      await prisma.$disconnect();
      logger.info('Database pool manager shutdown completed');
    } catch (error) {
      logger.error(`Error during database pool shutdown - Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
