import { PrismaClient as UserPrismaClient } from '../../node_modules/.prisma/user-client';
import { buildOptimizedDatabaseUrl } from './urlOptimizer';

const userClient = new UserPrismaClient({
  datasources: {
    db: {
      url: buildOptimizedDatabaseUrl(process.env.USER_SERVICE_DATABASE_URL || ''),
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Graceful shutdown
process.on('beforeExit', async () => {
  await userClient.$disconnect();
});

export default userClient;
