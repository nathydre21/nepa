/**
 * @jest-environment node
 */

const { Pool } = require('pg');
const {
  PRISMA_TABLES,
  SERVICE_TABLES,
  verifyPrismaSchema,
  verifyServiceSchema,
  getServiceDatabaseConfig,
} = require('../../scripts/verify-migration-schema.js');

const DEFAULTS = {
  host: process.env.PG_HOST || 'localhost',
  port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'password',
};

const databaseUrl =
  process.env.DATABASE_URL ||
  `postgresql://${DEFAULTS.user}:${DEFAULTS.password}@${DEFAULTS.host}:${DEFAULTS.port}/nepa_test`;

const migrationTestsEnabled = process.env.RUN_MIGRATION_TESTS === 'true';

describe('Database migration smoke tests', () => {
  if (!migrationTestsEnabled) {
    it('skips migration smoke tests unless RUN_MIGRATION_TESTS=true', () => {
      expect(true).toBe(true);
    });
    return;
  }

  it('connects to the Prisma test database', async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    const result = await pool.query('SELECT 1 AS ok');
    await pool.end();

    expect(result.rows[0]?.ok).toBe(1);
  });

  it('has applied Prisma migrations', async () => {
    const result = await verifyPrismaSchema(databaseUrl);

    expect(result.missing).toEqual([]);
    expect(result.migrationCount).toBeGreaterThan(0);
  });

  it('contains all Prisma-managed tables', async () => {
    const pool = new Pool({ connectionString: databaseUrl });

    try {
      for (const tableName of PRISMA_TABLES) {
        const result = await pool.query(
          `SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = $1
          ) AS exists`,
          [tableName]
        );

        expect(result.rows[0]?.exists).toBe(true);
      }
    } finally {
      await pool.end();
    }
  });

  it.each(Object.entries(SERVICE_TABLES))(
    'contains required tables for %s',
    async (serviceName, requiredTables) => {
      const result = await verifyServiceSchema(serviceName, requiredTables);
      expect(result.missing).toEqual([]);
    }
  );

  it('records SQL migrations for each service database', async () => {
    for (const serviceName of Object.keys(SERVICE_TABLES)) {
      const config = getServiceDatabaseConfig(serviceName);
      const pool = new Pool({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
      });

      try {
        const result = await pool.query('SELECT COUNT(*)::int AS count FROM migrations');
        expect(result.rows[0]?.count).toBeGreaterThan(0);
      } finally {
        await pool.end();
      }
    }
  });

  it('handles empty migration history boundaries safely', async () => {
    const pool = new Pool({ connectionString: databaseUrl });

    try {
      const result = await pool.query(
        'SELECT COUNT(*)::int AS count FROM _prisma_migrations'
      );
      expect(result.rows[0]?.count).toBeGreaterThanOrEqual(0);
    } finally {
      await pool.end();
    }
  });
});
