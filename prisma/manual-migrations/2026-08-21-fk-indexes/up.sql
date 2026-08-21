-- The two foreign keys nothing indexed.  2026-08-21
--
-- Postgres indexes a PRIMARY KEY and a UNIQUE constraint for you. It does NOT
-- index a FOREIGN KEY. Both columns below are ON DELETE SET NULL, so deleting a
-- User made the planner seq-scan the child table to find the rows to null out.
--
-- Found by an audit, not by a slow page: ServiceRequest holds 32 rows and
-- RequestMessage 12, so nothing is slow today. That is the reason to do it now —
-- the cost of the missing index is invisible until the table is big enough that
-- it is not, and account deletion (app/api/admin/users/[id]) is a flow the site
-- already runs.
--
-- Additive and idempotent, like everything in lib/dbBoot, which issues the same
-- two statements at boot. Whichever runs first wins; the other is a no-op.

CREATE INDEX IF NOT EXISTS "ServiceRequest_userId_idx"
  ON "ServiceRequest" ("userId");

CREATE INDEX IF NOT EXISTS "RequestMessage_fromUserId_idx"
  ON "RequestMessage" ("fromUserId");

-- Guard: both must exist afterwards, and fail loudly if not.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'ServiceRequest_userId_idx') THEN
    RAISE EXCEPTION 'ServiceRequest_userId_idx was not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'RequestMessage_fromUserId_idx') THEN
    RAISE EXCEPTION 'RequestMessage_fromUserId_idx was not created';
  END IF;
END $$;
