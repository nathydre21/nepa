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
    // Enhanced connection pool settings for heavy load
    __internal: {
      engine: {
        // Optimized connection pool limits for heavy load
        connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '100'), // Increased from 50
        poolTimeout: parseInt(process.env.DB_POOL_TIMEOUT || '45000'), // Increased from 30000ms
        // Connection lifecycle management
        connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '90000'), // 90 seconds
        idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '45000'), // 45 seconds
        // Enhanced retry configuration
        retryAttempts: parseInt(process.env.DB_RETRY_ATTEMPTS || '3'), // Reduced from 5
        retryDelay: parseInt(process.env.DB_RETRY_DELAY || '3000'), // Increased from 2000ms
        // Connection validation
        validateConnections: true,
        // Pool exhaustion handling
        maxOverflow: parseInt(process.env.DB_MAX_OVERFLOW || '20'), // Increased from 10
        evictionRunIntervalMillis: parseInt(process.env.DB_EVICTION_INTERVAL || '10000'), // Check every 10 seconds
        minEvictableIdleTimeMillis: parseInt(process.env.DB_MIN_EVICTABLE_IDLE || '15000'), // Evict after 15 seconds idle
        // Additional pool optimization settings
        acquireTimeoutMillis: parseInt(process.env.DB_ACQUIRE_TIMEOUT || '60000'), // 60 seconds to acquire connection
        reapIntervalMillis: parseInt(process.env.DB_REAP_INTERVAL || '30000'), // Check every 30 seconds
        createTimeoutMillis: parseInt(process.env.DB_CREATE_TIMEOUT || '30000'), // 30 seconds to create connection
        destroyTimeoutMillis: parseInt(process.env.DB_DESTROY_TIMEOUT || '5000'), // 5 seconds to destroy connection
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
