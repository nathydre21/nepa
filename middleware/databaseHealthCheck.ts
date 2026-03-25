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

    res.json({
      status: poolHealth.isHealthy ? 'healthy' : 'unhealthy',
      database: {
        ...poolStats,
        lastHealthCheck: poolHealth.lastCheckTime
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get database health', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve database health information'
    });
  }
};
