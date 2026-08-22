import { Request, Response, NextFunction } from 'express';

// Monitoring interfaces
interface RequestMetrics {
  method: string;
  url: string;
  userAgent: string;
  ip: string;
  timestamp: Date;
  responseTime?: number;
  statusCode?: number;
  error?: string;
  service?: string;
}

interface ServiceMetrics {
  serviceName: string;
  requestCount: number;
  averageResponseTime: number;
  errorRate: number;
  lastError?: Date;
  uptime: number;
}

// In-memory metrics store (in production, use database or time-series DB)
const metrics = {
  requests: [] as RequestMetrics[],
  services: new Map<string, ServiceMetrics>(),
  alerts: [] as {
    type: string;
    message: string;
    timestamp: Date;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }[],
};

// Alert thresholds
const thresholds = {
  responseTime: {
    warning: 2000, // 2 seconds
    critical: 5000, // 5 seconds
  },
  errorRate: {
    warning: 0.05, // 5%
    critical: 0.10, // 10%
  },
  requestRate: {
    warning: 100, // 100 requests per minute
    critical: 200, // 200 requests per minute
  },
};

// Generate unique request ID
export const generateRequestId = (): string => {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
};

// Calculate service metrics
export const calculateServiceMetrics = (serviceName: string): ServiceMetrics => {
  const serviceRequests = metrics.requests.filter(req => req.service === serviceName);
  const totalRequests = serviceRequests.length;

  if (totalRequests === 0) {
    return {
      serviceName,
      requestCount: 0,
      averageResponseTime: 0,
      errorRate: 0,
      uptime: 100,
    };
  }

  const successfulRequests = serviceRequests.filter(req => !req.error);
  const responseTimes = serviceRequests
    .filter(req => req.responseTime !== undefined)
    .map(req => req.responseTime!);

  const averageResponseTime = responseTimes.length > 0
    ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
    : 0;

  const errorCount = totalRequests - successfulRequests.length;
  const errorRate = totalRequests > 0 ? errorCount / totalRequests : 0;

  return {
    serviceName,
    requestCount: totalRequests,
    averageResponseTime,
    errorRate,
    uptime: 100 - (errorRate * 100),
  };
};

// Check for alerts
export const checkAlerts = (serviceMetrics: ServiceMetrics) => {
  const alerts = [];

  // Response time alerts
  if (serviceMetrics.averageResponseTime > thresholds.responseTime.critical) {
    alerts.push({
      type: 'response_time',
      message: `Service ${serviceMetrics.serviceName} response time is critically high: ${serviceMetrics.averageResponseTime}ms`,
      timestamp: new Date(),
      severity: 'critical',
    });
  } else if (serviceMetrics.averageResponseTime > thresholds.responseTime.warning) {
    alerts.push({
      type: 'response_time',
      message: `Service ${serviceMetrics.serviceName} response time is elevated: ${serviceMetrics.averageResponseTime}ms`,
      timestamp: new Date(),
      severity: 'medium',
    });
  }

  // Error rate alerts
  if (serviceMetrics.errorRate > thresholds.errorRate.critical) {
    alerts.push({
      type: 'error_rate',
      message: `Service ${serviceMetrics.serviceName} error rate is critical: ${(serviceMetrics.errorRate * 100).toFixed(1)}%`,
      timestamp: new Date(),
      severity: 'critical',
    });
  } else if (serviceMetrics.errorRate > thresholds.errorRate.warning) {
    alerts.push({
      type: 'error_rate',
      message: `Service ${serviceMetrics.serviceName} error rate is elevated: ${(serviceMetrics.errorRate * 100).toFixed(1)}%`,
      timestamp: new Date(),
      severity: 'medium',
    });
  }

  // Uptime alerts
  if (serviceMetrics.uptime < 95) {
    alerts.push({
      type: 'uptime',
      message: `Service ${serviceMetrics.serviceName} uptime is low: ${serviceMetrics.uptime.toFixed(1)}%`,
      timestamp: new Date(),
      severity: 'high',
    });
  }

  return alerts;
};

// Monitoring middleware
export const monitoringMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  // Add request ID to response headers
  res.setHeader('X-Request-ID', requestId);
  res.setHeader('X-Start-Time', startTime.toString());

  // Store request start time
  const requestMetric: RequestMetrics = {
    method: req.method,
    url: req.originalUrl,
    userAgent: req.headers['user-agent'] || 'Unknown',
    ip: req.ip || req.connection.remoteAddress || 'Unknown',
    timestamp: new Date(),
  };

  // Override res.end to capture metrics
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: string) {
    const endTime = Date.now();
    const responseTime = endTime - startTime;

    // Update request metrics
    requestMetric.responseTime = responseTime;
    requestMetric.statusCode = res.statusCode;
    requestMetric.service = req.headers['x-gateway-service'] || 'unknown';

    metrics.requests.push(requestMetric);

    // Keep only last 1000 requests in memory
    if (metrics.requests.length > 1000) {
      metrics.requests = metrics.requests.slice(-1000);
    }

    // Log the request
    console.log(JSON.stringify({
      requestId,
      method: requestMetric.method,
      url: requestMetric.url,
      ip: requestMetric.ip,
      userAgent: requestMetric.userAgent,
      service: requestMetric.service,
      statusCode: requestMetric.statusCode,
      responseTime,
      timestamp: new Date().toISOString(),
    }));

    // Call original end
    return originalEnd.call(this, chunk, encoding);
  };

  next();
};

