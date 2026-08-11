-- Revert 2026-08-11-taxonomy-realign.
--
-- Run: prisma db execute --file prisma/manual-migrations/2026-08-11-taxonomy-realign/down.sql --schema prisma/schema.prisma
--
-- Restores the two names, HR's parent, the two experts' filing and the previous
-- `order` values — all as read from production on 2026-08-11 at 14:57, which is
-- the state up.sql was rewritten against. Nothing here is destructive and
-- re-running it is a no-op.
--
-- ⚠️ Step 3 puts გვანცა ჭაღოშვილი BACK to no category. That was her real state
-- and it is what a revert means — but it is also the state in which she is
-- reachable from no sphere page and no filter. If the only thing being undone
-- is the naming, run step 2 alone.

BEGIN;

-- 1. HR back under „გადასახადები" ---------------------------------------------
UPDATE "Category" AS c
   SET "parentId" = t."id"
  FROM "Category" AS b, "Category" AS t
 WHERE c."slug" = 'hr'
   AND b."id" = c."parentId" AND b."slug" = 'business'
   AND t."slug" = 'tax';

-- 2. the two names ------------------------------------------------------------
UPDATE "Category" SET "name" = 'ბიზნესი და ფინანსები'
 WHERE "slug" = 'business' AND "name" = 'ბიზნესი და სტრატეგია';

UPDATE "Category" SET "name" = 'გადასახადები'
 WHERE "slug" = 'tax' AND "name" = 'ფინანსები და გადასახადები';

-- 3. the two experts ----------------------------------------------------------
UPDATE "TutorProfile" tp
   SET "categoryId" = (SELECT "id" FROM "Category" WHERE "slug" = 'business')
  FROM "User" u, "Category" c
 WHERE u."id" = tp."userId"
   AND c."id" = tp."categoryId"
   AND u."fullName" = 'ნინო გახოკია'
   AND c."slug" = 'psychology';

UPDATE "TutorProfile" tp
   SET "categoryId" = NULL
  FROM "User" u, "Category" c
 WHERE u."id" = tp."userId"
   AND c."id" = tp."categoryId"
   AND u."fullName" = 'გვანცა ჭაღოშვილი'
   AND c."slug" = 'finance';

-- 4. the previous order values, as read from production 2026-08-11 14:57 -------
UPDATE "Category" SET "order" = v.n FROM (VALUES
  ('business',      1),
  ('tax',           2),
  ('finance',       2),
  ('career',        3),
  ('law',           4),
  ('marketing',     5),
  ('sales',         6),
  ('psychology',    6),
  ('it',            7),
  ('product',       8),
  ('design',        9),
  ('hr',           11),
  ('real-estate',  12),
  ('crypto',       14),
  ('advokati',    901)
) AS v(slug, n) WHERE "Category"."slug" = v.slug;

COMMIT;
