import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { ApiResponseMiddleware } from '../middleware/ApiResponseMiddleware';
import { ApiVersioning } from '../middleware/ApiVersioning';
import { RateLimiting } from '../middleware/RateLimiting';
import { ApiDocumentation } from '../swagger/ApiDocumentation';

// Import routes
import authRoutes from '../routes/v1/auth';
import { sanitizeInput } from '../../middleware/inputSanitization';

/**
 * Standardized Application Setup
 * Implements REST API best practices with proper middleware stack
 */
export class StandardizedApp {
  private app: Application;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
    this.setupDocumentation();
  }

  /**
   * Setup global middleware
   */
  private setupMiddleware(): void {
    // 1. Security headers (should be first)
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }));

    // 2. CORS configuration
    this.app.use(cors({
      origin: (origin, callback) => {
        const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'X-API-Version',
        'X-Request-ID'
      ],
      exposedHeaders: [
        'X-Request-ID',
        'X-Response-Time',
        'X-Rate-Limit-Remaining',
        'X-Rate-Limit-Reset',
        'X-API-Version'
      ]
    }));

    // 3. Request parsing
    this.app.use(express.json({ 
      limit: '10mb',
      strict: true
    }));
    this.app.use(express.urlencoded({ 
      extended: true,
      limit: '10mb'
    }));

    // 4. Input sanitization (XSS prevention)
    this.app.use('/api', sanitizeInput);

    // 5. API versioning
    this.app.use('/api', ApiVersioning.versionMiddleware);

    // 5. Request logging
    this.app.use('/api', ApiResponseMiddleware.requestLogger);

    // 6. Response helpers
    this.app.use('/api', ApiResponseMiddleware.attachHelpers);

    // 7. Global rate limiting
    this.app.use('/api', RateLimiting.RateLimiters.public);

    // 8. Request ID middleware
    this.app.use('/api', (req: Request, res: Response, next: NextFunction) => {
      req.headers['x-request-id'] = req.headers['x-request-id'] || this.generateRequestId();
      next();
    });
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      const context = (req as any).context;
      res.success({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version,
        environment: process.env.NODE_ENV || 'development',
        requestId: context?.requestId
      });
    });

    // API info endpoint
    this.app.get('/api', (req: Request, res: Response) => {
      const context = (req as any).context;
      res.success({
        name: 'NEPA API',
        version: '2.0.0',
        description: 'Standardized REST API for NEPA platform',
        endpoints: {
          v1: '/api/v1',
          authentication: '/api/v1/auth',
          users: '/api/v1/users',
          documents: '/api/v1/documents',
          payments: '/api/v1/payments',
          analytics: '/api/v1/analytics'
        },
        features: [
          'Standardized responses',
          'API versioning',
          'Rate limiting',
          'Request validation',
          'Error handling',
          'Security headers',
          'API documentation'
        ],
        supportedVersions: ApiVersioning.getSupportedVersions(),
        defaultVersion: 'v1',
        requestId: context?.requestId
      });
    });

    // API routes
    this.app.use('/api/v1', authRoutes);

    // 404 handler for API routes
    this.app.use('/api/*', ApiResponseMiddleware.notFoundHandler);
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    // Global error handler
    this.app.use(ApiResponseMiddleware.errorHandler);

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      console.error('Unhandled Rejection at:', reason, 'at:', promise);
      // Don't exit the process, but log it for monitoring
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      console.error('Uncaught Exception:', error);
      // Don't exit the process immediately, but give time for logging
      process.exit(1);
    });
  }

  /**
   * Setup API documentation
   */
  private setupDocumentation(): void {
    // Swagger UI
    this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(ApiDocumentation.generateSpec()));

    // OpenAPI spec
    this.app.get('/api-docs.json', (req: Request, res: Response) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(ApiDocumentation.generateSpec());
    });

    // Postman collection
    this.app.get('/api-docs/postman', (req: Request, res: Response) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(ApiDocumentation.generatePostmanCollection());
    });

    // API documentation index
    this.app.get('/api-docs', (req: Request, res: Response) => {
      res.send(ApiDocumentation.generateDocumentationHtml());
    });
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get Express app instance
   */
  getApp(): Application {
    return this.app;
  }

  /**
   * Start the server
   */
  start(port: number = process.env.PORT || 3000): void {
    this.app.listen(port, () => {
      console.log(`🚀 NEPA API Server started on port ${port}`);
      console.log(`📚 API Documentation: http://localhost:${port}/api-docs`);
      console.log(`🔍 OpenAPI Spec: http://localhost:${port}/api-docs.json`);
      console.log(`📮 Postman Collection: http://localhost:${port}/api-docs/postman`);
      console.log(`🏥 Health Check: http://localhost:${port}/health`);
      console.log(`ℹ️ Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  }
}

/**
 * Create and configure the standardized app
 */
export const createStandardizedApp = (): StandardizedApp => {
  return new StandardizedApp();
};

/**
 * Export the app instance for backward compatibility
 */
export default StandardizedApp;
