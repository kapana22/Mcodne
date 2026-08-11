-- B2B: companies with a prepaid balance.  2026-08-11
--
-- WHY THIS IS HAND-WRITTEN. Same reason as 2026-08-10-category-hierarchy: this
-- project has no prisma/migrations history — the schema is applied with
-- `prisma db push` and the DDL that has to reach production runs from inside
-- the app process (lib/dbBoot.ts), because Railway's builder cannot reach the
-- database. So a migration here is a reviewed pair of scripts with a real down.
--
-- Run:
--   npx prisma db execute --file prisma/manual-migrations/2026-08-11-b2b/up.sql \
--     --schema prisma/schema.prisma
--
-- YOU DO NOT NORMALLY NEED TO RUN IT. lib/dbBoot.ts carries the same statements
-- and applies them on the first request after deploy. This file exists so the
-- change is reviewable as one document, so it can be applied to a database that
-- is not running the app (a restored dump, a local copy), and — the real
-- reason — so `down.sql` next to it is written before the change ships rather
-- than improvised during an incident.
--
-- NOTHING EXISTING IS TOUCHED. Four new tables, four new enum types, and ONE
-- new nullable column on "Booking". No existing column is altered, dropped or
-- backfilled; no existing row is written to. Running this against production
-- while the site is serving changes nothing a user can see: `B2B_VISIBILITY`
-- is 'off' in lib/flags.ts, so no code path reads any of it.
--
-- Every statement is IF NOT EXISTS / duplicate-tolerant, so re-running is a
-- no-op and this file can race lib/dbBoot without either one failing.

BEGIN;

-- 1. the vocabularies ---------------------------------------------------------
-- CREATE TYPE has no IF NOT EXISTS, hence the DO block. Same shape as the
-- "CategoryStatus" block in the 2026-08-10 migration.

DO $$ BEGIN
  CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CompanyMemberRole" AS ENUM ('OWNER', 'MEMBER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CompanyTransactionType" AS ENUM ('TOPUP', 'CHARGE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentSource" AS ENUM ('CARD', 'COMPANY_BALANCE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BusinessLeadStatus" AS ENUM ('NEW', 'CONTACTED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. the company --------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "Company" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "taxId"     TEXT,
  -- Lari, never negative. The CHECK is the last line of defence under the
  -- conditional-decrement pattern the API uses: if a code path ever manages to
  -- overdraw a balance, this refuses the write instead of recording a debt the
  -- product has no concept of.
  "balance"   INTEGER NOT NULL DEFAULT 0,
  "status"    "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
  "note"      TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- NOT NULL with no DB default, exactly as `prisma migrate diff` emits it:
  -- @updatedAt is applied by the client on every write. Giving it a default
  -- here would leave a difference for the next `prisma db push` to "fix".
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Company_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Company_balance_nonnegative" CHECK ("balance" >= 0)
);

-- Nullable + unique: Postgres permits any number of NULLs under a unique
-- constraint, so a company added before its paperwork arrived does not collide
-- with the next one.
CREATE UNIQUE INDEX IF NOT EXISTS "Company_taxId_key" ON "Company"("taxId");
CREATE INDEX IF NOT EXISTS "Company_status_createdAt_idx" ON "Company"("status", "createdAt");

-- 3. membership ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "CompanyMember" (
  "id"        TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "role"      "CompanyMemberRole" NOT NULL DEFAULT 'MEMBER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyMember_companyId_userId_key"
  ON "CompanyMember"("companyId", "userId");
CREATE INDEX IF NOT EXISTS "CompanyMember_userId_idx" ON "CompanyMember"("userId");

-- CASCADE on both, and deliberately unlike "Booking"'s Restrict: a membership
-- is a permission, not a record of something that happened. It must never be
-- the reason an account cannot be deleted. The money is in
-- "CompanyTransaction", which has no FK to anything and survives both.
DO $$ BEGIN
  ALTER TABLE "CompanyMember"
    ADD CONSTRAINT "CompanyMember_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CompanyMember"
    ADD CONSTRAINT "CompanyMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. the ledger ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "CompanyTransaction" (
  "id"           TEXT NOT NULL,
  "companyId"    TEXT NOT NULL,
  "type"         "CompanyTransactionType" NOT NULL,
  -- Always positive; "type" carries the direction. The CHECK stops a negative
  -- TOPUP from becoming an undocumented way to charge somebody.
  "amount"       INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  -- "bookingId" and "actorId" are plain TEXT with NO foreign key, on purpose:
  -- a ledger row must outlive its subject. A FK would either take the money row
  -- with the booking (CASCADE) or block the delete (RESTRICT), and both are
  -- wrong for an accounting record. Same reasoning as "AuditLog"."targetId".
  "bookingId"    TEXT,
  "actorId"      TEXT,
  "note"         TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompanyTransaction_amount_positive" CHECK ("amount" > 0)
);

CREATE INDEX IF NOT EXISTS "CompanyTransaction_companyId_createdAt_idx"
  ON "CompanyTransaction"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "CompanyTransaction_bookingId_idx"
  ON "CompanyTransaction"("bookingId");

DO $$ BEGIN
  ALTER TABLE "CompanyTransaction"
    ADD CONSTRAINT "CompanyTransaction_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. inbound enquiries from /business ------------------------------------------

CREATE TABLE IF NOT EXISTS "BusinessLead" (
  "id"          TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "taxId"       TEXT,
  "contactName" TEXT NOT NULL,
  "phone"       TEXT NOT NULL,
  "email"       TEXT NOT NULL,
  "interest"    TEXT,
  "message"     TEXT,
  "status"      "BusinessLeadStatus" NOT NULL DEFAULT 'NEW',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BusinessLead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BusinessLead_status_createdAt_idx"
  ON "BusinessLead"("status", "createdAt");

-- 6. the one column on an existing table --------------------------------------
--
-- NULLABLE, NO DEFAULT, NO BACKFILL — and that is the whole point. `null` is
-- what every booking that already exists says, and it MEANS 'CARD'
-- (paymentSourceOf() in lib/b2b.ts is the single reader). A DEFAULT 'CARD'
-- would require an UPDATE across live booking history to record a fact nobody
-- ever asserted, and a NOT NULL would rewrite rows this migration promises not
-- to touch.

ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "paidBy" "PaymentSource";

COMMIT;
