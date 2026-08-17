-- Retire the 12 empty sub-categories.  2026-08-11
--
-- Run: prisma db execute --file prisma/manual-migrations/2026-08-11-retire-empty-subcategories/up.sql --schema prisma/schema.prisma
--
-- WHY. The second level of the taxonomy was FIELD nouns („ფინანსები",
-- „გაყიდვები", „დიზაინი"). It is now PROFESSIONS („ბუღალტერი", „მარკეტოლოგი"),
-- from the owner's კატეგორიები.docx, and /apply no longer offers the old rows
-- at all — an applicant picks a sphere and then professions inside it.
--
-- That left the sub-categories as a third, orphaned concept: not offered on the
-- application, still listed in the admin and in the profile editor's picker,
-- and in one case („ადვოკატი") a literal duplicate of a profession.
--
-- THE THREE THAT HOLD EXPERTS ARE KEPT. ფინანსები (3), გაყიდვები (2) and
-- ადვოკატი (1) stay exactly as they are: deleting them would re-file six real
-- people, which is a decision about those people and not a cleanup. They can be
-- retired later, once those experts have filled in their professions.
--
-- URLS. Five of the twelve („career", „hr", „design", „product", „crypto") are
-- original seeded categories, so their /categories/<slug> URLs may be indexed;
-- after this they 404 instead of redirecting to their parent. That is accepted:
-- each has ZERO experts, so the redirect led to a page that could never answer
-- the query anyway. The five /konsultacia/* landing pages that referenced them
-- keep working — the cross-link to the sphere is now rendered only when there
-- are experts to see (app/konsultacia/[slug]/page.tsx).
--
-- The remaining seven were created earlier the same day and were never public.

BEGIN;

-- Refuse if any of them gained an expert between the check and this run.
DO $$
DECLARE held int;
BEGIN
  SELECT COUNT(*) INTO held
    FROM "TutorProfile" tp JOIN "Category" c ON c."id" = tp."categoryId"
   WHERE c."slug" IN ('career','hr','crypto','design','product',
                      'nutrition','fitness','interior','customs','video','translation','tenders');
  IF held > 0 THEN
    RAISE EXCEPTION 'cannot retire: % expert(s) are filed in these categories', held;
  END IF;
END $$;

DELETE FROM "Category"
 WHERE "slug" IN ('career','hr','crypto','design','product',
                  'nutrition','fitness','interior','customs','video','translation','tenders');

-- The three that were kept must still be intact and still redirect somewhere real.
DO $$
DECLARE bad int;
BEGIN
  SELECT COUNT(*) INTO bad FROM "Category" c
    LEFT JOIN "Category" p ON p."id" = c."parentId"
   WHERE c."slug" IN ('finance','sales','advokati')
     AND (c."status" <> 'REDIRECTED' OR p."status" IS DISTINCT FROM 'VISIBLE');
  IF bad > 0 THEN RAISE EXCEPTION '% kept sub-categor(ies) no longer resolve', bad; END IF;
END $$;

-- And nothing anywhere may be left redirecting into thin air.
DO $$
DECLARE orphan int;
BEGIN
  SELECT COUNT(*) INTO orphan FROM "Category" WHERE "status" = 'REDIRECTED' AND "parentId" IS NULL;
  IF orphan > 0 THEN RAISE EXCEPTION 'REDIRECTED categories with no parent: %', orphan; END IF;
END $$;

COMMIT;
