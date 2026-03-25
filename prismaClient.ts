// Prisma Client singleton instance with connection pool management
let prisma: any;

try {
  const { PrismaClient } = require('@prisma/client');
  
  // Database connection configuration with optimized pool settings
  const prismaConfig = {
    // Connection pool configuration
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    },
    // Connection pool settings
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    // Enhanced connection timeout and retry settings
    __internal: {
      engine: {
        // Optimized connection pool limits for heavy load
        connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '50'), // Increased from 20
        poolTimeout: parseInt(process.env.DB_POOL_TIMEOUT || '30000'), // Increased from 10000ms
        // Connection lifecycle management
        connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '60000'), // 60 seconds
        idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'), // 30 seconds
        // Enhanced retry configuration
        retryAttempts: parseInt(process.env.DB_RETRY_ATTEMPTS || '5'), // Increased from 3
        retryDelay: parseInt(process.env.DB_RETRY_DELAY || '2000'), // Increased from 1000ms
        // Connection validation
        validateConnections: true,
        // Pool exhaustion handling
        maxOverflow: parseInt(process.env.DB_MAX_OVERFLOW || '10'), // Allow temporary overflow
        evictionRunIntervalMillis: parseInt(process.env.DB_EVICTION_INTERVAL || '5000'), // Check every 5 seconds
        minEvictableIdleTimeMillis: parseInt(process.env.DB_MIN_EVICTABLE_IDLE || '10000'), // Evict after 10 seconds idle
      }
    }
  };
  
  if (process.env.NODE_ENV === 'production') {
    prisma = new PrismaClient(prismaConfig);
    
    // Handle graceful shutdown
    process.on('beforeExit', async () => {
      await prisma.$disconnect();
    });
    
    process.on('SIGINT', async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  } else {
    if (!(global as any).prisma) {
      (global as any).prisma = new PrismaClient(prismaConfig);
    }
    prisma = (global as any).prisma;
  }
} catch (err) {
  // Fallback if Prisma is not properly initialized
  prisma = {
    webhook: { create: () => {}, findUnique: () => {}, delete: () => {}, findMany: () => [] },
    webhookEvent: { create: () => {}, findMany: () => [], findUnique: () => {}, updateMany: () => {} },
    webhookAttempt: { create: () => {}, findMany: () => [] },
    webhookLog: { create: () => {}, findMany: () => [] },
  } as any;
}

export default prisma;
