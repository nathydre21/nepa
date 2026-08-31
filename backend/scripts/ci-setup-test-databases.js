#!/usr/bin/env node

/**
 * Creates isolated PostgreSQL databases for migration CI testing.
 */

const { Pool } = require('pg');

const DEFAULTS = {
  host: process.env.PG_HOST || 'localhost',
  port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'password',
};

const DATABASES = [
  'nepa_test',
  'nepa_user_service',
  'nepa_billing_service',
  'nepa_payment_service',
  'nepa_audit_service',
  'nepa_notification_service',
  'nepa_document_service',
  'nepa_analytics_service',
  'nepa_webhook_service',
];

async function createDatabase(adminPool, databaseName) {
  const exists = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [
    databaseName,
  ]);

  if (exists.rowCount > 0) {
    console.log(`ℹ️  Database ${databaseName} already exists`);
    return;
  }

  await adminPool.query(`CREATE DATABASE "${databaseName}"`);
  console.log(`✅ Created database ${databaseName}`);
}

async function setupDatabases() {
  const adminPool = new Pool({
    host: DEFAULTS.host,
    port: DEFAULTS.port,
    user: DEFAULTS.user,
    password: DEFAULTS.password,
    database: 'postgres',
  });

  try {
    for (const databaseName of DATABASES) {
      await createDatabase(adminPool, databaseName);
    }
  } finally {
    await adminPool.end();
  }
}

if (require.main === module) {
  setupDatabases()
    .then(() => {
      console.log('✅ CI test databases are ready');
    })
    .catch((error) => {
      console.error(`❌ Failed to create CI databases: ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  DATABASES,
  setupDatabases,
};
