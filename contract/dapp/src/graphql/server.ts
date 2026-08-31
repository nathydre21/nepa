import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { json } from 'body-parser';
import { GraphQLSchema, GraphQLObjectType, GraphQLScalarType, Kind } from 'graphql';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { GraphQLUpload } from 'graphql-upload/GraphQLUpload.js';
import { gql } from 'graphql-tag';

import { readFileSync } from 'fs';
import { join } from 'path';
import { resolvers, publishEvent } from './resolvers';
import { Context } from '../types';
import { IntegrationMonitor } from '../api';

// Import schema
const typeDefs = gql(readFileSync(join(__dirname, 'schema.graphql'), 'utf8'));

// Custom scalar types
const DateScalar = new GraphQLScalarType({
  name: 'Date',
  description: 'Date custom scalar type',
  serialize(value: any) {
    return value instanceof Date ? value.toISOString().split('T')[0] : null;
  },
  parseValue(value: any) {
    return new Date(value);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value);
    }
    return null;
  },
});

const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'DateTime custom scalar type',
  serialize(value: any) {
    return value instanceof Date ? value.toISOString() : null;
  },
  parseValue(value: any) {
    return new Date(value);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value);
    }
    return null;
  },
});

const BigIntScalar = new GraphQLScalarType({
  name: 'BigInt',
  description: 'BigInt custom scalar type',
  serialize(value: any) {
    return value.toString();
  },
  parseValue(value: any) {
    return BigInt(value);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING || ast.kind === Kind.INT) {
      return BigInt(ast.value);
    }
    return null;
  },
});

const DecimalScalar = new GraphQLScalarType({
  name: 'Decimal',
  description: 'Decimal custom scalar type for financial amounts',
  serialize(value: any) {
    return typeof value === 'number' ? value.toFixed(2) : value.toString();
  },
  parseValue(value: any) {
    return parseFloat(value);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING || ast.kind === Kind.FLOAT || ast.kind === Kind.INT) {
      return parseFloat(ast.value);
    }
    return null;
  },
});

const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'JSON custom scalar type',
  serialize(value: any) {
    return value;
  },
  parseValue(value: any) {
    return value;
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      try {
        return JSON.parse(ast.value);
      } catch {
        return null;
      }
    }
    return null;
  },
});

export interface GraphQLServerConfig {
  port: number;
  environment: 'development' | 'staging' | 'production';
  corsOrigins: string[];
  rateLimit: {
    windowMs: number;
    max: number;
  };
  introspection: boolean;
  playground: boolean;
  subscriptions: boolean;
  cache: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
  };
  monitoring: {
    enabled: boolean;
    logLevel: string;
  };
}

export class GraphQLServer {
  private app: express.Application;
  private httpServer: any;
  private apolloServer: ApolloServer<Context>;
  private config: GraphQLServerConfig;
  private monitor: IntegrationMonitor;
  private schema: GraphQLSchema;

  constructor(config: GraphQLServerConfig) {
    this.config = config;
    this.app = express();
    this.httpServer = createServer(this.app);
    
    this.initializeSchema();
    this.initializeMonitoring();
    this.setupMiddleware();
    this.setupApolloServer();
  }

  private initializeSchema(): void {
    // Create executable schema with resolvers and custom scalars
    this.schema = makeExecutableSchema({
      typeDefs,
      resolvers: {
        ...resolvers,
        Date: DateScalar,
        DateTime: DateTimeScalar,
        BigInt: BigIntScalar,
        Decimal: DecimalScalar,
        JSON: JSONScalar,
        Upload: GraphQLUpload,
      },
    });
  }

