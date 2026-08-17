-- Rollback for 2026-08-14-request-topics.
--
-- ⚠️ ROLL BACK THE DEPLOYMENT FIRST. lib/dbBoot.ts re-applies the forward
-- statements on EVERY boot, and ensureDbReady() runs on public pages — so
-- running this while the new build is serving restores the new shape within
-- milliseconds. The same trap every rollback in this folder documents.
--
-- ⚠️ THIS DESTROYS WHAT EVERY REQUEST WAS FOR. `topic`, `kind` and the budget
-- numbers have no equivalent in the old columns: the old `budget` enum has no
-- value that means „20–40₾ per lesson", and the old sphere list has no value
-- that means „ქიმია". Every teaching request becomes unreadable, and every
-- other one loses its band.
--
--   pg_dump "$DATABASE_URL" --data-only -t '"ServiceRequest"' > requests-backup.sql
--
-- The rows SURVIVE — the description, the contact, the offers and the status are
-- untouched. What is lost is what they asked for and what they would pay.
--
-- No backfill is attempted in either direction. Mapping a per-lesson budget onto
-- a total-project enum would be inventing a number nobody stated, which is worse
-- than an obviously empty column.

BEGIN;

DROP INDEX IF EXISTS "ServiceRequest_kind_status_idx";
DROP INDEX IF EXISTS "ServiceRequest_topic_status_idx";

-- The enums come back first — the columns below reference them.
DO $$ BEGIN CREATE TYPE "RequestBudget" AS ENUM ('UNDER_500', 'B500_1000', 'B1000_3000', 'B3000_7000', 'B7000_15000', 'OVER_15000'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "RequestDeadline" AS ENUM ('URGENT', 'TWO_WEEKS', 'ONE_MONTH', 'FLEXIBLE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Restored with defaults because the old columns were NOT NULL and nothing here
-- can honestly say what an existing row's band was. Every restored row will
-- claim „B1000_3000 / FLEXIBLE" and that claim is FICTION — treat the column as
-- empty, not as data.
ALTER TABLE "ServiceRequest"
  ADD COLUMN IF NOT EXISTS "budget"   "RequestBudget"   NOT NULL DEFAULT 'B1000_3000',
  ADD COLUMN IF NOT EXISTS "deadline" "RequestDeadline" NOT NULL DEFAULT 'FLEXIBLE';

ALTER TABLE "ServiceRequest" DROP CONSTRAINT IF EXISTS "ServiceRequest_budget_range";

ALTER TABLE "ServiceRequest"
  DROP COLUMN IF EXISTS "kind",
  DROP COLUMN IF EXISTS "topic",
  DROP COLUMN IF EXISTS "budgetMin",
  DROP COLUMN IF EXISTS "budgetMax",
  DROP COLUMN IF EXISTS "budgetUnit",
  DROP COLUMN IF EXISTS "timing",
  DROP COLUMN IF EXISTS "format";

COMMIT;
