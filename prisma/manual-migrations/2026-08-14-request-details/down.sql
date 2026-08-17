-- Rollback for 2026-08-14-request-details.
--
-- ⚠️ ROLL BACK THE DEPLOYMENT FIRST — lib/dbBoot.ts re-adds this column on
-- every boot (the standing trap every rollback in this folder documents).
--
-- Drops the clarifying answers („ვისთვის", „რა დონეა") from every request that
-- carries them. The rest of each row is untouched.

BEGIN;

ALTER TABLE "ServiceRequest"
  DROP COLUMN IF EXISTS "details";

COMMIT;
