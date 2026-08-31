#![no_std]
#![allow(clippy::too_many_arguments)]
#![allow(dead_code)]
extern crate alloc;
use soroban_sdk::{
    contract, contracterror, contractimpl, symbol_short, token, Address, Env, String, Symbol, Vec,
};

mod oracle;
use oracle::{OracleConfig, OracleManager, PriceFeed, UtilityRate};

mod multi_utility;
use multi_utility::{
    MultiUtilityManager, UtilityConfig, UtilityConfigRequest, UtilityFee, UtilityMeter,
    UtilityProvider,
};

mod upgrade_proxy;
use upgrade_proxy::UpgradeProxy;

mod version_manager;
use version_manager::{ContractVersion, VersionManager};

mod data_migration;
use data_migration::DataMigration;

#[cfg(test)]
mod tests;

#[cfg(test)]
mod upgrade_tests;

// SECURITY (Issue #414): Storage keys for security features
const REENTRANCY_GUARD: Symbol = symbol_short!("RE_GUARD");

// SECURITY (Issue #414): Maximum payment amount ceiling (1 billion tokens)
const MAX_PAYMENT_AMOUNT: i128 = 1_000_000_000_000_000;

// SECURITY (Issue #414): Maximum allowed meter ID length in bytes
const MAX_METER_ID_LENGTH: u32 = 64;

// SECURITY (Issue #414): Maximum payments per meter per ledger
const RATE_LIMIT_PER_LEDGER: u32 = 10;

fn join_strings(env: &Env, first: &String, separator: &str, second: &String) -> String {
    let first_len = first.len() as usize;
    let separator_len = separator.len();
    let mut bytes = alloc::vec![0; first_len + separator_len + second.len() as usize];
    first.copy_into_slice(&mut bytes[..first_len]);
    bytes[first_len..first_len + separator_len].copy_from_slice(separator.as_bytes());
    second.copy_into_slice(&mut bytes[first_len + separator_len..]);
    String::from_bytes(env, &bytes)
}

#[contract]
pub struct NepaBillingContract;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum ContractError {
    Failed = 1,
}

impl From<String> for ContractError {
    fn from(_: String) -> Self {
        Self::Failed
    }
}

impl From<Symbol> for ContractError {
    fn from(_: Symbol) -> Self {
        Self::Failed
    }
}

impl From<&'static str> for ContractError {
    fn from(_: &'static str) -> Self {
        Self::Failed
    }
}

// SECURITY (Issue #414): Validate meter_id is non-empty and within length limits
fn validate_meter_id(meter_id: &String) -> Result<(), &'static str> {
    let len = meter_id.len();
    if len == 0 {
        return Err("Meter ID cannot be empty");
    }
    if len > MAX_METER_ID_LENGTH {
        return Err("Meter ID exceeds maximum length");
    }
    Ok(())
}

// SECURITY (Issue #414): Validate currency against supported whitelist
fn validate_currency(env: &Env, currency: &String) -> Result<(), &'static str> {
    let usd = String::from_str(env, "USD");
    let ngn = String::from_str(env, "NGN");
    let eur = String::from_str(env, "EUR");
    let gbp = String::from_str(env, "GBP");
    let xlm = String::from_str(env, "XLM");

    if currency != &usd
        && currency != &ngn
        && currency != &eur
        && currency != &gbp
        && currency != &xlm
    {
        return Err("Unsupported currency. Allowed: USD, NGN, EUR, GBP, XLM");
    }
    Ok(())
}

// SECURITY (Issue #414): Re-entrancy guard using storage flag
fn check_reentrancy(env: &Env) -> Result<(), &'static str> {
    let locked: bool = env
        .storage()
        .instance()
        .get(&REENTRANCY_GUARD)
        .unwrap_or(false);
    if locked {
        return Err("Re-entrant call detected");
    }
    env.storage().instance().set(&REENTRANCY_GUARD, &true);
    Ok(())
}

fn clear_reentrancy(env: &Env) {
    env.storage().instance().set(&REENTRANCY_GUARD, &false);
}

