import { PrismaClient as PaymentPrismaClient } from '../../node_modules/.prisma/payment-client';
import { buildOptimizedDatabaseUrl } from './urlOptimizer';

const paymentClient = new PaymentPrismaClient({
  datasources: {
    db: {
      url: buildOptimizedDatabaseUrl(process.env.PAYMENT_SERVICE_DATABASE_URL || ''),
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Graceful shutdown
process.on('beforeExit', async () => {
  await paymentClient.$disconnect();
});

export default paymentClient;
