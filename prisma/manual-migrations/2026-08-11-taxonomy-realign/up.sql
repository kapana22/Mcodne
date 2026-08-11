-- Taxonomy realignment.  2026-08-11 (rewritten against the live tree, 14:57)
--
-- Run: prisma db execute --file prisma/manual-migrations/2026-08-11-taxonomy-realign/up.sql --schema prisma/schema.prisma
--
-- ⚠️ REWRITTEN. The first draft of this file was written against the tree as it
-- stood this morning. It was never run, and in the meantime two categories were
-- re-parented by hand from the admin panel — so the rename it proposed would
-- have produced a name that lies about its own contents. It is rewritten here
-- against what is actually in the database, not against what was.
--
-- ── WHERE THINGS STAND ──────────────────────────────────────────────────────
--
--   business  „ბიზნესი და ფინანსები"   3 experts, children: career
--   tax       „გადასახადები"            3 experts, children: finance(2), hr, crypto
--   law · marketing · psychology · it   unchanged
--
-- ── THE TWO PROBLEMS ────────────────────────────────────────────────────────
--
-- 1. „კადრები" (HR) sits under „გადასახადები". HR consulting is not tax work —
--    it is people-and-organisation work, which is what „კარიერა" is too, and
--    „კარიერა" is already under business. The pair belongs together, and it
--    belongs under business. This is the one STRUCTURAL change here.
--
-- 2. The sphere named „ბიზნესი და ფინანსები" holds no financier: both are under
--    „გადასახადები", through `finance`. Every Georgian practice sells
--    ბუღალტერია · გადასახადები · ფინანსები as ONE line of work — same client,
--    same month-end, often the same person — while ბიზნეს-სტრატეგია is a
--    different engagement sold to a different buyer. The TREE already says
--    that correctly. Only the two NAMES, both written before the sub-fields
--    existed, say otherwise.
--
--       ბიზნესი და ფინანსები  →  ბიზნესი და სტრატეგია      (slug `business`)
--       გადასახადები          →  ფინანსები და გადასახადები (slug `tax`)
--
--    NO URL CHANGES. `slug` is the identifier and `name` is copy; every
--    /categories/… path resolves exactly as before, including the nested ones.
--
-- Plus the two misfiled experts the audit found, and one `order` per row.
-- NOTHING IS DELETED. Every statement is guarded or idempotent; down.sql
-- restores the prior state exactly.

BEGIN;

-- 1. HR joins its own kind ----------------------------------------------------
-- Guarded on the wrong parent, so a re-run after the move is a no-op and a
-- later deliberate placement is never overwritten.
UPDATE "Category" AS c
   SET "parentId" = b."id"
  FROM "Category" AS t, "Category" AS b
 WHERE c."slug" = 'hr'
   AND t."id" = c."parentId" AND t."slug" = 'tax'
   AND b."slug" = 'business';

-- 2. the two names ------------------------------------------------------------
UPDATE "Category" SET "name" = 'ბიზნესი და სტრატეგია'
 WHERE "slug" = 'business' AND "name" = 'ბიზნესი და ფინანსები';

UPDATE "Category" SET "name" = 'ფინანსები და გადასახადები'
 WHERE "slug" = 'tax' AND "name" = 'გადასახადები';

-- 3. one display order, no ties -----------------------------------------------
-- `order` is the ONLY sort key for the menu, the home grid, the browse filter
-- and every picker; ties fell through to `name`, so two spheres could swap
-- places between deploys (tax=2/finance=2, sales=6/psychology=6, advokati=901).
-- Spheres in the sequence a client should meet them; each sphere's children
-- numbered inside its own decade.
UPDATE "Category" SET "order" = v.n FROM (VALUES
  ('business',     1),
  ('career',       2),   -- child of business
  ('hr',           3),   -- child of business (moved above)
  ('tax',         10),
  ('finance',     11),   -- child of tax
  ('crypto',      12),   -- child of tax
  ('law',         20),
  ('advokati',    21),   -- child of law
  ('marketing',   30),
  ('sales',       31),   -- child of marketing
  ('design',      32),   -- child of marketing
  ('it',          40),
  ('product',     41),   -- child of it
  ('psychology',  50),
  -- a real sphere with no expert yet: it keeps its page and its SEO and stays
  -- out of the menu until somebody is filed there (approval un-hides it).
  ('real-estate', 60)
) AS v(slug, n) WHERE "Category"."slug" = v.slug;