// SECURITY (Issue #414): Per-ledger rate limiting per meter
fn check_rate_limit(env: &Env, meter_id: &String) -> Result<(), &'static str> {
    let ledger_seq = env.ledger().sequence();
    let rate_key = (symbol_short!("RATE_LIM"), ledger_seq, meter_id.clone());
    let count: u32 = env.storage().persistent().get(&rate_key).unwrap_or(0);
    if count >= RATE_LIMIT_PER_LEDGER {
        return Err("Payment rate limit exceeded for this meter");
    }
    env.storage().persistent().set(&rate_key, &(count + 1));
    Ok(())
}

// SECURITY (Issue #414): Safe multiplication with overflow check
fn checked_mul_div(a: i128, b: i128, divisor: i128) -> Result<i128, &'static str> {
    let product = a
        .checked_mul(b)
        .ok_or("Integer overflow in price calculation")?;
    Ok(product / divisor)
}

// SECURITY (Issue #414): Validate payment amount ceiling
fn validate_amount(amount: i128) -> Result<(), &'static str> {
    if amount <= 0 {
        return Err("Amount must be greater than 0");
    }
    if amount > MAX_PAYMENT_AMOUNT {
        return Err("Amount exceeds maximum payment limit");
    }
    Ok(())
}

#[contractimpl]
impl NepaBillingContract {
    // Initialize the contract with oracle support
    pub fn initialize(env: Env, admin: Address, oracle_config: OracleConfig) {
        // Initialize oracle manager
        OracleManager::initialize_oracle(env, admin, oracle_config);
    }

    // Enhanced pay_bill with oracle integration
    pub fn pay_bill_with_oracle(
        env: Env,
        from: Address,
        token_address: Address,
        meter_id: String,
        amount: i128,
        currency: String,
        use_exchange_rate: bool,
    ) -> Result<(), ContractError> {
        // 1. Verify the user authorized this payment
        from.require_auth();

        // SECURITY (Issue #414): Re-entrancy guard
        check_reentrancy(&env)?;

        // SECURITY (Issue #414): Validate meter_id
        validate_meter_id(&meter_id)?;

        // SECURITY (Issue #414): Validate currency
        validate_currency(&env, &currency)?;

        // SECURITY (Issue #414): Validate amount (positive + ceiling)
        validate_amount(amount)?;

        // SECURITY (Issue #414): Rate limiting
        check_rate_limit(&env, &meter_id)?;

        // 2. Get exchange rate if needed
        let mut final_amount = amount;
        let mut used_fallback = false;
        if use_exchange_rate {
            let usd = String::from_str(&env, "USD");
            let exchange_rate_id = join_strings(&env, &currency, "_", &usd);

            // SECURITY (Issue #411): Use the new get_price_with_fallback method
            let max_deviation = 20;
            let (price, decimals, fallback) = OracleManager::get_price_with_fallback(
                env.clone(),
                exchange_rate_id,
                max_deviation,
            )?;

            used_fallback = fallback;

            // SECURITY (Issue #414): Overflow-safe multiplication
            let divisor = 10_i128.pow(decimals);
            final_amount = checked_mul_div(amount, price, divisor)?;
        }

        // 3. Initialize the Token client
        let token_client = token::Client::new(&env, &token_address);

        // 4. Move the tokens from the User to the Contract
        token_client.transfer(&from, &env.current_contract_address(), &final_amount);

        // 5. Update the meter record
        let current_total: i128 = env.storage().persistent().get(&meter_id).unwrap_or(0);
        env.storage()
            .persistent()
            .set(&meter_id, &(current_total + final_amount));

        // SECURITY (Issue #414): Emit payment event for audit trail
        env.events().publish(
            (symbol_short!("PAYMENT"), symbol_short!("ORACLE")),
            (from, meter_id, final_amount, currency, used_fallback),
        );

        // SECURITY (Issue #414): Clear re-entrancy guard
        clear_reentrancy(&env);

        Ok(())
    }

