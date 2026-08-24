import { PrismaClient as WebhookPrismaClient } from '../../node_modules/.prisma/webhook-client';
import { buildOptimizedDatabaseUrl } from './urlOptimizer';

const webhookClient = new WebhookPrismaClient({
  datasources: {
    db: {
      url: buildOptimizedDatabaseUrl(process.env.WEBHOOK_SERVICE_DATABASE_URL || ''),
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Graceful shutdown
process.on('beforeExit', async () => {
  await webhookClient.$disconnect();
});

export default webhookClient;
