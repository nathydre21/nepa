use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token, Address, Env,
};

fn setup_contract_test() -> (Env, Address, NepaBillingContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, NepaBillingContract);
    let client = NepaBillingContractClient::new(&env, &contract_id);
    (env, contract_id, client)
}

fn in_contract<T>(env: &Env, contract_id: &Address, f: impl FnOnce() -> T) -> T {
    env.as_contract(contract_id, f)
}

fn create_test_address(env: &Env) -> Address {
    Address::generate(env)
}

fn set_ledger_timestamp(env: &Env, timestamp: u64) {
    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = timestamp;
    env.ledger().set(ledger_info);
}

fn setup_test_token(env: &Env, user: &Address, amount: i128) -> Address {
    let token_admin = create_test_address(env);
    let token_address = env.register_stellar_asset_contract(token_admin.clone());
    let token_client = token::StellarAssetClient::new(env, &token_address);
    token_client.mint(user, &amount);
    token_address
}

fn create_test_oracle_config() -> OracleConfig {
    OracleConfig {
        max_age_seconds: 300,
        min_reliability_score: 70,
        fallback_enabled: true,
        cost_limit_per_call: 1000000,
    }
}

fn create_test_price_feed(env: &Env, feed_address: Address) -> PriceFeed {
    PriceFeed {
        feed_address,
        base_asset: String::from_str(env, "ETH"),
        quote_asset: String::from_str(env, "USD"),
        decimals: 8,
        last_updated: 1640995200,
        price: 300000000000,
        reliability_score: 85,
    }
}

fn create_test_utility_rate(env: &Env) -> UtilityRate {
    UtilityRate {
        utility_type: String::from_str(env, "electricity"),
        rate_per_kwh: 120000,
        currency: String::from_str(env, "USD"),
        region: String::from_str(env, "LAGOS"),
        last_updated: 1640995200,
        reliability_score: 90,
    }
}

#[test]
fn test_oracle_initialization() {
    let (env, contract_id, _client) = setup_contract_test();
    let admin = create_test_address(&env);
    let config = create_test_oracle_config();

    in_contract(&env, &contract_id, || {
        OracleManager::initialize_oracle(env.clone(), admin.clone(), config.clone());

        let stored_config: OracleConfig = env
            .storage()
            .instance()
            .get(&symbol_short!("OR_CONF"))
            .unwrap();

        assert_eq!(stored_config.max_age_seconds, config.max_age_seconds);
        assert_eq!(
            stored_config.min_reliability_score,
            config.min_reliability_score
        );
        assert_eq!(stored_config.fallback_enabled, config.fallback_enabled);
        assert_eq!(
            stored_config.cost_limit_per_call,
            config.cost_limit_per_call
        );
    });
}

#[test]
fn test_add_and_get_price_feed() {
    let (env, contract_id, _client) = setup_contract_test();
    let admin = create_test_address(&env);
    let config = create_test_oracle_config();
    let feed_address = create_test_address(&env);
    let price_feed = create_test_price_feed(&env, feed_address.clone());
    let feed_id = String::from_str(&env, "ETH_USD");

    in_contract(&env, &contract_id, || {
        OracleManager::initialize_oracle(env.clone(), admin.clone(), config);
        OracleManager::add_price_feed(
            env.clone(),
            admin.clone(),
            feed_id.clone(),
            price_feed.clone(),
        );

        let retrieved_feed = OracleManager::get_price_feed(env.clone(), feed_id.clone()).unwrap();

        assert_eq!(retrieved_feed.base_asset, price_feed.base_asset);
        assert_eq!(retrieved_feed.quote_asset, price_feed.quote_asset);
        assert_eq!(retrieved_feed.price, price_feed.price);
        assert_eq!(retrieved_feed.decimals, price_feed.decimals);
    });
}