    // Pay utility bill based on consumption and real-time rates
    pub fn pay_utility_bill(
        env: Env,
        from: Address,
        token_address: Address,
        meter_id: String,
        kwh_consumed: i128,
        utility_type: String,
        region: String,
        currency: String,
    ) -> Result<(), ContractError> {
        // 1. Verify authorization
        from.require_auth();

        // SECURITY (Issue #414): Re-entrancy guard
        check_reentrancy(&env)?;

        // SECURITY (Issue #414): Validate meter_id
        validate_meter_id(&meter_id)?;

        // SECURITY (Issue #414): Validate currency
        validate_currency(&env, &currency)?;

        // SECURITY (Issue #414): Validate consumption
        if kwh_consumed <= 0 {
            return Err(ContractError::Failed);
        }
        if kwh_consumed > 1_000_000_000_000 {
            return Err(ContractError::Failed);
        }

        // SECURITY (Issue #414): Rate limiting
        check_rate_limit(&env, &meter_id)?;

        // 2. Get utility rate
        let rate_id = join_strings(&env, &utility_type, "_", &region);
        let utility_rate = OracleManager::get_utility_rate(env.clone(), rate_id)
            .ok_or("Utility rate not available")?;

        // 3. Validate utility rate
        let config: OracleConfig = env
            .storage()
            .instance()
            .get(&symbol_short!("OR_CONF"))
            .ok_or("Oracle not initialized")?;

        if utility_rate.reliability_score < config.min_reliability_score {
            return Err(ContractError::Failed);
        }

        // 4. Calculate bill amount with overflow protection
        let subtotal = kwh_consumed
            .checked_mul(utility_rate.rate_per_kwh)
            .ok_or("Integer overflow in bill calculation")?;

        validate_amount(subtotal)?;

        // 5. Apply currency conversion if needed
        let mut final_amount = subtotal;
        if utility_rate.currency != currency {
            let exchange_rate_id = join_strings(&env, &utility_rate.currency, "_", &currency);

            let max_deviation = 20;
            let (price, decimals, _fallback) = OracleManager::get_price_with_fallback(
                env.clone(),
                exchange_rate_id,
                max_deviation,
            )?;

            let divisor = 10_i128.pow(decimals);
            final_amount = checked_mul_div(subtotal, price, divisor)?;
        }

        validate_amount(final_amount)?;

        // 6. Process payment
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&from, &env.current_contract_address(), &final_amount);

        // 7. Update meter record with detailed information
        let billing_key = (
            symbol_short!("BILLING"),
            meter_id.clone(),
            env.ledger().timestamp(),
        );
        let billing_data = (
            kwh_consumed,
            utility_rate.rate_per_kwh,
            final_amount,
            utility_type,
        );
        env.storage().persistent().set(&billing_key, &billing_data);

        // SECURITY (Issue #414): Emit payment event for audit trail
        env.events().publish(
            (symbol_short!("PAYMENT"), symbol_short!("UTILITY")),
            (from, meter_id, final_amount, currency, kwh_consumed),
        );

        // SECURITY (Issue #414): Clear re-entrancy guard
        clear_reentrancy(&env);

