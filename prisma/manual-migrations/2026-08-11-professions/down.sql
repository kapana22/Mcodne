-- Revert 2026-08-11-professions.
--
-- ⚠️ Dropping the column DESTROYS what experts have entered about themselves.
-- It refuses while anything is stored; clear the values deliberately first if
-- that is really the intent.

BEGIN;

UPDATE "Category" SET "name" = 'ტექნოლოგია და პროდუქტი'
 WHERE "slug" = 'it' AND "name" = 'IT და ტექნოლოგიები';

DO $$
DECLARE filled int;
BEGIN
  SELECT COUNT(*) INTO filled FROM "TutorProfile" WHERE cardinality("professions") > 0;
  IF filled > 0 THEN
    RAISE EXCEPTION 'cannot drop: % profile(s) have professions stored', filled;
  END IF;
END $$;

ALTER TABLE "TutorProfile" DROP COLUMN IF EXISTS "professions";

COMMIT;
