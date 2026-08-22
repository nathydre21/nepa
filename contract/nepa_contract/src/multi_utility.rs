#![no_std]
use soroban_sdk::{contracttype, symbol_short, Address, Env, Map, String, Symbol, Vec};

// Storage keys for multi-utility system
const UTILITY_TYPES: Symbol = symbol_short!("UT_TYPES");
pub(crate) const UTILITY_PROVIDERS: Symbol = symbol_short!("UT_PROVS");
const UTILITY_CONFIGS: Symbol = symbol_short!("UT_CONF");
const UTILITY_FEES: Symbol = symbol_short!("UT_FEES");
const UTILITY_METERS: Symbol = symbol_short!("UT_METERS");
const UTILITY_VERSIONS: Symbol = symbol_short!("UT_VERS");

// Utility Type Enumeration
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[contracttype]
pub enum UtilityType {
    Electricity = 1,
    Water = 2,
    Gas = 3,
    Internet = 4,
    Waste = 5,
    PropertyTax = 6,
    Solar = 7,
    EVCharging = 8,
}

impl UtilityType {
    pub fn from_u32(value: u32) -> Result<Self, &'static str> {
        match value {
            1 => Ok(UtilityType::Electricity),
            2 => Ok(UtilityType::Water),
            3 => Ok(UtilityType::Gas),
            4 => Ok(UtilityType::Internet),
            5 => Ok(UtilityType::Waste),
            6 => Ok(UtilityType::PropertyTax),
            7 => Ok(UtilityType::Solar),
            8 => Ok(UtilityType::EVCharging),
            _ => Err("Invalid utility type"),
        }
    }

    pub fn to_u32(self) -> u32 {
        self as u32
    }

    pub fn to_string(&self, env: &Env) -> String {
        match self {
            UtilityType::Electricity => String::from_str(env, "electricity"),
            UtilityType::Water => String::from_str(env, "water"),
            UtilityType::Gas => String::from_str(env, "gas"),
            UtilityType::Internet => String::from_str(env, "internet"),
            UtilityType::Waste => String::from_str(env, "waste"),
            UtilityType::PropertyTax => String::from_str(env, "property_tax"),
            UtilityType::Solar => String::from_str(env, "solar"),
            UtilityType::EVCharging => String::from_str(env, "ev_charging"),
        }
    }

    pub fn get_unit(&self, env: &Env) -> String {
        match self {
            UtilityType::Electricity => String::from_str(env, "kWh"),
            UtilityType::Water => String::from_str(env, "m³"),
            UtilityType::Gas => String::from_str(env, "m³"),
            UtilityType::Internet => String::from_str(env, "Mbps"),
            UtilityType::Waste => String::from_str(env, "kg"),
            UtilityType::PropertyTax => String::from_str(env, "property"),
            UtilityType::Solar => String::from_str(env, "kWh"),
            UtilityType::EVCharging => String::from_str(env, "kWh"),
        }
    }
}

// Utility Provider Structure
#[derive(Clone)]
#[contracttype]
pub struct UtilityProvider {
    pub provider_id: String,
    pub name: String,
    pub address: Address,
    pub utility_type: UtilityType,
    pub region: String,
    pub is_active: bool,
    pub registration_date: u64,
    pub license_number: String,
    pub contact_info: String,
    pub rating: u32, // 1-5 rating
    pub total_transactions: u64,
}

// Utility Configuration Structure
#[derive(Clone)]
#[contracttype]
pub struct UtilityConfig {
    pub utility_type: UtilityType,
    pub provider_id: String,
    pub region: String,
    pub base_rate: i128, // Base rate per unit
    pub currency: String,
    pub decimals: u32,
    pub tier_rates: Vec<TierRate>,             // Tiered pricing
    pub time_of_use_rates: Vec<TimeOfUseRate>, // Time-based pricing
    pub seasonal_adjustments: Vec<SeasonalAdjustment>,
    pub tax_rates: Vec<TaxRate>,
    pub discount_rates: Vec<DiscountRate>,
    pub late_fee_config: LateFeeConfig,
    pub payment_methods: Vec<String>, // Accepted payment methods
    pub billing_cycle_days: u32,
    pub grace_period_days: u32,
    pub minimum_payment: i128,
    pub maximum_payment: i128,
    pub is_active: bool,
    pub version: u32,
    pub last_updated: u64,
}

