#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Bytes, Env, Symbol};

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum NftError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    TokenNotFound = 4,
    ListingNotFound = 5,
    AuctionNotFound = 6,
    AuctionEnded = 7,
    AuctionNotEnded = 8,
    BidTooLow = 9,
    InvalidPrice = 10,
    NotOwner = 11,
    AlreadyListed = 12,
    InvalidRoyalty = 13,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NftToken {
    pub owner: Address,
    pub creator: Address,
    pub metadata_uri: Bytes,
    pub royalty_bps: u32, // royalty to creator on each sale
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Listing {
    pub token_id: u64,
    pub seller: Address,
    pub payment_token: Address,
    pub price: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Auction {
    pub token_id: u64,
    pub seller: Address,
    pub payment_token: Address,
    pub reserve_price: i128,
    pub highest_bid: i128,
    pub highest_bidder: Option<Address>,
    pub ends_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketplaceConfig {
    pub admin: Address,
    pub fee_bps: u32,
    pub fee_collector: Address,
}

const CONFIG: Symbol = symbol_short!("CONFIG");
const TOKEN_COUNT: Symbol = symbol_short!("TOK_CNT");
const TOKEN: Symbol = symbol_short!("TOKEN");
const LISTING: Symbol = symbol_short!("LISTING");
const AUCTION: Symbol = symbol_short!("AUCTION");

#[contract]
pub struct NftMarketplace;

#[contractimpl]
impl NftMarketplace {
    pub fn initialize(env: Env, admin: Address, fee_bps: u32, fee_collector: Address) -> Result<(), NftError> {
        if env.storage().instance().has(&CONFIG) {
            return Err(NftError::AlreadyInitialized);
        }
        if fee_bps > 10000 {
            return Err(NftError::InvalidPrice);
        }
        env.storage().instance().set(&CONFIG, &MarketplaceConfig { admin, fee_bps, fee_collector });
        env.storage().instance().set(&TOKEN_COUNT, &0u64);
        Ok(())
    }

    /// Mint a new NFT
    pub fn mint(env: Env, creator: Address, metadata_uri: Bytes, royalty_bps: u32) -> Result<u64, NftError> {
        creator.require_auth();
        if royalty_bps > 5000 {
            return Err(NftError::InvalidRoyalty);
        }
        let id: u64 = env.storage().instance().get(&TOKEN_COUNT).unwrap_or(0) + 1;
        let token = NftToken { owner: creator.clone(), creator, metadata_uri, royalty_bps };
        env.storage().instance().set(&(TOKEN, id), &token);
        env.storage().instance().set(&TOKEN_COUNT, &id);
        Ok(id)
    }

    /// Transfer NFT to another address
    pub fn transfer(env: Env, token_id: u64, to: Address) -> Result<(), NftError> {
        let mut nft: NftToken = env.storage().instance().get(&(TOKEN, token_id)).ok_or(NftError::TokenNotFound)?;
        nft.owner.require_auth();
        // Cannot transfer if listed or in auction
        if env.storage().instance().has(&(LISTING, token_id)) || env.storage().instance().has(&(AUCTION, token_id)) {
            return Err(NftError::AlreadyListed);
        }
        nft.owner = to;
        env.storage().instance().set(&(TOKEN, token_id), &nft);
        Ok(())
    }

    /// List NFT for fixed-price sale
    pub fn list(env: Env, token_id: u64, payment_token: Address, price: i128) -> Result<(), NftError> {
        if price <= 0 {
            return Err(NftError::InvalidPrice);
        }
        let nft: NftToken = env.storage().instance().get(&(TOKEN, token_id)).ok_or(NftError::TokenNotFound)?;
        nft.owner.require_auth();
        if env.storage().instance().has(&(LISTING, token_id)) || env.storage().instance().has(&(AUCTION, token_id)) {
            return Err(NftError::AlreadyListed);
        }
        env.storage().instance().set(&(LISTING, token_id), &Listing {
            token_id,
            seller: nft.owner,
            payment_token,
            price,
        });
        Ok(())
    }

    /// Cancel a fixed-price listing
    pub fn cancel_listing(env: Env, token_id: u64) -> Result<(), NftError> {
        let listing: Listing = env.storage().instance().get(&(LISTING, token_id)).ok_or(NftError::ListingNotFound)?;
        listing.seller.require_auth();
        env.storage().instance().remove(&(LISTING, token_id));
        Ok(())
    }

    /// Buy a listed NFT
    pub fn buy(env: Env, buyer: Address, token_id: u64) -> Result<(), NftError> {
        buyer.require_auth();
        let listing: Listing = env.storage().instance().get(&(LISTING, token_id)).ok_or(NftError::ListingNotFound)?;
        let config: MarketplaceConfig = env.storage().instance().get(&CONFIG).ok_or(NftError::NotInitialized)?;
        let mut nft: NftToken = env.storage().instance().get(&(TOKEN, token_id)).ok_or(NftError::TokenNotFound)?;

        Self::distribute_payment(&env, &listing.payment_token, &buyer, &listing.seller, &nft.creator, listing.price, nft.royalty_bps, config.fee_bps, &config.fee_collector)?;

        nft.owner = buyer;
        env.storage().instance().set(&(TOKEN, token_id), &nft);
        env.storage().instance().remove(&(LISTING, token_id));
        Ok(())
    }

    /// Start an auction
    pub fn start_auction(env: Env, token_id: u64, payment_token: Address, reserve_price: i128, duration: u64) -> Result<(), NftError> {
        if reserve_price <= 0 {
            return Err(NftError::InvalidPrice);
        }
        let nft: NftToken = env.storage().instance().get(&(TOKEN, token_id)).ok_or(NftError::TokenNotFound)?;
        nft.owner.require_auth();
        if env.storage().instance().has(&(LISTING, token_id)) || env.storage().instance().has(&(AUCTION, token_id)) {
            return Err(NftError::AlreadyListed);
        }
        env.storage().instance().set(&(AUCTION, token_id), &Auction {
            token_id,
            seller: nft.owner,
            payment_token,
            reserve_price,
            highest_bid: 0,
            highest_bidder: None,
            ends_at: env.ledger().timestamp() + duration,
        });
        Ok(())
    }

    /// Place a bid on an auction
    pub fn bid(env: Env, bidder: Address, token_id: u64, amount: i128) -> Result<(), NftError> {
        bidder.require_auth();
        let mut auction: Auction = env.storage().instance().get(&(AUCTION, token_id)).ok_or(NftError::AuctionNotFound)?;

        if env.ledger().timestamp() >= auction.ends_at {
            return Err(NftError::AuctionEnded);
        }
        if amount <= auction.highest_bid || amount < auction.reserve_price {
            return Err(NftError::BidTooLow);
        }

        let client = token::Client::new(&env, &auction.payment_token);

        // Refund previous highest bidder
        if let Some(ref prev_bidder) = auction.highest_bidder {
            client.transfer(&env.current_contract_address(), prev_bidder, &auction.highest_bid);
        }

        client.transfer(&bidder, &env.current_contract_address(), &amount);
        auction.highest_bid = amount;
        auction.highest_bidder = Some(bidder);
        env.storage().instance().set(&(AUCTION, token_id), &auction);
        Ok(())
    }

    /// Settle auction after it ends
    pub fn settle_auction(env: Env, token_id: u64) -> Result<(), NftError> {
        let auction: Auction = env.storage().instance().get(&(AUCTION, token_id)).ok_or(NftError::AuctionNotFound)?;
        if env.ledger().timestamp() < auction.ends_at {
            return Err(NftError::AuctionNotEnded);
        }

        let config: MarketplaceConfig = env.storage().instance().get(&CONFIG).ok_or(NftError::NotInitialized)?;
        let mut nft: NftToken = env.storage().instance().get(&(TOKEN, token_id)).ok_or(NftError::TokenNotFound)?;

        if let Some(ref winner) = auction.highest_bidder {
            Self::distribute_payment(&env, &auction.payment_token, &env.current_contract_address(), &auction.seller, &nft.creator, auction.highest_bid, nft.royalty_bps, config.fee_bps, &config.fee_collector)?;
            nft.owner = winner.clone();
            env.storage().instance().set(&(TOKEN, token_id), &nft);
        }
        // If no bids, NFT stays with seller

        env.storage().instance().remove(&(AUCTION, token_id));
        Ok(())
    }

    pub fn get_token(env: Env, token_id: u64) -> Result<NftToken, NftError> {
        env.storage().instance().get(&(TOKEN, token_id)).ok_or(NftError::TokenNotFound)
    }

    pub fn get_listing(env: Env, token_id: u64) -> Result<Listing, NftError> {
        env.storage().instance().get(&(LISTING, token_id)).ok_or(NftError::ListingNotFound)
    }

    pub fn get_auction(env: Env, token_id: u64) -> Result<Auction, NftError> {
        env.storage().instance().get(&(AUCTION, token_id)).ok_or(NftError::AuctionNotFound)
    }

    fn distribute_payment(
        env: &Env,
        payment_token: &Address,
        payer: &Address,
        seller: &Address,
        creator: &Address,
        amount: i128,
        royalty_bps: u32,
        fee_bps: u32,
        fee_collector: &Address,
    ) -> Result<(), NftError> {
        let client = token::Client::new(env, payment_token);
        let fee = amount * fee_bps as i128 / 10000;
        let royalty = amount * royalty_bps as i128 / 10000;
        let seller_amount = amount - fee - royalty;

        if fee > 0 {
            client.transfer(payer, fee_collector, &fee);
        }
        if royalty > 0 && creator != seller {
            client.transfer(payer, creator, &royalty);
        }
        client.transfer(payer, seller, &seller_amount);
        Ok(())
    }
}
