use crate::{
    data_migration::DataMigration, upgrade_proxy::UpgradeProxy, version_manager::VersionManager,
};
use soroban_sdk::{Address, Env, Symbol};

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{symbol_short, testutils::Address as _};

    fn create_test_env() -> Env {
        Env::default()
    }

    fn create_test_admin(env: &Env) -> Address {
        Address::generate(env)
    }

    #[test]
    fn test_upgrade_proxy_initialization() {
        let env = create_test_env();
        let admin = create_test_admin(&env);

        UpgradeProxy::initialize(env.clone(), admin.clone());

        assert_eq!(UpgradeProxy::get_admin(env.clone()), admin);
        assert_eq!(UpgradeProxy::get_version(env.clone()), 1);
    }

    #[test]
    fn test_upgrade_proxy_upgrade() {
        let env = create_test_env();
        let admin = create_test_admin(&env);
        let new_implementation = Address::generate(&env);

        UpgradeProxy::initialize(env.clone(), admin.clone());

        let result =
            UpgradeProxy::upgrade(env.clone(), admin.clone(), new_implementation.clone(), 2);

        assert!(result.is_ok());
        assert_eq!(UpgradeProxy::get_version(env.clone()), 2);
        assert_eq!(
            UpgradeProxy::get_implementation(env.clone()),
            new_implementation
        );
    }

    #[test]
    fn test_upgrade_proxy_unauthorized_upgrade() {
        let env = create_test_env();
        let admin = create_test_admin(&env);
        let unauthorized = Address::generate(&env);
        let new_implementation = Address::generate(&env);

        UpgradeProxy::initialize(env.clone(), admin);

        let result = UpgradeProxy::upgrade(env.clone(), unauthorized, new_implementation, 2);

        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), symbol_short!("UNAUTH"));
    }

    #[test]
    fn test_version_manager_initialization() {
        let env = create_test_env();
        let admin = create_test_admin(&env);

        VersionManager::initialize(env.clone(), admin.clone());

        assert_eq!(VersionManager::get_admin(env.clone()), admin);
    }

    #[test]
    fn test_version_manager_register_version() {
        let env = create_test_env();
        let admin = create_test_admin(&env);
        let implementation = Address::generate(&env);

        VersionManager::initialize(env.clone(), admin.clone());

        let result = VersionManager::register_version(
            env.clone(),
            admin.clone(),
            2,
            implementation.clone(),
            true,
            true,
        );

        assert!(result.is_ok());

        let version_info = VersionManager::get_version_info(env.clone(), 2);
        assert!(version_info.is_some());

        let info = version_info.unwrap();
        assert_eq!(info.version, 2);
        assert_eq!(info.implementation_address, implementation);
        assert!(info.migration_required);
        assert!(info.backward_compatible);
    }

    #[test]
    fn test_version_manager_latest_version() {
        let env = create_test_env();
        let admin = create_test_admin(&env);
        let implementation1 = Address::generate(&env);
        let implementation2 = Address::generate(&env);

        VersionManager::initialize(env.clone(), admin.clone());

        // Register versions
        VersionManager::register_version(
            env.clone(),
            admin.clone(),
            1,
            implementation1.clone(),
            false,
            true,
        )
        .unwrap();

        VersionManager::register_version(
            env.clone(),
            admin.clone(),
            3,
            implementation2.clone(),
            true,
            false,
        )
        .unwrap();

        assert_eq!(VersionManager::get_latest_version(env.clone()), Some(3));
    }

    #[test]
    fn test_version_manager_upgrade_safety() {
        let env = create_test_env();
        let admin = create_test_admin(&env);
        let implementation1 = Address::generate(&env);
        let implementation2 = Address::generate(&env);

        VersionManager::initialize(env.clone(), admin.clone());

        // Register backward compatible version
        VersionManager::register_version(
            env.clone(),
            admin.clone(),
            1,
            implementation1.clone(),
            false,
            true,
        )
        .unwrap();

        // Register non-backward compatible version
        VersionManager::register_version(
            env.clone(),
            admin.clone(),
            2,
            implementation2.clone(),
            true,
            false,
        )
        .unwrap();

        // Test safe upgrade (backward compatible)
        let is_safe = VersionManager::is_upgrade_safe(env.clone(), 1, 1);
        assert!(is_safe.is_ok());
        assert!(is_safe.unwrap());

        // Test unsafe upgrade (non-backward compatible)
        let is_safe = VersionManager::is_upgrade_safe(env.clone(), 1, 2);
        assert!(is_safe.is_ok());
        assert!(!is_safe.unwrap());
    }

    #[test]
    fn test_data_migration_initialization() {
        let env = create_test_env();
        let admin = create_test_admin(&env);

        DataMigration::initialize(env.clone(), admin.clone());

        assert_eq!(DataMigration::get_admin(env.clone()), admin);
    }

    #[test]
    fn test_data_migration_register_script() {
        let env = create_test_env();
        let admin = create_test_admin(&env);
        let script_hash = soroban_sdk::BytesN::from_array(&env, &[1u8; 32]);

        DataMigration::initialize(env.clone(), admin.clone());

        let result = DataMigration::register_migration_script(
            env.clone(),
            admin.clone(),
            1,
            2,
            script_hash.clone(),
            Symbol::new(&env, "TEST_MIGRATION"),
        );

        assert!(result.is_ok());

        let migrations = DataMigration::get_migration_scripts(env.clone(), 2);
        assert!(!migrations.is_empty());

        let migration = migrations.get(0).unwrap();
        assert_eq!(migration.from_version, 1);
        assert_eq!(migration.to_version, 2);
        assert_eq!(migration.script_hash, script_hash);
        assert_eq!(migration.description, Symbol::new(&env, "TEST_MIGRATION"));
    }

    #[test]
    fn test_data_migration_execute() {
        let env = create_test_env();
        let admin = create_test_admin(&env);
        let script_hash = soroban_sdk::BytesN::from_array(&env, &[1u8; 32]);

        DataMigration::initialize(env.clone(), admin.clone());

        // Register migration script
        DataMigration::register_migration_script(
            env.clone(),
            admin.clone(),
            1,
            2,
            script_hash,
            Symbol::new(&env, "TEST_MIGRATION"),
        )
        .unwrap();

        // Execute migration
        let result = DataMigration::execute_migration(env.clone(), admin.clone(), 1, 2);

        assert!(result.is_ok());
    }

    #[test]
    fn test_data_migration_backup() {
        let env = create_test_env();
        let admin = create_test_admin(&env);

        DataMigration::initialize(env.clone(), admin.clone());

        let result = DataMigration::backup_data(env.clone(), admin.clone());
        assert!(result.is_ok());
    }

    #[test]
    fn test_data_migration_unauthorized_access() {
        let env = create_test_env();
        let admin = create_test_admin(&env);
        let unauthorized = Address::generate(&env);

        DataMigration::initialize(env.clone(), admin);

        let result = DataMigration::backup_data(env.clone(), unauthorized);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), symbol_short!("UNAUTH"));
    }

    #[test]
    fn test_integration_upgrade_flow() {
        let env = create_test_env();
        let admin = create_test_admin(&env);
        let old_implementation = Address::generate(&env);
        let new_implementation = Address::generate(&env);
        let script_hash = soroban_sdk::BytesN::from_array(&env, &[1u8; 32]);

        // Initialize all systems
        UpgradeProxy::initialize(env.clone(), admin.clone());
        VersionManager::initialize(env.clone(), admin.clone());
        DataMigration::initialize(env.clone(), admin.clone());

        // Register new version
        VersionManager::register_version(
            env.clone(),
            admin.clone(),
            2,
            new_implementation.clone(),
            true,
            true,
        )
        .unwrap();

        // Register migration script
        DataMigration::register_migration_script(
            env.clone(),
            admin.clone(),
            1,
            2,
            script_hash,
            Symbol::new(&env, "INTEGRATION_TEST"),
        )
        .unwrap();

        // Set initial implementation
        UpgradeProxy::upgrade(env.clone(), admin.clone(), old_implementation.clone(), 1).unwrap();

        // Backup data
        DataMigration::backup_data(env.clone(), admin.clone()).unwrap();

        // Perform upgrade
        let upgrade_result =
            UpgradeProxy::upgrade(env.clone(), admin.clone(), new_implementation.clone(), 2);
        assert!(upgrade_result.is_ok());

        // Execute migration
        let migration_result = DataMigration::execute_migration(env.clone(), admin.clone(), 1, 2);
        assert!(migration_result.is_ok());

        // Verify final state
        assert_eq!(UpgradeProxy::get_version(env.clone()), 2);
        assert_eq!(
            UpgradeProxy::get_implementation(env.clone()),
            new_implementation
        );
    }

    #[test]
    fn test_error_handling() {
        let env = create_test_env();
        let admin = create_test_admin(&env);
        let unauthorized = Address::generate(&env);

        // Test unauthorized access to all systems
        UpgradeProxy::initialize(env.clone(), admin.clone());
        VersionManager::initialize(env.clone(), admin.clone());
        DataMigration::initialize(env.clone(), admin.clone());

        let upgrade_result = UpgradeProxy::upgrade(
            env.clone(),
            unauthorized.clone(),
            Address::generate(&env),
            2,
        );
        assert!(upgrade_result.is_err());

        let version_result = VersionManager::register_version(
            env.clone(),
            unauthorized.clone(),
            2,
            Address::generate(&env),
            true,
            true,
        );
        assert!(version_result.is_err());

        let migration_result = DataMigration::register_migration_script(
            env.clone(),
            unauthorized,
            1,
            2,
            soroban_sdk::BytesN::from_array(&env, &[1u8; 32]),
            symbol_short!("TEST"),
        );
        assert!(migration_result.is_err());
    }
}