-- 4. ნინო გახოკია → ფსიქოლოგია -------------------------------------------------
-- Her application, her `specialty` and her profile all say „ფსიქოლოგია"; she
-- was filed under business and is therefore missing from the psychology sphere
-- she is the third expert of. Matched on the WRONG category too, so a re-run
-- after the move does nothing and a namesake elsewhere is never caught.
UPDATE "TutorProfile" tp
   SET "categoryId" = (SELECT "id" FROM "Category" WHERE "slug" = 'psychology')
  FROM "User" u, "Category" c
 WHERE u."id" = tp."userId"
   AND c."id" = tp."categoryId"
   AND u."fullName" = 'ნინო გახოკია'
   AND c."slug" = 'business';

-- 5. გვანცა ჭაღოშვილი → ფინანსები ----------------------------------------------
-- Owner's call. Bookkeeping is a sub-discipline of finance, and the profiles
-- already filed under `finance` are bookkeepers themselves („ვარ გამოცდილი
-- მთავარი ბუღალტერი"). Only touches her while she is unfiled.
UPDATE "TutorProfile" tp
   SET "categoryId" = (SELECT "id" FROM "Category" WHERE "slug" = 'finance')
  FROM "User" u
 WHERE u."id" = tp."userId"
   AND u."fullName" = 'გვანცა ჭაღოშვილი'
   AND tp."categoryId" IS NULL;

-- ── guards ───────────────────────────────────────────────────────────────────

-- A REDIRECTED row with no parent is a dead-end redirect.
DO $$
DECLARE orphan int;
BEGIN
  SELECT COUNT(*) INTO orphan FROM "Category" WHERE "status" = 'REDIRECTED' AND "parentId" IS NULL;
  IF orphan > 0 THEN RAISE EXCEPTION 'REDIRECTED categories with no parent: %', orphan; END IF;
END $$;

-- One level only: a parent that is itself REDIRECTED would chain 301s.
DO $$
DECLARE chained int;
BEGIN
  SELECT COUNT(*) INTO chained
    FROM "Category" c JOIN "Category" p ON p."id" = c."parentId"
   WHERE p."status" = 'REDIRECTED';
  IF chained > 0 THEN RAISE EXCEPTION 'nested redirects: %', chained; END IF;
END $$;

-- A REDIRECTED row whose parent is not VISIBLE strands its experts: browsable
-- from nowhere, counted under nothing. Empty ones are tolerated (a sphere may
-- be opened before its first expert); one holding people is not.
DO $$
DECLARE stranded int;
BEGIN
  SELECT COUNT(*) INTO stranded
    FROM "Category" c JOIN "Category" p ON p."id" = c."parentId"
   WHERE c."status" = 'REDIRECTED' AND p."status" <> 'VISIBLE'
     AND EXISTS (SELECT 1 FROM "TutorProfile" t WHERE t."categoryId" = c."id");
  IF stranded > 0 THEN RAISE EXCEPTION '% sub-categor(ies) hold experts under a non-VISIBLE sphere', stranded; END IF;
END $$;

-- No publicly-listed expert may sit in a HIDDEN category. Same three gates
-- lib/tutorsQuery uses to decide who is listed.
DO $$
DECLARE lost int;
BEGIN
  SELECT COUNT(*) INTO lost
    FROM "TutorProfile" tp
    JOIN "User" u ON u."id" = tp."userId"
    JOIN "Category" c ON c."id" = tp."categoryId"
   WHERE tp."available" = true
     AND u."suspendedAt" IS NULL
     AND EXISTS (SELECT 1 FROM "Consultation" cs WHERE cs."tutorId" = tp."id")
     AND c."status" = 'HIDDEN';
  IF lost > 0 THEN RAISE EXCEPTION 'this migration would hide % listed expert(s)', lost; END IF;
END $$;

-- Nobody in the /abroad marker — see lib/abroad.ts. The row does not exist in
-- this database today; the check costs nothing and says so loudly if it appears.
DO $$
DECLARE marked int;
BEGIN
  SELECT COUNT(*) INTO marked
    FROM "TutorProfile" tp JOIN "Category" c ON c."id" = tp."categoryId"
   WHERE c."slug" = 'diaspora';
  IF marked > 0 THEN RAISE EXCEPTION '% expert(s) filed in the diaspora marker', marked; END IF;
END $$;

-- `order` decides the menu; a tie lets two spheres swap between deploys.
DO $$
DECLARE dupes int;
BEGIN
  SELECT COUNT(*) INTO dupes FROM (
    SELECT "order" FROM "Category" GROUP BY "order" HAVING COUNT(*) > 1
  ) d;
  IF dupes > 0 THEN RAISE EXCEPTION '% duplicated Category.order value(s)', dupes; END IF;
END $$;

COMMIT;

-- Verify (read-only, run after):
--   SELECT c.slug, c.name, c.status, c."order", p.slug AS parent,
--          (SELECT COUNT(*) FROM "TutorProfile" t WHERE t."categoryId" = c.id) AS tutors
--     FROM "Category" c LEFT JOIN "Category" p ON p.id = c."parentId"
--    ORDER BY c."order";
