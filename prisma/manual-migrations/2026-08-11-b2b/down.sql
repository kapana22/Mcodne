-- Rollback for 2026-08-11-b2b.
--
-- ⚠️ ORDER MATTERS, AND THE OBVIOUS ORDER IS WRONG — the same trap the
-- 2026-08-10 rollback documents. lib/dbBoot.ts re-creates every one of these
-- tables, types and the "Booking"."paidBy" column on EVERY boot, and
-- ensureDbReady() runs on public pages. Running this file while the B2B build
-- is still serving re-creates the whole schema within milliseconds — empty.
-- That is worse than not rolling back at all: you would have deleted the ledger
-- and kept the tables.
--
--   1. redeploy the previous build (no code reads these tables; dbBoot no
--      longer creates them)
--   2. npx prisma db execute --file prisma/manual-migrations/2026-08-11-b2b/down.sql \
--        --schema prisma/schema.prisma
--   3. revert the schema.prisma change and `npx prisma generate`
--
-- ⚠️ THIS DESTROYS THE LEDGER. "CompanyTransaction" is the only record of who
-- put money on a balance and what was spent from it; "Company"."balance" is the
-- only record of what is left. Neither can be reconstructed from anything else
-- in this database — the bookings do not carry the amounts, and the audit log
-- carries the admin's actions but not the running total.
--
-- SO: BEFORE YOU RUN THIS, DUMP THEM.
--
--   pg_dump "$DATABASE_URL" --data-only \
--     -t '"Company"' -t '"CompanyMember"' -t '"CompanyTransaction"' \
--     -t '"BusinessLead"' > b2b-backup.sql
--
-- If a company has a live balance, a rollback is almost certainly not what you
-- want. Setting `B2B_VISIBILITY = 'off'` in lib/flags.ts hides the entire
-- vertical from every surface and touches no data at all — that is the reverse
-- gear for „turn it off". This file is for „it should never have existed".
--
-- WHAT IT CANNOT RESTORE: nothing, on the existing schema. "Booking"."paidBy"
-- is dropped, but a booking charged to a balance keeps every other field it had
-- — its price, its status and its history are untouched by this column and by
-- its removal. It simply stops recording that the money came from a balance.

BEGIN;

-- 1. the column on the existing table, first: it depends on the enum below.
ALTER TABLE "Booking" DROP COLUMN IF EXISTS "paidBy";

-- 2. the tables. Child tables before parents so the FKs go quietly; CASCADE is
--    deliberately NOT used, so an unexpected dependency fails loudly here
--    rather than silently taking something else with it.
DROP TABLE IF EXISTS "CompanyTransaction";
DROP TABLE IF EXISTS "CompanyMember";
DROP TABLE IF EXISTS "BusinessLead";
DROP TABLE IF EXISTS "Company";

-- 3. the vocabularies, last — nothing references them now.
DROP TYPE IF EXISTS "PaymentSource";
DROP TYPE IF EXISTS "CompanyTransactionType";
DROP TYPE IF EXISTS "CompanyMemberRole";
DROP TYPE IF EXISTS "CompanyStatus";
DROP TYPE IF EXISTS "BusinessLeadStatus";

COMMIT;
