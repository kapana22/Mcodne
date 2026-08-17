-- Requests: the automation flags.  2026-08-17
--
-- TWO nullable timestamps, and they exist because the cron ticks every 15
-- minutes. „Has this request already been nudged" cannot be inferred from the
-- elapsed window — every tick inside the eligible period would re-send the same
-- mail. A written timestamp IS the idempotency, and it doubles as the record of
-- when the nudge went out.
--
-- The clock they are read against lives in lib/requestRouting: providers are
-- re-mailed once at 6h if nobody has offered, the client is reminded once at
-- 48h if offers are waiting unchosen.
--
-- Additive only; nothing else is touched. lib/dbBoot.ts carries the same
-- statement.

BEGIN;

ALTER TABLE "ServiceRequest"
  ADD COLUMN IF NOT EXISTS "providerNudgeAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "clientNudgeAt"   TIMESTAMP(3);

-- The cron's own scan: verified rows, cheapest first. Without it every tick
-- sequential-scans the whole table to find the handful that are due.
CREATE INDEX IF NOT EXISTS "ServiceRequest_status_verifiedAt_idx"
  ON "ServiceRequest"("status", "verifiedAt");

COMMIT;
