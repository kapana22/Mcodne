-- One conversation per offer.  2026-08-17
--
-- ⚠️ WHY NOT THE EXISTING "Message" TABLE. It already carries pre-booking
-- threads (bookingId NULL between a client and an expert) — but both its sides
-- are User foreign keys, and the client of a request HAS NO ACCOUNT. „No
-- registration, ever" is the decision the whole intake was rebuilt on; adding a
-- signup so somebody can ask „do you teach on Saturdays?" would undo it. Here
-- the client side is identified by POSSESSION OF THE REQUEST (the publicRef
-- that already opens their page) and only the provider side is a User.
--
-- ⚠️ THE THREAD IS PER OFFER, not per request: the client holds a separate
-- conversation with each provider who answered, and merging them would show
-- every provider what their competitors wrote.
--
-- Additive only. lib/dbBoot.ts carries the same statements.

BEGIN;

CREATE TABLE IF NOT EXISTS "RequestMessage" (
  "id"        TEXT NOT NULL,
  "offerId"   TEXT NOT NULL,
  -- Denormalised from the offer so the client's page loads every thread of
  -- their request in one query. Never written independently — lib/requestChat
  -- is the only writer and it copies it from the offer.
  "requestId" TEXT NOT NULL,
  -- WHICH SIDE SPOKE. A boolean, not two nullable FKs: there are exactly two
  -- parties and only one of them is ever a User, so „from the client" is a
  -- fact about the row rather than an absence.
  "fromClient" BOOLEAN NOT NULL,
  -- Null on every client message. SET NULL on delete, not CASCADE: a deleted
  -- provider account must not erase the client's half of a conversation.
  "fromUserId" TEXT,
  "body"      TEXT NOT NULL,
  -- Two receipts, because there are two readers and only one has an account.
  "readByClientAt"   TIMESTAMP(3),
  "readByProviderAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequestMessage_pkey" PRIMARY KEY ("id"),
  -- A CLIENT message carries no author — the security half, and the only half
  -- a CHECK can hold. The endpoint DERIVES which side is speaking; a row that
  -- claims to be the client while naming a User is the exact forgery it exists
  -- to refuse.
  --
  -- ⚠️ NOT the mirror („a provider message must carry an author"), however
  -- obvious it looks. The FK below is SET NULL, so purging a provider account
  -- nulls this column — and the mirror half would then reject that update and
  -- fail the DELETE, leaving an account nobody can delete because the person
  -- once typed a sentence. The author rule lives in lib/requestChat, the only
  -- writer, and is pinned by tests/requests.test.ts.
  CONSTRAINT "RequestMessage_author_matches_side" CHECK (
    "fromClient" = false OR "fromUserId" IS NULL
  ),
  CONSTRAINT "RequestMessage_body_not_empty" CHECK (length(btrim("body")) > 0)
);

-- The same relaxation for a database that already ran the strict version of
-- this file (it shipped for one day). CREATE TABLE IF NOT EXISTS cannot reach
-- an existing table, so the constraint is replaced in place — conditionally, so
-- re-running this migration is a no-op.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'RequestMessage_author_matches_side'
      AND pg_get_constraintdef(oid) LIKE '%IS NOT NULL%'
  ) THEN
    ALTER TABLE "RequestMessage" DROP CONSTRAINT "RequestMessage_author_matches_side";
    ALTER TABLE "RequestMessage" ADD CONSTRAINT "RequestMessage_author_matches_side"
      CHECK ("fromClient" = false OR "fromUserId" IS NULL);
  END IF;
END $$;

-- The thread itself, and „every thread of my request".
CREATE INDEX IF NOT EXISTS "RequestMessage_offerId_createdAt_idx" ON "RequestMessage"("offerId", "createdAt");
CREATE INDEX IF NOT EXISTS "RequestMessage_requestId_createdAt_idx" ON "RequestMessage"("requestId", "createdAt");

-- CASCADE from both parents: a message about an offer that no longer exists is
-- unreadable — it quotes a price nobody can see. Unlike a ledger row, it
-- records no money and no obligation.
DO $$ BEGIN ALTER TABLE "RequestMessage" ADD CONSTRAINT "RequestMessage_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "RequestOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "RequestMessage" ADD CONSTRAINT "RequestMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "RequestMessage" ADD CONSTRAINT "RequestMessage_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
