-- Rollback for 2026-08-17-request-automation.
--
-- ⚠️ ROLL BACK THE DEPLOYMENT FIRST — lib/dbBoot.ts re-adds these columns on
-- every boot (the standing trap every rollback in this folder documents).
--
-- Dropping these does NOT stop the automation; it makes it AMNESIAC. The cron
-- would re-send the same nudge on every 15-minute tick for every eligible row,
-- because the „already sent" fact lives nowhere else. Remove the cron block in
-- app/api/internal/cleanup first, or take FEATURE_REQUESTS off.

BEGIN;

DROP INDEX IF EXISTS "ServiceRequest_status_verifiedAt_idx";

ALTER TABLE "ServiceRequest"
  DROP COLUMN IF EXISTS "providerNudgeAt",
  DROP COLUMN IF EXISTS "clientNudgeAt";

COMMIT;
