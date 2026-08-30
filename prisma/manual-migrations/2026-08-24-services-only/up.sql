-- THE CONSULTATION PRODUCT IS REMOVED.  2026-08-24
--
-- Owner: „მინდა რომ მცოდნეზე კონსულტაციები საერთოდ ამოვიღოთ და მოვარგოთ
-- სერვისებზე რაც ჩანაფიქრში იყო."
--
-- Measured on production the morning this was written:
--   27 TutorProfile · 58 Consultation · 6 267 AvailabilitySlot · 2 Package
--   7 Booking EVER — 2 COMPLETED, 4 CANCELED, 1 NO_SHOW, 0 active, the last on
--   13 August — 0 Review, 14 Message, 27 TutorApplication
--   2 ServiceProfile · 1 ServiceRequest · 1 RequestOffer · 5 RequestAccess
--
-- So the consultation half held the PEOPLE and none of the transactions. This
-- migration moves the people and drops the machinery.
--
-- ⚠️ THE 27 PROFILES ARE MIGRATED, NOT DELETED, AND THEY KEEP THEIR IDS AND
-- THEIR SLUGS. Three consequences, and each one is a bug avoided:
--   · /experts/<slug> answers the same URL it answered yesterday — 27 indexed
--     pages, and every link anybody has ever sent;
--   · `Certificate`/`Education`/`Experience` only need their COLUMN renamed
--     (tutorId → providerId), because the row it points at still has that id;
--   · a saved `Favorite` survives for the same reason.
-- Verified before writing this: 0 id collisions, 0 slug collisions and 0 users
-- holding both profiles.
--
-- ⚠️ EVERY MIGRATED PROVIDER GETS AN ACTIVE `RequestAccess`. That row is what
-- „is this person a provider" now means (lib/identity), and it is also half the
-- catalogue's visibility rule. Without it all 27 would migrate correctly and
-- then vanish from the site.
--
-- ⚠️ EVERY STATEMENT IS IDEMPOTENT. lib/dbBoot re-runs the whole set whenever
-- its own source changes, so `IF EXISTS` / `ON CONFLICT DO NOTHING` is not
-- politeness here, it is the contract.
--
-- Reversible only in shape, not in content: down.sql restores the tables and
-- the columns, and the rows are in scratch/backup-consult-2026-08-24.json.

-- ── 1. The provider profile absorbs the professional columns ────────────────
ALTER TABLE "ServiceProfile"
  ADD COLUMN IF NOT EXISTS "headline"          TEXT,
  ADD COLUMN IF NOT EXISTS "professions"       TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "categoryId"        TEXT,
  ADD COLUMN IF NOT EXISTS "yearsExp"          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "languages"         TEXT[] NOT NULL DEFAULT ARRAY['ka'],
  ADD COLUMN IF NOT EXISTS "verified"          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "featured"          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "linkedinUrl"       TEXT,
  ADD COLUMN IF NOT EXISTS "websiteUrl"        TEXT,
  ADD COLUMN IF NOT EXISTS "videoUrl"          TEXT,
  ADD COLUMN IF NOT EXISTS "responseHours"     INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS "responseMedianMin" INTEGER,
  ADD COLUMN IF NOT EXISTS "responseSampleN"   INTEGER,
  ADD COLUMN IF NOT EXISTS "rating"            DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reviewsCount"      INTEGER NOT NULL DEFAULT 0;

-- SET NULL, never CASCADE: an admin retiring a sphere must not delete the
-- people filed under it.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServiceProfile_categoryId_fkey') THEN
    ALTER TABLE "ServiceProfile" ADD CONSTRAINT "ServiceProfile_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ServiceProfile_categoryId_idx"        ON "ServiceProfile" ("categoryId");
CREATE INDEX IF NOT EXISTS "ServiceProfile_featured_idx"          ON "ServiceProfile" ("featured");
CREATE INDEX IF NOT EXISTS "ServiceProfile_published_available_idx" ON "ServiceProfile" ("published", "available");

