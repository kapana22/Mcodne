-- Category hierarchy + status.  2026-08-10
--
-- WHY THIS IS HAND-WRITTEN. The project has no prisma/migrations history: the
-- schema is applied with `prisma db push` and a few tables are raw DDL in
-- lib/dbBoot. Introducing `prisma migrate` would first require baselining an
-- existing production database against a schema it never generated — a bigger
-- and riskier change than this task needs. So: a reviewed pair of scripts with
-- a real down, run with `prisma db execute --file … --schema prisma/schema.prisma`.
--
-- NOTHING IS DELETED. No category row, no expert↔category link, no booking.
-- `isLive` is left in place so down.sql can restore the previous behaviour
-- exactly; it is dropped in a follow-up migration once no code reads it.

BEGIN;

-- 1. the status vocabulary ---------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "CategoryStatus" AS ENUM ('VISIBLE', 'HIDDEN', 'REDIRECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "status" "CategoryStatus" NOT NULL DEFAULT 'VISIBLE';
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "parentId" TEXT;

-- Restrict, not Cascade: deleting a parent must fail loudly rather than
-- silently orphan (or worse, remove) a subtree.
DO $$ BEGIN
  ALTER TABLE "Category"
    ADD CONSTRAINT "Category_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Category_parentId_idx" ON "Category" ("parentId");

-- 2. carry the old boolean across so nothing regresses before step 3 ---------
UPDATE "Category"
   SET "status" = (CASE WHEN "isLive" THEN 'VISIBLE' ELSE 'HIDDEN' END)::"CategoryStatus";

-- 3. the target structure ----------------------------------------------------
-- Six spheres carry the catalogue; three names widen to say what they now cover.
UPDATE "Category" SET "status" = 'VISIBLE', "name" = 'ბიზნესი და ფინანსები'    WHERE "slug" = 'business';
UPDATE "Category" SET "status" = 'VISIBLE', "name" = 'მარკეტინგი და გაყიდვები' WHERE "slug" = 'marketing';
UPDATE "Category" SET "status" = 'VISIBLE', "name" = 'ტექნოლოგია და პროდუქტი'  WHERE "slug" = 'it';
UPDATE "Category" SET "status" = 'VISIBLE'                                     WHERE "slug" IN ('tax', 'psychology', 'law');

-- Real spheres with no expert yet. The page and its SEO stay; only the menu
-- entry goes, so nobody is sent to an empty room.
UPDATE "Category" SET "status" = 'HIDDEN' WHERE "slug" IN ('career', 'relocation', 'real-estate');

-- `diaspora` is NOT an absorbed sphere and must not be redirected into one. It
-- is the hidden marker the /abroad vertical keys off (lib/abroad.ts): a real
-- category row whose entire job is to stay out of the public catalogue. Stated
-- explicitly rather than left to the isLive backfill, so a stray „turn it on"
-- in the panel cannot quietly put it in the menu.
UPDATE "Category" SET "status" = 'HIDDEN' WHERE "slug" = 'diaspora';

-- Two names lose a borrowed word the site does not need (owner, 2026-08-10):
-- „HR და რეკრუტინგი" → „კადრები", „პროდაქტი" → „პროდუქტი". Neither is shown
-- publicly after this migration; the words are removed so they cannot come back
-- through a seed or a future un-hiding.
UPDATE "Category" SET "name" = 'კადრები'  WHERE "slug" = 'hr';
UPDATE "Category" SET "name" = 'პროდუქტი' WHERE "slug" = 'product';

-- Absorbed into a parent. Experts keep their own categoryId — the parent counts
-- them through the hierarchy instead, so no row is re-pointed here.
UPDATE "Category" AS c
   SET "status" = 'REDIRECTED',
       "parentId" = p."id"
  FROM (VALUES
         ('finance',  'business'),
         ('sales',    'marketing'),
         ('product',  'it'),
         ('design',   'it'),
         ('crypto',   'tax'),
         ('hr',       'career'),
         ('advokati', 'law')
       ) AS v(child, parent)
  JOIN "Category" AS p ON p."slug" = v.parent
 WHERE c."slug" = v.child;

-- 4. guard rails -------------------------------------------------------------
-- A REDIRECTED sphere without a parent is a dead end: its old URL would have
-- nowhere to go. Fail the migration rather than ship that.
DO $$
DECLARE orphan int;
BEGIN
  SELECT COUNT(*) INTO orphan FROM "Category" WHERE "status" = 'REDIRECTED' AND "parentId" IS NULL;
  IF orphan > 0 THEN
    RAISE EXCEPTION 'REDIRECTED categories with no parent: %', orphan;
  END IF;
END $$;

-- A parent that is itself REDIRECTED would chain 301s. One level only.
DO $$
DECLARE chained int;
BEGIN
  SELECT COUNT(*) INTO chained
    FROM "Category" c JOIN "Category" p ON p."id" = c."parentId"
   WHERE p."status" = 'REDIRECTED';
  IF chained > 0 THEN
    RAISE EXCEPTION 'redirect chains (parent is itself REDIRECTED): %', chained;
  END IF;
END $$;

COMMIT;
