// Prisma Client singleton instance
let prisma: any;

try {
  const { PrismaClient } = require('@prisma/client');
  
  if (process.env.NODE_ENV === 'production') {
    prisma = new PrismaClient();
  } else {
    if (!(global as any).prisma) {
      (global as any).prisma = new PrismaClient();
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
