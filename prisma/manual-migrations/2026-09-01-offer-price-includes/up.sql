-- AN OFFER SAYS WHAT ITS PRICE COVERS.
--
-- The owner's design canvas (2026-09-01) adds one required line to an offer —
-- „რას მოიცავს ფასი" — and prints it under the price on EVERY offer card in the
-- client's room. It is what makes three prices comparable: a client can read
-- three one-liners; they cannot read three paragraphs. `message` became
-- optional in the same change.
--
-- NULLABLE, deliberately. Every offer written before today has none, and a
-- NOT NULL DEFAULT would put a sentence under a provider's price that the
-- provider never wrote. The requirement is enforced by `RequestOfferInput`,
-- which only new offers pass through.
--
-- The executable twin of this file lives at the foot of lib/dbBoot.ts.

BEGIN;

ALTER TABLE "RequestOffer" ADD COLUMN IF NOT EXISTS "priceIncludes" TEXT;

-- Guard: the column is there and it is nullable. A NOT NULL here would mean an
-- earlier hand-run added it with a default, and every legacy offer would now be
-- claiming something.
DO $$
DECLARE n INT;
BEGIN
  SELECT COUNT(*) INTO n
    FROM information_schema.columns
   WHERE table_name = 'RequestOffer'
     AND column_name = 'priceIncludes'
     AND is_nullable = 'YES';
  IF n <> 1 THEN
    RAISE EXCEPTION 'RequestOffer.priceIncludes missing or NOT NULL (found %)', n;
  END IF;
END $$;

COMMIT;