#[test]
fn test_update_price_feed() {
    let (env, contract_id, _client) = setup_contract_test();
    let admin = create_test_address(&env);
    let config = create_test_oracle_config();
    let feed_address = create_test_address(&env);
    let price_feed = create_test_price_feed(&env, feed_address.clone());
    let feed_id = String::from_str(&env, "ETH_USD");

    in_contract(&env, &contract_id, || {
        set_ledger_timestamp(&env, 1640995200);
        OracleManager::initialize_oracle(env.clone(), admin.clone(), config);
        OracleManager::add_price_feed(env.clone(), admin.clone(), feed_id.clone(), price_feed);

        let new_price = 350000000000;
        let new_timestamp = 1640995300;
        let result = OracleManager::update_price_feed(
            env.clone(),
            feed_id.clone(),
            new_price,
            new_timestamp,
        );
        assert!(result.is_ok());

        let updated_feed = OracleManager::get_price_feed(env.clone(), feed_id).unwrap();
        assert_eq!(updated_feed.price, new_price);
        assert_eq!(updated_feed.last_updated, new_timestamp);
    });
}

#[test]
fn test_price_feed_data_too_old() {
    let (env, contract_id, _client) = setup_contract_test();
    let admin = create_test_address(&env);
    let config = create_test_oracle_config();
    let feed_address = create_test_address(&env);
    let price_feed = create_test_price_feed(&env, feed_address.clone());
    let feed_id = String::from_str(&env, "ETH_USD");

    in_contract(&env, &contract_id, || {
        set_ledger_timestamp(&env, 1640995200);
        OracleManager::initialize_oracle(env.clone(), admin.clone(), config);
        OracleManager::add_price_feed(env.clone(), admin.clone(), feed_id.clone(), price_feed);

        let old_timestamp = 1640995200 - 1000;
        let result =
            OracleManager::update_price_feed(env.clone(), feed_id, 300000000000, old_timestamp);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), String::from_str(&env, "Data too old"));
    });
}

#[test]
fn test_add_and_get_utility_rate() {
    let (env, contract_id, _client) = setup_contract_test();
    let admin = create_test_address(&env);
    let config = create_test_oracle_config();
    let utility_rate = create_test_utility_rate(&env);
    let rate_id = String::from_str(&env, "electricity_LAGOS");

    in_contract(&env, &contract_id, || {
        OracleManager::initialize_oracle(env.clone(), admin.clone(), config);
        OracleManager::add_utility_rate(
            env.clone(),
            admin.clone(),
            rate_id.clone(),
            utility_rate.clone(),
        );

        let retrieved_rate = OracleManager::get_utility_rate(env.clone(), rate_id.clone()).unwrap();

        assert_eq!(retrieved_rate.utility_type, utility_rate.utility_type);
        assert_eq!(retrieved_rate.rate_per_kwh, utility_rate.rate_per_kwh);
        assert_eq!(retrieved_rate.currency, utility_rate.currency);
        assert_eq!(retrieved_rate.region, utility_rate.region);
    });
}

#[test]
fn test_update_utility_rate() {
    let (env, contract_id, _client) = setup_contract_test();
    let admin = create_test_address(&env);
    let config = create_test_oracle_config();
    let utility_rate = create_test_utility_rate(&env);
    let rate_id = String::from_str(&env, "electricity_LAGOS");

    in_contract(&env, &contract_id, || {
        OracleManager::initialize_oracle(env.clone(), admin.clone(), config);
        OracleManager::add_utility_rate(env.clone(), admin.clone(), rate_id.clone(), utility_rate);

        let new_rate = 150000;
        let new_timestamp = 1640995300;
        let result = OracleManager::update_utility_rate(
            env.clone(),
            rate_id.clone(),
            new_rate,
            new_timestamp,
        );
        assert!(result.is_ok());

        let updated_rate = OracleManager::get_utility_rate(env.clone(), rate_id).unwrap();
        assert_eq!(updated_rate.rate_per_kwh, new_rate);
        assert_eq!(updated_rate.last_updated, new_timestamp);
    });
}