-- ── ServiceProfile.servicesConfirmedAt — „have they LOOKED at the list" ─────
-- Additive, nullable, no backfill: null is the honest state for everybody the
-- day it appears, including the two profiles that predate the migration.
--
-- ⚠️ WHY IT IS NOT A FIX APPLIED FOR THEM. Step 2 above seeded each migrated
-- provider with their whole SPHERE, because a provider with no services is
-- invisible to routing and „nothing ticked" would have migrated 27 people into
-- silence. The cost is real — all four lawyers claim all seven legal services,
-- so they read as one person on a card and the filter narrows nothing — and the
-- obvious repair is to derive each person's real list from the bio they wrote.
-- That was built, run against the live data, and NOT applied: a bio is evidence
-- of what somebody definitely does and never of what they do not, so it would
-- have taken „დღგ" from an accountant who had not happened to type the word,
-- and dropped them out of every queue that names it.
--
-- Owner, 2026-08-25: „არაფერი არ უნდა შეცვალოს, წაშლა არ გვინდა, მათ უნდა
-- შევიდნენ ისევ თავიან ექაუნთზე." So nothing is changed and nothing is deleted;
-- this column only records whether the person has been back to look, and the
-- workspace asks them until they have.
ALTER TABLE "ServiceProfile"
  ADD COLUMN IF NOT EXISTS "servicesConfirmedAt" TIMESTAMP(3);

-- The one application form now asks for a profession too.
ALTER TABLE "MasterApplication"
  ADD COLUMN IF NOT EXISTS "professions" TEXT[] NOT NULL DEFAULT '{}';

-- ── 2. The 27 people move ───────────────────────────────────────────────────
--
-- `services[]` is seeded from the SPHERE they are already filed under, through
-- the taxonomy's own `Topic.categorySlug` map (lib/requestTopics). A provider
-- with no services is invisible to routing, so „nothing ticked" would migrate
-- them into silence; the sphere is what we actually know about them, and they
-- can narrow it on /work/services.
--
-- The map is written out rather than derived because SQL cannot read the
-- TypeScript vocabulary. It is generated from it (scratch/_map.ts) and covers
-- every sphere the 27 are filed under; a sub-category (`advokati` → `law`,
-- `sales` → `marketing`, `finance` → `tax`) falls through to its parent.
DO $$
DECLARE
  has_tutor BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'TutorProfile'
  ) INTO has_tutor;
  IF NOT has_tutor THEN RETURN; END IF;

  CREATE TEMP TABLE _cat_topics (slug TEXT PRIMARY KEY, topics TEXT[]) ON COMMIT DROP;
  INSERT INTO _cat_topics (slug, topics) VALUES
    ('architecture', ARRAY['interior','architecture','estimate']),
    ('business',     ARRAY['business-plan','strategy','startup','operations','project-mgmt','franchise']),
    ('career',       ARRAY['cv','interview','career-adv','hiring','training']),
    ('crypto',       ARRAY['crypto']),
    ('design',       ARRAY['logo','uxui','print','presentation']),
    ('finance',      ARRAY['fin-analysis','investment']),
    ('health',       ARRAY['fitness','yoga','dietitian','nutrition','training-plan']),
    ('it',           ARRAY['website','mobile-app','automation','data-an','ai','security','crm']),
    ('law',          ARRAY['contract','labor-law','family-law','corp-law','ip-law','court','company-reg']),
    ('marketing',    ARRAY['smm','seo','ads','branding','content','pr']),
    ('psychology',   ARRAY['psy-individual','psy-couple','psy-child','psy-org']),
    ('real-estate',  ARRAY['valuation','broker']),
    ('relocation',   ARRAY['visa','residence','study-abroad','tax-residence']),
    ('sales',        ARRAY['sales-sys']),
    ('tax',          ARRAY['accounting','declaration','vat','audit']);

  INSERT INTO "ServiceProfile" (
    "id", "userId", "services", "areas", "priceFrom", "about", "slug",
    "published", "available", "createdAt", "updatedAt", "workPhotos",
    "headline", "professions", "categoryId", "yearsExp", "languages",
    "verified", "featured", "linkedinUrl", "websiteUrl", "videoUrl",
    "responseHours", "rating", "reviewsCount"
  )
  SELECT
    t."id",
    t."userId",
    COALESCE(own.topics, parent.topics, '{}'),
    -- Tbilisi only, for now (CITIES in lib/requestTopics). An empty `areas`
    -- would make them unroutable, and it is where they already work.
    ARRAY['TBILISI'],
    -- The flat consultation price becomes the „from" figure. It is the only
    -- number they ever gave us; the per-service list is theirs to fill in.
    NULLIF(t."price", 0),
    t."bio",
    t."slug",
    TRUE,
    t."available",
    t."createdAt",
    now(),
    '{}',
    NULLIF(btrim(t."headline"), ''),
    t."professions",
    t."categoryId",
    t."yearsExp",
    t."languages",
    t."verified",
    t."featured",
    t."linkedinUrl",
    t."websiteUrl",
    t."videoUrl",
    t."responseHours",
    -- 🔒 NOT `t.rating` / `t.reviewsCount`. Those were 0 for all 27 anyway, and
    -- they described booking reviews; the new number is derived from reviews on
    -- finished JOBS, of which they have none. Never carry a rating across.
    0,
    0
  FROM "TutorProfile" t
  LEFT JOIN "Category" c        ON c."id" = t."categoryId"
  LEFT JOIN "Category" cp       ON cp."id" = c."parentId"
  LEFT JOIN _cat_topics own     ON own.slug = c."slug"
  LEFT JOIN _cat_topics parent  ON parent.slug = cp."slug"
  ON CONFLICT ("id") DO NOTHING;

  -- Admission. `kind: EXPERT` is „one named human who writes offers" — the same
  -- row a trades provider already holds; the difference between a lawyer and a
  -- plumber is what they are filed under, never how they bid.
  -- ⚠️ NO "updatedAt". The table does not have one — an allowlist row records an
  -- admission and there is no second event to stamp — and assuming otherwise is
  -- what this statement failed on the first time it met the real database
  -- (2026-08-25). It failed before any DROP ran, which is why they are last.
  INSERT INTO "RequestAccess" ("id", "kind", "userId", "active", "note", "createdAt")
  SELECT
    'ra_' || substr(md5(t."userId"), 1, 21),
    'EXPERT',
    t."userId",
    TRUE,
    'მიგრირებული კონსულტაციის პროფილიდან 2026-08-24',
    now()
  FROM "TutorProfile" t
  WHERE NOT EXISTS (SELECT 1 FROM "RequestAccess" ra WHERE ra."userId" = t."userId")
  ON CONFLICT DO NOTHING;

  -- Everybody who sells is role PROVIDER. 26 of the 27 already were; the odd
  -- one out would have been refused by every `requireRole` on the workspace.
  UPDATE "User" u SET "role" = 'PROVIDER'
   WHERE u."role" <> 'ADMIN'
     AND EXISTS (SELECT 1 FROM "TutorProfile" t WHERE t."userId" = u."id");
