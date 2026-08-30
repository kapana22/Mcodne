-- ROLLBACK OF 2026-08-24-services-only.
--
-- ⚠️ READ THIS FIRST: THIS FILE RESTORES THE SHAPE, NOT THE CONTENT.
--
-- It recreates the nine tables, the eight enum types and every column, index and
-- constraint that `up.sql` dropped, and it reverses the six in-place changes
-- (the credential renames, Favorite, Review, ServiceRequest.kind, the Role enum,
-- Category.defaultServiceType). It puts back ZERO ROWS.
--
-- THE ROWS ARE IN `scratch/backup-consult-2026-08-24.json` — every live table,
-- 9.4MB, taken before any DDL ran. Restoring them is a separate, deliberate step
-- and there is no script for it, on purpose: by the time anybody runs this file
-- the site has been selling services against these ids for some period, and
-- blind-loading a day-old snapshot over live rows is how a rollback becomes the
-- outage. Load the tables you actually need, in FK order, and check the ids.
--
-- ⚠️ AND THE 27 PROFILES DO NOT COME BACK BY DROPPING ANYTHING. `up.sql` did not
-- move them — it COPIED them into ServiceProfile carrying their ids and slugs,
-- then dropped the source. So after this file runs, those 27 people exist as
-- ServiceProfile rows AND as empty TutorProfile shells. Decide which is true
-- before you let the site read both: two profiles for one person at one address
-- is worse than either half alone.
--
-- WHY THE DDL BELOW IS TRUSTWORTHY. It was not hand-copied from schema.prisma —
-- it was dumped out of the production database itself on 2026-08-25, while the
-- tables were still there, by scratch/_ddl.ts (read-only, information_schema and
-- pg_catalog). What follows is the shape that actually existed, defaults and all.
--
-- Idempotent, like everything else here: `IF EXISTS` / `IF NOT EXISTS`
-- throughout, so a half-finished rollback can simply be run again.

-- ── 1. The enum types, before the columns that reference them ───────────────
CREATE TYPE "BookingStatus" AS ENUM ('PREPARING', 'CONFIRMED', 'LIVE', 'COMPLETED', 'CANCELED', 'NO_SHOW');
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'RELEASED', 'REFUNDED');
CREATE TYPE "ServiceType" AS ENUM ('CONSULTATION', 'RECURRING');
CREATE TYPE "ProfileType" AS ENUM ('EXPERT', 'TEACHER');
CREATE TYPE "EnrollmentStatus" AS ENUM ('REQUESTED', 'ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "RescheduleStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');
CREATE TYPE "DisputeReason" AS ENUM ('NO_SHOW', 'QUALITY', 'WRONG_TOPIC', 'UNPROFESSIONAL', 'TECHNICAL', 'OTHER');
CREATE TYPE "DisputeOutcome" AS ENUM ('PENDING', 'REFUND_FULL', 'REFUND_PARTIAL', 'REDO_FREE', 'DISMISSED');

-- ── 2. The ten tables, exactly as production had them ───────────────────────
-- Columns only, ALL of them first: a foreign key cannot name a table that
-- does not exist yet, and these ten reference each other in both directions.
CREATE TABLE IF NOT EXISTS "TutorProfile" (
  "id" text NOT NULL,
  "userId" text NOT NULL,
  "headline" text NOT NULL,
  "bio" text,
  "specialty" text NOT NULL,
  "yearsExp" integer NOT NULL DEFAULT 0,
  "rating" double precision NOT NULL DEFAULT 0,
  "reviewsCount" integer NOT NULL DEFAULT 0,
  "sessionsCount" integer NOT NULL DEFAULT 0,
  "price" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'GEL'::text,
  "verified" boolean NOT NULL DEFAULT false,
  "available" boolean NOT NULL DEFAULT true,
  "responseHours" integer NOT NULL DEFAULT 24,
  "languages" text[] DEFAULT ARRAY['ka'::text],
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) without time zone NOT NULL,
  "categoryId" text,
  "linkedinUrl" text,
  "professionData" jsonb,
  "websiteUrl" text,
  "serviceType" "ServiceType" NOT NULL DEFAULT 'CONSULTATION'::"ServiceType",
  "consultationDurationMin" integer NOT NULL DEFAULT 30,
  "featured" boolean NOT NULL DEFAULT false,
  "videoUrl" text,
  "bufferMin" integer NOT NULL DEFAULT 0,
  "responseMedianMin" integer,
  "responseSampleN" integer,
  "slug" text,
  "packagesEnabled" boolean NOT NULL DEFAULT false,
  "profileType" "ProfileType" NOT NULL DEFAULT 'EXPERT'::"ProfileType",
  "professions" text[] NOT NULL DEFAULT '{}'::text[]
);