#[derive(Clone)]
#[contracttype]
pub struct UtilityConfigRequest {
    pub utility_type: u32,
    pub provider_id: String,
    pub region: String,
    pub base_rate: i128,
    pub currency: String,
    pub decimals: u32,
    pub billing_cycle_days: u32,
    pub grace_period_days: u32,
    pub minimum_payment: i128,
    pub maximum_payment: i128,
}

// Tier Rate Structure
#[derive(Clone)]
#[contracttype]
pub struct TierRate {
    pub min_units: i128,
    pub max_units: i128,
    pub rate_per_unit: i128,
    pub tier_name: String,
}

// Time of Use Rate Structure
#[derive(Clone)]
#[contracttype]
pub struct TimeOfUseRate {
    pub start_hour: u32,
    pub end_hour: u32,
    pub days_of_week: Vec<u32>, // 0-6 (Sunday-Saturday)
    pub rate_multiplier: i128,  // Multiplier for base rate (e.g., 150 = 1.5x)
    pub season: String,         // "summer", "winter", etc.
}

// Seasonal Adjustment Structure
#[derive(Clone)]
#[contracttype]
pub struct SeasonalAdjustment {
    pub season: String,
    pub start_month: u32,
    pub end_month: u32,
    pub rate_adjustment: i128, // Percentage adjustment (e.g., 110 = +10%)
}

// Tax Rate Structure
#[derive(Clone)]
#[contracttype]
pub struct TaxRate {
    pub tax_name: String,
    pub rate_percentage: i128,
    pub is_compound: bool,
    pub max_amount: Option<i128>,
}

// Discount Rate Structure
#[derive(Clone)]
#[contracttype]
pub struct DiscountRate {
    pub discount_name: String,
    pub discount_percentage: i128,
    pub condition: String, // "early_payment", "senior_citizen", etc.
    pub is_active: bool,
    pub expiry_date: Option<u64>,
}

// Late Fee Configuration
#[derive(Clone)]
#[contracttype]
pub struct LateFeeConfig {
    pub flat_fee: i128,
    pub percentage_fee: i128,
    pub max_fee: i128,
    pub grace_period_days: u32,
    pub compound_daily: bool,
}

// Utility Fee Structure
#[derive(Clone)]
#[contracttype]
pub struct UtilityFee {
    pub fee_id: String,
    pub utility_type: UtilityType,
    pub provider_id: String,
    pub fee_type: FeeType,
    pub fee_amount: i128,
    pub fee_percentage: Option<i128>,
    pub is_percentage: bool,
    pub description: String,
    pub is_active: bool,
    pub created_at: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[contracttype]
pub enum FeeType {
    Processing = 1,
    Service = 2,
    Maintenance = 3,
    Connection = 4,
    Disconnection = 5,
    Reconnection = 6,
    Inspection = 7,
    Emergency = 8,
}

impl FeeType {
    pub fn from_u32(value: u32) -> Result<Self, &'static str> {
        match value {
            1 => Ok(FeeType::Processing),
            2 => Ok(FeeType::Service),
            3 => Ok(FeeType::Maintenance),
            4 => Ok(FeeType::Connection),
            5 => Ok(FeeType::Disconnection),
            6 => Ok(FeeType::Reconnection),
            7 => Ok(FeeType::Inspection),
            8 => Ok(FeeType::Emergency),
            _ => Err("Invalid fee type"),
        }
    }

    pub fn to_u32(self) -> u32 {
        self as u32
    }
}

// Utility Meter Structure
#[derive(Clone)]
#[contracttype]
pub struct UtilityMeter {
    pub meter_id: String,
    pub utility_type: UtilityType,
    pub provider_id: String,
    pub region: String,
    pub customer_address: Address,
    pub installation_date: u64,
    pub last_reading: i128,
    pub last_reading_date: u64,
    pub is_active: bool,
    pub is_smart_meter: bool,
    pub location: String,
    pub meter_model: String,
    pub firmware_version: String,
}

// Utility Version Structure for upgrades
#[derive(Clone)]
#[contracttype]
pub struct UtilityVersion {
    pub utility_type: UtilityType,
    pub version: u32,
    pub config_hash: String, // Hash of the configuration
    pub deployment_date: u64,
    pub is_active: bool,
    pub migration_required: bool,
    pub description: String,
}

pub struct MultiUtilityManager;

impl MultiUtilityManager {
    #[cfg(test)]
    fn require_auth(_addr: &Address) {}

    #[cfg(not(test))]
    fn require_auth(addr: &Address) {
        addr.require_auth();
    }

