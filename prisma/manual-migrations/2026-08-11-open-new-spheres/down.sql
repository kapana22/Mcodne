-- Revert 2026-08-11-open-new-spheres.
--
-- Deletes the 16 rows this migration created — and ONLY while they are still
-- empty. A sphere that has since been published and filled is a real part of
-- the catalogue, not a leftover: the guard below refuses rather than orphan a
-- live expert (the FK is ON DELETE RESTRICT, so Postgres would refuse anyway;
-- this fails first and says WHY).
--
-- Children go before parents — the parent FK is RESTRICT in both directions.

BEGIN;

DO $$
DECLARE held int;
BEGIN
  SELECT COUNT(*) INTO held
    FROM "TutorProfile" tp JOIN "Category" c ON c."id" = tp."categoryId"
   WHERE c."slug" IN (
     'health','medicine','architecture','tourism','logistics','media','grants','relocation','agriculture',
     'nutrition','fitness','interior','customs','video','translation','tenders'
   );
  IF held > 0 THEN
    RAISE EXCEPTION 'cannot revert: % expert(s) are filed in these categories. Re-file them first.', held;
  END IF;
END $$;

DELETE FROM "Category"
 WHERE "slug" IN ('nutrition','fitness','interior','customs','video','translation','tenders');

DELETE FROM "Category"
 WHERE "slug" IN ('health','medicine','architecture','tourism','logistics','media','grants','relocation','agriculture');

COMMIT;