END $$;

-- ── 3. The credential tables follow their owner ─────────────────────────────
-- The rename is enough because the new profile carries the OLD id.
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['Certificate','Education','Experience'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name=tbl AND column_name='tutorId') THEN
      EXECUTE format('ALTER TABLE %I RENAME COLUMN "tutorId" TO "providerId"', tbl);
    END IF;
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', tbl, tbl || '_tutorId_fkey');
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', tbl, tbl || '_providerId_fkey');
    -- A row whose profile did not migrate (there are none) would block the FK.
    EXECUTE format('DELETE FROM %I x WHERE NOT EXISTS (SELECT 1 FROM "ServiceProfile" s WHERE s."id" = x."providerId")', tbl);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("providerId") REFERENCES "ServiceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE',
      tbl, tbl || '_providerId_fkey');
    EXECUTE format('DROP INDEX IF EXISTS %I', tbl || '_tutorId_idx');
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I ("providerId")', tbl || '_providerId_idx', tbl);
  END LOOP;
END $$;

-- ── 4. A saved provider ─────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='Favorite' AND column_name='tutorId') THEN
    ALTER TABLE "Favorite" RENAME COLUMN "tutorId" TO "providerId";
  END IF;
  ALTER TABLE "Favorite" DROP CONSTRAINT IF EXISTS "Favorite_tutorId_fkey";
  ALTER TABLE "Favorite" DROP CONSTRAINT IF EXISTS "Favorite_providerId_fkey";
  DELETE FROM "Favorite" f WHERE NOT EXISTS (SELECT 1 FROM "ServiceProfile" s WHERE s."id" = f."providerId");
  ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_providerId_fkey"
    FOREIGN KEY ("providerId") REFERENCES "ServiceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
END $$;
DROP INDEX IF EXISTS "Favorite_userId_tutorId_key";
DROP INDEX IF EXISTS "Favorite_tutorId_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "Favorite_userId_providerId_key" ON "Favorite" ("userId", "providerId");
CREATE INDEX IF NOT EXISTS "Favorite_providerId_idx" ON "Favorite" ("providerId");

