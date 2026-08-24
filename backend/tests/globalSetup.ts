import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/nepa_test' } }
});

export default async function globalSetup() {
  try {
    await prisma.$connect();
    console.log('Test database connected');
  } catch {
    console.warn('No database available - integration tests will be skipped');
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}
