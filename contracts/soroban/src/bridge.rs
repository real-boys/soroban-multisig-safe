#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Bytes, Env, Symbol, Vec};

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BridgeError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
    TransferNotFound = 5,
    AlreadyProcessed = 6,
    ValidatorAlreadyExists = 7,
    ValidatorNotFound = 8,
    InsufficientValidations = 9,
    TransferExpired = 10,
    ChainNotSupported = 11,
    AlreadyValidated = 12,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TransferStatus {
    Pending,
    Validated,
    Released,
    Expired,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OutboundTransfer {
    pub id: u64,
    pub sender: Address,
    pub token: Address,
    pub amount: i128,
    pub fee: i128,
    pub dest_chain: Bytes,
    pub dest_address: Bytes,
    pub created_at: u64,
    pub expires_at: u64,
    pub status: TransferStatus,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BridgeConfig {
    pub admin: Address,
    pub fee_bps: u32,
    pub fee_collector: Address,
    pub min_validators: u32,
    pub transfer_timeout: u64,
}

const CONFIG: Symbol = symbol_short!("CONFIG");
const VALIDATORS: Symbol = symbol_short!("VALIDTRS");
const CHAINS: Symbol = symbol_short!("CHAINS");
const TX_COUNT: Symbol = symbol_short!("TX_COUNT");
const TRANSFER: Symbol = symbol_short!("TRANSFER");
const VALIDATED_BY: Symbol = symbol_short!("VAL_BY");

#[contract]
pub struct CrossChainBridge;

#[contractimpl]
impl CrossChainBridge {
    pub fn initialize(
        env: Env,
        admin: Address,
        fee_bps: u32,
        fee_collector: Address,
        min_validators: u32,
        transfer_timeout: u64,
    ) -> Result<(), BridgeError> {
        if env.storage().instance().has(&CONFIG) {
            return Err(BridgeError::AlreadyInitialized);
        }
        env.storage().instance().set(&CONFIG, &BridgeConfig {
            admin,
            fee_bps,
            fee_collector,
            min_validators,
            transfer_timeout,
        });
        env.storage().instance().set(&TX_COUNT, &0u64);
        env.storage().instance().set(&VALIDATORS, &Vec::<Address>::new(&env));
        env.storage().instance().set(&CHAINS, &Vec::<Bytes>::new(&env));
        Ok(())
    }

    pub fn add_validator(env: Env, validator: Address) -> Result<(), BridgeError> {
        let config: BridgeConfig = env.storage().instance().get(&CONFIG).ok_or(BridgeError::NotInitialized)?;
        config.admin.require_auth();
        let mut validators: Vec<Address> = env.storage().instance().get(&VALIDATORS).unwrap_or(Vec::new(&env));
        if validators.contains(&validator) {
            return Err(BridgeError::ValidatorAlreadyExists);
        }
        validators.push_back(validator);
        env.storage().instance().set(&VALIDATORS, &validators);
        Ok(())
    }

    pub fn remove_validator(env: Env, validator: Address) -> Result<(), BridgeError> {
        let config: BridgeConfig = env.storage().instance().get(&CONFIG).ok_or(BridgeError::NotInitialized)?;
        config.admin.require_auth();
        let validators: Vec<Address> = env.storage().instance().get(&VALIDATORS).unwrap_or(Vec::new(&env));
        let mut new_validators = Vec::new(&env);
        let mut found = false;
        for v in validators.iter() {
            if v == validator { found = true; } else { new_validators.push_back(v); }
        }
        if !found { return Err(BridgeError::ValidatorNotFound); }
        env.storage().instance().set(&VALIDATORS, &new_validators);
        Ok(())
    }

    pub fn add_supported_chain(env: Env, chain_id: Bytes) -> Result<(), BridgeError> {
        let config: BridgeConfig = env.storage().instance().get(&CONFIG).ok_or(BridgeError::NotInitialized)?;
        config.admin.require_auth();
        let mut chains: Vec<Bytes> = env.storage().instance().get(&CHAINS).unwrap_or(Vec::new(&env));
        chains.push_back(chain_id);
        env.storage().instance().set(&CHAINS, &chains);
        Ok(())
    }

    /// Lock tokens on Stellar side to initiate cross-chain transfer
    pub fn lock(
        env: Env,
        sender: Address,
        token: Address,
        amount: i128,
        dest_chain: Bytes,
        dest_address: Bytes,
    ) -> Result<u64, BridgeError> {
        sender.require_auth();
        if amount <= 0 {
            return Err(BridgeError::InvalidAmount);
        }
        let config: BridgeConfig = env.storage().instance().get(&CONFIG).ok_or(BridgeError::NotInitialized)?;

        // Validate destination chain
        let chains: Vec<Bytes> = env.storage().instance().get(&CHAINS).unwrap_or(Vec::new(&env));
        if !chains.contains(&dest_chain) {
            return Err(BridgeError::ChainNotSupported);
        }

        let fee = amount * config.fee_bps as i128 / 10000;
        let net = amount - fee;

        token::Client::new(&env, &token).transfer(&sender, &env.current_contract_address(), &amount);

        if fee > 0 {
            token::Client::new(&env, &token)
                .transfer(&env.current_contract_address(), &config.fee_collector, &fee);
        }

        let id: u64 = env.storage().instance().get(&TX_COUNT).unwrap_or(0) + 1;
        let now = env.ledger().timestamp();

        env.storage().instance().set(&TRANSFER, &OutboundTransfer {
            id,
            sender,
            token,
            amount: net,
            fee,
            dest_chain,
            dest_address,
            created_at: now,
            expires_at: now + config.transfer_timeout,
            status: TransferStatus::Pending,
        });
        env.storage().instance().set(&TX_COUNT, &id);
        Ok(id)
    }

    /// Validator confirms an inbound transfer from another chain; releases tokens when threshold met
    pub fn validate_inbound(
        env: Env,
        validator: Address,
        transfer_id: u64,
        recipient: Address,
        token: Address,
        amount: i128,
    ) -> Result<bool, BridgeError> {
        validator.require_auth();
        let config: BridgeConfig = env.storage().instance().get(&CONFIG).ok_or(BridgeError::NotInitialized)?;

        let validators: Vec<Address> = env.storage().instance().get(&VALIDATORS).unwrap_or(Vec::new(&env));
        if !validators.contains(&validator) {
            return Err(BridgeError::Unauthorized);
        }

        let val_key = (VALIDATED_BY, transfer_id, validator.clone());
        if env.storage().instance().has(&val_key) {
            return Err(BridgeError::AlreadyValidated);
        }
        env.storage().instance().set(&val_key, &true);

        // Count validations
        let count_key = (TRANSFER, transfer_id);
        let count: u32 = env.storage().instance().get(&count_key).unwrap_or(0) + 1;
        env.storage().instance().set(&count_key, &count);

        if count >= config.min_validators {
            // Release tokens to recipient
            token::Client::new(&env, &token)
                .transfer(&env.current_contract_address(), &recipient, &amount);
            return Ok(true);
        }

        Ok(false)
    }

    /// Reclaim locked tokens if transfer expired without validation
    pub fn reclaim_expired(env: Env, transfer_id: u64) -> Result<(), BridgeError> {
        let mut transfer: OutboundTransfer = env.storage().instance().get(&TRANSFER).ok_or(BridgeError::TransferNotFound)?;
        if transfer.id != transfer_id {
            return Err(BridgeError::TransferNotFound);
        }
        transfer.sender.require_auth();
        if env.ledger().timestamp() < transfer.expires_at {
            return Err(BridgeError::TransferExpired);
        }
        if matches!(transfer.status, TransferStatus::Released) {
            return Err(BridgeError::AlreadyProcessed);
        }

        token::Client::new(&env, &transfer.token)
            .transfer(&env.current_contract_address(), &transfer.sender, &transfer.amount);

        transfer.status = TransferStatus::Expired;
        env.storage().instance().set(&TRANSFER, &transfer);
        Ok(())
    }

    pub fn get_transfer(env: Env, transfer_id: u64) -> Result<OutboundTransfer, BridgeError> {
        let transfer: OutboundTransfer = env.storage().instance().get(&TRANSFER).ok_or(BridgeError::TransferNotFound)?;
        if transfer.id != transfer_id {
            return Err(BridgeError::TransferNotFound);
        }
        Ok(transfer)
    }

    pub fn get_validators(env: Env) -> Vec<Address> {
        env.storage().instance().get(&VALIDATORS).unwrap_or(Vec::new(&env))
    }
}
