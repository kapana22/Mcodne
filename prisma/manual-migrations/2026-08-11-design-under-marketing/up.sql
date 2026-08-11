-- „დიზაინი" moves from „ტექნოლოგია და პროდუქტი" to „მარკეტინგი და გაყიდვები".
-- 2026-08-11, owner.
--
-- WHY. „დიზაინი" was filed under technology on 2026-08-10 because product/UX
-- design is a technology discipline. But the word on the chip is just
-- „დიზაინი", and most people who read it mean brand and graphic design — which
-- is marketing work. A designer looking at the application saw „ტექნოლოგია და
-- პროდუქტი" as their only parent and would not recognise themselves in it.
--
-- SAFE TO RUN NOW, and this is the reason it is done now rather than later:
-- the category has no experts. Nobody is re-filed, no count changes, and the
-- only visible effect is where two URLs point.
--
-- URLS. /categories/design keeps redirecting — the target simply becomes
-- /categories/marketing/design. The previous nested URL /categories/it/design
-- does not 404 either: the nested route checks the parent in the path against
-- the real one and redirects to the correct nested URL, which is exactly the
-- case it was written for.
--
-- Run: prisma db execute --file prisma/manual-migrations/2026-08-11-design-under-marketing/up.sql --schema prisma/schema.prisma

BEGIN;

UPDATE "Category" AS c
   SET "parentId" = p."id"
  FROM "Category" AS p
 WHERE c."slug" = 'design'
   AND p."slug" = 'marketing';

-- The same invariant the 2026-08-10 migration ends on: a redirect target that
-- is not VISIBLE strands the child's experts. Marketing is a sphere today; this
-- fails the move rather than trusting that it still will be.
DO $$
DECLARE bad int;
BEGIN
  SELECT COUNT(*) INTO bad
    FROM "Category" c JOIN "Category" p ON p."id" = c."parentId"
   WHERE c."slug" = 'design' AND (c."status" <> 'REDIRECTED' OR p."status" <> 'VISIBLE');
  IF bad > 0 THEN
    RAISE EXCEPTION 'design is not a redirect into a visible sphere';
  END IF;
END $$;

COMMIT;
