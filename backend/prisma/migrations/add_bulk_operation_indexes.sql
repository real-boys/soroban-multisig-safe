-- Add indexes for bulk operation performance optimization

-- Wallet indexes for bulk operations
CREATE INDEX IF NOT EXISTS idx_wallets_owner_id_created_at ON "wallets"("ownerId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_wallets_is_active_owner_id ON "wallets"("isActive", "ownerId");
CREATE INDEX IF NOT EXISTS idx_wallets_contract_address ON "wallets"("contractAddress");

-- Wallet owners indexes for bulk operations
CREATE INDEX IF NOT EXISTS idx_wallet_owners_wallet_id ON "wallet_owners"("walletId");
CREATE INDEX IF NOT EXISTS idx_wallet_owners_address ON "wallet_owners"("address");
CREATE INDEX IF NOT EXISTS idx_wallet_owners_wallet_id_address ON "wallet_owners"("walletId", "address");

-- Transaction indexes for bulk operations
CREATE INDEX IF NOT EXISTS idx_transactions_wallet_id_created_at ON "transactions"("walletId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_is_deleted_created_at ON "transactions"("isDeleted", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_executed_created_at ON "transactions"("executed", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_title_search ON "transactions" USING gin(to_tsvector('english', "title"));
CREATE INDEX IF NOT EXISTS idx_transactions_description_search ON "transactions" USING gin(to_tsvector('english', "description"));

-- Comment indexes for bulk operations
CREATE INDEX IF NOT EXISTS idx_comments_transaction_id_created_at ON "comments"("transactionId", "createdAt" ASC);
CREATE INDEX IF NOT EXISTS idx_comments_user_id_created_at ON "comments"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_comments_transaction_id_user_id ON "comments"("transactionId", "userId");

-- Signature indexes for bulk operations
CREATE INDEX IF NOT EXISTS idx_signatures_transaction_id_user_id ON "signatures"("transactionId", "userId");
CREATE INDEX IF NOT EXISTS idx_signatures_signer_address ON "signatures"("signerAddress");
CREATE INDEX IF NOT EXISTS idx_signatures_signed_at ON "signatures"("signedAt" DESC);

-- User indexes for bulk operations
CREATE INDEX IF NOT EXISTS idx_users_stellar_address ON "users"("stellarAddress");
CREATE INDEX IF NOT EXISTS idx_users_is_active_email ON "users"("isActive", "email");

-- Composite indexes for common bulk operation queries
CREATE INDEX IF NOT EXISTS idx_wallets_owner_active_created ON "wallets"("ownerId", "isActive", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet_deleted_executed ON "transactions"("walletId", "isDeleted", "executed");
CREATE INDEX IF NOT EXISTS idx_comments_transaction_user_created ON "comments"("transactionId", "userId", "createdAt" ASC);

-- Performance optimization indexes for large datasets
CREATE INDEX IF NOT EXISTS idx_transactions_created_at_brin ON "transactions" USING BRIN("createdAt");
CREATE INDEX IF NOT EXISTS idx_comments_created_at_brin ON "comments" USING BRIN("createdAt");
CREATE INDEX IF NOT EXISTS idx_signatures_signed_at_brin ON "signatures" USING BRIN("signedAt");

-- Partial indexes for better performance on filtered queries
CREATE INDEX IF NOT EXISTS idx_active_wallets ON "wallets"("ownerId", "createdAt" DESC) WHERE "isActive" = true;
CREATE INDEX IF NOT EXISTS idx_active_transactions ON "transactions"("walletId", "createdAt" DESC) WHERE "isDeleted" = false;
CREATE INDEX IF NOT EXISTS idx_pending_transactions ON "transactions"("walletId", "createdAt" DESC) WHERE "executed" = false AND "isDeleted" = false;
