import { PrismaClient as NotificationPrismaClient } from '../../node_modules/.prisma/notification-client';
import { buildOptimizedDatabaseUrl } from './urlOptimizer';

const notificationClient = new NotificationPrismaClient({
  datasources: {
    db: {
      url: buildOptimizedDatabaseUrl(process.env.NOTIFICATION_SERVICE_DATABASE_URL || ''),
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Graceful shutdown
process.on('beforeExit', async () => {
  await notificationClient.$disconnect();
});

export default notificationClient;
