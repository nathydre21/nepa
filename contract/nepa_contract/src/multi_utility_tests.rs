#![cfg(test)]

use crate::multi_utility::*;
use soroban_sdk::{Address, Env, String, Symbol};

#[test]
fn test_utility_type_enum() {
    let env = Env::default();
    
    // Test utility type conversion
    assert_eq!(UtilityType::from_u32(1).unwrap(), UtilityType::Electricity);
    assert_eq!(UtilityType::from_u32(2).unwrap(), UtilityType::Water);
    assert_eq!(UtilityType::from_u32(8).unwrap(), UtilityType::EVCharging);
    
    // Test invalid utility type
    assert!(UtilityType::from_u32(99).is_err());
    
    // Test utility type to string conversion
    assert_eq!(UtilityType::Electricity.to_string(&env), String::from_str(&"electricity"));
    assert_eq!(UtilityType::Water.to_string(&env), String::from_str(&"water"));
    
    // Test utility type units
    assert_eq!(UtilityType::Electricity.get_unit(&env), String::from_str(&"kWh"));
    assert_eq!(UtilityType::Water.get_unit(&env), String::from_str(&"m³"));
    assert_eq!(UtilityType::Internet.get_unit(&env), String::from_str(&"Mbps"));
}

#[test]
fn test_fee_type_enum() {
    // Test fee type conversion
    assert_eq!(FeeType::from_u32(1).unwrap(), FeeType::Processing);
    assert_eq!(FeeType::from_u32(8).unwrap(), FeeType::Emergency);
    
    // Test invalid fee type
    assert!(FeeType::from_u32(99).is_err());
}

#[test]
fn test_multi_utility_initialization() {
    let env = Env::default();
    let admin = Address::generate(&env);
    
    // Initialize multi-utility system
    MultiUtilityManager::initialize(env.clone(), admin.clone());
    
    // Verify utility types are registered
    let utility_types = MultiUtilityManager::get_utility_types(env.clone());
    assert!(utility_types.contains_key(1)); // Electricity
    assert!(utility_types.contains_key(2)); // Water
    assert!(utility_types.contains_key(8)); // EVCharging
    
    // Verify collections are initialized
    let providers: soroban_sdk::Map<String, UtilityProvider> = env.storage()
        .persistent()
        .get(&UTILITY_PROVIDERS)
        .unwrap();
    assert_eq!(providers.len(), 0);
}

#[test]
fn test_provider_registration() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let provider_address = Address::generate(&env);
    
    // Initialize system
    MultiUtilityManager::initialize(env.clone(), admin.clone());
    
    // Register a provider
    let result = MultiUtilityManager::register_provider(
        env.clone(),
        admin.clone(),
        String::from_str(&"provider_001"),
        String::from_str(&"Test Electricity Co"),
        provider_address.clone(),
        1, // Electricity
        String::from_str(&"Lagos"),
        String::from_str(&"LICENSE001"),
        String::from_str(&"contact@test.com"),
    );
    
    assert!(result.is_ok());
    
    // Verify provider is registered
    let provider = MultiUtilityManager::get_provider(env.clone(), String::from_str(&"provider_001"));
    assert!(provider.is_some());
    
    let provider = provider.unwrap();
    assert_eq!(provider.name, String::from_str(&"Test Electricity Co"));
    assert_eq!(provider.utility_type, UtilityType::Electricity);
    assert_eq!(provider.region, String::from_str(&"Lagos"));
    assert!(provider.is_active);
    
    // Test duplicate registration
    let duplicate_result = MultiUtilityManager::register_provider(
        env.clone(),
        admin.clone(),
        String::from_str(&"provider_001"),
        String::from_str(&"Duplicate Co"),
        provider_address,
        1,
        String::from_str(&"Lagos"),
        String::from_str(&"LICENSE002"),
        String::from_str(&"duplicate@test.com"),
    );
    
    assert!(duplicate_result.is_err());
    assert_eq!(duplicate_result.unwrap_err(), "Provider already registered");
}

#[test]
fn test_utility_configuration() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let provider_address = Address::generate(&env);
    
    // Initialize system
    MultiUtilityManager::initialize(env.clone(), admin.clone());
    
    // Register provider first
    MultiUtilityManager::register_provider(
        env.clone(),
        admin.clone(),
        String::from_str(&"provider_001"),
        String::from_str(&"Test Water Co"),
        provider_address.clone(),
        2, // Water
        String::from_str(&"Abuja"),
        String::from_str(&"LICENSE001"),
        String::from_str(&"contact@test.com"),
    ).unwrap();
    
    // Add utility configuration
    let result = MultiUtilityManager::add_utility_config(
        env.clone(),
        admin.clone(),
        String::from_str(&"config_001"),
        2, // Water
        String::from_str(&"provider_001"),
        String::from_str(&"Abuja"),
        5000000i128, // 0.5 XLM per m³
        String::from_str(&"XLM"),
        7,
        30, // 30 days billing cycle
        5,  // 5 days grace period
        1000000i128, // 0.001 XLM minimum
        100000000i128, // 0.1 XLM maximum
    );
    
    assert!(result.is_ok());
    
    // Verify configuration
    let config = MultiUtilityManager::get_utility_config(env.clone(), String::from_str(&"config_001"));
    assert!(config.is_some());
    
    let config = config.unwrap();
    assert_eq!(config.utility_type, UtilityType::Water);
    assert_eq!(config.base_rate, 5000000i128);
    assert_eq!(config.currency, String::from_str(&"XLM"));
    assert_eq!(config.billing_cycle_days, 30);
    assert!(config.is_active);
}