#[test]
fn test_external_data_validation() {
    let (env, _contract_id, _client) = setup_contract_test();

    assert!(OracleManager::validate_external_data(
        env.clone(),
        300000000000,
        10000000000,
        1000000000000,
        8
    ));

    assert!(!OracleManager::validate_external_data(
        env.clone(),
        5000000000,
        10000000000,
        1000000000000,
        8
    ));

    assert!(!OracleManager::validate_external_data(
        env.clone(),
        2000000000000,
        10000000000,
        1000000000000,
        8
    ));

    assert!(OracleManager::validate_external_data(
        env.clone(),
        300000000123,
        10000000000,
        1000000000000,
        8
    ));
}

#[test]
fn test_fallback_price() {
    let (env, contract_id, _client) = setup_contract_test();
    let admin = create_test_address(&env);
    let config = OracleConfig {
        max_age_seconds: 300,
        min_reliability_score: 70,
        fallback_enabled: true,
        cost_limit_per_call: 1000000,
    };
    let feed_address = create_test_address(&env);
    let price_feed = create_test_price_feed(&env, feed_address.clone());
    let feed_id = String::from_str(&env, "ETH_USD");

    in_contract(&env, &contract_id, || {
        set_ledger_timestamp(&env, 1640995200);
        OracleManager::initialize_oracle(env.clone(), admin.clone(), config);
        OracleManager::add_price_feed(env.clone(), admin.clone(), feed_id.clone(), price_feed);

        let fallback_price = OracleManager::get_fallback_price(env.clone(), feed_id.clone());
        assert!(fallback_price.is_some());
        assert_eq!(fallback_price.unwrap(), 300000000000);

        let old_feed = PriceFeed {
            feed_address,
            base_asset: String::from_str(&env, "BTC"),
            quote_asset: String::from_str(&env, "USD"),
            decimals: 8,
            last_updated: 1640995200 - 1000,
            price: 50000000000,
            reliability_score: 85,
        };
        let old_feed_id = String::from_str(&env, "BTC_USD");
        OracleManager::add_price_feed(env.clone(), admin.clone(), old_feed_id.clone(), old_feed);

        let old_fallback_price = OracleManager::get_fallback_price(env.clone(), old_feed_id);
        assert!(old_fallback_price.is_none());
    });
}

#[test]
fn test_reliability_scoring() {
    let (env, contract_id, _client) = setup_contract_test();
    let admin = create_test_address(&env);
    let config = create_test_oracle_config();

    in_contract(&env, &contract_id, || {
        OracleManager::initialize_oracle(env.clone(), admin.clone(), config);

        let initial_score = OracleManager::get_reliability_score(env.clone());
        assert_eq!(initial_score, 50);

        for _ in 0..10 {
            OracleManager::update_reliability(env.clone(), true, 1000);
        }

        let good_score = OracleManager::get_reliability_score(env.clone());
        assert!(good_score > 80);

        for _ in 0..5 {
            OracleManager::update_reliability(env.clone(), false, 5000);
        }

        let mixed_score = OracleManager::get_reliability_score(env.clone());
        assert!(mixed_score < good_score);
        assert!(mixed_score > 40);
    });
}

#[test]
fn test_oracle_cost_tracking() {
    let (env, contract_id, _client) = setup_contract_test();
    let admin = create_test_address(&env);
    let config = create_test_oracle_config();

    in_contract(&env, &contract_id, || {
        OracleManager::initialize_oracle(env.clone(), admin.clone(), config);

        let result = OracleManager::track_oracle_cost(env.clone(), 500000);
        assert!(result.is_ok());

        let (cost, _, _) = OracleManager::get_oracle_stats(env.clone());
        assert_eq!(cost.total_spent, 500000);
        assert_eq!(cost.calls_made, 1);
        assert_eq!(cost.average_cost_per_call, 500000);

        let expensive_call = OracleManager::track_oracle_cost(env.clone(), 2000000);
        assert!(expensive_call.is_err());
        assert_eq!(
            expensive_call.unwrap_err(),
            String::from_str(&env, "Cost exceeds limit per call")
        );
    });
}

