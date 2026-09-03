-- Reverses 2026-09-02-message-control.
--
-- ⚠️ DROPPING "MessageSetting" SILENTLY TURNS EVERY MESSAGE BACK ON. The rows
-- are overrides, so losing them is not losing a preference — it is the site
-- resuming letters somebody deliberately stopped. Read the table before you
-- drop it, and roll the CODE back first (lib/outboundSettings must stop being
-- consulted, or every send will try to read a table that is not there).

BEGIN;

DROP INDEX IF EXISTS "MessageLog_pending_delivery_idx";
ALTER TABLE "MessageLog" DROP COLUMN IF EXISTS "deliveryAt";
ALTER TABLE "MessageLog" DROP COLUMN IF EXISTS "delivery";
DROP TABLE IF EXISTS "MessageSetting";

COMMIT;
