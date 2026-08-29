-- Database migration script for Browser-Bound OTP
-- 1. Create OtpChallengeStatus Enum
DO $$ BEGIN
  CREATE TYPE "OtpChallengeStatus" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. Alter otp_requests table to add challenge lifecycle tracking columns
ALTER TABLE "otp_requests" 
  ADD COLUMN IF NOT EXISTS "status" "OtpChallengeStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "delivery_method" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "verified_at" TIMESTAMPTZ;

-- Backfill existing data
UPDATE "otp_requests" SET "status" = 'VERIFIED' WHERE "verified" = true AND "status" = 'PENDING';
UPDATE "otp_requests" SET "status" = 'EXPIRED' WHERE "verified" = false AND "expiresAt" < NOW() AND "status" = 'PENDING';

-- 3. Create browser_credentials table
CREATE TABLE IF NOT EXISTS "browser_credentials" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "credential_hash" TEXT NOT NULL,
  "user_agent" TEXT,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "last_used_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "browser_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "browser_credentials_user_id_idx" ON "browser_credentials"("user_id");
CREATE INDEX IF NOT EXISTS "browser_credentials_phone_idx" ON "browser_credentials"("phone");
CREATE INDEX IF NOT EXISTS "browser_credentials_credential_hash_idx" ON "browser_credentials"("credential_hash");