#[test]
fn test_update_scheduling() {
    let (env, contract_id, _client) = setup_contract_test();
    let admin = create_test_address(&env);
    let config = create_test_oracle_config();

    in_contract(&env, &contract_id, || {
        set_ledger_timestamp(&env, 1640995200);
        OracleManager::initialize_oracle(env.clone(), admin.clone(), config);

        assert!(OracleManager::should_update_price_feeds(env.clone()));
        assert!(OracleManager::should_update_utility_rates(env.clone()));

        OracleManager::mark_price_feeds_updated(env.clone());
        OracleManager::mark_utility_rates_updated(env.clone());

        assert!(!OracleManager::should_update_price_feeds(env.clone()));
        assert!(!OracleManager::should_update_utility_rates(env.clone()));
    });
}

#[test]
fn test_enhanced_billing_with_oracle() {
    let (env, contract_id, client) = setup_contract_test();
    let admin = create_test_address(&env);
    let user = create_test_address(&env);
    let token_address = setup_test_token(&env, &user, 1_000_000_000_000);
    let config = create_test_oracle_config();
    let feed_address = create_test_address(&env);
    let price_feed = create_test_price_feed(&env, feed_address.clone());
    let feed_id = String::from_str(&env, "NGN_USD");

    in_contract(&env, &contract_id, || {
        OracleManager::initialize_oracle(env.clone(), admin.clone(), config);
        OracleManager::add_price_feed(env.clone(), admin.clone(), feed_id, price_feed);
    });

    client.pay_bill_with_oracle(
        &user,
        &token_address,
        &String::from_str(&env, "meter123"),
        &100000000,
        &String::from_str(&env, "NGN"),
        &true,
    );
}

#[test]
fn test_utility_billing() {
    let (env, contract_id, client) = setup_contract_test();
    let admin = create_test_address(&env);
    let user = create_test_address(&env);
    let token_address = setup_test_token(&env, &user, 1_000_000_000_000);
    let config = create_test_oracle_config();
    let utility_rate = create_test_utility_rate(&env);
    let rate_id = String::from_str(&env, "electricity_LAGOS");

    in_contract(&env, &contract_id, || {
        OracleManager::initialize_oracle(env.clone(), admin.clone(), config);
        OracleManager::add_utility_rate(env.clone(), admin.clone(), rate_id, utility_rate);
    });

    client.pay_utility_bill(
        &user,
        &token_address,
        &String::from_str(&env, "meter456"),
        &50000,
        &String::from_str(&env, "electricity"),
        &String::from_str(&env, "LAGOS"),
        &String::from_str(&env, "USD"),
    );

    let details = client.get_billing_details(
        &String::from_str(&env, "meter456"),
        &env.ledger().timestamp(),
    );
    assert!(details.is_some());

    let (kwh, rate, _amount, utility_type) = details.unwrap();
    assert_eq!(kwh, 50000);
    assert_eq!(rate, 120000);
    assert_eq!(utility_type, String::from_str(&env, "electricity"));
}

#[test]
fn test_oracle_reliability_validation() {
    let (env, contract_id, client) = setup_contract_test();
    let admin = create_test_address(&env);
    let user = create_test_address(&env);
    let token_address = setup_test_token(&env, &user, 1_000_000_000_000);

    let config = OracleConfig {
        max_age_seconds: 300,
        min_reliability_score: 95,
        fallback_enabled: true,
        cost_limit_per_call: 1000000,
    };

    in_contract(&env, &contract_id, || {
        OracleManager::initialize_oracle(env.clone(), admin.clone(), config);
    });

    let result = client.try_pay_bill_with_oracle(
        &user,
        &token_address,
        &String::from_str(&env, "meter789"),
        &100000000,
        &String::from_str(&env, "NGN"),
        &true,
    );

    assert!(result.is_err() || result.unwrap().is_err());
}
