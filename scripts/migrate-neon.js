const { Pool } = require('pg');

async function migrate() {
  const connectionString =
    'postgresql://neondb_owner:npg_e3aiQzmZfV5d@ep-red-cell-amfjmvvf-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require';
  const pool = new Pool({ connectionString });
  console.log('Connecting to Neon Production Database...');

  // 1. Create Enum if not exists
  await pool.query(`
    DO $$ BEGIN
      CREATE TYPE "OtpChallengeStatus" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED', 'FAILED');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);
  console.log('1. OtpChallengeStatus Enum verified/created.');

  // 2. Add columns to otp_requests
  await pool.query(`
    ALTER TABLE "otp_requests" 
      ADD COLUMN IF NOT EXISTS "delivery_method" TEXT,
      ADD COLUMN IF NOT EXISTS "status" "OtpChallengeStatus" DEFAULT 'PENDING',
      ADD COLUMN IF NOT EXISTS "verified_at" TIMESTAMP(3);
  `);
  console.log('2. otp_requests columns verified/added.');

  // 3. Create browser_credentials table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "browser_credentials" (
      "id" TEXT NOT NULL,
      "user_id" TEXT NOT NULL,
      "phone" TEXT NOT NULL,
      "credential_hash" TEXT NOT NULL,
      "user_agent" TEXT,
      "expires_at" TIMESTAMP(3) NOT NULL,
      "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT "browser_credentials_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "browser_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "browser_credentials_user_id_idx" ON "browser_credentials"("user_id");
    CREATE INDEX IF NOT EXISTS "browser_credentials_phone_idx" ON "browser_credentials"("phone");
    CREATE INDEX IF NOT EXISTS "browser_credentials_credential_hash_idx" ON "browser_credentials"("credential_hash");
  `);
  console.log('3. browser_credentials table and indexes verified/created.');

  console.log('✅ Neon Database migration completed successfully!');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
