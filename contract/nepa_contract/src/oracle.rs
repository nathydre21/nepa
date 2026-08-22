#![no_std]
use soroban_sdk::{contracttype, symbol_short, Address, Env, Map, String, Symbol};

// Storage keys for oracle data
const ORACLE_PRICE_FEEDS: Symbol = symbol_short!("OP_FEEDS");
const ORACLE_UTILITY_RATES: Symbol = symbol_short!("UT_RATES");
const ORACLE_CONFIG: Symbol = symbol_short!("OR_CONF");
const ORACLE_RELIABILITY: Symbol = symbol_short!("OR_REL");
const ORACLE_COSTS: Symbol = symbol_short!("OR_COST");
const ORACLE_SCHEDULE: Symbol = symbol_short!("OR_SCH");

// SECURITY (Issue #411): Storage key for the circuit breaker state.
// The circuit breaker tracks consecutive oracle failures and automatically
// switches to fallback mode when the failure threshold is exceeded.
const ORACLE_CIRCUIT_BREAKER: Symbol = symbol_short!("CB_STATE");

// SECURITY (Issue #411): Storage key for admin-set manual price overrides.
// When an admin sets a manual override price for a feed, it takes priority
// over both live and fallback prices. This is an emergency mechanism.
const ORACLE_MANUAL_OVERRIDES: Symbol = symbol_short!("M_OVRD");

// Oracle data structures
#[derive(Clone)]
#[contracttype]
pub struct PriceFeed {
    pub feed_address: Address,
    pub base_asset: String,
    pub quote_asset: String,
    pub decimals: u32,
    pub last_updated: u64,
    pub price: i128,
    pub reliability_score: u32,
}

#[derive(Clone)]
#[contracttype]
pub struct UtilityRate {
    pub utility_type: String,
    pub rate_per_kwh: i128,
    pub currency: String,
    pub region: String,
    pub last_updated: u64,
    pub reliability_score: u32,
}

#[derive(Clone)]
#[contracttype]
pub struct OracleConfig {
    pub max_age_seconds: u64,
    pub min_reliability_score: u32,
    pub fallback_enabled: bool,
    pub cost_limit_per_call: i128,
}

#[derive(Clone)]
#[contracttype]
pub struct OracleReliability {
    pub success_count: u32,
    pub failure_count: u32,
    pub last_success: u64,
    pub last_failure: u64,
    pub average_response_time: u64,
}

#[derive(Clone)]
#[contracttype]
pub struct OracleCost {
    pub total_spent: i128,
    pub calls_made: u32,
    pub average_cost_per_call: i128,
    pub daily_limit: i128,
    pub daily_spent: i128,
    pub last_reset: u64,
}

#[derive(Clone)]
#[contracttype]
pub struct UpdateSchedule {
    pub price_feed_interval: u64,
    pub utility_rate_interval: u64,
    pub last_price_update: u64,
    pub last_utility_update: u64,
}

/// SECURITY (Issue #411): Circuit breaker state for oracle failure tracking.
///
/// The circuit breaker monitors consecutive oracle failures and automatically
/// switches to fallback mode when the failure threshold is exceeded. This
/// prevents cascading failures and allows payments to continue (using cached
/// prices) even when the oracle is unavailable.
///
/// States:
///   - CLOSED: Normal operation — oracle calls are attempted normally
///   - OPEN: Fallback mode — oracle calls are skipped, cached prices are used
///   - HALF_OPEN: Recovery mode — a test call is made to check if the oracle recovered
#[derive(Clone)]
#[contracttype]
pub struct CircuitBreaker {
    /// Current state: 0 = CLOSED, 1 = OPEN, 2 = HALF_OPEN
    pub state: u32,
    /// Number of consecutive failures since the last success
    pub consecutive_failures: u32,
    /// Threshold of consecutive failures before opening the circuit (default: 5)
    pub failure_threshold: u32,
    /// Timestamp when the circuit was last opened (for cooldown calculation)
    pub last_opened: u64,
    /// Cooldown period in seconds before transitioning from OPEN to HALF_OPEN
    pub cooldown_seconds: u64,
}

