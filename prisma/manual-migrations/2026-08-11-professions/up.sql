-- Professions + the sphere rename.  2026-08-11
--
-- Run: prisma db execute --file prisma/manual-migrations/2026-08-11-professions/up.sql --schema prisma/schema.prisma
--
-- TWO changes, both from the owner's კატეგორიები.docx.
--
-- 1. „ტექნოლოგია და პროდუქტი" → „IT და ტექნოლოგიები". The only sphere whose
--    name differs from the document; the other fifteen already matched. `slug`
--    is untouched, so /categories/it and every nested URL resolve as before —
--    a name is copy, a slug is the identifier.
--
-- 2. `TutorProfile.professions` — what the expert calls themselves, several of
--    them („მარკეტოლოგმა იცის დიზაინი და რეკლამირებაც"). The vocabulary is
--    lib/professions.ts: 16 spheres, 91 jobs, keyed by slug.
--
--    It does NOT replace `categoryId`. The sphere stays single and keeps
--    driving browse, the filter, /categories/*, the counts and the SEO;
--    professions are the finer grain that shows on the profile. Nothing that
--    reads a category had to change.
--
-- The column is also created idempotently by lib/dbBoot at boot, so a deploy
-- that lands before this file is run is not broken — this exists so the change
-- is reviewable and reversible on its own.

BEGIN;

-- 1. the rename ---------------------------------------------------------------
UPDATE "Category" SET "name" = 'IT და ტექნოლოგიები'
 WHERE "slug" = 'it' AND "name" = 'ტექნოლოგია და პროდუქტი';

-- 2. the column ---------------------------------------------------------------
-- text[] with an empty default: every existing profile stays valid untouched
-- and there is nothing to backfill. Experts fill it from the profile editor,
-- and new applicants answer it on /apply.
ALTER TABLE "TutorProfile"
  ADD COLUMN IF NOT EXISTS "professions" TEXT[] NOT NULL DEFAULT '{}';

-- ── guards ───────────────────────────────────────────────────────────────────

-- The rename must not have produced a duplicate display name: two spheres with
-- one name is indistinguishable to everybody except the database.
DO $$
DECLARE dupes int;
BEGIN
  SELECT COUNT(*) INTO dupes FROM (
    SELECT "name" FROM "Category" WHERE "parentId" IS NULL GROUP BY "name" HAVING COUNT(*) > 1
  ) d;
  IF dupes > 0 THEN RAISE EXCEPTION '% duplicated sphere name(s)', dupes; END IF;
END $$;

-- The column has to be readable as an array, not as text — a mistyped ALTER
-- would surface much later, as a Prisma deserialisation error on a live page.
DO $$
DECLARE t text;
BEGIN
  SELECT data_type INTO t FROM information_schema.columns
   WHERE table_name = 'TutorProfile' AND column_name = 'professions';
  IF t IS DISTINCT FROM 'ARRAY' THEN RAISE EXCEPTION 'professions is %, expected ARRAY', t; END IF;
END $$;

COMMIT;

-- Verify (read-only, run after):
--   SELECT slug, name FROM "Category" WHERE slug = 'it';
--   SELECT COUNT(*) FROM "TutorProfile" WHERE cardinality("professions") > 0;
