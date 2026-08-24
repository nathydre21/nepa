import { Router, Request, Response } from 'express';
import { getCacheStrategy } from '../services/cache/CacheStrategy';
import { getSessionCacheService } from '../services/cache/SessionCacheService';
import { getCacheWarmupService } from '../services/cache/CacheWarmupService';
import { getCacheMonitoringService } from '../services/cache/CacheMonitoringService';
import { getMicroserviceCacheService } from '../services/cache/MicroserviceCacheService';
import { getCacheInitializer } from '../services/cache/CacheInitializer';
import { getCacheManager } from '../services/RedisCacheManager';
import { authenticate, authorize } from '../middleware/authentication';
import { logger } from '../services/logger';
import { sanitizeInput } from '../middleware/inputSanitization';

const router = Router();

/**
 * Cache management routes for administrators
 */

// Middleware to ensure only admins can access cache management
router.use(authenticate);
router.use(authorize(['ADMIN', 'SUPER_ADMIN']));
router.use(sanitizeInput);

/**
 * GET /api/cache/health
 * Get comprehensive cache health status
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const monitoring = getCacheMonitoringService();
    const initializer = getCacheInitializer();
    
    const [healthMetrics, performanceReport, initStatus] = await Promise.all([
      monitoring.getHealthMetrics(),
      monitoring.getPerformanceReport(),
      initializer.getStatus()
    ]);

    res.json({
      status: healthMetrics.redis.connected ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      redis: healthMetrics.redis,
      performance: performanceReport.summary,
      services: initStatus.services,
      uptime: initStatus.uptime,
      alerts: healthMetrics.alerts.filter(alert => !alert.resolved),
      recommendations: performanceReport.recommendations,
      trends: performanceReport.trends
    });
  } catch (error) {
    logger.error('Cache health check error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Cache health check failed',
      error: error.message
    });
  }
});

/**
 * GET /api/cache/metrics
 * Get detailed cache metrics
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const cacheStrategy = getCacheStrategy();
    const monitoring = getCacheMonitoringService();
    const microservicesCache = getMicroserviceCacheService();

    const [strategyMetrics, healthMetrics, microservicesStats] = await Promise.all([
      cacheStrategy.getMetrics(),
      monitoring.getHealthMetrics(),
      microservicesCache.getMicroservicesCacheStats()
    ]);

    res.json({
      timestamp: new Date().toISOString(),
      overall: strategyMetrics,
      redis: healthMetrics.redis,
      patterns: healthMetrics.patterns,
      microservices: microservicesStats,
      performance: healthMetrics.performance
    });
  } catch (error) {
    logger.error('Cache metrics error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve cache metrics',
      error: error.message
    });
  }
});

/**
 * GET /api/cache/metrics/prometheus
 * Export metrics in Prometheus format
 */
router.get('/metrics/prometheus', async (req: Request, res: Response) => {
  try {
    const monitoring = getCacheMonitoringService();
    const metrics = monitoring.exportMetrics();
    
    res.set('Content-Type', 'text/plain');
    res.send(metrics.prometheus);
  } catch (error) {
    logger.error('Prometheus metrics export error:', error);
    res.status(500).send('# Error exporting metrics');
  }
});

/**
 * POST /api/cache/warmup
 * Trigger cache warmup manually
 */
router.post('/warmup', async (req: Request, res: Response) => {
  try {
    const warmupService = getCacheWarmupService();
    const { jobId } = req.body;

    let result;
    if (jobId) {
      // Run specific job
      result = await warmupService.runJobById(jobId);
      if (!result) {
        return res.status(404).json({
          success: false,
          message: `Warmup job '${jobId}' not found`
        });
      }
      
      res.json({
        success: true,
        message: `Warmup job '${jobId}' executed successfully`
      });
    } else {
      // Run all warmup jobs
      const stats = await warmupService.runWarmup();
      res.json({
        success: true,
        message: 'Cache warmup completed',
        stats
      });
    }
  } catch (error) {
    logger.error('Cache warmup error:', error);
    res.status(500).json({
      success: false,
      message: 'Cache warmup failed',
      error: error.message
    });
  }
});

/**
 * GET /api/cache/warmup/status
 * Get warmup service status and job information
 */
router.get('/warmup/status', async (req: Request, res: Response) => {
  try {
    const warmupService = getCacheWarmupService();
    const stats = warmupService.getStats();
    const jobs = warmupService.getJobs();

    res.json({
      stats,
      jobs: jobs.map(job => ({
        id: job.id,
        name: job.name,
        priority: job.priority,
        enabled: job.enabled,
        lastRun: job.lastRun,
        nextRun: job.nextRun,
        runCount: job.runCount,
        errorCount: job.errorCount
      }))
    });
  } catch (error) {
    logger.error('Warmup status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get warmup status',
      error: error.message
    });
  }
});

/**
 * PUT /api/cache/warmup/jobs/:jobId
 * Enable/disable a warmup job
 */
router.put('/warmup/jobs/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'enabled field must be a boolean'
      });
    }

    const warmupService = getCacheWarmupService();
    const result = warmupService.setJobEnabled(jobId, enabled);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: `Warmup job '${jobId}' not found`
      });
    }

    res.json({
      success: true,
      message: `Warmup job '${jobId}' ${enabled ? 'enabled' : 'disabled'}`
    });
  } catch (error) {
    logger.error('Warmup job update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update warmup job',
      error: error.message
    });
  }
});

