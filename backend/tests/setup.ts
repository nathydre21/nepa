import '@testing-library/jest-dom';
import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient;
let dbAvailable = false;

beforeAll(async () => {
  try {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/nepa_test'
        }
      }
    });
    await prisma.$connect();
    dbAvailable = true;
  } catch {
    // No database available - unit tests will still run
    dbAvailable = false;
  }
});

afterAll(async () => {
  if (dbAvailable && prisma) {
    await prisma.$disconnect();
  }
});

beforeEach(async () => {
  if (!dbAvailable || !prisma) return;
  try {
    const tablenames = await prisma.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname='public'`;
    for (const { tablename } of tablenames) {
      if (tablename !== '_prisma_migrations') {
        try {
          await prisma.$executeRawUnsafe(`TRUNCATE TABLE "public"."${tablename}" CASCADE;`);
        } catch {
          // ignore truncation errors
        }
      }
    }
  } catch {
    // ignore
  }
});

// Mock i18n for tests
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      changeLanguage: jest.fn(),
      language: 'en',
    },
  }),
}));

export { prisma };