#[test]
fn test_meter_registration() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let provider_address = Address::generate(&env);
    let customer_address = Address::generate(&env);
    
    // Initialize system
    MultiUtilityManager::initialize(env.clone(), admin.clone());
    
    // Register provider
    MultiUtilityManager::register_provider(
        env.clone(),
        admin.clone(),
        String::from_str(&"provider_001"),
        String::from_str(&"Test Gas Co"),
        provider_address.clone(),
        3, // Gas
        String::from_str(&"Kano"),
        String::from_str(&"LICENSE001"),
        String::from_str(&"contact@test.com"),
    ).unwrap();
    
    // Register meter
    let result = MultiUtilityManager::register_meter(
        env.clone(),
        provider_address.clone(),
        String::from_str(&"meter_001"),
        3, // Gas
        String::from_str(&"provider_001"),
        customer_address.clone(),
        String::from_str(&"123 Main St"),
        String::from_str(&"SmartMeter X1"),
        String::from_str(&"v1.0.0"),
        true, // Smart meter
    );
    
    assert!(result.is_ok());
    
    // Verify meter
    let meter = MultiUtilityManager::get_meter(env.clone(), String::from_str(&"meter_001"));
    assert!(meter.is_some());
    
    let meter = meter.unwrap();
    assert_eq!(meter.utility_type, UtilityType::Gas);
    assert_eq!(meter.provider_id, String::from_str(&"provider_001"));
    assert_eq!(meter.customer_address, customer_address);
    assert!(meter.is_smart_meter);
    assert!(meter.is_active);
}

#[test]
fn test_utility_fee_structure() {
    let env = Env::default();
    let admin = Address::generate(&env);
    
    // Initialize system
    MultiUtilityManager::initialize(env.clone(), admin.clone());
    
    // Register provider
    MultiUtilityManager::register_provider(
        env.clone(),
        admin.clone(),
        String::from_str(&"provider_001"),
        String::from_str(&"Test Internet Co"),
        Address::generate(&env),
        4, // Internet
        String::from_str(&"Port Harcourt"),
        String::from_str(&"LICENSE001"),
        String::from_str(&"contact@test.com"),
    ).unwrap();
    
    // Add utility fee
    let result = MultiUtilityManager::add_utility_fee(
        env.clone(),
        admin.clone(),
        String::from_str(&"fee_001"),
        4, // Internet
        String::from_str(&"provider_001"),
        1, // Processing fee
        2000000i128, // 0.002 XLM
        None,
        false, // Fixed amount
        String::from_str(&"Standard processing fee"),
    );
    
    assert!(result.is_ok());
    
    // Verify fee
    let fee = MultiUtilityManager::get_utility_fee(env.clone(), String::from_str(&"fee_001"));
    assert!(fee.is_some());
    
    let fee = fee.unwrap();
    assert_eq!(fee.utility_type, UtilityType::Internet);
    assert_eq!(fee.fee_type, FeeType::Processing);
    assert_eq!(fee.fee_amount, 2000000i128);
    assert!(!fee.is_percentage);
    assert!(fee.is_active);
}

#[test]
fn test_list_providers_by_type_and_region() {
    let env = Env::default();
    let admin = Address::generate(&env);
    
    // Initialize system
    MultiUtilityManager::initialize(env.clone(), admin.clone());
    
    // Register multiple providers
    let provider1_addr = Address::generate(&env);
    let provider2_addr = Address::generate(&env);
    let provider3_addr = Address::generate(&env);
    
    // Same type and region
    MultiUtilityManager::register_provider(
        env.clone(),
        admin.clone(),
        String::from_str(&"provider_001"),
        String::from_str(&"Electricity Co 1"),
        provider1_addr,
        1, // Electricity
        String::from_str(&"Lagos"),
        String::from_str(&"LICENSE001"),
        String::from_str(&"contact1@test.com"),
    ).unwrap();
    
    MultiUtilityManager::register_provider(
        env.clone(),
        admin.clone(),
        String::from_str(&"provider_002"),
        String::from_str(&"Electricity Co 2"),
        provider2_addr,
        1, // Electricity
        String::from_str(&"Lagos"),
        String::from_str(&"LICENSE002"),
        String::from_str(&"contact2@test.com"),
    ).unwrap();
    
    // Different type
    MultiUtilityManager::register_provider(
        env.clone(),
        admin.clone(),
        String::from_str(&"provider_003"),
        String::from_str(&"Water Co"),
        provider3_addr,
        2, // Water
        String::from_str(&"Lagos"),
        String::from_str(&"LICENSE003"),
        String::from_str(&"contact3@test.com"),
    ).unwrap();
    
    // List electricity providers in Lagos
    let providers = MultiUtilityManager::list_providers_by_type_and_region(
        env.clone(),
        1, // Electricity
        String::from_str(&"Lagos"),
    ).unwrap();
    
    assert_eq!(providers.len(), 2);
    
    // Verify both electricity providers are returned
    let provider_ids: Vec<String> = Vec::new(&env);
    for provider in providers.iter() {
        provider_ids.push_back(provider.provider_id.clone());
    }
    
    assert!(provider_ids.contains(&String::from_str(&"provider_001")));
    assert!(provider_ids.contains(&String::from_str(&"provider_002")));
    assert!(!provider_ids.contains(&String::from_str(&"provider_003")));
}

