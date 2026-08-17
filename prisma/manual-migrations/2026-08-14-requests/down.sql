-- Rollback for 2026-08-14-requests.
--
-- ⚠️ ROLL BACK THE DEPLOYMENT FIRST. lib/dbBoot.ts re-creates these tables on
-- EVERY boot, and ensureDbReady() runs on public pages — so running this while
-- the new build is serving restores them within milliseconds, empty. The same
-- trap the 2026-08-11 rollbacks document.
--
-- ⚠️ THIS DESTROYS EVERY REQUEST AND EVERY OFFER: what people asked for, what
-- they were willing to spend, who answered and at what price. None of it exists
-- anywhere else — the request table IS the record of what the market wants,
-- which is the one thing stage 1 was built to find out.
--
--   pg_dump "$DATABASE_URL" --data-only \
--     -t '"ServiceRequest"' -t '"RequestOffer"' -t '"RequestAccess"' > requests-backup.sql
--
-- TO SIMPLY STOP THE FEATURE, set FEATURE_REQUESTS=off and redeploy. That 404s
-- every route for everyone including admins, and touches no data. This file is
-- for „it should never have existed".
--
-- Nothing outside these three tables is affected: this migration added no
-- column to any existing table, so there is nothing to un-add.

BEGIN;

-- Children before parents; the FKs are dropped with their tables.
DROP TABLE IF EXISTS "RequestOffer";
DROP TABLE IF EXISTS "RequestAccess";
DROP TABLE IF EXISTS "ServiceRequest";

-- The enum types last — a DROP TYPE fails while any column still uses it, so
-- this order is load-bearing rather than tidy.
DROP TYPE IF EXISTS "RequestOfferStatus";
DROP TYPE IF EXISTS "RequestProviderKind";
DROP TYPE IF EXISTS "ServiceRequestStatus";
DROP TYPE IF EXISTS "RequestBudget";
DROP TYPE IF EXISTS "RequestDeadline";

COMMIT;
