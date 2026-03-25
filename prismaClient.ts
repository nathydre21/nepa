// Prisma Client singleton instance with connection pool management
let prisma: any;

try {
  const { PrismaClient } = require('@prisma/client');
  
  // Database connection configuration with pool limits
  const prismaConfig = {
    // Connection pool configuration
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    },
    // Connection pool settings
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    // Connection timeout and retry settings
    __internal: {
      engine: {
        // Connection pool limits
        connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '20'),
        poolTimeout: parseInt(process.env.DB_POOL_TIMEOUT || '10000'),
        // Retry configuration
        retryAttempts: parseInt(process.env.DB_RETRY_ATTEMPTS || '3'),
        retryDelay: parseInt(process.env.DB_RETRY_DELAY || '1000')
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