    // Initialize multi-utility system
    pub fn initialize(env: Env, admin: Address) {
        Self::require_auth(&admin);

        // Initialize utility types registry
        let mut utility_types: Map<u32, String> = Map::new(&env);
        utility_types.set(
            UtilityType::Electricity.to_u32(),
            UtilityType::Electricity.to_string(&env),
        );
        utility_types.set(
            UtilityType::Water.to_u32(),
            UtilityType::Water.to_string(&env),
        );
        utility_types.set(UtilityType::Gas.to_u32(), UtilityType::Gas.to_string(&env));
        utility_types.set(
            UtilityType::Internet.to_u32(),
            UtilityType::Internet.to_string(&env),
        );
        utility_types.set(
            UtilityType::Waste.to_u32(),
            UtilityType::Waste.to_string(&env),
        );
        utility_types.set(
            UtilityType::PropertyTax.to_u32(),
            UtilityType::PropertyTax.to_string(&env),
        );
        utility_types.set(
            UtilityType::Solar.to_u32(),
            UtilityType::Solar.to_string(&env),
        );
        utility_types.set(
            UtilityType::EVCharging.to_u32(),
            UtilityType::EVCharging.to_string(&env),
        );

        env.storage()
            .persistent()
            .set(&UTILITY_TYPES, &utility_types);

        // Initialize empty collections
        env.storage().persistent().set(
            &UTILITY_PROVIDERS,
            &Map::<String, UtilityProvider>::new(&env),
        );
        env.storage()
            .persistent()
            .set(&UTILITY_CONFIGS, &Map::<String, UtilityConfig>::new(&env));
        env.storage()
            .persistent()
            .set(&UTILITY_FEES, &Map::<String, UtilityFee>::new(&env));
        env.storage()
            .persistent()
            .set(&UTILITY_METERS, &Map::<String, UtilityMeter>::new(&env));
        env.storage().persistent().set(
            &UTILITY_VERSIONS,
            &Map::<(String, u32), UtilityVersion>::new(&env),
        );
    }

    // Register a new utility provider
    pub fn register_provider(
        env: Env,
        admin: Address,
        provider_id: String,
        name: String,
        provider_address: Address,
        utility_type: u32,
        region: String,
        license_number: String,
        contact_info: String,
    ) -> Result<(), &'static str> {
        Self::require_auth(&admin);

        // Validate utility type
        let utility_type_enum = UtilityType::from_u32(utility_type)?;

        // Check if provider already exists
        let providers: Map<String, UtilityProvider> = env
            .storage()
            .persistent()
            .get(&UTILITY_PROVIDERS)
            .unwrap_or_else(|| Map::new(&env));

        if providers.contains_key(provider_id.clone()) {
            return Err("Provider already registered");
        }

        // Create new provider
        let provider = UtilityProvider {
            provider_id: provider_id.clone(),
            name,
            address: provider_address,
            utility_type: utility_type_enum,
            region,
            is_active: true,
            registration_date: env.ledger().timestamp(),
            license_number,
            contact_info,
            rating: 5, // Start with neutral rating
            total_transactions: 0,
        };

        // Store provider
        let mut updated_providers = providers;
        updated_providers.set(provider_id, provider);
        env.storage()
            .persistent()
            .set(&UTILITY_PROVIDERS, &updated_providers);

