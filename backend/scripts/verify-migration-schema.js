#!/usr/bin/env node

/**
 * Verifies database schema after migrations in CI.
 * Checks Prisma-managed tables and SQL migration service tables.
 */

const { Pool } = require('pg');

const PRISMA_TABLES = [
  'users',
  'user_sessions',
  'utility_providers',
  'bills',
  'payments',
  '_prisma_migrations',
];

const SERVICE_TABLES = {
  user_service: ['users', 'user_profiles', 'user_sessions', 'user_roles', 'migrations'],
  billing_service: ['bills', 'payments', 'payment_attempts', 'billing_subscriptions', 'migrations'],
  payment_service: ['payment_transactions', 'payment_methods', 'payment_webhooks', 'refunds', 'migrations'],
  audit_service: ['audit_logs', 'audit_trails', 'compliance_reports', 'audit_retention_policies', 'migrations'],
  notification_service: [
    'notifications',
    'notification_templates',
    'notification_preferences',
    'notification_delivery_logs',
    'migrations',
  ],
  document_service: [
    'documents',
    'document_versions',
    'document_permissions',
    'document_access_logs',
    'document_shares',
    'migrations',
  ],
  analytics_service: [
    'analytics_events',
    'user_metrics',
    'system_metrics',
    'reports',
    'funnels',
    'funnel_analytics',
    'migrations',
  ],
  webhook_service: [
    'webhooks',
    'webhook_deliveries',
    'webhook_logs',
    'webhook_signatures',
    'webhook_statistics',
    'migrations',
  ],
};

const DEFAULTS = {
  host: process.env.PG_HOST || 'localhost',
  port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'password',
};

const SERVICE_ENV_PREFIX = {
  user_service: 'USER',
  billing_service: 'BILLING',
  payment_service: 'PAYMENT',
  audit_service: 'AUDIT',
  notification_service: 'NOTIFICATION',
  document_service: 'DOCUMENT',
  analytics_service: 'ANALYTICS',
  webhook_service: 'WEBHOOK',
};

function getServiceDatabaseConfig(serviceName) {
  const prefix = SERVICE_ENV_PREFIX[serviceName];
  if (!prefix) {
    throw new Error(`Unknown service: ${serviceName}`);
  }

  return {
    host: process.env[`${prefix}_DB_HOST`] || DEFAULTS.host,
    port: Number(process.env[`${prefix}_DB_PORT`] || DEFAULTS.port),
    database: process.env[`${prefix}_DB_NAME`] || `nepa_${serviceName}`,
    user: process.env[`${prefix}_DB_USER`] || DEFAULTS.user,
    password: process.env[`${prefix}_DB_PASSWORD`] || DEFAULTS.password,
  };
}

async function tableExists(pool, tableName) {
  const result = await pool.query(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    ) AS exists`,
    [tableName]
  );

  return Boolean(result.rows[0]?.exists);
}

async function verifyPrismaSchema(databaseUrl) {
  const pool = new Pool({ connectionString: databaseUrl });
  const missing = [];

  try {
    for (const tableName of PRISMA_TABLES) {
      const exists = await tableExists(pool, tableName);
      if (!exists) {
        missing.push(tableName);
      }
    }

    const migrationCount = await pool.query('SELECT COUNT(*)::int AS count FROM _prisma_migrations');
    if ((migrationCount.rows[0]?.count || 0) === 0) {
      throw new Error('No Prisma migrations recorded in _prisma_migrations');
    }

    return { missing, migrationCount: migrationCount.rows[0].count };
  } finally {
    await pool.end();
  }
}

async function verifyServiceSchema(serviceName, requiredTables) {
  const config = getServiceDatabaseConfig(serviceName);
  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
  });

  const missing = [];

  try {
    for (const tableName of requiredTables) {
      const exists = await tableExists(pool, tableName);
      if (!exists) {
        missing.push(tableName);
      }
    }

    return { serviceName, missing };
  } finally {
    await pool.end();
  }
}

async function verifyAll() {
  const databaseUrl =
    process.env.DATABASE_URL ||
    `postgresql://${DEFAULTS.user}:${DEFAULTS.password}@${DEFAULTS.host}:${DEFAULTS.port}/nepa_test`;

  console.log('🔍 Verifying Prisma schema...');
  const prismaResult = await verifyPrismaSchema(databaseUrl);

  if (prismaResult.missing.length > 0) {
    throw new Error(`Missing Prisma tables: ${prismaResult.missing.join(', ')}`);
  }

  console.log(`✅ Prisma schema verified (${prismaResult.migrationCount} migrations applied)`);

  console.log('🔍 Verifying SQL service schemas...');
  const serviceResults = [];

  for (const [serviceName, requiredTables] of Object.entries(SERVICE_TABLES)) {
    const result = await verifyServiceSchema(serviceName, requiredTables);
    serviceResults.push(result);

    if (result.missing.length > 0) {
      throw new Error(
        `Missing tables for ${serviceName}: ${result.missing.join(', ')}`
      );
    }

    console.log(`✅ ${serviceName} schema verified`);
  }

  return {
    prismaMigrationCount: prismaResult.migrationCount,
    servicesVerified: serviceResults.length,
  };
}

if (require.main === module) {
  verifyAll()
    .then((summary) => {
      console.log('✅ Schema verification completed');
      console.log(JSON.stringify(summary));
    })
    .catch((error) => {
      console.error(`❌ Schema verification failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  PRISMA_TABLES,
  SERVICE_TABLES,
  verifyAll,
  verifyPrismaSchema,
  verifyServiceSchema,
  getServiceDatabaseConfig,
  tableExists,
};