/**
 * DELETE /api/cache/invalidate
 * Invalidate cache by pattern or tags
 */
router.delete('/invalidate', async (req: Request, res: Response) => {
  try {
    const { pattern, params, tags } = req.body;

    if (!pattern && !tags) {
      return res.status(400).json({
        success: false,
        message: 'Either pattern or tags must be provided'
      });
    }

    const cacheStrategy = getCacheStrategy();
    await cacheStrategy.invalidate(pattern, params, tags);

    res.json({
      success: true,
      message: 'Cache invalidated successfully',
      invalidated: {
        pattern,
        params,
        tags
      }
    });
  } catch (error) {
    logger.error('Cache invalidation error:', error);
    res.status(500).json({
      success: false,
      message: 'Cache invalidation failed',
      error: error.message
    });
  }
});

/**
 * DELETE /api/cache/flush
 * Flush entire cache (dangerous operation)
 */
router.delete('/flush', async (req: Request, res: Response) => {
  try {
    const { confirm } = req.body;

    if (confirm !== 'FLUSH_ALL_CACHE') {
      return res.status(400).json({
        success: false,
        message: 'Confirmation required. Send { "confirm": "FLUSH_ALL_CACHE" }'
      });
    }

    const cacheManager = getCacheManager();
    const result = await cacheManager.flush();

    if (result) {
      logger.warn('Cache flushed by admin', { 
        userId: req.user?.id,
        userEmail: req.user?.email 
      });
      
      res.json({
        success: true,
        message: 'All cache data flushed successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Cache flush failed'
      });
    }
  } catch (error) {
    logger.error('Cache flush error:', error);
    res.status(500).json({
      success: false,
      message: 'Cache flush failed',
      error: error.message
    });
  }
});

/**
 * GET /api/cache/alerts
 * Get active cache alerts
 */
router.get('/alerts', async (req: Request, res: Response) => {
  try {
    const monitoring = getCacheMonitoringService();
    const healthMetrics = await monitoring.getHealthMetrics();
    
    const activeAlerts = healthMetrics.alerts.filter(alert => !alert.resolved);
    
    res.json({
      alerts: activeAlerts,
      count: activeAlerts.length,
      summary: {
        critical: activeAlerts.filter(a => a.severity === 'critical').length,
        high: activeAlerts.filter(a => a.severity === 'high').length,
        medium: activeAlerts.filter(a => a.severity === 'medium').length,
        low: activeAlerts.filter(a => a.severity === 'low').length
      }
    });
  } catch (error) {
    logger.error('Cache alerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve cache alerts',
      error: error.message
    });
  }
});

/**
 * PUT /api/cache/alerts/:alertId/resolve
 * Resolve a cache alert
 */
router.put('/alerts/:alertId/resolve', async (req: Request, res: Response) => {
  try {
    const { alertId } = req.params;
    const monitoring = getCacheMonitoringService();
    
    const result = await monitoring.resolveAlert(alertId);
    
    if (result) {
      res.json({
        success: true,
        message: `Alert ${alertId} resolved`
      });
    } else {
      res.status(404).json({
        success: false,
        message: `Alert ${alertId} not found`
      });
    }
  } catch (error) {
    logger.error('Alert resolution error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resolve alert',
      error: error.message
    });
  }
});

/**
 * GET /api/cache/config
 * Get current cache configuration
 */
router.get('/config', async (req: Request, res: Response) => {
  try {
    const initializer = getCacheInitializer();
    const status = await initializer.getStatus();
    
    res.json({
      config: status.config,
      services: status.services,
      initialized: status.initialized,
      uptime: status.uptime
    });
  } catch (error) {
    logger.error('Cache config error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve cache configuration',
      error: error.message
    });
  }
});

/**
 * POST /api/cache/reinitialize
 * Reinitialize cache system (for configuration changes)
 */
router.post('/reinitialize', async (req: Request, res: Response) => {
  try {
    const initializer = getCacheInitializer();
    const result = await initializer.reinitialize();
    
    if (result.success) {
      logger.info('Cache system reinitialized by admin', { 
        userId: req.user?.id,
        userEmail: req.user?.email 
      });
      
      res.json({
        success: true,
        message: 'Cache system reinitialized successfully',
        result
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Cache reinitialization failed',
        errors: result.errors,
        warnings: result.warnings
      });
    }
  } catch (error) {
    logger.error('Cache reinitialization error:', error);
    res.status(500).json({
      success: false,
      message: 'Cache reinitialization failed',
      error: error.message
    });
  }
});

/**
 * GET /api/cache/stats/microservices
 * Get microservice-specific cache statistics
 */
router.get('/stats/microservices', async (req: Request, res: Response) => {
  try {
    const microservicesCache = getMicroserviceCacheService();
    const stats = await microservicesCache.getMicroservicesCacheStats();
    
    res.json({
      timestamp: new Date().toISOString(),
      microservices: stats
    });
  } catch (error) {
    logger.error('Microservices cache stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve microservices cache statistics',
      error: error.message
    });
  }
});

/**
 * GET /api/cache/stats/sessions
 * Get session cache statistics
 */
router.get('/stats/sessions', async (req: Request, res: Response) => {
  try {
    const sessionCache = getSessionCacheService();
    const stats = await sessionCache.getSessionStats();
    
    res.json({
      timestamp: new Date().toISOString(),
      sessions: stats
    });
  } catch (error) {
    logger.error('Session cache stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve session cache statistics',
      error: error.message
    });
  }
});

export default router;