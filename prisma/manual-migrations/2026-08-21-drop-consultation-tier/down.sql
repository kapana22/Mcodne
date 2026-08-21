-- Reverses 2026-08-21-drop-consultation-tier.
--
-- The column carried no information of its own — every value was a function of
-- `minutes` — so restoring it loses nothing: the ladder below is the one the
-- application used (lib/consultationTier, deleted in the same change).
--
-- ⚠️ ROLL BACK THE DEPLOY TOO. lib/dbBoot does not recreate this column, and the
-- build that is live after the drop never writes it. Restoring the column while
-- the new build serves leaves it correct but permanently NULL for new rows —
-- harmless, since nothing reads it, and still not what a rollback means.

CREATE TYPE "ConsultationTier" AS ENUM ('QUICK', 'STANDARD', 'DEEP');

ALTER TABLE "Consultation" ADD COLUMN "tier" "ConsultationTier";

UPDATE "Consultation" SET "tier" = CASE
  WHEN "minutes" <= 20 THEN 'QUICK'::"ConsultationTier"
  WHEN "minutes" <= 45 THEN 'STANDARD'::"ConsultationTier"
  ELSE 'DEEP'::"ConsultationTier"
END;

ALTER TABLE "Consultation" ALTER COLUMN "tier" SET NOT NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Consultation" WHERE "tier" IS NULL) THEN
    RAISE EXCEPTION 'a Consultation row was left without a tier';
  END IF;
END $$;