        Ok(())
    }

    // Original pay_bill function for backward compatibility
    pub fn pay_bill(
        env: Env,
        from: Address,
        token_address: Address,
        meter_id: String,
        amount: i128,
    ) -> Result<(), ContractError> {
        // 1. Verify the user authorized this payment
        from.require_auth();

        // SECURITY (Issue #414): Re-entrancy guard
        check_reentrancy(&env)?;

        // SECURITY (Issue #414): Validate meter_id
        validate_meter_id(&meter_id)?;

        // SECURITY (Issue #414): Validate amount (positive + ceiling)
        validate_amount(amount)?;

        // SECURITY (Issue #414): Rate limiting
        check_rate_limit(&env, &meter_id)?;

        // 2. Initialize the Token client (for XLM or USDC)
        let token_client = token::Client::new(&env, &token_address);

        // 3. Move the tokens from the User to the Contract
        token_client.transfer(&from, &env.current_contract_address(), &amount);

        // 4. Update the meter record (using i128 for larger money values)
        let current_total: i128 = env.storage().persistent().get(&meter_id).unwrap_or(0);
        env.storage()
            .persistent()
            .set(&meter_id, &(current_total + amount));

        // SECURITY (Issue #414): Emit payment event for audit trail
        env.events().publish(
            (symbol_short!("PAYMENT"), symbol_short!("SIMPLE")),
            (from, meter_id, amount),
        );

        // SECURITY (Issue #414): Clear re-entrancy guard
        clear_reentrancy(&env);

        Ok(())
    }

    pub fn get_total_paid(env: Env, meter_id: String) -> i128 {
        env.storage().persistent().get(&meter_id).unwrap_or(0)
    }

    // Get billing details
    pub fn get_billing_details(
        env: Env,
        meter_id: String,
        timestamp: u64,
    ) -> Option<(i128, i128, i128, String)> {
        let billing_key = (symbol_short!("BILLING"), meter_id, timestamp);
        env.storage().persistent().get(&billing_key)
    }

    // Oracle management functions (delegated to OracleManager)
    pub fn add_price_feed(env: Env, admin: Address, feed_id: String, price_feed: PriceFeed) {
        OracleManager::add_price_feed(env, admin, feed_id, price_feed);
    }

    pub fn update_price_feed(
        env: Env,
        feed_id: String,
        new_price: i128,
        timestamp: u64,
    ) -> Result<(), ContractError> {
        OracleManager::update_price_feed(env, feed_id, new_price, timestamp).map_err(Into::into)
    }

    pub fn get_price_feed(env: Env, feed_id: String) -> Option<PriceFeed> {
        OracleManager::get_price_feed(env, feed_id)
    }

    pub fn add_utility_rate(env: Env, admin: Address, rate_id: String, utility_rate: UtilityRate) {
        OracleManager::add_utility_rate(env, admin, rate_id, utility_rate);
    }

    pub fn update_utility_rate(
        env: Env,
        rate_id: String,
        new_rate: i128,
        timestamp: u64,
    ) -> Result<(), ContractError> {
        OracleManager::update_utility_rate(env, rate_id, new_rate, timestamp).map_err(Into::into)
    }

    pub fn get_utility_rate(env: Env, rate_id: String) -> Option<UtilityRate> {
        OracleManager::get_utility_rate(env, rate_id)
    }

    pub fn get_oracle_stats(env: Env) -> (oracle::OracleCost, oracle::OracleReliability, u32) {
        OracleManager::get_oracle_stats(env)
    }

    // === ORACLE FALLBACK MANAGEMENT (Issue #411) ===

    /// SECURITY (Issue #411): Set a manual price override for a feed.
    /// Admin-only emergency function. The override takes priority over
    /// both live and fallback prices.
    pub fn set_oracle_manual_override(
        env: Env,
        admin: Address,
        feed_id: String,
        price: i128,
        decimals: u32,
        expires_at: u64,
    ) {
        OracleManager::set_manual_override(env, admin, feed_id, price, decimals, expires_at);
    }

    /// SECURITY (Issue #411): Remove a manual price override.
    pub fn remove_oracle_manual_override(env: Env, admin: Address, feed_id: String) {
        OracleManager::remove_manual_override(env, admin, feed_id);
    }

    /// SECURITY (Issue #411): Check if the oracle circuit breaker is in fallback mode.
    /// Returns true if the circuit is OPEN (using cached/fallback prices).
    pub fn is_oracle_in_fallback_mode(env: Env) -> bool {
        OracleManager::is_fallback_mode(&env)
    }

    /// SECURITY (Issue #411): Get the current circuit breaker state.
    /// Returns (state, consecutive_failures, failure_threshold).
    /// state: 0=CLOSED, 1=OPEN, 2=HALF_OPEN
    pub fn get_circuit_breaker_status(env: Env) -> (u32, u32, u32) {
        let breaker = OracleManager::circuit_breaker_status(&env);
        (
            breaker.state,
            breaker.consecutive_failures,
            breaker.failure_threshold,
        )
    }

    pub fn should_update_oracles(env: Env) -> (bool, bool) {
        (
            OracleManager::should_update_price_feeds(env.clone()),
            OracleManager::should_update_utility_rates(env),
        )
    }

    // === MULTI-UTILITY FUNCTIONS ===

    // Initialize multi-utility system
    pub fn initialize_multi_utility(env: Env, admin: Address) {
        MultiUtilityManager::initialize(env, admin);
    }

    // Register utility provider
    pub fn register_utility_provider(
        env: Env,
        admin: Address,
        provider_id: String,
        name: String,
        provider_address: Address,
        utility_type: u32,
        region: String,
        license_number: String,
        contact_info: String,
    ) -> Result<(), ContractError> {
        MultiUtilityManager::register_provider(
            env,
            admin,
            provider_id,
            name,
            provider_address,
            utility_type,
            region,
            license_number,
            contact_info,
        )
        .map_err(Into::into)
    }

    // Add utility configuration
    pub fn add_utility_configuration(
        env: Env,
        admin: Address,
        config_id: String,
        request: UtilityConfigRequest,
    ) -> Result<(), ContractError> {
        MultiUtilityManager::add_utility_config(
            env,
            admin,
            config_id,
            request.utility_type,
            request.provider_id,
            request.region,
            request.base_rate,
            request.currency,
            request.decimals,
            request.billing_cycle_days,
            request.grace_period_days,
            request.minimum_payment,
            request.maximum_payment,
        )
        .map_err(Into::into)
    }

    // Register utility meter
    pub fn register_utility_meter(
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
    ) -> Result<(), ContractError> {
        MultiUtilityManager::register_meter(
            env,
            provider_address,
            meter_id,
            utility_type,
            provider_id,
            customer_address,
            location,
            meter_model,
            firmware_version,
            is_smart_meter,
        )
        .map_err(Into::into)
    }

    // Add utility fee
    pub fn add_utility_fee_structure(
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
    ) -> Result<(), ContractError> {
        MultiUtilityManager::add_utility_fee(
            env,
            admin,
            fee_id,
            utility_type,
            provider_id,
            fee_type,
            fee_amount,
            fee_percentage,
            is_percentage,
            description,
        )
        .map_err(Into::into)
    }

    // Enhanced multi-utility payment function
    pub fn pay_multi_utility_bill(
        env: Env,
        from: Address,
        token_address: Address,
        meter_id: String,
        consumption: i128,
        currency: String,
        apply_fees: bool,
    ) -> Result<(), ContractError> {
        // 1. Verify authorization
        from.require_auth();

        // SECURITY (Issue #414): Re-entrancy guard
        check_reentrancy(&env)?;

        // SECURITY (Issue #414): Validate meter_id
        validate_meter_id(&meter_id)?;

        // SECURITY (Issue #414): Validate currency
        validate_currency(&env, &currency)?;

        // SECURITY (Issue #414): Validate consumption
        if consumption <= 0 {
            return Err(ContractError::Failed);
        }
        if consumption > 1_000_000_000_000 {
            return Err(ContractError::Failed);
        }

        // SECURITY (Issue #414): Rate limiting
        check_rate_limit(&env, &meter_id)?;

        // 2. Get meter information
        let meter = MultiUtilityManager::get_meter(env.clone(), meter_id.clone())
            .ok_or("Meter not found")?;

        if !meter.is_active {
            return Err(ContractError::Failed);
        }

        // 3. Get utility configuration
        let config_id = join_strings(&env, &meter.provider_id, "_", &meter.region);
        let config = MultiUtilityManager::get_utility_config(env.clone(), config_id)
            .ok_or("Utility configuration not found")?;

        if !config.is_active {
            return Err(ContractError::Failed);
        }

        // 4. Calculate base amount with overflow protection
        let mut base_amount = consumption
            .checked_mul(config.base_rate)
            .ok_or("Integer overflow in base amount calculation")?;

        // 5. Apply tier rates if applicable
        for tier_rate in config.tier_rates.iter() {
            if consumption >= tier_rate.min_units && consumption <= tier_rate.max_units {
                base_amount = consumption
                    .checked_mul(tier_rate.rate_per_unit)
                    .ok_or("Integer overflow in tier rate calculation")?;
                break;
            }
        }

        // 6. Apply time-of-use rates if applicable
        let current_hour = ((env.ledger().timestamp() / 3600) % 24) as u32;
        let current_day_of_week = ((env.ledger().timestamp() / 86400) % 7) as u32;

        for tou_rate in config.time_of_use_rates.iter() {
            if current_hour >= tou_rate.start_hour
                && current_hour <= tou_rate.end_hour
                && tou_rate.days_of_week.contains(current_day_of_week)
            {
                base_amount = checked_mul_div(base_amount, tou_rate.rate_multiplier, 100)?;
                break;
            }
        }

        // 7. Apply taxes with overflow protection
        let mut tax_amount = 0i128;
        for tax in config.tax_rates.iter() {
            let tax_calc = checked_mul_div(base_amount, tax.rate_percentage, 100)?;
            tax_amount = tax_amount
                .checked_add(tax_calc)
                .ok_or("Integer overflow in tax calculation")?;
        }

        // 8. Apply fees if requested
        let mut fee_amount = 0i128;
        if apply_fees {
            fee_amount = 1000000; // 0.001 XLM default processing fee
        }

        // 9. Calculate final amount with overflow protection
        let subtotal = base_amount
            .checked_add(tax_amount)
            .ok_or("Integer overflow in subtotal calculation")?
            .checked_add(fee_amount)
            .ok_or("Integer overflow in subtotal calculation")?;

        // 10. Apply currency conversion if needed
        let mut final_amount = subtotal;
        if config.currency != currency {
            let exchange_rate_id = join_strings(&env, &config.currency, "_", &currency);

            let max_deviation = 20;
            let (price, decimals, _fallback) = OracleManager::get_price_with_fallback(
                env.clone(),
                exchange_rate_id,
                max_deviation,
            )?;

            let divisor = 10_i128.pow(decimals);
            final_amount = checked_mul_div(subtotal, price, divisor)?;
        }

        // 11. Validate payment limits
        if final_amount < config.minimum_payment {
            return Err(ContractError::Failed);
        }
        if final_amount > config.maximum_payment {
            return Err(ContractError::Failed);
        }

        validate_amount(final_amount)?;

        // 12. Process payment
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&from, &env.current_contract_address(), &final_amount);

        // 13. Update meter record with detailed billing information
        let billing_key = (
            symbol_short!("BILLING"),
            meter_id.clone(),
            env.ledger().timestamp(),
        );
        let billing_data = (
            consumption,
            base_amount,
            tax_amount,
            fee_amount,
            final_amount,
            meter.utility_type.to_u32(),
            config.version,
        );
        env.storage().persistent().set(&billing_key, &billing_data);

        // 14. Update provider transaction count
        let mut providers = env
            .storage()
            .persistent()
            .get::<Symbol, soroban_sdk::Map<String, multi_utility::UtilityProvider>>(
                &multi_utility::UTILITY_PROVIDERS,
            )
            .unwrap_or(soroban_sdk::Map::new(&env));

        if let Some(mut provider) = providers.get(meter.provider_id.clone()) {
            provider.total_transactions += 1;
            providers.set(meter.provider_id, provider);
            env.storage()
                .persistent()
                .set(&multi_utility::UTILITY_PROVIDERS, &providers);
        }

        // SECURITY (Issue #414): Emit payment event for audit trail
        env.events().publish(
            (symbol_short!("PAYMENT"), symbol_short!("MULTI")),
            (from, meter_id, final_amount, currency, consumption),
        );

        // SECURITY (Issue #414): Clear re-entrancy guard
        clear_reentrancy(&env);

        Ok(())
    }

    // Get utility provider
    pub fn get_utility_provider(env: Env, provider_id: String) -> Option<UtilityProvider> {
        MultiUtilityManager::get_provider(env, provider_id)
    }

    // Get utility configuration
    pub fn get_utility_configuration(env: Env, config_id: String) -> Option<UtilityConfig> {
        MultiUtilityManager::get_utility_config(env, config_id)
    }

    // Get utility meter
    pub fn get_utility_meter_info(env: Env, meter_id: String) -> Option<UtilityMeter> {
        MultiUtilityManager::get_meter(env, meter_id)
    }

    // Get utility fee
    pub fn get_utility_fee_info(env: Env, fee_id: String) -> Option<UtilityFee> {
        MultiUtilityManager::get_utility_fee(env, fee_id)
    }

    // List providers by type and region
    pub fn list_providers(
        env: Env,
        utility_type: u32,
        region: String,
    ) -> Result<Vec<UtilityProvider>, ContractError> {
        MultiUtilityManager::list_providers_by_type_and_region(env, utility_type, region)
            .map_err(Into::into)
    }

    // Update provider status
    pub fn update_provider_status(
        env: Env,
        admin: Address,
        provider_id: String,
        is_active: bool,
    ) -> Result<(), ContractError> {
        MultiUtilityManager::update_provider_status(env, admin, provider_id, is_active)
            .map_err(Into::into)
    }

    // Upgrade utility configuration
    pub fn upgrade_utility_configuration(
        env: Env,
        admin: Address,
        config_id: String,
        new_config: UtilityConfig,
    ) -> Result<(), ContractError> {
        MultiUtilityManager::upgrade_utility_config(env, admin, config_id, new_config)
            .map_err(Into::into)
    }

    // Validate utility type
    pub fn validate_utility_type(env: Env, utility_type: u32) -> Result<(), ContractError> {
        MultiUtilityManager::validate_utility_type(env, utility_type).map_err(Into::into)
    }

    // Get all utility types
    pub fn get_supported_utility_types(env: Env) -> soroban_sdk::Map<u32, String> {
        MultiUtilityManager::get_utility_types(env)
    }

    // === UPGRADE MANAGEMENT FUNCTIONS ===

    // Initialize upgrade systems
    pub fn initialize_upgrade_system(env: Env, admin: Address) {
        UpgradeProxy::initialize(env.clone(), admin.clone());
        VersionManager::initialize(env.clone(), admin.clone());
        DataMigration::initialize(env, admin);
    }

    // Upgrade contract to new version
    pub fn upgrade_contract(
        env: Env,
        admin: Address,
        new_implementation: Address,
        new_version: u32,
    ) -> Result<(), ContractError> {
        // Check if upgrade is safe
        let current_version = UpgradeProxy::get_version(env.clone());
        let is_safe = VersionManager::is_upgrade_safe(env.clone(), current_version, new_version)?;

        if !is_safe {
            return Err(ContractError::Failed);
        }

        // Backup data before upgrade
        DataMigration::backup_data(env.clone(), admin.clone())?;

        // Execute upgrade
        UpgradeProxy::upgrade(env.clone(), admin.clone(), new_implementation, new_version)?;

        // Execute data migration if needed
        let version_info = VersionManager::get_version_info(env.clone(), new_version);
        if let Some(info) = version_info {
            if info.migration_required {
                DataMigration::execute_migration(env.clone(), admin, current_version, new_version)?;
            }
        }

        Ok(())
    }

    // Register new contract version
    pub fn register_contract_version(
        env: Env,
        admin: Address,
        version: u32,
        implementation_address: Address,
        migration_required: bool,
        backward_compatible: bool,
    ) -> Result<(), ContractError> {
        VersionManager::register_version(
            env,
            admin,
            version,
            implementation_address,
            migration_required,
            backward_compatible,
        )
        .map_err(Into::into)
    }

    // Get current contract version
    pub fn get_contract_version(env: Env) -> u32 {
        UpgradeProxy::get_version(env)
    }

    // Get contract upgrade info
    pub fn get_upgrade_info(env: Env) -> (u32, Address, bool) {
        let version = UpgradeProxy::get_version(env.clone());
        let implementation = UpgradeProxy::get_implementation(env.clone());
        let admin = UpgradeProxy::get_admin(env.clone());
        (
            version,
            implementation,
            admin == env.current_contract_address(),
        )
    }

    // List all contract versions
    pub fn list_contract_versions(env: Env) -> soroban_sdk::Map<u32, ContractVersion> {
        VersionManager::list_versions(env)
    }

    // Check if upgrade is available
    pub fn is_upgrade_available(env: Env) -> bool {
        let current_version = UpgradeProxy::get_version(env.clone());
        if let Some(latest_version) = VersionManager::get_latest_version(env) {
            return latest_version > current_version;
        }
        false
    }

    // Get migration status
    pub fn get_migration_status(env: Env) -> (bool, Option<u32>) {
        let current_version = UpgradeProxy::get_version(env.clone());
        let version_info = VersionManager::get_version_info(env, current_version);

        match version_info {
            Some(info) => (info.migration_required, Some(info.version)),
            None => (false, None),
        }
    }
}
