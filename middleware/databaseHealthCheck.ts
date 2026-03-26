import { Request, Response, NextFunction } from 'express';
import { databasePoolManager } from '../databasePoolManager';
import { logger } from '../logger';

/**
 * Middleware to check database connection pool health
 */
export const databaseHealthCheck = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const poolHealth = databasePoolManager.getPoolHealth();
    const poolStats = await databasePoolManager.getPoolStats();

    // If database is unhealthy, return 503
    if (!poolHealth.isHealthy) {
      logger.error('Database health check failed', {
        poolHealth,
        poolStats,
        requestId: req.headers['x-request-id']
      });

      return res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'Database connection issues detected',
        retryAfter: 30
      });
    }

    // Add pool stats to request for monitoring
    (req as any).dbPoolStats = poolStats;
    
    next();
  } catch (error) {
    logger.error('Database health check middleware error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId: req.headers['x-request-id']
    });

    res.status(503).json({
      error: 'Service temporarily unavailable',
      message: 'Database health check failed'
    });
  }
};

/**
 * Enhanced health check endpoint with pool metrics
 */
export const getDatabaseHealth = async (req: Request, res: Response) => {
  try {
    const poolHealth = databasePoolManager.getPoolHealth();
    const poolStats = await databasePoolManager.getPoolStats();

    const healthInfo = {
      status: poolHealth.isHealthy ? 'healthy' : 'unhealthy',
      database: {
        ...poolStats,
        ...poolHealth.metrics,
        lastHealthCheck: poolHealth.lastCheckTime
      },
      recommendations: generateHealthRecommendations(poolHealth, poolStats),
      timestamp: new Date().toISOString()
    };

    res.status(poolHealth.isHealthy ? 200 : 503).json(healthInfo);
  } catch (error) {
    logger.error('Failed to get database health', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(503).json({
      status: 'error',
      message: 'Failed to retrieve database health information',
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Generate health recommendations based on pool metrics
 */
function generateHealthRecommendations(poolHealth: any, poolStats: any): string[] {
  const recommendations: string[] = [];
  
  if (!poolHealth.isHealthy) {
    recommendations.push('Database pool is unhealthy - check database server connectivity');
  }
  
  if (poolStats.activeConnections > poolStats.totalConnections * 0.8) {
    recommendations.push('High connection utilization - consider increasing DB_CONNECTION_LIMIT');
  }
  
  if (poolHealth.metrics.poolExhaustionEvents > 0) {
    recommendations.push('Pool exhaustion events detected - review connection usage patterns');
  }
  
  if (poolHealth.metrics.averageResponseTime > 5000) {
    recommendations.push('High average response time - consider query optimization or connection tuning');
  }
  
  if (poolHealth.metrics.failedConnections > 0) {
    recommendations.push('Connection failures detected - check database server performance and network connectivity');
  }
  
  return recommendations;
}
