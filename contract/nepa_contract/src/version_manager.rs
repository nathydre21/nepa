use soroban_sdk::{contracttype, Address, Env, Map, Symbol};

#[derive(Clone)]
#[contracttype]
pub struct ContractVersion {
    pub version: u32,
    pub implementation_address: Address,
    pub deployment_timestamp: u64,
    pub migration_required: bool,
    pub backward_compatible: bool,
}

pub struct VersionManager;

impl VersionManager {
    /// Initialize version manager
    pub fn initialize(env: Env, admin: Address) {
        env.storage()
            .instance()
            .set(&Symbol::short("ADMIN"), &admin);

        // Initialize version registry
        let version_registry: Map<u32, ContractVersion> = Map::new(&env);
        env.storage()
            .instance()
            .set(&Symbol::short("VERSIONS"), &version_registry);
    }

    /// Register a new version
    pub fn register_version(
        env: Env,
        admin: Address,
        version: u32,
        implementation_address: Address,
        migration_required: bool,
        backward_compatible: bool,
    ) -> Result<(), Symbol> {
        // Verify admin
        let current_admin = env
            .storage()
            .instance()
            .get::<Symbol, Address>(&Symbol::short("ADMIN"))
            .unwrap();

        if current_admin != admin {
            return Err(Symbol::short("UNAUTH"));
        }

        // Create version info
        let version_info = ContractVersion {
            version,
            implementation_address: implementation_address.clone(),
            deployment_timestamp: env.ledger().timestamp(),
            migration_required,
            backward_compatible,
        };

        // Get existing versions
        let mut versions: Map<u32, ContractVersion> = env
            .storage()
            .instance()
            .get(&Symbol::short("VERSIONS"))
            .unwrap_or_else(|| Map::new(&env));

        // Add new version
        versions.set(version, version_info);

        // Store updated versions
        env.storage()
            .instance()
            .set(&Symbol::short("VERSIONS"), &versions);

        // Emit registration event
        env.events().publish(
            (Symbol::short("VER_REG"), version),
            (
                implementation_address,
                migration_required,
                backward_compatible,
            ),
        );

        Ok(())
    }

    /// Get version info
    pub fn get_version_info(env: Env, version: u32) -> Option<ContractVersion> {
        let versions: Map<u32, ContractVersion> = env
            .storage()
            .instance()
            .get(&Symbol::short("VERSIONS"))
            .unwrap_or_else(|| Map::new(&env));

        versions.get(version)
    }

    /// Get latest version
    pub fn get_latest_version(env: Env) -> Option<u32> {
        let versions: Map<u32, ContractVersion> = env
            .storage()
            .instance()
            .get(&Symbol::short("VERSIONS"))
            .unwrap_or_else(|| Map::new(&env));

        if versions.is_empty() {
            return None;
        }

        // Find the highest version number
        let mut latest_version = 0u32;
        for version in versions.keys() {
            if version > latest_version {
                latest_version = version;
            }
        }

        Some(latest_version)
    }

    /// Check if upgrade is safe
    pub fn is_upgrade_safe(env: Env, from_version: u32, to_version: u32) -> Result<bool, Symbol> {
        let versions: Map<u32, ContractVersion> = env
            .storage()
            .instance()
            .get(&Symbol::short("VERSIONS"))
            .unwrap_or_else(|| Map::new(&env));

        let from_info = versions
            .get(from_version)
            .ok_or(Symbol::short("FROM_VER"))?;

        let to_info = versions
            .get(to_version)
            .ok_or(Symbol::short("TO_VER"))?;

        // Check if target version is backward compatible
        if !to_info.backward_compatible && from_version < to_version {
            return Ok(false);
        }

        // Check if migration is required and available
        if to_info.migration_required {
            // In a real implementation, you'd check if migration scripts exist
            // For now, we'll assume migration is always possible
        }

        Ok(true)
    }

    /// List all versions
    pub fn list_versions(env: Env) -> Map<u32, ContractVersion> {
        env.storage()
            .instance()
            .get(&Symbol::short("VERSIONS"))
            .unwrap_or_else(|| Map::new(&env))
    }

    /// Get admin
    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&Symbol::short("ADMIN"))
            .unwrap()
    }
}