#[test]
fn test_provider_status_update() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let provider_address = Address::generate(&env);
    
    // Initialize system
    MultiUtilityManager::initialize(env.clone(), admin.clone());
    
    // Register provider
    MultiUtilityManager::register_provider(
        env.clone(),
        admin.clone(),
        String::from_str(&"provider_001"),
        String::from_str(&"Test Co"),
        provider_address,
        1, // Electricity
        String::from_str(&"Lagos"),
        String::from_str(&"LICENSE001"),
        String::from_str(&"contact@test.com"),
    ).unwrap();
    
    // Verify provider is active
    let provider = MultiUtilityManager::get_provider(env.clone(), String::from_str(&"provider_001")).unwrap();
    assert!(provider.is_active);
    
    // Deactivate provider
    let result = MultiUtilityManager::update_provider_status(
        env.clone(),
        admin.clone(),
        String::from_str(&"provider_001"),
        false,
    );
    
    assert!(result.is_ok());
    
    // Verify provider is deactivated
    let provider = MultiUtilityManager::get_provider(env.clone(), String::from_str(&"provider_001")).unwrap();
    assert!(!provider.is_active);
}

#[test]
fn test_utility_type_validation() {
    let env = Env::default();
    let admin = Address::generate(&env);
    
    // Initialize system
    MultiUtilityManager::initialize(env.clone(), admin.clone());
    
    // Test valid utility types
    assert!(MultiUtilityManager::validate_utility_type(env.clone(), 1).is_ok()); // Electricity
    assert!(MultiUtilityManager::validate_utility_type(env.clone(), 2).is_ok()); // Water
    assert!(MultiUtilityManager::validate_utility_type(env.clone(), 8).is_ok()); // EVCharging
    
    // Test invalid utility type
    assert!(MultiUtilityManager::validate_utility_type(env.clone(), 99).is_err());
}

#[test]
fn test_configuration_upgrade() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let provider_address = Address::generate(&env);
    
    // Initialize system
    MultiUtilityManager::initialize(env.clone(), admin.clone());
    
    // Register provider
    MultiUtilityManager::register_provider(
        env.clone(),
        admin.clone(),
        String::from_str(&"provider_001"),
        String::from_str(&"Test Co"),
        provider_address,
        1, // Electricity
        String::from_str(&"Lagos"),
        String::from_str(&"LICENSE001"),
        String::from_str(&"contact@test.com"),
    ).unwrap();
    
    // Add initial configuration
    MultiUtilityManager::add_utility_config(
        env.clone(),
        admin.clone(),
        String::from_str(&"config_001"),
        1, // Electricity
        String::from_str(&"provider_001"),
        String::from_str(&"Lagos"),
        1000000i128, // 0.001 XLM per kWh
        String::from_str(&"XLM"),
        7,
        30,
        5,
        1000000i128,
        100000000i128,
    ).unwrap();
    
    // Get initial config
    let initial_config = MultiUtilityManager::get_utility_config(env.clone(), String::from_str(&"config_001")).unwrap();
    assert_eq!(initial_config.version, 1);
    assert_eq!(initial_config.base_rate, 1000000i128);
    
    // Create upgraded configuration
    let mut upgraded_config = initial_config.clone();
    upgraded_config.base_rate = 1500000i128; // Increase rate
    upgraded_config.billing_cycle_days = 60; // Change billing cycle
    
    // Upgrade configuration
    let result = MultiUtilityManager::upgrade_utility_config(
        env.clone(),
        admin.clone(),
        String::from_str(&"config_001"),
        upgraded_config,
    );
    
    assert!(result.is_ok());
    
    // Verify upgraded configuration
    let upgraded_config_result = MultiUtilityManager::get_utility_config(env.clone(), String::from_str(&"config_001")).unwrap();
    assert_eq!(upgraded_config_result.version, 2);
    assert_eq!(upgraded_config_result.base_rate, 1500000i128);
    assert_eq!(upgraded_config_result.billing_cycle_days, 60);
}