CREATE TABLE IF NOT EXISTS "TutorApplication" (
  "id" text NOT NULL,
  "userId" text NOT NULL,
  "fullName" text NOT NULL,
  "phone" text NOT NULL,
  "city" text,
  "specialty" text NOT NULL,
  "yearsExp" integer NOT NULL,
  "hourlyRate" integer NOT NULL,
  "motivation" text NOT NULL,
  "status" "ApplicationStatus" NOT NULL DEFAULT 'SUBMITTED'::"ApplicationStatus",
  "moderatorNote" text,
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" timestamp(3) without time zone,
  "linkedinUrl" text,
  "professionData" jsonb,
  "websiteUrl" text,
  "introVideoUrl" text,
  "introVideoId" text,
  "idDocUrl" text,
  "selfieUrl" text,
  "certificates" jsonb
);

CREATE TABLE IF NOT EXISTS "Consultation" (
  "id" text NOT NULL,
  "tutorId" text NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "minutes" integer NOT NULL,
  "price" integer NOT NULL,
  "bookable" boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS "AvailabilitySlot" (
  "id" text NOT NULL,
  "tutorId" text NOT NULL,
  "startAt" timestamp(3) without time zone NOT NULL,
  "endAt" timestamp(3) without time zone NOT NULL,
  "booked" boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS "Booking" (
  "id" text NOT NULL,
  "ref" text NOT NULL,
  "studentId" text NOT NULL,
  "tutorId" text NOT NULL,
  "consultationId" text,
  "topic" text NOT NULL,
  "status" "BookingStatus" NOT NULL DEFAULT 'PREPARING'::"BookingStatus",
  "startAt" timestamp(3) without time zone NOT NULL,
  "durationMin" integer NOT NULL,
  "price" integer NOT NULL,
  "payoutStatus" "PayoutStatus" NOT NULL DEFAULT 'PENDING'::"PayoutStatus",
  "studentNotes" text,
  "tutorNotes" text,
  "meetingUrl" text,
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) without time zone NOT NULL,
  "cancelReason" text,
  "cancelledBy" "Role",
  "serviceType" "ServiceType" NOT NULL DEFAULT 'CONSULTATION'::"ServiceType",
  "autoCompleted" boolean NOT NULL DEFAULT false,
  "heldSlotId" text,
  "rescheduleRequest" jsonb,
  "sessionReminderSentAt" timestamp without time zone,
  "proposedByStudent" boolean NOT NULL DEFAULT false,
  "proposedAlternates" jsonb,
  "paymentLinkUrl" text,
  "enrollmentId" text,
  "paidBy" "PaymentSource"
);

CREATE TABLE IF NOT EXISTS "Package" (
  "id" text NOT NULL,
  "tutorId" text NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "lessonsCount" integer NOT NULL,
  "minutesPerLesson" integer NOT NULL,
  "price" integer NOT NULL,
  "validDays" integer NOT NULL DEFAULT 30,
  "active" boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS "Enrollment" (
  "id" text NOT NULL,
  "packageId" text,
  "studentId" text NOT NULL,
  "tutorId" text NOT NULL,
  "status" "EnrollmentStatus" NOT NULL DEFAULT 'REQUESTED'::"EnrollmentStatus",
  "lessonsTotal" integer NOT NULL,
  "lessonsUsed" integer NOT NULL DEFAULT 0,
  "priceTotal" integer NOT NULL,
  "perLessonPrice" integer NOT NULL,
  "paidAt" timestamp without time zone,
  "startsAt" timestamp without time zone,
  "expiresAt" timestamp without time zone,
  "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
  "minutesPerLesson" integer
);

CREATE TABLE IF NOT EXISTS "Message" (
  "id" text NOT NULL,
  "bookingId" text,
  "fromId" text NOT NULL,
  "toId" text NOT NULL,
  "body" text NOT NULL,
  "fileUrl" text,
  "fileName" text,
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" timestamp(3) without time zone,
  "reminderEmailSentAt" timestamp without time zone
);

CREATE TABLE IF NOT EXISTS "Dispute" (
  "id" text NOT NULL,
  "bookingId" text NOT NULL,
  "studentId" text NOT NULL,
  "tutorId" text NOT NULL,
  "reason" "DisputeReason" NOT NULL,
  "details" text,
  "requested" "DisputeOutcome" NOT NULL DEFAULT 'PENDING'::"DisputeOutcome",
  "outcome" "DisputeOutcome" NOT NULL DEFAULT 'PENDING'::"DisputeOutcome",
  "resolution" text,
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" timestamp(3) without time zone,
  "resolvedBy" text
);

-- ── 2b. Keys, uniques and checks ────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "TutorProfile" ADD CONSTRAINT "TutorProfile_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TutorApplication" ADD CONSTRAINT "TutorApplication_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AvailabilitySlot" ADD CONSTRAINT "AvailabilitySlot_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Booking" ADD CONSTRAINT "Booking_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Package" ADD CONSTRAINT "Package_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Message" ADD CONSTRAINT "Message_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2c. The foreign keys, once every table they name is there ───────────────
DO $$ BEGIN
  ALTER TABLE "TutorProfile" ADD CONSTRAINT "TutorProfile_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"(id) ON UPDATE CASCADE ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TutorProfile" ADD CONSTRAINT "TutorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TutorApplication" ADD CONSTRAINT "TutorApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "TutorProfile"(id) ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AvailabilitySlot" ADD CONSTRAINT "AvailabilitySlot_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "TutorProfile"(id) ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Booking" ADD CONSTRAINT "Booking_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"(id) ON UPDATE CASCADE ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Booking" ADD CONSTRAINT "Booking_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "TutorProfile"(id) ON UPDATE CASCADE ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Message" ADD CONSTRAINT "Message_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"(id) ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Message" ADD CONSTRAINT "Message_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Message" ADD CONSTRAINT "Message_toId_fkey" FOREIGN KEY ("toId") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"(id) ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2d. The plain indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "TutorProfile_available_verified_rating_idx" ON public."TutorProfile" USING btree (available, verified, rating);
CREATE INDEX IF NOT EXISTS "TutorProfile_bio_trgm_idx" ON public."TutorProfile" USING gin (bio gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "TutorProfile_categoryId_idx" ON public."TutorProfile" USING btree ("categoryId");
CREATE INDEX IF NOT EXISTS "TutorProfile_featured_idx" ON public."TutorProfile" USING btree (featured);
CREATE INDEX IF NOT EXISTS "TutorProfile_headline_trgm_idx" ON public."TutorProfile" USING gin (headline gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "TutorProfile_profileType_idx" ON public."TutorProfile" USING btree ("profileType");
CREATE INDEX IF NOT EXISTS "TutorProfile_serviceType_idx" ON public."TutorProfile" USING btree ("serviceType");
CREATE UNIQUE INDEX IF NOT EXISTS "TutorProfile_slug_key" ON public."TutorProfile" USING btree (slug);
CREATE INDEX IF NOT EXISTS "TutorProfile_specialty_trgm_idx" ON public."TutorProfile" USING gin (specialty gin_trgm_ops);
CREATE UNIQUE INDEX IF NOT EXISTS "TutorProfile_userId_key" ON public."TutorProfile" USING btree ("userId");
CREATE INDEX IF NOT EXISTS "TutorApplication_createdAt_idx" ON public."TutorApplication" USING btree ("createdAt");
CREATE INDEX IF NOT EXISTS "TutorApplication_status_idx" ON public."TutorApplication" USING btree (status);
CREATE UNIQUE INDEX IF NOT EXISTS "TutorApplication_userId_key" ON public."TutorApplication" USING btree ("userId");
CREATE INDEX IF NOT EXISTS "Consultation_tutorId_idx" ON public."Consultation" USING btree ("tutorId");
CREATE INDEX IF NOT EXISTS "AvailabilitySlot_tutorId_booked_startAt_idx" ON public."AvailabilitySlot" USING btree ("tutorId", booked, "startAt");
CREATE INDEX IF NOT EXISTS "AvailabilitySlot_tutorId_startAt_idx" ON public."AvailabilitySlot" USING btree ("tutorId", "startAt");
CREATE INDEX IF NOT EXISTS "Booking_consultationId_idx" ON public."Booking" USING btree ("consultationId");
CREATE INDEX IF NOT EXISTS "Booking_createdAt_idx" ON public."Booking" USING btree ("createdAt");
CREATE INDEX IF NOT EXISTS "Booking_enrollmentId_idx" ON public."Booking" USING btree ("enrollmentId");
CREATE UNIQUE INDEX IF NOT EXISTS "Booking_ref_key" ON public."Booking" USING btree (ref);
CREATE INDEX IF NOT EXISTS "Booking_serviceType_idx" ON public."Booking" USING btree ("serviceType");
CREATE INDEX IF NOT EXISTS "Booking_status_startAt_idx" ON public."Booking" USING btree (status, "startAt");
CREATE INDEX IF NOT EXISTS "Booking_studentId_idx" ON public."Booking" USING btree ("studentId");
CREATE INDEX IF NOT EXISTS "Booking_studentId_startAt_idx" ON public."Booking" USING btree ("studentId", "startAt");
CREATE INDEX IF NOT EXISTS "Booking_tutorId_idx" ON public."Booking" USING btree ("tutorId");
CREATE INDEX IF NOT EXISTS "Booking_tutorId_status_startAt_idx" ON public."Booking" USING btree ("tutorId", status, "startAt");
CREATE INDEX IF NOT EXISTS "Booking_updatedAt_idx" ON public."Booking" USING btree ("updatedAt");
CREATE INDEX IF NOT EXISTS "Package_tutorId_idx" ON public."Package" USING btree ("tutorId");
CREATE INDEX IF NOT EXISTS "Enrollment_packageId_idx" ON public."Enrollment" USING btree ("packageId");
CREATE INDEX IF NOT EXISTS "Enrollment_status_expiresAt_idx" ON public."Enrollment" USING btree (status, "expiresAt");
CREATE INDEX IF NOT EXISTS "Enrollment_studentId_createdAt_idx" ON public."Enrollment" USING btree ("studentId", "createdAt");
CREATE INDEX IF NOT EXISTS "Enrollment_tutorId_status_idx" ON public."Enrollment" USING btree ("tutorId", status);
CREATE INDEX IF NOT EXISTS "Message_bookingId_createdAt_idx" ON public."Message" USING btree ("bookingId", "createdAt");
CREATE INDEX IF NOT EXISTS "Message_fromId_createdAt_idx" ON public."Message" USING btree ("fromId", "createdAt");
CREATE INDEX IF NOT EXISTS "Message_fromId_idx" ON public."Message" USING btree ("fromId");
CREATE INDEX IF NOT EXISTS "Message_readAt_createdAt_idx" ON public."Message" USING btree ("readAt", "createdAt");
CREATE INDEX IF NOT EXISTS "Message_toId_createdAt_idx" ON public."Message" USING btree ("toId", "createdAt");
CREATE INDEX IF NOT EXISTS "Message_toId_readAt_idx" ON public."Message" USING btree ("toId", "readAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Dispute_bookingId_key" ON public."Dispute" USING btree ("bookingId");
CREATE INDEX IF NOT EXISTS "Dispute_outcome_createdAt_idx" ON public."Dispute" USING btree (outcome, "createdAt");
CREATE INDEX IF NOT EXISTS "Dispute_studentId_idx" ON public."Dispute" USING btree ("studentId");
CREATE INDEX IF NOT EXISTS "Dispute_tutorId_outcome_idx" ON public."Dispute" USING btree ("tutorId", outcome);

-- ── 3. The in-place changes, reversed ───────────────────────────────────────

-- 3a. Category
ALTER TABLE "Category"
  ADD COLUMN IF NOT EXISTS "defaultServiceType" "ServiceType" NOT NULL DEFAULT 'CONSULTATION';

-- 3b. The request kind. „შეხვედრა" goes back to being called a consultation.
-- ⚠️ THIS IS LOSSY AND KNOWINGLY SO: any MEETING request filed AFTER the
-- migration is renamed too, because nothing recorded which ones were originally
-- CONSULTATION. There were 0 of either on the day, so the loss is theoretical
-- until it is not — check the count before running it.
UPDATE "ServiceRequest" SET "kind" = 'CONSULTATION' WHERE "kind" = 'MEETING';
ALTER TABLE "ServiceRequest" ALTER COLUMN "kind" SET DEFAULT 'CONSULTATION';

-- 3c. The Role enum. STUDENT and TUTOR come back as VALUES; no row is moved
-- onto them, because `up.sql` moved none off them (it refused to run while any
-- still carried one).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                  WHERE t.typname = 'Role' AND e.enumlabel = 'STUDENT') THEN
    ALTER TYPE "Role" RENAME TO "Role_new";
    CREATE TYPE "Role" AS ENUM ('STUDENT','TUTOR','ADMIN','USER','PROVIDER');
    ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
    ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
    ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';
    DROP TYPE "Role_new";
  END IF;
END $$;

-- 3d. Review — the booking half. Both columns are NULLABLE on the way back:
-- every review written since the migration hangs on an offer and has no booking
-- to point at, and a NOT NULL here would refuse the rollback outright.
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "bookingId" TEXT;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "tutorId"   TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Review_bookingId_key" ON "Review" ("bookingId");
CREATE INDEX IF NOT EXISTS "Review_tutorId_createdAt_idx" ON "Review" ("tutorId", "createdAt");
DROP INDEX IF EXISTS "Review_createdAt_idx";
DO $$ BEGIN
  ALTER TABLE "Review" ADD CONSTRAINT "Review_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Review" ADD CONSTRAINT "Review_tutorId_fkey"
    FOREIGN KEY ("tutorId") REFERENCES "TutorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- ⚠️ THE CHECK IS NOT PUT BACK. „bookingId IS NOT NULL OR offerId IS NOT NULL"
-- was true of every row when it was written and is FALSE of nothing today, but
-- adding it back would refuse the statement if a single review were ever written
-- with neither. Add it by hand once you have looked.

-- 3e. Favorite — back to naming a tutor profile.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='Favorite' AND column_name='providerId') THEN
    ALTER TABLE "Favorite" RENAME COLUMN "providerId" TO "tutorId";
  END IF;
  ALTER TABLE "Favorite" DROP CONSTRAINT IF EXISTS "Favorite_providerId_fkey";
  ALTER TABLE "Favorite" DROP CONSTRAINT IF EXISTS "Favorite_tutorId_fkey";
  -- A saved row whose TutorProfile did not come back would block the FK.
  DELETE FROM "Favorite" f WHERE NOT EXISTS (SELECT 1 FROM "TutorProfile" t WHERE t."id" = f."tutorId");
  ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_tutorId_fkey"
    FOREIGN KEY ("tutorId") REFERENCES "TutorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
END $$;
DROP INDEX IF EXISTS "Favorite_userId_providerId_key";
DROP INDEX IF EXISTS "Favorite_providerId_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "Favorite_userId_tutorId_key" ON "Favorite" ("userId", "tutorId");
CREATE INDEX IF NOT EXISTS "Favorite_tutorId_idx" ON "Favorite" ("tutorId");

-- 3f. The three credential tables follow their owner back.
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['Certificate','Education','Experience'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name=tbl AND column_name='providerId') THEN
      EXECUTE format('ALTER TABLE %I RENAME COLUMN "providerId" TO "tutorId"', tbl);
    END IF;
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', tbl, tbl || '_providerId_fkey');
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', tbl, tbl || '_tutorId_fkey');
    EXECUTE format('DELETE FROM %I x WHERE NOT EXISTS (SELECT 1 FROM "TutorProfile" t WHERE t."id" = x."tutorId")', tbl);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("tutorId") REFERENCES "TutorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE',
      tbl, tbl || '_tutorId_fkey');
    EXECUTE format('DROP INDEX IF EXISTS %I', tbl || '_providerId_idx');
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I ("tutorId")', tbl || '_tutorId_idx', tbl);
  END LOOP;
END $$;

-- 3g. ServiceProfile gives back the professional columns.
-- ⚠️ LAST, AND IT IS THE ONE STEP THAT DESTROYS DATA. These columns hold what
-- the 27 migrated providers have been editing since the migration — a headline
-- they rewrote, a profession they added, a language they corrected. Dropping
-- them is not „undoing a migration", it is deleting work nobody backed up,
-- because scratch/backup-consult-2026-08-24.json predates all of it.
--
-- COMMENTED OUT DELIBERATELY. Everything above can run on its own and leaves a
-- database both shapes can read. Uncomment this block only when you have decided
-- the new columns are worthless, and take a fresh backup first.
--
-- ALTER TABLE "ServiceProfile"
--   DROP COLUMN IF EXISTS "headline",          DROP COLUMN IF EXISTS "professions",
--   DROP COLUMN IF EXISTS "categoryId",        DROP COLUMN IF EXISTS "yearsExp",
--   DROP COLUMN IF EXISTS "languages",         DROP COLUMN IF EXISTS "verified",
--   DROP COLUMN IF EXISTS "featured",          DROP COLUMN IF EXISTS "linkedinUrl",
--   DROP COLUMN IF EXISTS "websiteUrl",        DROP COLUMN IF EXISTS "videoUrl",
--   DROP COLUMN IF EXISTS "responseHours",     DROP COLUMN IF EXISTS "responseMedianMin",
--   DROP COLUMN IF EXISTS "responseSampleN",   DROP COLUMN IF EXISTS "rating",
--   DROP COLUMN IF EXISTS "reviewsCount";
-- ALTER TABLE "MasterApplication" DROP COLUMN IF EXISTS "professions";
-- DROP INDEX IF EXISTS "ServiceProfile_headline_trgm_idx";
-- DROP INDEX IF EXISTS "ServiceProfile_about_trgm_idx";

-- ── 4. The guards ───────────────────────────────────────────────────────────
DO $$
DECLARE missing TEXT;
BEGIN
  -- ⚠️ NINE, NOT TEN. `LegacyRescheduleRequest` is not on this list and is not
  -- created above, because it NEVER EXISTED IN PRODUCTION: the model was
  -- declared in schema.prisma, no migration ever created the table, and
  -- lib/dbBoot never made one either. `up.sql` drops it with IF EXISTS, which
  -- was a no-op, so there is nothing here to restore. Found on 2026-08-25 by
  -- dumping the live shapes for this file — the kind of thing a hand-copied
  -- rollback would have asserted its way into failing on.
  SELECT string_agg(t, ', ') INTO missing
    FROM unnest(ARRAY['TutorProfile','TutorApplication','Consultation','AvailabilitySlot',
                      'Booking','Package','Enrollment','Message','Dispute']) AS t
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables
                      WHERE table_schema='public' AND table_name=t);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'these tables did not come back: %', missing;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='Favorite' AND column_name='tutorId') THEN
    RAISE EXCEPTION 'Favorite.tutorId did not come back';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='Review' AND column_name='bookingId') THEN
    RAISE EXCEPTION 'Review.bookingId did not come back';
  END IF;
END $$;
