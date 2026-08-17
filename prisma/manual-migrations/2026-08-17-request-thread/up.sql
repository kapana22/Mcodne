-- The platform thread, and the operator heartbeat behind „ონლაინ ვართ".
--
-- WHAT THIS OPENS. Until now the first thing that happened after somebody
-- pressed send was nothing they could see: a thank-you card, a code, and a
-- promise to phone. The conversation existed only once a provider had answered,
-- which is after an admin phones and after routing — hours, on a good day. This
-- makes the gap a conversation with US instead of a wait.
--
-- WHY NO NEW TABLE. Both threads are the same bubbles, the same receipts and the
-- same unread count; a second table would have duplicated all three and given
-- the reader two of everything. What actually differs — who may read it, whether
-- contacts are masked, when it closes — is rules, and rules live in
-- lib/requestChat + lib/requestThread.
--
-- Mirrors lib/dbBoot exactly. Both are idempotent; either may run first.

-- ── 1. offerId becomes nullable, and NULL means „this thread is with us" ───
--
-- Guarded rather than fired blind: on a database that already has it nullable
-- this is a no-op, and asking anyway would write a needless lock into the log.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'RequestMessage' AND column_name = 'offerId'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "RequestMessage" ALTER COLUMN "offerId" DROP NOT NULL;
  END IF;
END $$;

-- ⚠️ NO CHECK PAIRING offerId WITH ANYTHING, deliberately. „A message belongs to
-- an offer OR to the platform" is already total — both cases are legal and the
-- column IS the discriminator. The temptation is to also demand that the offer,
-- when present, belongs to the same requestId; that is true and enforced by the
-- single writer, but as a CHECK it would need a subquery, which Postgres does
-- not allow in one. The FKs below are what the database can honestly promise.

-- ── 2. the operator heartbeat ─────────────────────────────────────────────
-- Nullable, no default, no index: it is read once per thread poll with a
-- role filter that already narrows to a handful of rows.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "supportSeenAt" TIMESTAMP(3);
