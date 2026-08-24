import { PrismaClient as UtilityPrismaClient } from '../../node_modules/.prisma/utility-client';
import { buildOptimizedDatabaseUrl } from './urlOptimizer';

const utilityClient = new UtilityPrismaClient({
  datasources: {
    db: {
      url: buildOptimizedDatabaseUrl(process.env.UTILITY_SERVICE_DATABASE_URL || ''),
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Graceful shutdown
process.on('beforeExit', async () => {
  await utilityClient.$disconnect();
});

export default utilityClient;
