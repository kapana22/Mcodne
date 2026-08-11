-- Rollback for 2026-08-11-b2b-services.
--
-- ⚠️ ROLL BACK THE DEPLOYMENT FIRST. lib/dbBoot.ts re-creates this table and
-- these columns on EVERY boot, and ensureDbReady() runs on public pages — so
-- running this while the new build is serving restores them within
-- milliseconds, empty. Same trap the 2026-08-10 rollback documents.
--
-- ⚠️ THIS DESTROYS THE PRICE LIST, and the link between every request and the
-- service it was for. `agreedPrice` and `adminNote` — what was actually agreed
-- and what was promised — are dropped with it, and exist nowhere else.
--
--   pg_dump "$DATABASE_URL" --data-only -t '"B2BService"' > services-backup.sql
--
-- The requests themselves SURVIVE: only their serviceId is lost, because the
-- FK is SET NULL and this drops the columns rather than the rows.
--
-- To simply stop selling, set every service invisible in the admin panel — that
-- empties the page and touches no data. This file is for „it should never have
-- existed".

BEGIN;

ALTER TABLE "BusinessLead" DROP CONSTRAINT IF EXISTS "BusinessLead_serviceId_fkey";
ALTER TABLE "BusinessLead"
  DROP COLUMN IF EXISTS "serviceId",
  DROP COLUMN IF EXISTS "agreedPrice",
  DROP COLUMN IF EXISTS "adminNote";

DROP TABLE IF EXISTS "B2BService";

COMMIT;
