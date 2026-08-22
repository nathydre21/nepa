import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { Request, Response, NextFunction } from 'express';
import { authMiddleware } from './middleware/auth';
import { loggingMiddleware } from './middleware/logging';
import { validationMiddleware } from './middleware/validation';
import { transformMiddleware } from './middleware/transform';
import { monitoringMiddleware } from './middleware/monitoring';

// Service registry for microservices
interface ServiceConfig {
  name: string;
  url: string;
  version: string;
  healthCheck?: string;
  timeout?: number;
  retries?: number;
  circuitBreaker?: {
    enabled: boolean;
    threshold: number;
    timeout: number;
  };
}

const services: Record<string, ServiceConfig> = {
  'user-service': {
    name: 'User Service',
    url: process.env.USER_SERVICE_URL || 'http://localhost:3001',
    version: 'v1',
    healthCheck: '/health',
    timeout: 5000,
    retries: 3,
    circuitBreaker: {
      enabled: true,
      threshold: 5,
      timeout: 60000,
    },
  },
  'payment-service': {
    name: 'Payment Service',
    url: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3002',
    version: 'v1',
    healthCheck: '/health',
    timeout: 10000,
    retries: 3,
    circuitBreaker: {
      enabled: true,
      threshold: 3,
      timeout: 30000,
    },
  },
  'notification-service': {
    name: 'Notification Service',
    url: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3003',
    version: 'v1',
    healthCheck: '/health',
    timeout: 3000,
    retries: 2,
  },
  'analytics-service': {
    name: 'Analytics Service',
    url: process.env.ANALYTICS_SERVICE_URL || 'http://localhost:3004',
    version: 'v1',
    healthCheck: '/health',
    timeout: 2000,
    retries: 2,
  },
};

// Circuit breaker state
interface CircuitState {
  failures: number;
  lastFailureTime: number;
  state: 'CLOSED' | 'HALF_OPEN' | 'OPEN';
}

const circuitStates = new Map<string, CircuitState>();

// Rate limiting configurations
const rateLimitConfigs = {
  'user-service': {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: 'Too many requests from this IP, please try again later.',
  },
  'payment-service': {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 50, // 50 requests per window
    message: 'Too many payment requests, please try again later.',
  },
  'notification-service': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 200, // 200 requests per hour
    message: 'Too many notifications, please try again later.',
  },
  'analytics-service': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 1000, // 1000 requests per hour
    message: 'Too many analytics requests, please try again later.',
  },
};

// Create Express app
const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Request logging and monitoring
app.use(loggingMiddleware);
app.use(monitoringMiddleware);

// Request validation and transformation
app.use(validationMiddleware);
app.use(transformMiddleware);

// Authentication middleware
app.use(authMiddleware);

// Rate limiting per service
Object.entries(services).forEach(([serviceName, config]) => {
  const rateLimitConfig = rateLimitConfigs[serviceName];
  if (rateLimitConfig) {
    const limiter = rateLimit({
      windowMs: rateLimitConfig.windowMs,
      max: rateLimitConfig.max,
      message: rateLimitConfig.message,
      standardHeaders: true,
      legacyHeaders: false,
    });

    // Apply rate limiting to specific service routes
    app.use(`/api/${config.version}/${serviceName}`, limiter);
  }
});

// Health check endpoint for the gateway
app.get('/health', async (req, res) => {
  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {},
    uptime: process.uptime(),
  };

  // Check health of all services
  const healthChecks = Promise.allSettled(
    Object.entries(services).map(async ([serviceName, config]) => {
      try {
        if (config.healthCheck) {
          const response = await fetch(`${config.url}${config.healthCheck}`, {
            method: 'GET',
            timeout: 5000,
          });

          if (response.ok) {
            healthStatus.services[serviceName] = {
              status: 'healthy',
              responseTime: Date.now(),
            };
            return { status: 'fulfilled', value: serviceName };
          }
        }

        healthStatus.services[serviceName] = {
          status: 'unknown',
          error: 'No health check configured',
        };
        return { status: 'fulfilled', value: serviceName };
      } catch (error) {
        healthStatus.services[serviceName] = {
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error',
          lastCheck: new Date().toISOString(),
        };
        return { status: 'fulfilled', value: serviceName };
      }
    })
  );

  await healthChecks;

  res.json(healthStatus);
});