-- ── 5. A review hangs on a finished JOB ─────────────────────────────────────
-- 0 rows on production, so nothing is lost by dropping the booking half.
--
-- ⚠️ THE CHECK COMES OFF FIRST. `Review_attached_to_something` names TWO columns
-- („bookingId IS NOT NULL OR offerId IS NOT NULL"), and Postgres refuses to DROP
-- COLUMN out from under a multi-column constraint — it only auto-drops the
-- single-column ones. Without this line the two DROP COLUMNs below fail.
ALTER TABLE "Review" DROP CONSTRAINT IF EXISTS "Review_attached_to_something";
ALTER TABLE "Review" DROP CONSTRAINT IF EXISTS "Review_bookingId_fkey";
ALTER TABLE "Review" DROP CONSTRAINT IF EXISTS "Review_tutorId_fkey";
DROP INDEX IF EXISTS "Review_tutorId_createdAt_idx";
ALTER TABLE "Review" DROP COLUMN IF EXISTS "bookingId";
ALTER TABLE "Review" DROP COLUMN IF EXISTS "tutorId";
CREATE INDEX IF NOT EXISTS "Review_createdAt_idx" ON "Review" ("createdAt");

-- ── 6. A request kind called „კონსულტაცია" ──────────────────────────────────
-- `ServiceRequest.kind` is a plain TEXT column (never an enum, deliberately —
-- lib/requestTopics explains why), so this is one UPDATE.
UPDATE "ServiceRequest" SET "kind" = 'MEETING' WHERE "kind" = 'CONSULTATION';
ALTER TABLE "ServiceRequest" ALTER COLUMN "kind" SET DEFAULT 'MEETING';

-- ── 7. The machinery ────────────────────────────────────────────────────────
-- Children first — Review and Favorite were repointed above, so nothing outside
-- this list references any of them.
ALTER TABLE "Category" DROP COLUMN IF EXISTS "defaultServiceType";

-- ⚠️ „RescheduleRequest", NOT „LegacyRescheduleRequest". The Prisma MODEL was
-- called LegacyRescheduleRequest and carried `@@map("RescheduleRequest")`, so the
-- table on disk has always had the shorter name. Dropping the model name was a
-- silent no-op (`IF EXISTS`), and the miss only surfaced two steps later, when
-- `DROP TYPE "RescheduleStatus"` refused because that very table still held the
-- type. Found 2026-08-25 by running this against the real database.
DROP TABLE IF EXISTS "RescheduleRequest"     CASCADE;
DROP TABLE IF EXISTS "Dispute"                 CASCADE;
DROP TABLE IF EXISTS "Message"                 CASCADE;
DROP TABLE IF EXISTS "Enrollment"              CASCADE;
DROP TABLE IF EXISTS "Package"                 CASCADE;
DROP TABLE IF EXISTS "Booking"                 CASCADE;
DROP TABLE IF EXISTS "AvailabilitySlot"        CASCADE;
DROP TABLE IF EXISTS "Consultation"            CASCADE;
DROP TABLE IF EXISTS "TutorApplication"        CASCADE;
DROP TABLE IF EXISTS "TutorProfile"            CASCADE;

DROP TYPE IF EXISTS "BookingStatus";
DROP TYPE IF EXISTS "PayoutStatus";
DROP TYPE IF EXISTS "ServiceType";
DROP TYPE IF EXISTS "ProfileType";
DROP TYPE IF EXISTS "EnrollmentStatus";
DROP TYPE IF EXISTS "RescheduleStatus";
DROP TYPE IF EXISTS "DisputeReason";
DROP TYPE IF EXISTS "DisputeOutcome";

-- ── 8. Two dead enum values on Role ─────────────────────────────────────────
--
-- ⚠️ AFTER THE DROPS, AND IT USED TO BE BEFORE THEM. Postgres cannot drop an
-- enum type while any column still has it, and `Booking.cancelledBy` was a
-- `Role`. Running this first therefore failed with „cannot drop type Role_old
-- because other objects depend on it" — found on 2026-08-25 by running the
-- migration against the real database rather than reading it. Once the tables
-- are gone, "User"."role" is the only column left holding the type.
--
-- STUDENT and TUTOR were the original pair, renamed to USER/PROVIDER when the
-- site stopped being a tutoring platform and kept only because Postgres cannot
-- drop a value in place. Measured before the swap: 0 rows on either.
DO $$
DECLARE stragglers INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
              WHERE t.typname = 'Role' AND e.enumlabel IN ('STUDENT','TUTOR')) THEN
    EXECUTE 'SELECT count(*) FROM "User" WHERE "role"::text IN (''STUDENT'',''TUTOR'')' INTO stragglers;
    IF stragglers > 0 THEN
      RAISE EXCEPTION 'Role still has % row(s) on STUDENT/TUTOR — migrate them before dropping the values', stragglers;
    END IF;
    ALTER TYPE "Role" RENAME TO "Role_old";
    CREATE TYPE "Role" AS ENUM ('USER','PROVIDER','ADMIN');
    ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
    ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
    ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';
    DROP TYPE "Role_old";
  END IF;
