#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-postgres}"
PG_PASSWORD="${PG_PASSWORD:-password}"

export DATABASE_URL="${DATABASE_URL:-postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/nepa_test}"
export PG_HOST PG_PORT PG_USER PG_PASSWORD

export USER_DB_HOST="$PG_HOST"
export USER_DB_PORT="$PG_PORT"
export USER_DB_NAME="nepa_user_service"
export USER_DB_USER="$PG_USER"
export USER_DB_PASSWORD="$PG_PASSWORD"

export BILLING_DB_HOST="$PG_HOST"
export BILLING_DB_PORT="$PG_PORT"
export BILLING_DB_NAME="nepa_billing_service"
export BILLING_DB_USER="$PG_USER"
export BILLING_DB_PASSWORD="$PG_PASSWORD"

export PAYMENT_DB_HOST="$PG_HOST"
export PAYMENT_DB_PORT="$PG_PORT"
export PAYMENT_DB_NAME="nepa_payment_service"
export PAYMENT_DB_USER="$PG_USER"
export PAYMENT_DB_PASSWORD="$PG_PASSWORD"

export AUDIT_DB_HOST="$PG_HOST"
export AUDIT_DB_PORT="$PG_PORT"
export AUDIT_DB_NAME="nepa_audit_service"
export AUDIT_DB_USER="$PG_USER"
export AUDIT_DB_PASSWORD="$PG_PASSWORD"

export NOTIFICATION_DB_HOST="$PG_HOST"
export NOTIFICATION_DB_PORT="$PG_PORT"
export NOTIFICATION_DB_NAME="nepa_notification_service"
export NOTIFICATION_DB_USER="$PG_USER"
export NOTIFICATION_DB_PASSWORD="$PG_PASSWORD"

export DOCUMENT_DB_HOST="$PG_HOST"
export DOCUMENT_DB_PORT="$PG_PORT"
export DOCUMENT_DB_NAME="nepa_document_service"
export DOCUMENT_DB_USER="$PG_USER"
export DOCUMENT_DB_PASSWORD="$PG_PASSWORD"

export ANALYTICS_DB_HOST="$PG_HOST"
export ANALYTICS_DB_PORT="$PG_PORT"
export ANALYTICS_DB_NAME="nepa_analytics_service"
export ANALYTICS_DB_USER="$PG_USER"
export ANALYTICS_DB_PASSWORD="$PG_PASSWORD"

export WEBHOOK_DB_HOST="$PG_HOST"
export WEBHOOK_DB_PORT="$PG_PORT"
export WEBHOOK_DB_NAME="nepa_webhook_service"
export WEBHOOK_DB_USER="$PG_USER"
export WEBHOOK_DB_PASSWORD="$PG_PASSWORD"

echo "🗄️  Setting up CI migration test databases..."
node scripts/ci-setup-test-databases.js

echo "📦 Running Prisma migrate deploy..."
npx prisma migrate deploy --schema=./prisma/schema.prisma

echo "📦 Generating Prisma client..."
npx prisma generate --schema=./prisma/schema.prisma

echo "📦 Running SQL service migrations..."
node migrations/migration_runner.js up

echo "🔍 Verifying migrated schemas..."
node scripts/verify-migration-schema.js

echo "↩️  Testing SQL migration rollback (user_service)..."
node migrations/migration_runner.js rollback 001_create_user_service_tables.sql

echo "🔍 Verifying user_service tables were removed..."
node - <<'NODE'
const { Pool } = require('pg');

async function verifyRollback() {
  const pool = new Pool({
    host: process.env.PG_HOST,
    port: Number(process.env.PG_PORT),
    database: process.env.USER_DB_NAME,
    user: process.env.USER_DB_USER,
    password: process.env.USER_DB_PASSWORD,
  });

  const result = await pool.query(`
    SELECT COUNT(*)::int AS count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('users', 'user_profiles', 'user_sessions', 'user_roles')
  `);

  await pool.end();

  if (result.rows[0].count !== 0) {
    throw new Error('Rollback did not remove expected user_service tables');
  }

  console.log('✅ Rollback removed expected user_service tables');
}

verifyRollback().catch((error) => {
  console.error(`❌ Rollback verification failed: ${error.message}`);
  process.exit(1);
});
NODE

echo "📦 Re-applying rolled-back migration..."
node migrations/migration_runner.js up

echo "🔍 Final schema verification..."
node scripts/verify-migration-schema.js

echo "🧪 Running migration smoke tests..."
npm run test:migrations:smoke

echo "✅ Migration CI checks completed successfully"
