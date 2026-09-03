-- ONE ROW PER ATTEMPTED OUTBOUND MESSAGE — mail and SMS both.
--
-- Owner, 2026-09-02: „სად მიდის როდის მიდის და ასეთი დეტალები რომ კარგად იყოს
-- მოწესრიგებული და არ გაგვეპაროს შეცდომები."
--
-- Until now a send left ONE trace: a console line in the Railway log. That log
-- scrolls, so „the letter never arrived" and „the letter was never sent" looked
-- the same from the admin — and they need opposite answers.
--
-- ADDITIVE AND STANDALONE. It references no existing table, so it cannot fail
-- on a database that has never been migrated, and nothing above it in
-- runMigrations() depends on it.
--
-- The executable twin of this file lives at the foot of lib/dbBoot.ts.

BEGIN;

CREATE TABLE IF NOT EXISTS "MessageLog" (
  "id"        TEXT NOT NULL,
  "channel"   TEXT NOT NULL,
  "key"       TEXT NOT NULL,
  "to"        TEXT NOT NULL,
  "status"    TEXT NOT NULL,
  "mode"      TEXT NOT NULL,
  "detail"    TEXT,
  "ref"       TEXT,
  "parts"     INTEGER,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);

-- The tab reads „newest first", „failures first" and „this message, over time".
CREATE INDEX IF NOT EXISTS "MessageLog_createdAt_idx"        ON "MessageLog" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "MessageLog_status_createdAt_idx" ON "MessageLog" ("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "MessageLog_key_createdAt_idx"    ON "MessageLog" ("key", "createdAt" DESC);

-- Guard: the table exists with all ten columns. A short count means an earlier
-- hand-run created a different shape, and the senders would fail on every write.
DO $$
DECLARE n INT;
BEGIN
  SELECT COUNT(*) INTO n FROM information_schema.columns WHERE table_name = 'MessageLog';
  IF n <> 10 THEN
    RAISE EXCEPTION 'MessageLog has % columns, expected 10', n;
  END IF;
END $$;

COMMIT;