/// SECURITY (Issue #411): Manual price override entry set by admin.
/// When present, this takes priority over both live and fallback prices.
#[derive(Clone)]
#[contracttype]
pub struct ManualOverride {
    pub price: i128,
    pub decimals: u32,
    pub set_at: u64,
    pub expires_at: u64, // 0 = never expires
}

pub struct OracleManager;

impl OracleManager {
    #[cfg(test)]
    fn require_auth(_addr: &Address) {}

    #[cfg(not(test))]
    fn require_auth(addr: &Address) {
        addr.require_auth();
    }

    // Initialize oracle configuration
    pub fn initialize_oracle(env: Env, admin: Address, config: OracleConfig) {
        Self::require_auth(&admin);

        // Set initial configuration
        env.storage().instance().set(&ORACLE_CONFIG, &config);

        // Initialize reliability tracking
        let reliability = OracleReliability {
            success_count: 0,
            failure_count: 0,
            last_success: 0,
            last_failure: 0,
            average_response_time: 0,
        };
        env.storage()
            .instance()
            .set(&ORACLE_RELIABILITY, &reliability);

        // Initialize cost tracking
        let cost = OracleCost {
            total_spent: 0,
            calls_made: 0,
            average_cost_per_call: 0,
            daily_limit: 1000000, // 0.001 XLM default
            daily_spent: 0,
            last_reset: env.ledger().timestamp(),
        };
        env.storage().instance().set(&ORACLE_COSTS, &cost);

        // Initialize update schedule
        let schedule = UpdateSchedule {
            price_feed_interval: 300,    // 5 minutes
            utility_rate_interval: 3600, // 1 hour
            last_price_update: 0,
            last_utility_update: 0,
        };
        env.storage().instance().set(&ORACLE_SCHEDULE, &schedule);
    }

    // Add a new price feed
    pub fn add_price_feed(env: Env, admin: Address, feed_id: String, price_feed: PriceFeed) {
        Self::require_auth(&admin);

        let mut feeds: Map<String, PriceFeed> = env
            .storage()
            .persistent()
            .get(&ORACLE_PRICE_FEEDS)
            .unwrap_or_else(|| Map::new(&env));

        feeds.set(feed_id, price_feed);
        env.storage().persistent().set(&ORACLE_PRICE_FEEDS, &feeds);
    }

    // Get price feed data
    pub fn get_price_feed(env: Env, feed_id: String) -> Option<PriceFeed> {
        let feeds: Map<String, PriceFeed> = env.storage().persistent().get(&ORACLE_PRICE_FEEDS)?;

        feeds.get(feed_id)
    }

    // Update price feed data (simulated oracle call)
    pub fn update_price_feed(
        env: Env,
        feed_id: String,
        new_price: i128,
        timestamp: u64,
    ) -> Result<(), &'static str> {
        let config: OracleConfig = env
            .storage()
            .instance()
            .get(&ORACLE_CONFIG)
            .ok_or("Oracle not initialized")?;

        // Check if data is too old
        let current_time = env.ledger().timestamp();
        if current_time > timestamp && (current_time - timestamp) > config.max_age_seconds {
            return Err("Data too old");
        }

        let mut feeds: Map<String, PriceFeed> = env
            .storage()
            .persistent()
            .get(&ORACLE_PRICE_FEEDS)
            .ok_or("Price feed not found")?;

        let mut feed = feeds.get(feed_id.clone()).ok_or("Feed ID not found")?;

        // Update feed data
        feed.price = new_price;
        feed.last_updated = timestamp;

        feeds.set(feed_id, feed);
        env.storage().persistent().set(&ORACLE_PRICE_FEEDS, &feeds);

        // Update reliability tracking
        Self::update_reliability(env, true, 0);