// Get metrics for dashboard
export const getMetrics = () => {
  const serviceMetrics = new Map<string, ServiceMetrics>();

  // Calculate metrics for each service
  const services = ['user-service', 'payment-service', 'notification-service', 'analytics-service'];
  services.forEach(service => {
    serviceMetrics.set(service, calculateServiceMetrics(service));
  });

  // Check for alerts
  const allAlerts = [];
  serviceMetrics.forEach((metrics, serviceName) => {
    allAlerts.push(...checkAlerts(metrics));
  });

  // Sort alerts by timestamp
  allAlerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  return {
    services: Array.from(serviceMetrics.entries()).map(([name, metrics]) => ({
      serviceName: name,
      ...metrics,
    })),
    alerts: allAlerts.slice(-50), // Last 50 alerts
    totalRequests: metrics.requests.length,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    cpuUsage: process.cpuUsage(),
  };
};

// Get metrics for specific service
export const getServiceMetrics = (serviceName: string) => {
  return calculateServiceMetrics(serviceName);
};

// Clear old metrics
export const clearMetrics = () => {
  metrics.requests = [];
  metrics.services.clear();
  metrics.alerts = [];
};

// Health check for monitoring service
export const healthCheck = () => {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    metrics: {
      totalRequests: metrics.requests.length,
      activeServices: metrics.services.size,
      totalAlerts: metrics.alerts.length,
      uptime: process.uptime(),
    },
  };
};

// Performance monitoring
export const getPerformanceMetrics = () => {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  return {
    memory: {
      used: memUsage.heapUsed,
      total: memUsage.heapTotal,
      external: memUsage.heapTotal - memUsage.heapUsed,
      rss: memUsage.rss,
      usagePercentage: ((memUsage.heapUsed / memUsage.heapTotal) * 100).toFixed(2),
    },
    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system,
      idle: cpuUsage.idle,
    },
    loadAverage: require('os').loadavg(),
    uptime: process.uptime(),
  };
};

// Error tracking
export const trackError = (error: Error, req?: Request) => {
  const errorMetric = {
    type: 'error',
    message: error.message,
    stack: error.stack,
    timestamp: new Date(),
    requestId: req?.headers['x-request-id'],
    url: req?.originalUrl,
    method: req?.method,
    userAgent: req?.headers['user-agent'],
    ip: req?.ip || req?.connection?.remoteAddress,
  };

  metrics.alerts.push({
    type: 'error',
    message: `Application error: ${error.message}`,
    timestamp: new Date(),
    severity: 'high',
  });

  console.error('Application Error:', JSON.stringify(errorMetric));
};

// Request analytics
export const getRequestAnalytics = (timeRange: '1h' | '24h' | '7d' | '30d') => {
  const now = new Date();
  let startTime: Date;

  switch (timeRange) {
    case '1h':
      startTime = new Date(now.getTime() - (60 * 60 * 1000));
      break;
    case '24h':
      startTime = new Date(now.getTime() - (24 * 60 * 60 * 1000));
      break;
    case '7d':
      startTime = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
      break;
    case '30d':
      startTime = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
      break;
  }

  const filteredRequests = metrics.requests.filter(req =>
    req.timestamp >= startTime && req.timestamp <= now
  );

  const requestsPerMinute = filteredRequests.length / (timeRange === '1h' ? 60 : timeRange === '24h' ? 1440 : 10080);

  const statusCodes = filteredRequests.reduce((acc, req) => {
    const code = req.statusCode || 0;
    acc[code] = (acc[code] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  return {
    timeRange,
    totalRequests: filteredRequests.length,
    requestsPerMinute: Math.round(requestsPerMinute * 100) / 100,
    statusCodes,
    averageResponseTime: filteredRequests
      .filter(req => req.responseTime !== undefined)
      .reduce((sum, req) => sum + req.responseTime!, 0) / filteredRequests.length || 0,
    topEndpoints: Object.entries(
      filteredRequests.reduce((acc, req) => {
        const key = `${req.method} ${req.url.split('?')[0]}`;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    ).sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([endpoint, count]) => ({ endpoint, count })),
  };
};