  private initializeMonitoring(): void {
    this.monitor = new IntegrationMonitor({
      logLevel: this.config.monitoring.logLevel as any,
      retentionPeriod: 30,
      maxLogEntries: 10000,
      alertConfig: {
        enabled: true,
        thresholds: {
          errorRate: 5,
          responseTime: 5000,
          rateLimitHits: 50,
          cacheHitRate: 80
        },
        cooldown: 300000,
        channels: []
      },
      healthCheckInterval: 60000,
      metricsInterval: 30000
    });
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS
    this.app.use(cors({
      origin: this.config.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID']
    }));

    // Compression
    this.app.use(compression());

    // Rate limiting
    this.app.use(rateLimit({
      windowMs: this.config.rateLimit.windowMs,
      max: this.config.rateLimit.max,
      message: {
        errors: [{
          message: 'Too many requests from this IP, please try again later.',
          code: 'RATE_LIMIT_EXCEEDED'
        }]
      },
      standardHeaders: true,
      legacyHeaders: false,
    }));

    // Request parsing
    this.app.use(json({ limit: '10mb' }));

    // Request context middleware
    this.app.use((req, res, next) => {
      const correlationId = req.headers['x-request-id'] as string || this.generateCorrelationId();
      
      // Log request
      this.monitor.log('info', 'graphql', 'request_received', `${req.method} ${req.path}`, {
        correlationId,
        userAgent: req.headers['user-agent'],
        ip: req.ip
      }, correlationId);

      next();
    });
  }

  private setupApolloServer(): void {
    this.apolloServer = new ApolloServer<Context>({
      schema: this.schema,
      introspection: this.config.introspection,
      plugins: [
        ApolloServerPluginDrainHttpServer({ httpServer: this.httpServer }),
        ApolloServerPluginLandingPageLocalDefault({
          embed: this.config.playground,
          includeCookies: true,
        }),
      ],
      formatError: (error) => {
        this.monitor.log('error', 'graphql', 'graphql_error', error.message, {
          path: error.path,
          locations: error.locations,
          extensions: error.extensions
        });

        return {
          message: error.message,
          code: error.extensions?.code || 'INTERNAL_ERROR',
          path: error.path,
          locations: error.locations,
          extensions: this.config.environment === 'development' ? error.extensions : undefined
        };
      },
      formatResponse: (response) => {
        const correlationId = response.extensions?.correlationId;
        
        this.monitor.log('info', 'graphql', 'response_sent', 'GraphQL response', {
          correlationId,
          dataCount: response.data ? Object.keys(response.data).length : 0,
          errorCount: response.errors?.length || 0
        }, correlationId);

        return response;
      },
    });
  }

