-- PER-MESSAGE CONTROL, AND WHAT THE CARRIER ACTUALLY DID.
--
-- Two additions, one change of mind each:
--
-- 1. `MessageSetting` — the admin owns which messages go out, rather than a
--    deploy. A ROW IS AN OVERRIDE: absent means the registry's own default, so
--    a new message arrives switched on with no migration and no backfill.
--    Same shape as SiteText over lib/siteTextDefs.
--
-- 2. `MessageLog.delivery` / `.deliveryAt` — „the provider took it" and „the
--    phone rang" are different facts. sender.ge's 200 is the first; callback.php
--    (statusId 0 pending · 1 delivered · 2 undelivered) is the second, and
--    until now the table could only ever claim the first. Twilio names the same
--    gap `sent` vs `delivered`, and warns a message can sit in it for ever with
--    no failure ever reported.
--
-- Both additive. `MessageSetting` references nothing; the two columns are
-- nullable, because every row written before today was never asked.
--
-- The executable twin of this file lives at the foot of lib/dbBoot.ts.

BEGIN;

CREATE TABLE IF NOT EXISTS "MessageSetting" (
  "key"       TEXT NOT NULL,
  "mailOn"    BOOLEAN NOT NULL DEFAULT true,
  "smsOn"     BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageSetting_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "MessageLog" ADD COLUMN IF NOT EXISTS "delivery"   INTEGER;
ALTER TABLE "MessageLog" ADD COLUMN IF NOT EXISTS "deliveryAt" TIMESTAMPTZ(6);

-- The poller asks for SMS rows that went out and were never settled. Partial,
-- because that set stays small while the table only grows.
CREATE INDEX IF NOT EXISTS "MessageLog_pending_delivery_idx"
  ON "MessageLog" ("createdAt" DESC)
  WHERE "channel" = 'sms' AND "ref" IS NOT NULL AND "delivery" IS DISTINCT FROM 1;

-- Guard: both columns landed and both are nullable. NOT NULL here would mean an
-- earlier hand-run added a default, and every historical row would be claiming
-- a delivery report that was never read.
DO $$
DECLARE n INT;
BEGIN
  SELECT COUNT(*) INTO n
    FROM information_schema.columns
   WHERE table_name = 'MessageLog'
     AND column_name IN ('delivery', 'deliveryAt')
     AND is_nullable = 'YES';
  IF n <> 2 THEN
    RAISE EXCEPTION 'MessageLog delivery columns missing or NOT NULL (found %)', n;
  END IF;
END $$;

COMMIT;
