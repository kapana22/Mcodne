-- Nine new spheres, opened HIDDEN, ready for their first expert.  2026-08-11
--
-- Run AFTER 2026-08-11-taxonomy-realign.
-- prisma db execute --file prisma/manual-migrations/2026-08-11-open-new-spheres/up.sql --schema prisma/schema.prisma
--
-- WHY HIDDEN AND NOT VISIBLE. HIDDEN is not „off" — it is the state this
-- platform already uses for „a real sphere with nobody in it yet":
--
--   · out of the menu, out of the home grid, out of the browse filter, so a
--     client is never sent to an empty room;
--   · IN the /apply picker and the profile editor, because somebody has to be
--     able to be the first (lib/categoryTree → ASSIGNABLE_CATEGORY);
--   · self-clearing: approving the first expert into one flips it VISIBLE and
--     writes an audit row (app/api/applications/[id] and the admin re-file
--     endpoint both do it).
--
-- So this file changes NOTHING a visitor can see today, and every row in it
-- publishes itself the day its first expert is approved. That is the whole
-- request: be ready before the people arrive.
--
-- WHAT IS DELIBERATELY NOT HERE. Tutoring / რეპეტიტორობა (owner, 2026-08-11):
-- not yet, and it would also fight the product's own vocabulary — CLAUDE.md
-- bans „რეპეტიტორი" in UI copy and the site sells consultations, not lessons.
-- The /swavleba packages vertical is a separate decision (it is also still
-- unreachable — nothing in the product sets TutorProfile.profileType).
--
-- SLUGS ARE LATIN and follow the existing style. `relocation` is REUSED rather
-- than invented: lib/professionSeo already ships a landing page pointing at it
-- (/konsultacia/relokaciis-konsultanti) and the row has never existed, so that
-- page currently resolves to a category that is not there. Creating it fixes a
-- broken landing and opens the sphere in one statement.
--
-- ⚠️ `medicine`. Online medical advice is regulated, and the benchmark this
-- product cites (ekimo.ge) is a licensed medical booking service. The sphere is
-- created because it was asked for; before its first expert is approved, decide
-- what verification is required — the „გადამოწმებული" badge is currently an
-- optional checkbox and 0 of 22 approvals have used it.

BEGIN;

-- Spheres. `status = HIDDEN`, `isLive = false` (written together everywhere),
-- `defaultServiceType = CONSULTATION` (the product default; new experts inherit
-- it unless the admin changes the category's own default).
INSERT INTO "Category" ("id", "slug", "name", "order", "status", "isLive", "defaultServiceType", "count")
VALUES
  (gen_random_uuid()::text, 'health',       'ჯანმრთელობა და კვება',      70, 'HIDDEN', false, 'CONSULTATION', 0),
  (gen_random_uuid()::text, 'medicine',     'მედიცინა',                  73, 'HIDDEN', false, 'CONSULTATION', 0),
  (gen_random_uuid()::text, 'architecture', 'არქიტექტურა და მშენებლობა', 75, 'HIDDEN', false, 'CONSULTATION', 0),
  (gen_random_uuid()::text, 'tourism',      'ტურიზმი და მასპინძლობა',    78, 'HIDDEN', false, 'CONSULTATION', 0),
  (gen_random_uuid()::text, 'logistics',    'ლოგისტიკა და საბაჟო',       80, 'HIDDEN', false, 'CONSULTATION', 0),
  (gen_random_uuid()::text, 'media',        'მედია და კონტენტი',         83, 'HIDDEN', false, 'CONSULTATION', 0),
  (gen_random_uuid()::text, 'grants',       'გრანტები და დაფინანსება',   86, 'HIDDEN', false, 'CONSULTATION', 0),
  (gen_random_uuid()::text, 'relocation',   'ვიზა და მიგრაცია',          88, 'HIDDEN', false, 'CONSULTATION', 0),
  (gen_random_uuid()::text, 'agriculture',  'სოფლის მეურნეობა',          90, 'HIDDEN', false, 'CONSULTATION', 0)
ON CONFLICT ("slug") DO NOTHING;

-- Sub-fields. REDIRECTED with a parent is how this schema says „folded into":
-- the child keeps its own page and its own URL, its experts surface under the
-- parent in browse, and the parent's count includes them (lib/categoryTree).
--
-- ⚠️ Their parents are HIDDEN right now, and a REDIRECTED row whose parent is
-- not VISIBLE strands its experts — the guard at the end of the 2026-08-10
-- migration refuses exactly that shape. It is SAFE here only because none of
-- these hold anybody: the parent goes VISIBLE the moment its first expert is
-- approved, which necessarily happens before any child of it can have one.
-- The final guard below re-asserts this on the real data rather than trusting
-- the sentence you just read.
INSERT INTO "Category" ("id", "slug", "name", "order", "status", "isLive", "defaultServiceType", "count", "parentId")
SELECT gen_random_uuid()::text, v.slug, v.name, v.n, 'REDIRECTED', false, 'CONSULTATION', 0, p."id"
  FROM (VALUES
    ('nutrition',   'დიეტოლოგია',      71, 'health'),
    ('fitness',     'ფიტნესი',         72, 'health'),
    ('interior',    'ინტერიერი',       76, 'architecture'),
    ('customs',     'ექსპორტი-იმპორტი', 81, 'logistics'),
    ('video',       'ფოტო და ვიდეო',   84, 'media'),
    ('translation', 'თარგმანი',        85, 'media'),
    ('tenders',     'ტენდერები',       87, 'grants')
  ) AS v(slug, name, n, parent)
  JOIN "Category" p ON p."slug" = v.parent
ON CONFLICT ("slug") DO NOTHING;

-- ── guards ───────────────────────────────────────────────────────────────────

-- No REDIRECTED row without a parent (a dead-end 301).
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

-- THE ONE THAT MATTERS HERE: nobody may be stranded under a non-VISIBLE parent.
-- The new children are allowed to sit under HIDDEN parents ONLY while empty.
DO $$
DECLARE stranded int;
BEGIN
  SELECT COUNT(*) INTO stranded
    FROM "Category" c
    JOIN "Category" p ON p."id" = c."parentId"
   WHERE c."status" = 'REDIRECTED'
     AND p."status" <> 'VISIBLE'
     AND EXISTS (SELECT 1 FROM "TutorProfile" t WHERE t."categoryId" = c."id");
  IF stranded > 0 THEN
    RAISE EXCEPTION '% child categor(ies) hold experts under a non-VISIBLE sphere', stranded;
  END IF;
END $$;

-- No publicly-listed expert may have been pushed into a HIDDEN category.
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

-- Verify (read-only):
--   SELECT c.slug, c.name, c.status, c."order", p.slug AS parent
--     FROM "Category" c LEFT JOIN "Category" p ON p.id = c."parentId"
--    ORDER BY c."order";