        Ok(())
    }

    // Add utility configuration
    pub fn add_utility_config(
        env: Env,
        admin: Address,
        config_id: String,
        utility_type: u32,
        provider_id: String,
        region: String,
        base_rate: i128,
        currency: String,
        decimals: u32,
        billing_cycle_days: u32,
        grace_period_days: u32,
        minimum_payment: i128,
        maximum_payment: i128,
    ) -> Result<(), &'static str> {
        Self::require_auth(&admin);

        // Validate utility type
        let utility_type_enum = UtilityType::from_u32(utility_type)?;

        // Verify provider exists and is active
        let providers: Map<String, UtilityProvider> = env
            .storage()
            .persistent()
            .get(&UTILITY_PROVIDERS)
            .ok_or("No providers registered")?;

        let provider = providers
            .get(provider_id.clone())
            .ok_or("Provider not found")?;

        if !provider.is_active {
            return Err("Provider is not active");
        }

        if provider.utility_type != utility_type_enum {
            return Err("Utility type mismatch");
        }

        // Create configuration
        let config = UtilityConfig {
            utility_type: utility_type_enum,
            provider_id: provider_id.clone(),
            region,
            base_rate,
            currency,
            decimals,
            tier_rates: Vec::new(&env),
            time_of_use_rates: Vec::new(&env),
            seasonal_adjustments: Vec::new(&env),
            tax_rates: Vec::new(&env),
            discount_rates: Vec::new(&env),
            late_fee_config: LateFeeConfig {
                flat_fee: 1000000,   // 0.001 XLM default
                percentage_fee: 500, // 5% default
                max_fee: 10000000,   // 0.01 XLM max
                grace_period_days,
                compound_daily: false,
            },
            payment_methods: Vec::new(&env),
            billing_cycle_days,
            grace_period_days,
            minimum_payment,
            maximum_payment,
            is_active: true,
            version: 1,
            last_updated: env.ledger().timestamp(),
        };

        // Store configuration
        let mut configs: Map<String, UtilityConfig> = env
            .storage()
            .persistent()
            .get(&UTILITY_CONFIGS)
            .unwrap_or_else(|| Map::new(&env));

        configs.set(config_id, config);
        env.storage().persistent().set(&UTILITY_CONFIGS, &configs);

        Ok(())
    }

    // Register utility meter
    pub fn register_meter(
        env: Env,
        provider_address: Address,
        meter_id: String,
        utility_type: u32,
        provider_id: String,
        customer_address: Address,
        location: String,
        meter_model: String,
        firmware_version: String,
        is_smart_meter: bool,
    ) -> Result<(), &'static str> {
        Self::require_auth(&provider_address);

        // Validate utility type
        let utility_type_enum = UtilityType::from_u32(utility_type)?;

        // Verify provider exists and is active
        let providers: Map<String, UtilityProvider> = env
            .storage()
            .persistent()
            .get(&UTILITY_PROVIDERS)
            .ok_or("No providers registered")?;

        let provider = providers
            .get(provider_id.clone())
            .ok_or("Provider not found")?;

        if provider.address != provider_address {
            return Err("Unauthorized provider");
        }

        if !provider.is_active {
            return Err("Provider is not active");
        }

        // Check if meter already exists
        let meters: Map<String, UtilityMeter> = env
            .storage()
            .persistent()
            .get(&UTILITY_METERS)
            .unwrap_or_else(|| Map::new(&env));

        if meters.contains_key(meter_id.clone()) {
            return Err("Meter already registered");
        }

        // Create meter
        let meter = UtilityMeter {
            meter_id: meter_id.clone(),
            utility_type: utility_type_enum,
            provider_id,
            region: provider.region,
            customer_address,
            installation_date: env.ledger().timestamp(),
            last_reading: 0,
            last_reading_date: env.ledger().timestamp(),
            is_active: true,
            is_smart_meter,
            location,
            meter_model,
            firmware_version,
        };

        // Store meter
        let mut updated_meters = meters;
        updated_meters.set(meter_id, meter);
        env.storage()
            .persistent()
            .set(&UTILITY_METERS, &updated_meters);

        Ok(())
    }

    // Add utility fee
    pub fn add_utility_fee(
        env: Env,
        admin: Address,
        fee_id: String,
        utility_type: u32,
        provider_id: String,
        fee_type: u32,
        fee_amount: i128,
        fee_percentage: Option<i128>,
        is_percentage: bool,
        description: String,
    ) -> Result<(), &'static str> {
        Self::require_auth(&admin);

        // Validate utility type and fee type
        let utility_type_enum = UtilityType::from_u32(utility_type)?;
        let fee_type_enum = FeeType::from_u32(fee_type)?;

        // Verify provider exists
        let providers: Map<String, UtilityProvider> = env
            .storage()
            .persistent()
            .get(&UTILITY_PROVIDERS)
            .ok_or("No providers registered")?;

        providers
            .get(provider_id.clone())
            .ok_or("Provider not found")?;

        // Create fee
        let fee = UtilityFee {
            fee_id: fee_id.clone(),
            utility_type: utility_type_enum,
            provider_id,
            fee_type: fee_type_enum,
            fee_amount,
            fee_percentage,
            is_percentage,
            description,
            is_active: true,
            created_at: env.ledger().timestamp(),
        };

        // Store fee
        let mut fees: Map<String, UtilityFee> = env
            .storage()
            .persistent()
            .get(&UTILITY_FEES)
            .unwrap_or_else(|| Map::new(&env));

        fees.set(fee_id, fee);
        env.storage().persistent().set(&UTILITY_FEES, &fees);

        Ok(())
    }

    // Get utility provider
    pub fn get_provider(env: Env, provider_id: String) -> Option<UtilityProvider> {
        let providers: Map<String, UtilityProvider> =
            env.storage().persistent().get(&UTILITY_PROVIDERS)?;

        providers.get(provider_id)
    }

    // Get utility configuration
    pub fn get_utility_config(env: Env, config_id: String) -> Option<UtilityConfig> {
        let configs: Map<String, UtilityConfig> =
            env.storage().persistent().get(&UTILITY_CONFIGS)?;

        configs.get(config_id)
    }

    // Get utility meter
    pub fn get_meter(env: Env, meter_id: String) -> Option<UtilityMeter> {
        let meters: Map<String, UtilityMeter> = env.storage().persistent().get(&UTILITY_METERS)?;

        meters.get(meter_id)
    }

    // Get utility fee
    pub fn get_utility_fee(env: Env, fee_id: String) -> Option<UtilityFee> {
        let fees: Map<String, UtilityFee> = env.storage().persistent().get(&UTILITY_FEES)?;

        fees.get(fee_id)
    }

    // List providers by utility type and region
    pub fn list_providers_by_type_and_region(
        env: Env,
        utility_type: u32,
        region: String,
    ) -> Result<Vec<UtilityProvider>, &'static str> {
        let utility_type_enum = UtilityType::from_u32(utility_type)?;

        let providers: Map<String, UtilityProvider> = env
            .storage()
            .persistent()
            .get(&UTILITY_PROVIDERS)
            .ok_or("No providers registered")?;

        let mut result = Vec::new(&env);

        for (_, provider) in providers.iter() {
            if provider.utility_type == utility_type_enum
                && provider.region == region
                && provider.is_active
            {
                result.push_back(provider);
            }
        }

        Ok(result)
    }

    // Update provider status
    pub fn update_provider_status(
        env: Env,
        admin: Address,
        provider_id: String,
        is_active: bool,
    ) -> Result<(), &'static str> {
        Self::require_auth(&admin);

        let mut providers: Map<String, UtilityProvider> = env
            .storage()
            .persistent()
            .get(&UTILITY_PROVIDERS)
            .ok_or("No providers registered")?;

        let mut provider = providers
            .get(provider_id.clone())
            .ok_or("Provider not found")?;

        provider.is_active = is_active;
        providers.set(provider_id, provider);
        env.storage()
            .persistent()
            .set(&UTILITY_PROVIDERS, &providers);

        Ok(())
    }

    // Upgrade utility configuration
    pub fn upgrade_utility_config(
        env: Env,
        admin: Address,
        config_id: String,
        new_config: UtilityConfig,
    ) -> Result<(), &'static str> {
        Self::require_auth(&admin);

        let mut configs: Map<String, UtilityConfig> = env
            .storage()
            .persistent()
            .get(&UTILITY_CONFIGS)
            .ok_or("No configurations found")?;

        let old_config = configs
            .get(config_id.clone())
            .ok_or("Configuration not found")?;

        // Create version record
        let version = UtilityVersion {
            utility_type: old_config.utility_type,
            version: old_config.version + 1,
            config_hash: String::from_str(&env, "hash_placeholder"), // In real implementation, compute hash
            deployment_date: env.ledger().timestamp(),
            is_active: true,
            migration_required: true,
            description: String::from_str(&env, "Configuration upgrade"),
        };

        // Store version
        let mut versions: Map<(String, u32), UtilityVersion> = env
            .storage()
            .persistent()
            .get(&UTILITY_VERSIONS)
            .unwrap_or_else(|| Map::new(&env));

        let version_key = (config_id.clone(), version.version);
        versions.set(version_key, version);
        env.storage().persistent().set(&UTILITY_VERSIONS, &versions);

        // Update configuration
        let mut updated_config = new_config;
        updated_config.version = old_config.version + 1;
        updated_config.last_updated = env.ledger().timestamp();

        configs.set(config_id, updated_config);
        env.storage().persistent().set(&UTILITY_CONFIGS, &configs);

        Ok(())
    }

    // Validate utility type
    pub fn validate_utility_type(env: Env, utility_type: u32) -> Result<(), &'static str> {
        let utility_types: Map<u32, String> = env
            .storage()
            .persistent()
            .get(&UTILITY_TYPES)
            .ok_or("Utility types not initialized")?;

        if utility_types.contains_key(utility_type) {
            Ok(())
        } else {
            Err("Invalid utility type")
        }
    }

    // Get all utility types
    pub fn get_utility_types(env: Env) -> Map<u32, String> {
        env.storage()
            .persistent()
            .get(&UTILITY_TYPES)
            .unwrap_or_else(|| Map::new(&env))
    }
}