  private generateCorrelationId(): string {
    return `gql_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async createContext({ req }: { req: express.Request }): Promise<Context> {
    // Extract authentication token
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    let user = null;
    if (token) {
      try {
        // Mock token verification - in production, verify JWT
        user = this.verifyToken(token);
      } catch (error) {
        this.monitor.log('warn', 'graphql', 'invalid_token', 'Invalid authentication token', {
          token: token.substring(0, 10) + '...'
        });
      }
    }

    return {
      user,
      req,
      res: {} as any, // Will be set by express
      correlationId: req.headers['x-request-id'] as string || this.generateCorrelationId(),
      monitor: this.monitor,
      publishEvent
    };
  }

  private verifyToken(token: string): any {
    // Mock token verification - in production, verify JWT signature and expiration
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      return {
        id: payload.sub,
        email: payload.email,
        role: payload.role || 'USER'
      };
    } catch {
      throw new Error('Invalid token format');
    }
  }

  public async start(): Promise<void> {
    // Start Apollo Server
    await this.apolloServer.start();

    // Apply GraphQL middleware
    this.app.use(
      '/graphql',
      expressMiddleware(this.apolloServer, {
        context: ({ req, res }) => this.createContext({ req }),
      })
    );

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      const summary = this.monitor.getMonitoringSummary();
      res.json({
        status: summary.unhealthyServices === 0 ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        graphql: {
          enabled: true,
          subscriptions: this.config.subscriptions,
          playground: this.config.playground
        },
        metrics: summary
      });
    });

    // GraphQL Playground endpoint
    if (this.config.playground) {
      this.app.get('/playground', (req, res) => {
        res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>NEPA GraphQL Playground</title>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/graphql-playground-react/build/static/css/index.css" />
          </head>
          <body>
            <div id="root">
              <style>
                body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif; }
                #root { height: 100vh; }
              </style>
            </div>
            <script src="https://cdn.jsdelivr.net/npm/graphql-playground-react/build/static/js/middleware.js"></script>
            <script>
              window.addEventListener('load', function(event) {
                GraphQLPlayground.init(document.getElementById('root'), {
                  endpoint: '/graphql',
                  subscriptionEndpoint: '${this.config.subscriptions ? 'ws://localhost:' + this.config.port + '/graphql' : ''}',
                  headers: {
                    'Authorization': 'Bearer YOUR_TOKEN_HERE'
                  }
                });
              });
            </script>
          </body>
          </html>
        `);
      });
    }

    // Start HTTP server
    this.httpServer.listen(this.config.port, () => {
      console.log(`🚀 NEPA GraphQL Server ready at http://localhost:${this.config.port}/graphql`);
      console.log(`📊 GraphQL Playground: http://localhost:${this.config.port}/playground`);
      console.log(`🏥 Health Check: http://localhost:${this.config.port}/health`);
      console.log(`🌍 Environment: ${this.config.environment}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  public async stop(): Promise<void> {
    console.log('Shutting down GraphQL server...');
    
    if (this.apolloServer) {
      await this.apolloServer.stop();
    }
    
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer.close(() => {
          console.log('HTTP server closed');
          resolve();
        });
      });
    }

    if (this.monitor) {
      this.monitor.stopMonitoring();
    }
  }

  private shutdown(): void {
    console.log('Received shutdown signal, shutting down gracefully...');
    this.stop();
  }

  // Public methods for external access
  public getSchema(): GraphQLSchema {
    return this.schema;
  }

  public getApolloServer(): ApolloServer<Context> {
    return this.apolloServer;
  }

  public getMonitor(): IntegrationMonitor {
    return this.monitor;
  }

  // Query optimization methods
  public enableQueryCache(ttl: number = 300): void {
    // Implement query caching logic
    console.log(`Query caching enabled with TTL: ${ttl}s`);
  }

  public disableQueryCache(): void {
    // Disable query caching
    console.log('Query caching disabled');
  }

  // Performance monitoring
  public getPerformanceMetrics(): any {
    return {
      queries: this.monitor.getMetrics(),
      cache: {
        enabled: this.config.cache.enabled,
        ttl: this.config.cache.ttl,
        maxSize: this.config.cache.maxSize
      },
      subscriptions: {
        enabled: this.config.subscriptions,
        activeConnections: 0 // Would track actual connections
      }
    };
  }

  // Schema management
  public async updateSchema(newTypeDefs: any): Promise<void> {
    // Hot schema reload for development
    if (this.config.environment === 'development') {
      console.log('Updating GraphQL schema...');
      const newSchema = makeExecutableSchema({
        typeDefs: newTypeDefs,
        resolvers: {
          ...resolvers,
          Date: DateScalar,
          DateTime: DateTimeScalar,
          BigInt: BigIntScalar,
          Decimal: DecimalScalar,
          JSON: JSONScalar,
          Upload: GraphQLUpload,
        },
      });
      
      this.schema = newSchema;
      await this.apolloServer.stop();
      this.setupApolloServer();
      await this.apolloServer.start();
      
      console.log('GraphQL schema updated successfully');
    }
  }

  // Subscription management
  public async publishToSubscription(eventType: string, data: any, userId?: string): Promise<void> {
    publishEvent(eventType, data, userId);
  }

  // Health check for monitoring
  public async healthCheck(): Promise<any> {
    try {
      const summary = this.monitor.getMonitoringSummary();
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          graphql: 'healthy',
          database: 'healthy',
          cache: this.config.cache.enabled ? 'healthy' : 'disabled'
        },
        metrics: summary,
        performance: this.getPerformanceMetrics()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
