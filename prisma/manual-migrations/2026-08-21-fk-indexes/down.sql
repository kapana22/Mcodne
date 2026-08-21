-- Reverses 2026-08-21-fk-indexes.
--
-- Dropping an index loses no data and no page depends on one existing, so this
-- is a genuine rollback rather than a best effort. lib/dbBoot re-creates both on
-- the next boot, so to roll back and STAY rolled back you must redeploy the
-- previous build as well — the same caveat every migration here carries.

DROP INDEX IF EXISTS "ServiceRequest_userId_idx";
DROP INDEX IF EXISTS "RequestMessage_fromUserId_idx";
