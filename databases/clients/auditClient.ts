import { logger } from '../../services/logger';

// Define a comprehensive client interface
interface AuditPrismaClient {
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  $queryRaw: any;
  $executeRaw: any;
  $transaction: any;
  $on?: (event: string, callback: (e: any) => void) => void;
  auditLog: {
    create: (data: any) => Promise<any>;
    findMany: (options?: any) => Promise<any[]>;
    findUnique: (options: any) => Promise<any>;
    count: (options?: any) => Promise<number>;
    update: (options: any) => Promise<any>;
    updateMany: (options: any) => Promise<{ count: number }>;
    delete: (options: any) => Promise<any>;
    deleteMany: (options?: any) => Promise<{ count: number }>;
  };
  auditEvent: {
    create: (data: any) => Promise<any>;
    findMany: (options?: any) => Promise<any[]>;
    count: (options?: any) => Promise<number>;
  };
  complianceReport: {
    create: (data: any) => Promise<any>;
    findMany: (options?: any) => Promise<any[]>;
  };
  auditRetentionPolicy: {
    findMany: (options?: any) => Promise<any[]>;
    upsert: (options: any) => Promise<any>;
  };
}

class AuditClient {
  private client: AuditPrismaClient | null = null;
  private isConnected = false;
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    // Initialize client lazily to avoid import errors
    this.initializationPromise = this.initializeClient();
  }

  private async initializeClient() {
    try {
      // Try multiple approaches to get a Prisma client
      let PrismaClientClass: any = null;
      
      // Approach 1: Try the generated audit client
      try {
        const auditModule = await this.tryImport('../../node_modules/.prisma/audit-client');
        if (auditModule?.PrismaClient) {
          PrismaClientClass = auditModule.PrismaClient;
          logger.debug('Using generated audit Prisma client');
        }
      } catch (error) {
        logger.debug('Generated audit client not available');
      }
      
      // Approach 2: Try the main Prisma client as fallback
      if (!PrismaClientClass) {
        try {
          const mainModule = await this.tryImport('@prisma/client');
          if (mainModule?.PrismaClient) {
            PrismaClientClass = mainModule.PrismaClient;
            logger.debug('Using main Prisma client as fallback');
          }
        } catch (error) {
          logger.debug('Main Prisma client not available');
        }
      }
      
      if (PrismaClientClass) {
        this.client = new PrismaClientClass({
          datasources: {
            db: {
              url: process.env.AUDIT_DATABASE_URL || 'postgresql://postgres:password@localhost:5440/nepa_audit'
            }
          },
          log: [
            { level: 'error', emit: 'event' },
            { level: 'warn', emit: 'event' }
          ]
        });

        // Setup logging if available
        const client = this.client;
        if (client?.$on) {
          client.$on('error', (e: any) => {
            logger.error('Audit database error:', { error: e });
          });

          client.$on('warn', (e: any) => {
            logger.warn('Audit database warning:', { warning: e });
          });
        }

        logger.info('Audit Prisma client initialized successfully');
      } else {
        throw new Error('No Prisma client available');
      }
    } catch (error) {
      logger.warn('Audit Prisma client not available. Using mock client. Run "npm run audit:generate" to enable full functionality.');
      this.client = this.createMockClient();
    }
  }

  private async tryImport(modulePath: string): Promise<any> {
    try {
      return await import(modulePath);
    } catch (error) {
      return null;
    }
  }

  private createMockClient(): AuditPrismaClient {
    const mockMethod = () => Promise.resolve();
    return {
      $connect: mockMethod,
      $disconnect: mockMethod,
      $queryRaw: mockMethod,
      $executeRaw: mockMethod,
      $transaction: mockMethod,
      auditLog: {
        create: mockMethod,
        findMany: () => Promise.resolve([]),
        findUnique: () => Promise.resolve(null),
        count: () => Promise.resolve(0),
        update: mockMethod,
        updateMany: () => Promise.resolve({ count: 0 }),
        delete: mockMethod,
        deleteMany: () => Promise.resolve({ count: 0 })
      },
      auditEvent: {
        create: mockMethod,
        findMany: () => Promise.resolve([]),
        count: () => Promise.resolve(0)
      },
      complianceReport: {
        create: mockMethod,
        findMany: () => Promise.resolve([])
      },
      auditRetentionPolicy: {
        findMany: () => Promise.resolve([]),
        upsert: mockMethod
      }
    };
  }

  async connect(): Promise<void> {
    // Wait for initialization to complete
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
    
    if (this.isConnected || !this.client) return;

    try {
      await this.client.$connect();
      this.isConnected = true;
      logger.info('Connected to audit database');
    } catch (error) {
      logger.error('Failed to connect to audit database:', {
        error: error instanceof Error ? error : new Error(String(error))
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected || !this.client) return;

    try {
      await this.client.$disconnect();
      this.isConnected = false;
      logger.info('Disconnected from audit database');
    } catch (error) {
      logger.error('Error disconnecting from audit database:', {
        error: error instanceof Error ? error : new Error(String(error))
      });
    }
  }

  async healthCheck(): Promise<boolean> {
    // Wait for initialization to complete
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
    
    if (!this.client) return false;
    
    try {
      await this.client.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      logger.error('Audit database health check failed:', {
        error: error instanceof Error ? error : new Error(String(error))
      });
      return false;
    }
  }

  async ensureInitialized(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  get auditLog() {
    return this.client?.auditLog;
  }

  get auditEvent() {
    return this.client?.auditEvent;
  }

  get complianceReport() {
    return this.client?.complianceReport;
  }

  get auditRetentionPolicy() {
    return this.client?.auditRetentionPolicy;
  }

  // Raw query access for complex operations
  get $queryRaw() {
    return this.client?.$queryRaw?.bind(this.client);
  }

  get $executeRaw() {
    return this.client?.$executeRaw?.bind(this.client);
  }

  // Transaction support
  get $transaction() {
    return this.client?.$transaction?.bind(this.client);
  }
}

const auditClient = new AuditClient();

// Auto-connect on import
auditClient.connect().catch((error) => {
  logger.error('Failed to auto-connect audit client:', error);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await auditClient.disconnect();
});

process.on('SIGTERM', async () => {
  await auditClient.disconnect();
});

export default auditClient;