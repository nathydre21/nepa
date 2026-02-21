# Database Backup and Recovery Procedures

This document outlines the procedures for backing up and restoring the PostgreSQL database used in the Nepa application.

## Prerequisites

- PostgreSQL client tools installed (specifically `pg_dump` and `pg_restore`).
- Access to the database credentials (connection string).

## Backup Procedure

To create a backup of the database, use the `pg_dump` utility. This command creates a file containing the SQL commands required to reconstruct the database.

### Command

```bash
# Syntax
pg_dump "postgres://username:password@host:port/database_name" > backup_filename.sql

# Example
pg_dump "postgresql://postgres:password@localhost:5432/nepa_db" > nepa_backup_$(date +%Y%m%d).sql
```

## Recovery Procedure

To restore the database from a backup file, use the `psql` utility.

### Warning
Restoring a database may overwrite existing data. Ensure you are restoring to the correct environment.

### Command

```bash
# Syntax
psql "postgres://username:password@host:port/database_name" < backup_filename.sql

# Example
psql "postgresql://postgres:password@localhost:5432/nepa_db" < nepa_backup_20231027.sql
```