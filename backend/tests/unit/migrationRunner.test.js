const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  resolveRollbackPath,
  parseServiceMigrationFile,
  listServiceMigrationFiles,
} = require('../../migrations/migration_runner');

describe('migration_runner helpers', () => {
  const migrationsPath = path.join(__dirname, '../../migrations');

  it('parses service migration filenames', () => {
    expect(parseServiceMigrationFile('001_create_user_service_tables.sql')).toEqual({
      order: '001',
      serviceName: 'user_service',
    });
  });

  it('returns null for unsupported migration filenames', () => {
    expect(parseServiceMigrationFile('add_rbac_system.sql')).toBeNull();
    expect(parseServiceMigrationFile('')).toBeNull();
  });

  it('lists only numbered service migration files in order', () => {
    const files = listServiceMigrationFiles(migrationsPath);

    expect(files.length).toBeGreaterThan(0);
    expect(files[0]).toBe('001_create_user_service_tables.sql');
    expect(files).not.toContain('add_rbac_system.sql');
  });

  it('resolves legacy rollback script naming', () => {
    const rollbackPath = resolveRollbackPath(
      migrationsPath,
      '001_create_user_service_tables.sql',
      'user_service'
    );

    expect(rollbackPath).toBe(
      path.join(migrationsPath, 'rollback', '001_rollback_user_service.sql')
    );
    expect(fs.existsSync(rollbackPath)).toBe(true);
  });

  it('returns null when rollback script does not exist', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-runner-'));
    const rollbackPath = resolveRollbackPath(
      tempDir,
      '001_create_user_service_tables.sql',
      'user_service'
    );

    expect(rollbackPath).toBeNull();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('handles empty migration directories safely', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-runner-empty-'));
    expect(listServiceMigrationFiles(tempDir)).toEqual([]);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
