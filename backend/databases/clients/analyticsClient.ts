import { PrismaClient as AnalyticsPrismaClient } from '../../node_modules/.prisma/analytics-client';
import { buildOptimizedDatabaseUrl } from './urlOptimizer';

const analyticsClient = new AnalyticsPrismaClient({
  datasources: {
    db: {
      url: buildOptimizedDatabaseUrl(process.env.ANALYTICS_SERVICE_DATABASE_URL || ''),
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Graceful shutdown
process.on('beforeExit', async () => {
  await analyticsClient.$disconnect();
});

export default analyticsClient;