// API documentation endpoint
app.get('/api/docs', (req, res) => {
  const docs = {
    title: 'NEPA API Gateway',
    version: '1.0.0',
    description: 'Centralized API gateway for NEPA microservices',
    services: Object.entries(services).map(([name, config]) => ({
      name,
      displayName: config.name,
      version: config.version,
      baseUrl: `/api/${config.version}/${name}`,
      healthCheck: config.healthCheck ? `${config.url}${config.healthCheck}` : null,
      timeout: config.timeout,
      retries: config.retries,
      circuitBreaker: config.circuitBreaker,
    })),
    authentication: {
      type: 'Bearer Token',
      description: 'JWT token required for authenticated endpoints',
    },
    rateLimiting: Object.entries(rateLimitConfigs).map(([service, config]) => ({
      service,
      windowMs: config.windowMs,
      max: config.max,
      description: config.message,
    })),
    security: {
      cors: {
        enabled: true,
        allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      },
      helmet: {
        enabled: true,
        csp: {
          enabled: true,
          policy: 'default-src \'self\'; style-src \'self\' \'unsafe-inline\'; script-src \'self\'; img-src \'self\' data: https:; connect-src \'self\' https:;',
        },
      },
    },
  };

  res.json(docs);
});

// Create proxy middleware for each service
Object.entries(services).forEach(([serviceName, config]) => {
  // Check circuit breaker state
  const checkCircuitBreaker = (req: Request, res: Response, next: NextFunction) => {
    const circuitState = circuitStates.get(serviceName);

    if (circuitState?.state === 'OPEN') {
      // Check if circuit should be half-open
      const timeSinceOpen = Date.now() - circuitState.lastFailureTime;
      if (timeSinceOpen > 60000) { // 1 minute
        circuitState.state = 'HALF_OPEN';
      } else {
        return res.status(503).json({
          error: 'Service temporarily unavailable',
          service: serviceName,
          reason: 'Circuit breaker is open',
          retryAfter: new Date(Date.now() + 60000).toISOString(),
        });
      }
    }

    next();
  };

  // Update circuit breaker on failures
  const updateCircuitBreaker = (success: boolean) => {
    const currentState = circuitStates.get(serviceName) || { failures: 0, lastFailureTime: 0, state: 'OPEN' as const };

    if (success) {
      currentState.failures = 0;
      currentState.state = 'OPEN';
    } else {
      currentState.failures++;
      currentState.lastFailureTime = Date.now();

      if (currentState.failures >= config.circuitBreaker?.threshold) {
        currentState.state = 'OPEN';
      }
    }

    circuitStates.set(serviceName, currentState);
  };

  // Create proxy middleware
  const proxyOptions = {
    target: config.url,
    changeOrigin: true,
    pathRewrite: {
      [`^/api/${config.version}/${serviceName}`]: '',
    },
    onError: (err, req, res) => {
      console.error(`Proxy error for ${serviceName}:`, err);
      updateCircuitBreaker(false);

      res.status(502).json({
        error: 'Service unavailable',
        service: serviceName,
        message: 'Service temporarily unavailable',
        timestamp: new Date().toISOString(),
      });
    },
    onProxyReq: (proxyReq, req) => {
      console.log(`Proxying ${req.method} ${req.originalUrl} to ${serviceName}`);
    },
    onProxyRes: (proxyRes, req, res) => {
      updateCircuitBreaker(true);

      // Add response headers
      res.setHeader('X-Gateway-Service', serviceName);
      res.setHeader('X-Gateway-Version', config.version);
      res.setHeader('X-Response-Time', Date.now().toString());
    },
    timeout: config.timeout,
  };

  // Apply middleware chain
  app.use(`/api/${config.version}/${serviceName}`, checkCircuitBreaker);
  app.use(`/api/${config.version}/${serviceName}`, createProxyMiddleware(proxyOptions));
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Gateway error:', err);

  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'],
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.originalUrl} not found`,
    availableServices: Object.keys(services),
    documentation: '/api/docs',
    timestamp: new Date().toISOString(),
  });
});

// Start server
const PORT = process.env.GATEWAY_PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 NEPA API Gateway running on port ${PORT}`);
  console.log(`📋 Available services:`, Object.keys(services));
  console.log(`📚 API Documentation: http://localhost:${PORT}/api/docs`);
  console.log(`💚 Health Check: http://localhost:${PORT}/health`);
});

export default app;
