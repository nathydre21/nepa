const {
  PRISMA_TABLES,
  SERVICE_TABLES,
  getServiceDatabaseConfig,
} = require('../../scripts/verify-migration-schema.js');

describe('verify-migration-schema helpers', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('defines expected Prisma tables including migration history', () => {
    expect(PRISMA_TABLES).toContain('users');
    expect(PRISMA_TABLES).toContain('_prisma_migrations');
    expect(PRISMA_TABLES.length).toBeGreaterThan(0);
  });

  it('defines required tables for every service database', () => {
    expect(Object.keys(SERVICE_TABLES)).toEqual([
      'user_service',
      'billing_service',
      'payment_service',
      'audit_service',
      'notification_service',
      'document_service',
      'analytics_service',
      'webhook_service',
    ]);

    for (const tables of Object.values(SERVICE_TABLES)) {
      expect(tables.length).toBeGreaterThan(0);
      expect(tables).toContain('migrations');
    }
  });

  it('reads service database config from env prefixes', () => {
    process.env.USER_DB_HOST = 'db.example.com';
    process.env.USER_DB_PORT = '5433';
    process.env.USER_DB_NAME = 'custom_user_db';
    process.env.USER_DB_USER = 'ci_user';
    process.env.USER_DB_PASSWORD = 'ci_password';

    expect(getServiceDatabaseConfig('user_service')).toEqual({
      host: 'db.example.com',
      port: 5433,
      database: 'custom_user_db',
      user: 'ci_user',
      password: 'ci_password',
    });
  });

  it('falls back to defaults when env vars are missing', () => {
    delete process.env.WEBHOOK_DB_HOST;
    delete process.env.WEBHOOK_DB_PORT;
    delete process.env.WEBHOOK_DB_NAME;
    delete process.env.WEBHOOK_DB_USER;
    delete process.env.WEBHOOK_DB_PASSWORD;

    expect(getServiceDatabaseConfig('webhook_service')).toEqual({
      host: 'localhost',
      port: 5432,
      database: 'nepa_webhook_service',
      user: 'postgres',
      password: 'password',
    });
  });

  it('throws for unknown services', () => {
    expect(() => getServiceDatabaseConfig('unknown_service')).toThrow(
      'Unknown service: unknown_service'
    );
  });
});
