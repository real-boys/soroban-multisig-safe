#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, Address, Bytes, Env, Symbol, Vec};

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum OracleError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    FeedNotFound = 4,
    StalePrice = 5,
    InvalidPrice = 6,
    ProviderAlreadyExists = 7,
    ProviderNotFound = 8,
    InsufficientProviders = 9,
    DeviationTooHigh = 10,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PriceFeed {
    pub asset: Bytes,
    pub price: i128,       // price in smallest unit (e.g., 8 decimals)
    pub decimals: u32,
    pub updated_at: u64,
    pub max_staleness: u64, // seconds before price is considered stale
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OracleConfig {
    pub admin: Address,
    pub min_providers: u32,
    pub max_deviation_bps: u32, // max allowed deviation between providers
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProviderSubmission {
    pub provider: Address,
    pub price: i128,
    pub submitted_at: u64,
}

const CONFIG: Symbol = symbol_short!("CONFIG");
const PROVIDERS: Symbol = symbol_short!("PROVDRS");
const FEED: Symbol = symbol_short!("FEED");
const FALLBACK: Symbol = symbol_short!("FALLBACK");
const SUBMISSIONS: Symbol = symbol_short!("SUBMITS");

#[contract]
pub struct OracleContract;

#[contractimpl]
impl OracleContract {
    pub fn initialize(
        env: Env,
        admin: Address,
        min_providers: u32,
        max_deviation_bps: u32,
    ) -> Result<(), OracleError> {
        if env.storage().instance().has(&CONFIG) {
            return Err(OracleError::AlreadyInitialized);
        }
        let config = OracleConfig { admin, min_providers, max_deviation_bps };
        env.storage().instance().set(&CONFIG, &config);
        env.storage().instance().set(&PROVIDERS, &Vec::<Address>::new(&env));
        Ok(())
    }

    /// Admin adds a trusted price provider
    pub fn add_provider(env: Env, provider: Address) -> Result<(), OracleError> {
        let config: OracleConfig = env.storage().instance().get(&CONFIG).ok_or(OracleError::NotInitialized)?;
        config.admin.require_auth();

        let mut providers: Vec<Address> = env.storage().instance().get(&PROVIDERS).unwrap_or(Vec::new(&env));
        if providers.contains(&provider) {
            return Err(OracleError::ProviderAlreadyExists);
        }
        providers.push_back(provider);
        env.storage().instance().set(&PROVIDERS, &providers);
        Ok(())
    }

    /// Admin removes a provider
    pub fn remove_provider(env: Env, provider: Address) -> Result<(), OracleError> {
        let config: OracleConfig = env.storage().instance().get(&CONFIG).ok_or(OracleError::NotInitialized)?;
        config.admin.require_auth();

        let providers: Vec<Address> = env.storage().instance().get(&PROVIDERS).unwrap_or(Vec::new(&env));
        let mut new_providers = Vec::new(&env);
        let mut found = false;
        for p in providers.iter() {
            if p == provider {
                found = true;
            } else {
                new_providers.push_back(p);
            }
        }
        if !found {
            return Err(OracleError::ProviderNotFound);
        }
        env.storage().instance().set(&PROVIDERS, &new_providers);
        Ok(())
    }

    /// Provider submits a price for an asset; aggregates when min_providers threshold met
    pub fn submit_price(
        env: Env,
        provider: Address,
        asset: Bytes,
        price: i128,
        decimals: u32,
        max_staleness: u64,
    ) -> Result<(), OracleError> {
        provider.require_auth();
        if price <= 0 {
            return Err(OracleError::InvalidPrice);
        }

        let config: OracleConfig = env.storage().instance().get(&CONFIG).ok_or(OracleError::NotInitialized)?;
        let providers: Vec<Address> = env.storage().instance().get(&PROVIDERS).unwrap_or(Vec::new(&env));
        if !providers.contains(&provider) {
            return Err(OracleError::Unauthorized);
        }

        let sub_key = (SUBMISSIONS, asset.clone());
        let mut submissions: Vec<ProviderSubmission> = env.storage().instance().get(&sub_key).unwrap_or(Vec::new(&env));

        // Remove previous submission from same provider
        let mut filtered = Vec::new(&env);
        for s in submissions.iter() {
            if s.provider != provider {
                filtered.push_back(s);
            }
        }
        filtered.push_back(ProviderSubmission {
            provider,
            price,
            submitted_at: env.ledger().timestamp(),
        });
        env.storage().instance().set(&sub_key, &filtered);

        // Aggregate if enough providers
        if filtered.len() >= config.min_providers {
            let aggregated = Self::aggregate_price(&env, &filtered, config.max_deviation_bps)?;
            let feed = PriceFeed {
                asset: asset.clone(),
                price: aggregated,
                decimals,
                updated_at: env.ledger().timestamp(),
                max_staleness,
            };
            env.storage().instance().set(&(FEED, asset), &feed);
        }

        Ok(())
    }

    /// Set a fallback price (admin only) used when primary feed is stale
    pub fn set_fallback(env: Env, asset: Bytes, price: i128, decimals: u32) -> Result<(), OracleError> {
        let config: OracleConfig = env.storage().instance().get(&CONFIG).ok_or(OracleError::NotInitialized)?;
        config.admin.require_auth();
        if price <= 0 {
            return Err(OracleError::InvalidPrice);
        }
        let feed = PriceFeed {
            asset: asset.clone(),
            price,
            decimals,
            updated_at: env.ledger().timestamp(),
            max_staleness: u64::MAX,
        };
        env.storage().instance().set(&(FALLBACK, asset), &feed);
        Ok(())
    }

    /// Get latest price; falls back to fallback feed if primary is stale
    pub fn get_price(env: Env, asset: Bytes) -> Result<PriceFeed, OracleError> {
        let now = env.ledger().timestamp();

        if let Some(feed) = env.storage().instance().get::<_, PriceFeed>(&(FEED, asset.clone())) {
            if now - feed.updated_at <= feed.max_staleness {
                return Ok(feed);
            }
        }

        // Try fallback
        env.storage().instance()
            .get::<_, PriceFeed>(&(FALLBACK, asset))
            .ok_or(OracleError::FeedNotFound)
    }

    pub fn get_providers(env: Env) -> Vec<Address> {
        env.storage().instance().get(&PROVIDERS).unwrap_or(Vec::new(&env))
    }

    /// Median aggregation with deviation check
    fn aggregate_price(env: &Env, submissions: &Vec<ProviderSubmission>, max_deviation_bps: u32) -> Result<i128, OracleError> {
        let n = submissions.len() as usize;
        let mut prices: Vec<i128> = Vec::new(env);
        for s in submissions.iter() {
            prices.push_back(s.price);
        }

        // Bubble sort (small n expected)
        for i in 0..n {
            for j in 0..n - 1 - i {
                let a = prices.get(j as u32).unwrap();
                let b = prices.get(j as u32 + 1).unwrap();
                if a > b {
                    prices.set(j as u32, b);
                    prices.set(j as u32 + 1, a);
                }
            }
        }

        let median = prices.get(n as u32 / 2).unwrap();
        let min = prices.get(0).unwrap();
        let max = prices.get(n as u32 - 1).unwrap();

        // Check deviation: (max - min) / median <= max_deviation_bps / 10000
        if median > 0 && (max - min) * 10000 / median > max_deviation_bps as i128 {
            return Err(OracleError::DeviationTooHigh);
        }

        Ok(median)
    }
}
