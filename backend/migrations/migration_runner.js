#!/usr/bin/env node

/**
 * Migration Runner for NEPA Backend Services
 * Supports running migrations for all 8 databases with rollback capabilities
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database configurations for all 8 services
const DATABASES = {
  user_service: {
    host: process.env.USER_DB_HOST || 'localhost',
    port: process.env.USER_DB_PORT || 5432,
    database: process.env.USER_DB_NAME || 'nepa_user_service',
    username: process.env.USER_DB_USER || 'postgres',
    password: process.env.USER_DB_PASSWORD || 'password'
  },
  billing_service: {
    host: process.env.BILLING_DB_HOST || 'localhost',
    port: process.env.BILLING_DB_PORT || 5432,
    database: process.env.BILLING_DB_NAME || 'nepa_billing_service',
    username: process.env.BILLING_DB_USER || 'postgres',
    password: process.env.BILLING_DB_PASSWORD || 'password'
  },
  payment_service: {
    host: process.env.PAYMENT_DB_HOST || 'localhost',
    port: process.env.PAYMENT_DB_PORT || 5432,
    database: process.env.PAYMENT_DB_NAME || 'nepa_payment_service',
    username: process.env.PAYMENT_DB_USER || 'postgres',
    password: process.env.PAYMENT_DB_PASSWORD || 'password'
  },
  audit_service: {
    host: process.env.AUDIT_DB_HOST || 'localhost',
    port: process.env.AUDIT_DB_PORT || 5432,
    database: process.env.AUDIT_DB_NAME || 'nepa_audit_service',
    username: process.env.AUDIT_DB_USER || 'postgres',
    password: process.env.AUDIT_DB_PASSWORD || 'password'
  },
  notification_service: {
    host: process.env.NOTIFICATION_DB_HOST || 'localhost',
    port: process.env.NOTIFICATION_DB_PORT || 5432,
    database: process.env.NOTIFICATION_DB_NAME || 'nepa_notification_service',
    username: process.env.NOTIFICATION_DB_USER || 'postgres',
    password: process.env.NOTIFICATION_DB_PASSWORD || 'password'
  },
  document_service: {
    host: process.env.DOCUMENT_DB_HOST || 'localhost',
    port: process.env.DOCUMENT_DB_PORT || 5432,
    database: process.env.DOCUMENT_DB_NAME || 'nepa_document_service',
    username: process.env.DOCUMENT_DB_USER || 'postgres',
    password: process.env.DOCUMENT_DB_PASSWORD || 'password'
  },
  analytics_service: {
    host: process.env.ANALYTICS_DB_HOST || 'localhost',
    port: process.env.ANALYTICS_DB_PORT || 5432,
    database: process.env.ANALYTICS_DB_NAME || 'nepa_analytics_service',
    username: process.env.ANALYTICS_DB_USER || 'postgres',
    password: process.env.ANALYTICS_DB_PASSWORD || 'password'
  },
  webhook_service: {
    host: process.env.WEBHOOK_DB_HOST || 'localhost',
    port: process.env.WEBHOOK_DB_PORT || 5432,
    database: process.env.WEBHOOK_DB_NAME || 'nepa_webhook_service',
    username: process.env.WEBHOOK_DB_USER || 'postgres',
    password: process.env.WEBHOOK_DB_PASSWORD || 'password'
  }
};

function resolveRollbackPath(migrationsPath, migrationFile, serviceName) {
  const candidates = [
    path.join(migrationsPath, 'rollback', migrationFile.replace('.sql', '_rollback.sql')),
    path.join(migrationsPath, 'rollback', migrationFile.replace('_create_', '_rollback_')),
  ];

  if (serviceName) {
    const match = migrationFile.match(/(\d+)_create_(\w+)_tables\.sql/);
    if (match) {
      candidates.push(
        path.join(migrationsPath, 'rollback', `${match[1]}_rollback_${match[2]}.sql`)
      );
    }
  }

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function parseServiceMigrationFile(migrationFile) {
  const serviceMatch = migrationFile.match(/(\d+)_create_(\w+)_tables\.sql/);
  if (!serviceMatch) {
    return null;
  }

  return {
    order: serviceMatch[1],
    serviceName: serviceMatch[2],
  };
}

function listServiceMigrationFiles(migrationsPath) {
  return fs.readdirSync(migrationsPath)
    .filter((file) => file.endsWith('.sql') && !file.includes('rollback'))
    .filter((file) => parseServiceMigrationFile(file))
    .sort();
}

class MigrationRunner {
  constructor() {
    this.migrationsPath = path.join(__dirname);
  }

  async createPool(config) {
    return new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  async runMigration(serviceName, migrationFile) {
    const config = DATABASES[serviceName];
    if (!config) {
      throw new Error(`Unknown service: ${serviceName}`);
    }

    const pool = await this.createPool(config);
    const client = await pool.connect();

    try {
      console.log(`Running migration ${migrationFile} for ${serviceName}...`);
      
      // Create migrations table if it doesn't exist
      await client.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          filename VARCHAR(255) UNIQUE NOT NULL,
          executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Check if migration already executed
      const result = await client.query(
        'SELECT filename FROM migrations WHERE filename = $1',
        [migrationFile]
      );

      if (result.rows.length > 0) {
        console.log(`Migration ${migrationFile} already executed for ${serviceName}`);
        return;
      }

      // Read and execute migration
      const migrationPath = path.join(this.migrationsPath, migrationFile);
      const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
      
      await client.query('BEGIN');
      await client.query(migrationSQL);
      await client.query(
        'INSERT INTO migrations (filename) VALUES ($1)',
        [migrationFile]
      );
      await client.query('COMMIT');

      console.log(`✅ Migration ${migrationFile} completed for ${serviceName}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`❌ Migration ${migrationFile} failed for ${serviceName}:`, error.message);
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  }

  async rollbackMigration(serviceName, migrationFile) {
    const config = DATABASES[serviceName];
    if (!config) {
      throw new Error(`Unknown service: ${serviceName}`);
    }

    const pool = await this.createPool(config);
    const client = await pool.connect();

    try {
      console.log(`Rolling back migration ${migrationFile} for ${serviceName}...`);
      
      const rollbackPath = resolveRollbackPath(this.migrationsPath, migrationFile, serviceName);

      if (!rollbackPath) {
        throw new Error(`Rollback file not found for migration: ${migrationFile}`);
      }

      const rollbackSQL = fs.readFileSync(rollbackPath, 'utf8');
      
      await client.query('BEGIN');
      await client.query(rollbackSQL);
      await client.query(
        'DELETE FROM migrations WHERE filename = $1',
        [migrationFile]
      );
      await client.query('COMMIT');

      console.log(`✅ Rollback ${migrationFile} completed for ${serviceName}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`❌ Rollback ${migrationFile} failed for ${serviceName}:`, error.message);
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  }

  async runAllMigrations() {
    const migrationFiles = listServiceMigrationFiles(this.migrationsPath);

    console.log('🚀 Starting database migrations for all services...');

    for (const migrationFile of migrationFiles) {
      const parsed = parseServiceMigrationFile(migrationFile);
      if (!parsed) {
        continue;
      }

      try {
        await this.runMigration(parsed.serviceName, migrationFile);
      } catch (error) {
        console.error(`Migration failed for ${parsed.serviceName}, stopping execution`);
        process.exit(1);
      }
    }

    console.log('✅ All migrations completed successfully!');
  }

  async rollbackMigrationFile(migrationFile) {
    const parsed = parseServiceMigrationFile(migrationFile);
    if (!parsed) {
      throw new Error(`Unsupported migration file: ${migrationFile}`);
    }

    await this.rollbackMigration(parsed.serviceName, migrationFile);
    console.log(`✅ Rollback ${migrationFile} completed successfully!`);
  }

  async rollbackLastMigration() {
    const migrationFiles = listServiceMigrationFiles(this.migrationsPath)
      .slice()
      .reverse();

    if (migrationFiles.length === 0) {
      console.log('No migrations to rollback');
      return;
    }

    for (const migrationFile of migrationFiles) {
      const parsed = parseServiceMigrationFile(migrationFile);
      const rollbackPath = resolveRollbackPath(this.migrationsPath, migrationFile, parsed?.serviceName);

      if (!rollbackPath) {
        continue;
      }

      try {
        await this.rollbackMigration(parsed.serviceName, migrationFile);
        console.log('✅ Last rollback-capable migration rolled back successfully!');
        return;
      } catch (error) {
        console.error('Rollback failed:', error.message);
        process.exit(1);
      }
    }

    console.log('No rollback scripts available for configured migrations');
  }

  listRollbackableMigrations() {
    return listServiceMigrationFiles(this.migrationsPath).filter((migrationFile) => {
      const parsed = parseServiceMigrationFile(migrationFile);
      return Boolean(resolveRollbackPath(this.migrationsPath, migrationFile, parsed?.serviceName));
    });
  }

  async getMigrationStatus() {
    console.log('📊 Migration Status for All Services:\n');

    for (const [serviceName, config] of Object.entries(DATABASES)) {
      const pool = await this.createPool(config);
      const client = await pool.connect();

      try {
        const result = await client.query(`
          SELECT filename, executed_at 
          FROM migrations 
          ORDER BY executed_at DESC
        `);

        console.log(`${serviceName.toUpperCase()}:`);
        if (result.rows.length === 0) {
          console.log('  No migrations executed');
        } else {
          result.rows.forEach(row => {
            console.log(`  ✅ ${row.filename} (${row.executed_at})`);
          });
        }
        console.log('');
      } catch (error) {
        console.log(`  ❌ Error checking status: ${error.message}`);
      } finally {
        client.release();
        await pool.end();
      }
    }
  }
}

// CLI interface
async function main() {
  const command = process.argv[2];
  const runner = new MigrationRunner();

  switch (command) {
    case 'up':
      await runner.runAllMigrations();
      break;
    case 'down':
      await runner.rollbackLastMigration();
      break;
    case 'rollback':
      if (!process.argv[3]) {
        console.error('❌ Missing migration file argument');
        process.exit(1);
      }
      await runner.rollbackMigrationFile(process.argv[3]);
      break;
    case 'status':
      await runner.getMigrationStatus();
      break;
    default:
      console.log(`
Usage: node migration_runner.js <command> [args]

Commands:
  up                          - Run all pending migrations
  down                        - Rollback the last migration with a rollback script
  rollback <migration-file>   - Rollback a specific migration file
  status                      - Show migration status for all services

Environment Variables:
  Set database connection details for each service:
  - *_DB_HOST
  - *_DB_PORT  
  - *_DB_NAME
  - *_DB_USER
  - *_DB_PASSWORD

  Where * is one of: USER, BILLING, PAYMENT, AUDIT, NOTIFICATION, DOCUMENT, ANALYTICS, WEBHOOK
      `);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  MigrationRunner,
  resolveRollbackPath,
  parseServiceMigrationFile,
  listServiceMigrationFiles,
};