END $$;

-- ── 9. Un-seed the university subjects ──────────────────────────────────────
-- ⚠️ THIS FIXES STEP 2, AND STEP 2 IS ABOVE IT. The sphere → topics map seeded
-- each migrated professional with their whole sphere, and six of those spheres
-- lead with the tutoring taxonomy's ACADEMIC topic — `higher → ბუღალტერია`,
-- `higher → სამართალი`, `higher → მენეჯმენტი`, `higher → ფინანსები`. Those mean
-- „the university subject", not „the service": a practising advocate came out of
-- the migration filed under „სამართალი (უმაღლესი)", which is what a student
-- ticks when they want to be TAUGHT law.
--
-- Measured 2026-08-25, the day after: 14 of 29 public profiles carried one, and
-- it was the FIRST chip on their card — which is why all four lawyers read
-- „სამართალი · ხელშეკრულება · +6" and looked like the same person.
--
-- Removing them unroutes nobody: every one of the 14 keeps between 2 and 7 real
-- service topics. Checked before writing this, not assumed.
--
-- The map in step 2 has been corrected too, so a fresh run never adds them; this
-- statement is for the database that already ran the old one. Idempotent.
UPDATE "ServiceProfile"
   SET "services" = ARRAY(SELECT unnest("services") EXCEPT SELECT unnest(ARRAY['accounting-l', 'law-l', 'management-l', 'finance-l', 'economics-l', 'statistics-l', 'medicine-l']))
 WHERE "services" && ARRAY['accounting-l', 'law-l', 'management-l', 'finance-l', 'economics-l', 'statistics-l', 'medicine-l'];

-- ── 10. The bell still pointed at the pages that went ───────────────────────
-- Measured 2026-08-25, after step 7 had run: 88 of 479 notifications carried an
-- href under /me/bookings, /work/bookings or /apply — and 39 of them were still
-- UNREAD. A person opens their bell, reads „ჯავშანი შეიქმნა", taps it and lands
-- on a 404 for a booking that no longer exists in any form.
--
-- ⚠️ DELETED BY TYPE, NOT BY HREF. Every BOOKING_* notification lost its subject
-- when the table went, so the row is not history worth keeping — there is
-- nothing left for it to describe. The href is only how the damage was FOUND;
-- matching on it would also catch `/apply`, which still resolves (308 → /join)
-- and whose APPLICATION_STATUS rows are about an application that does still
-- exist.
--
-- Idempotent: the second run matches nothing.
DELETE FROM "Notification" WHERE "type" LIKE 'BOOKING\_%';

-- ── 11. The guards ──────────────────────────────────────────────────────────
DO $$
DECLARE n INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='TutorProfile') THEN
    RAISE EXCEPTION 'TutorProfile survived the drop';
  END IF;
  SELECT count(*) INTO n FROM "ServiceProfile";
  IF n < 29 THEN
    RAISE EXCEPTION 'only % provider profiles after the move — 27 migrated + 2 existing were expected', n;
  END IF;
  SELECT count(*) INTO n FROM "ServiceProfile" WHERE "slug" IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION '% profiles lost their slug — every /experts/<slug> they own is a 404', n;
  END IF;
  SELECT count(*) INTO n FROM "ServiceProfile" s
   WHERE s."userId" IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM "RequestAccess" ra WHERE ra."userId" = s."userId" AND ra."active");
  IF n > 0 THEN
    RAISE EXCEPTION '% providers have no active allowlist row — they would vanish from the catalogue', n;
  END IF;
END $$;
