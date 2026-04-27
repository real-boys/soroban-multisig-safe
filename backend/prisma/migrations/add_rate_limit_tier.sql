-- Add rateLimitTier column to users table
-- This migration adds support for user-based rate limiting tiers

-- Add the column with default value
ALTER TABLE "users" ADD COLUMN "rateLimitTier" TEXT NOT NULL DEFAULT 'FREE';

-- Add a check constraint to ensure valid tier values
ALTER TABLE "users" ADD CONSTRAINT "users_rateLimitTier_check" 
  CHECK ("rateLimitTier" IN ('FREE', 'BASIC', 'PREMIUM', 'ENTERPRISE'));

-- Create an index for faster tier lookups
CREATE INDEX "users_rateLimitTier_idx" ON "users"("rateLimitTier");

-- Optional: Update existing users to appropriate tiers based on some criteria
-- Example: Upgrade users with more than 5 wallets to BASIC tier
-- UPDATE "users" 
-- SET "rateLimitTier" = 'BASIC' 
-- WHERE id IN (
--   SELECT "ownerId" 
--   FROM "wallets" 
--   GROUP BY "ownerId" 
--   HAVING COUNT(*) > 5
-- );