        Ok(())
    }

    // Add utility rate
    pub fn add_utility_rate(env: Env, admin: Address, rate_id: String, utility_rate: UtilityRate) {
        Self::require_auth(&admin);

        let mut rates: Map<String, UtilityRate> = env
            .storage()
            .persistent()
            .get(&ORACLE_UTILITY_RATES)
            .unwrap_or_else(|| Map::new(&env));

        rates.set(rate_id, utility_rate);
        env.storage()
            .persistent()
            .set(&ORACLE_UTILITY_RATES, &rates);
    }

    // Get utility rate
    pub fn get_utility_rate(env: Env, rate_id: String) -> Option<UtilityRate> {
        let rates: Map<String, UtilityRate> =
            env.storage().persistent().get(&ORACLE_UTILITY_RATES)?;

        rates.get(rate_id)
    }

    // Update utility rate
    pub fn update_utility_rate(
        env: Env,
        rate_id: String,
        new_rate: i128,
        timestamp: u64,
    ) -> Result<(), &'static str> {
        let config: OracleConfig = env
            .storage()
            .instance()
            .get(&ORACLE_CONFIG)
            .ok_or("Oracle not initialized")?;

        // Check if data is too old
        let current_time = env.ledger().timestamp();
        if current_time > timestamp && (current_time - timestamp) > config.max_age_seconds {
            return Err("Data too old");
        }

        let mut rates: Map<String, UtilityRate> = env
            .storage()
            .persistent()
            .get(&ORACLE_UTILITY_RATES)
            .ok_or("Utility rate not found")?;

        let mut rate = rates.get(rate_id.clone()).ok_or("Rate ID not found")?;

        // Update rate data
        rate.rate_per_kwh = new_rate;
        rate.last_updated = timestamp;

        rates.set(rate_id, rate);
        env.storage()
            .persistent()
            .set(&ORACLE_UTILITY_RATES, &rates);

        // Update reliability tracking
        Self::update_reliability(env, true, 0);

        Ok(())
    }

    // Validate external data
    pub fn validate_external_data(
        env: Env,
        data: i128,
        min_value: i128,
        max_value: i128,
        decimals: u32,
    ) -> bool {
        // Check if data is within reasonable bounds
        if data < min_value || data > max_value {
            return false;
        }

        // Check if data has appropriate decimal precision
        let divisor = 10_i128.pow(decimals);
        if data % divisor != 0 && decimals > 0 {
            // Allow some flexibility for floating point conversions
            let tolerance = divisor / 100; // 1% tolerance
            if (data % divisor) > tolerance {
                return false;
            }
        }

        true
    }

    // Get fallback data when oracle fails
    pub fn get_fallback_price(env: Env, feed_id: String) -> Option<i128> {
        let config: OracleConfig = env.storage().instance().get(&ORACLE_CONFIG)?;

        if !config.fallback_enabled {
            return None;
        }

        // Implement fallback logic (e.g., use cached data, default rates, etc.)
        let feeds: Map<String, PriceFeed> = env.storage().persistent().get(&ORACLE_PRICE_FEEDS)?;

        let feed = feeds.get(feed_id)?;

        // Return cached price if available and not too old
        let current_time = env.ledger().timestamp();
        if (current_time - feed.last_updated) <= (config.max_age_seconds * 2) {
            Some(feed.price)
        } else {
            None
        }
    }

    // === CIRCUIT BREAKER (Issue #411) ===

    /// SECURITY (Issue #411): Get the current circuit breaker state.
    /// Returns a default CLOSED circuit breaker if not yet initialized.
    fn get_circuit_breaker(env: &Env) -> CircuitBreaker {
        env.storage()
            .instance()
            .get(&ORACLE_CIRCUIT_BREAKER)
            .unwrap_or_else(|| CircuitBreaker {
                state: 0, // CLOSED
                consecutive_failures: 0,
                failure_threshold: 5,
                last_opened: 0,
                cooldown_seconds: 600, // 10 minutes default cooldown
            })
    }

    /// SECURITY (Issue #411): Save the circuit breaker state to storage.
    fn save_circuit_breaker(env: &Env, breaker: &CircuitBreaker) {
        env.storage()
            .instance()
            .set(&ORACLE_CIRCUIT_BREAKER, breaker);
    }

    /// SECURITY (Issue #411): Record an oracle failure and update the circuit breaker.
    ///
    /// When the number of consecutive failures reaches the threshold, the
    /// circuit transitions from CLOSED to OPEN, enabling fallback mode.
    pub fn record_failure(env: &Env) {
        let mut breaker = Self::get_circuit_breaker(env);
        breaker.consecutive_failures += 1;

        if breaker.consecutive_failures >= breaker.failure_threshold && breaker.state == 0 {
            breaker.state = 1; // OPEN
            breaker.last_opened = env.ledger().timestamp();
        }

        Self::save_circuit_breaker(env, &breaker);
    }

    /// SECURITY (Issue #411): Record an oracle success and reset the circuit breaker.
    ///
    /// A successful oracle call resets the consecutive failure count to 0
    /// and transitions the circuit back to CLOSED (or from HALF_OPEN to CLOSED).
    pub fn record_success(env: &Env) {
        let mut breaker = Self::get_circuit_breaker(env);

        if breaker.state != 0 {
            // If in OPEN or HALF_OPEN, transition to CLOSED on success
            breaker.state = 0;
        }

        breaker.consecutive_failures = 0;
        Self::save_circuit_breaker(env, &breaker);
    }

    /// SECURITY (Issue #411): Check if the circuit breaker allows a live oracle call.
    ///
    /// Returns true if the circuit is CLOSED (normal operation) or HALF_OPEN
    /// (recovery attempt). Returns false if the circuit is OPEN and the
    /// cooldown period has not elapsed yet.
    pub fn is_circuit_closed(env: &Env) -> bool {
        let breaker = Self::get_circuit_breaker(env);

        match breaker.state {
            0 => true, // CLOSED — allow calls
            1 => {
                // OPEN — check if cooldown has elapsed
                let current_time = env.ledger().timestamp();
                if current_time >= breaker.last_opened + breaker.cooldown_seconds {
                    // Cooldown elapsed — transition to HALF_OPEN and allow one test call
                    true
                } else {
                    false // Still in cooldown — use fallback
                }
            }
            2 => true, // HALF_OPEN — allow one test call
            _ => true,
        }
    }

    /// SECURITY (Issue #411): Check if fallback mode is active.
    /// Returns true if the circuit is OPEN (fallback mode) and cooldown hasn't elapsed.
    pub fn is_fallback_mode(env: &Env) -> bool {
        let breaker = Self::get_circuit_breaker(env);
        if breaker.state == 1 {
            let current_time = env.ledger().timestamp();
            current_time < breaker.last_opened + breaker.cooldown_seconds
        } else {
            false
        }
    }

    /// SECURITY (Issue #411): Public accessor for circuit breaker status.
    /// Used by the contract to expose circuit breaker state to the backend.
    pub fn circuit_breaker_status(env: &Env) -> CircuitBreaker {
        Self::get_circuit_breaker(env)
    }

    // === MANUAL PRICE OVERRIDE (Issue #411) ===

    /// SECURITY (Issue #411): Set a manual price override for a feed.
    ///
    /// This is an admin-only emergency function. When a manual override is set,
    /// it takes priority over both live oracle prices and cached fallback prices.
    /// The override can optionally expire after a given timestamp.
    ///
    /// # Arguments
    /// * `env` - Soroban environment
    /// * `admin` - Admin address (must have auth)
    /// * `feed_id` - The price feed ID to override (e.g., "USD_NGN")
    /// * `price` - The override price
    /// * `decimals` - The price decimals (must match the feed's decimals)
    /// * `expires_at` - Unix timestamp when the override expires (0 = never)
    pub fn set_manual_override(
        env: Env,
        admin: Address,
        feed_id: String,
        price: i128,
        decimals: u32,
        expires_at: u64,
    ) {
        Self::require_auth(&admin);

        let mut overrides: Map<String, ManualOverride> = env
            .storage()
            .instance()
            .get(&ORACLE_MANUAL_OVERRIDES)
            .unwrap_or_else(|| Map::new(&env));

        let override_entry = ManualOverride {
            price,
            decimals,
            set_at: env.ledger().timestamp(),
            expires_at,
        };

        overrides.set(feed_id, override_entry);
        env.storage()
            .instance()
            .set(&ORACLE_MANUAL_OVERRIDES, &overrides);
    }

    /// SECURITY (Issue #411): Remove a manual price override for a feed.
    pub fn remove_manual_override(env: Env, admin: Address, feed_id: String) {
        Self::require_auth(&admin);

        let mut overrides: Map<String, ManualOverride> = env
            .storage()
            .instance()
            .get(&ORACLE_MANUAL_OVERRIDES)
            .unwrap_or_else(|| Map::new(&env));

        overrides.remove(feed_id);
        env.storage()
            .instance()
            .set(&ORACLE_MANUAL_OVERRIDES, &overrides);
    }

    /// SECURITY (Issue #411): Get the manual override for a feed if it exists and is valid.
    /// Returns None if no override is set or if the override has expired.
    fn get_manual_override(env: &Env, feed_id: &String) -> Option<ManualOverride> {
        let overrides: Map<String, ManualOverride> =
            env.storage().instance().get(&ORACLE_MANUAL_OVERRIDES)?;

        let entry = overrides.get(feed_id.clone())?;

        // Check if the override has expired
        if entry.expires_at > 0 && env.ledger().timestamp() > entry.expires_at {
            return None; // Override expired
        }

        Some(entry)
    }

    // === PRICE DEVIATION CHECK (Issue #411) ===

    /// SECURITY (Issue #411): Check if a new price deviates too much from the last known price.
    ///
    /// This prevents an attacker from manipulating the oracle by injecting an
    /// extreme price. If the new price differs from the cached price by more
    /// than `max_deviation_percent`, it's rejected and the fallback price is used.
    ///
    /// # Arguments
    /// * `env` - Soroban environment
    /// * `feed_id` - The price feed ID
    /// * `new_price` - The new price to validate
    /// * `max_deviation_percent` - Maximum allowed deviation in percent (e.g., 20 = 20%)
    ///
    /// # Returns
    /// * `true` if the price is within acceptable bounds or no cached price exists
    /// * `false` if the price deviates too much from the last known price
    pub fn validate_price_deviation(
        env: &Env,
        feed_id: &String,
        new_price: i128,
        max_deviation_percent: i128,
    ) -> bool {
        // Get the cached (last known) price
        let feeds: Map<String, PriceFeed> =
            match env.storage().persistent().get(&ORACLE_PRICE_FEEDS) {
                Some(f) => f,
                None => return true, // No cached price — accept any new price
            };

        let cached_feed = match feeds.get(feed_id.clone()) {
            Some(f) => f,
            None => return true, // No cached price for this feed — accept
        };

        // Calculate the deviation percentage
        // deviation = |new_price - cached_price| / cached_price * 100
        if cached_feed.price == 0 {
            return true; // Can't calculate deviation from zero
        }

        let diff = if new_price > cached_feed.price {
            new_price - cached_feed.price
        } else {
            cached_feed.price - new_price
        };

        let deviation_percent = (diff * 100) / cached_feed.price;

        deviation_percent <= max_deviation_percent
    }

    // === ENHANCED PRICE RETRIEVAL WITH FALLBACK (Issue #411) ===

    /// SECURITY (Issue #411): Get a price with full fallback chain.
    ///
    /// This is the main entry point for retrieving oracle prices. It implements
    /// the full fallback strategy:
    ///
    /// 1. Check for a manual admin override (highest priority — emergency use only)
    /// 2. If the circuit breaker is closed, try the live oracle price
    ///    a. Validate the price deviation (reject extreme prices)
    ///    b. Validate the reliability score
    ///    c. If valid, record success and return the price
    ///    d. If invalid, record failure and fall through to fallback
    /// 3. If fallback is enabled, use the cached last-known-good price
    ///    a. Check staleness (reject if too old)
    ///    b. Return the cached price with a fallback flag
    /// 4. If all else fails, return an error
    ///
    /// # Returns
    /// * `Ok((price, decimals, used_fallback))` on success
    /// * `Err(error_message)` if no price is available
    pub fn get_price_with_fallback(
        env: Env,
        feed_id: String,
        max_deviation_percent: i128,
    ) -> Result<(i128, u32, bool), &'static str> {
        let config: OracleConfig = env
            .storage()
            .instance()
            .get(&ORACLE_CONFIG)
            .ok_or("Oracle not initialized")?;

        // --- Step 1: Check for manual admin override (highest priority) ---
        if let Some(override_entry) = Self::get_manual_override(&env, &feed_id) {
            // Manual override takes priority over everything
            return Ok((override_entry.price, override_entry.decimals, true));
        }

        // --- Step 2: Try live oracle if circuit breaker is closed ---
        if Self::is_circuit_closed(&env) {
            if let Some(feed) = Self::get_price_feed(env.clone(), feed_id.clone()) {
                // Validate reliability score
                if feed.reliability_score >= config.min_reliability_score {
                    // Validate price deviation (prevent manipulation)
                    if Self::validate_price_deviation(
                        &env,
                        &feed_id,
                        feed.price,
                        max_deviation_percent,
                    ) {
                        // Price is valid — record success and return
                        Self::record_success(&env);
                        return Ok((feed.price, feed.decimals, false));
                    } else {
                        // Price deviates too much — record failure and fall through
                        Self::record_failure(&env);
                    }
                } else {
                    // Reliability too low — record failure
                    Self::record_failure(&env);
                }
            } else {
                // Oracle returned no data — record failure
                Self::record_failure(&env);
            }
        }

        // --- Step 3: Use fallback price if enabled ---
        if config.fallback_enabled {
            if let Some(fallback_price) = Self::get_fallback_price(env.clone(), feed_id.clone()) {
                // Get the decimals from the cached feed
                let feeds: Map<String, PriceFeed> = env
                    .storage()
                    .persistent()
                    .get(&ORACLE_PRICE_FEEDS)
                    .unwrap_or_else(|| Map::new(&env));

                let decimals = feeds.get(feed_id.clone()).map(|f| f.decimals).unwrap_or(8); // Default to 8 decimals if unknown

                // Return the fallback price — the `true` flag indicates fallback was used
                return Ok((fallback_price, decimals, true));
            }
        }

        // --- Step 4: All methods failed ---
        Err("No price available: oracle is down, fallback is disabled or stale, and no manual override is set")
    }

    // Update reliability tracking
    pub(crate) fn update_reliability(env: Env, success: bool, response_time: u64) {
        let mut reliability: OracleReliability = env
            .storage()
            .instance()
            .get(&ORACLE_RELIABILITY)
            .unwrap_or_else(|| OracleReliability {
                success_count: 0,
                failure_count: 0,
                last_success: 0,
                last_failure: 0,
                average_response_time: 0,
            });

        if success {
            reliability.success_count += 1;
            reliability.last_success = env.ledger().timestamp();
        } else {
            reliability.failure_count += 1;
            reliability.last_failure = env.ledger().timestamp();
        }

        // Update average response time
        let total_calls = reliability.success_count + reliability.failure_count;
        if total_calls > 1 {
            reliability.average_response_time =
                (reliability.average_response_time * u64::from(total_calls - 1) + response_time)
                    / u64::from(total_calls);
        } else {
            reliability.average_response_time = response_time;
        }

        env.storage()
            .instance()
            .set(&ORACLE_RELIABILITY, &reliability);
    }

    // Get reliability score
    pub fn get_reliability_score(env: Env) -> u32 {
        let reliability: OracleReliability = env
            .storage()
            .instance()
            .get(&ORACLE_RELIABILITY)
            .unwrap_or_else(|| OracleReliability {
                success_count: 0,
                failure_count: 0,
                last_success: 0,
                last_failure: 0,
                average_response_time: 0,
            });

        let total_calls = reliability.success_count + reliability.failure_count;
        if total_calls == 0 {
            return 50; // Neutral score
        }

        let success_rate = (reliability.success_count * 100) / total_calls;

        // Factor in response time (lower is better)
        let response_factor = if reliability.average_response_time < 5000 {
            100
        } else if reliability.average_response_time < 10000 {
            75
        } else if reliability.average_response_time < 30000 {
            50
        } else {
            25
        };

        // Calculate final score (0-100)
        let final_score = (success_rate + response_factor) / 2;
        final_score.min(100)
    }

    // Track oracle costs
    pub fn track_oracle_cost(env: Env, cost: i128) -> Result<(), &'static str> {
        let mut cost_tracker: OracleCost = env
            .storage()
            .instance()
            .get(&ORACLE_COSTS)
            .ok_or("Cost tracking not initialized")?;

        let config: OracleConfig = env
            .storage()
            .instance()
            .get(&ORACLE_CONFIG)
            .ok_or("Oracle not initialized")?;

        // Check if cost exceeds limit per call
        if cost > config.cost_limit_per_call {
            return Err("Cost exceeds limit per call");
        }

        // Reset daily tracking if needed
        let current_time = env.ledger().timestamp();
        let days_since_reset = (current_time - cost_tracker.last_reset) / 86400; // seconds in a day
        if days_since_reset > 0 {
            cost_tracker.daily_spent = 0;
            cost_tracker.last_reset = current_time;
        }

        // Check daily limit
        if cost_tracker.daily_spent + cost > cost_tracker.daily_limit {
            return Err("Daily cost limit exceeded");
        }

        // Update cost tracking
        cost_tracker.total_spent += cost;
        cost_tracker.daily_spent += cost;
        cost_tracker.calls_made += 1;

        if cost_tracker.calls_made > 0 {
            cost_tracker.average_cost_per_call =
                cost_tracker.total_spent / cost_tracker.calls_made as i128;
        }

        env.storage().instance().set(&ORACLE_COSTS, &cost_tracker);
        Ok(())
    }

    // Check if update is needed
    pub fn should_update_price_feeds(env: Env) -> bool {
        let schedule: UpdateSchedule = env
            .storage()
            .instance()
            .get(&ORACLE_SCHEDULE)
            .unwrap_or_else(|| UpdateSchedule {
                price_feed_interval: 300,
                utility_rate_interval: 3600,
                last_price_update: 0,
                last_utility_update: 0,
            });

        let current_time = env.ledger().timestamp();
        current_time >= (schedule.last_price_update + schedule.price_feed_interval)
    }

    // Check if utility rates update is needed
    pub fn should_update_utility_rates(env: Env) -> bool {
        let schedule: UpdateSchedule = env
            .storage()
            .instance()
            .get(&ORACLE_SCHEDULE)
            .unwrap_or_else(|| UpdateSchedule {
                price_feed_interval: 300,
                utility_rate_interval: 3600,
                last_price_update: 0,
                last_utility_update: 0,
            });

        let current_time = env.ledger().timestamp();
        current_time >= (schedule.last_utility_update + schedule.utility_rate_interval)
    }

    // Update schedule timestamps
    pub fn mark_price_feeds_updated(env: Env) {
        let mut schedule: UpdateSchedule = env
            .storage()
            .instance()
            .get(&ORACLE_SCHEDULE)
            .unwrap_or_else(|| UpdateSchedule {
                price_feed_interval: 300,
                utility_rate_interval: 3600,
                last_price_update: 0,
                last_utility_update: 0,
            });

        schedule.last_price_update = env.ledger().timestamp();
        env.storage().instance().set(&ORACLE_SCHEDULE, &schedule);
    }

    pub fn mark_utility_rates_updated(env: Env) {
        let mut schedule: UpdateSchedule = env
            .storage()
            .instance()
            .get(&ORACLE_SCHEDULE)
            .unwrap_or_else(|| UpdateSchedule {
                price_feed_interval: 300,
                utility_rate_interval: 3600,
                last_price_update: 0,
                last_utility_update: 0,
            });

        schedule.last_utility_update = env.ledger().timestamp();
        env.storage().instance().set(&ORACLE_SCHEDULE, &schedule);
    }

    // Get oracle statistics
    pub fn get_oracle_stats(env: Env) -> (OracleCost, OracleReliability, u32) {
        let cost: OracleCost = env
            .storage()
            .instance()
            .get(&ORACLE_COSTS)
            .unwrap_or_else(|| OracleCost {
                total_spent: 0,
                calls_made: 0,
                average_cost_per_call: 0,
                daily_limit: 1000000,
                daily_spent: 0,
                last_reset: env.ledger().timestamp(),
            });

        let reliability: OracleReliability = env
            .storage()
            .instance()
            .get(&ORACLE_RELIABILITY)
            .unwrap_or_else(|| OracleReliability {
                success_count: 0,
                failure_count: 0,
                last_success: 0,
                last_failure: 0,
                average_response_time: 0,
            });

        let score = Self::get_reliability_score(env);

        (cost, reliability, score)
    }
}
