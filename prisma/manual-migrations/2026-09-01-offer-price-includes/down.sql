-- Reverses 2026-09-01-offer-price-includes.
--
-- ⚠️ THIS DESTROYS DATA. Every „რას მოიცავს ფასი" a provider has typed since the
-- column shipped is in it, and nothing else holds a copy — `message` is a
-- different field with a different job. Going back means those offers lose the
-- line their client was comparing them on.
--
-- Roll the CODE back first (RequestOfferInput must stop requiring it and every
-- render must stop reading it), then run this.

BEGIN;

ALTER TABLE "RequestOffer" DROP COLUMN IF EXISTS "priceIncludes";

COMMIT;
