-- Revert 2026-08-20-launch-categories.
--
-- Puts back exactly what the forward file changed, and refuses rather than
-- destroy anything that has become real since:
--   · `swavleba` is deleted ONLY while empty — a sphere with a teacher in it is
--     part of the catalogue, not a leftover (the FK is ON DELETE RESTRICT, so
--     Postgres would refuse anyway; this fails first and says why).
--   · `health` goes back to VISIBLE only because the forward file found it
--     VISIBLE. If a real expert has since been approved into it, it would be
--     VISIBLE by its own auto-reveal too, so this is the same end state.
--   · The test profile is re-listed. That is the honest revert; whether it
--     SHOULD be listed is the question the forward file answers.

BEGIN;

DO $$
DECLARE held int;
BEGIN
  SELECT COUNT(*) INTO held
    FROM "TutorProfile" tp JOIN "Category" c ON c."id" = tp."categoryId"
   WHERE c."slug" = 'swavleba';
  IF held > 0 THEN
    RAISE EXCEPTION 'cannot revert: % expert(s) are filed in swavleba. Re-file them first.', held;
  END IF;
END $$;

DELETE FROM "Category" WHERE "slug" = 'swavleba';

UPDATE "Category" SET "status" = 'VISIBLE', "isLive" = true WHERE "slug" = 'health';

UPDATE "TutorProfile" tp SET "available" = true
  FROM "User" u
 WHERE u."id" = tp."userId" AND lower(u."email") = 'mcodne.ge@gmail.com';

COMMIT;
