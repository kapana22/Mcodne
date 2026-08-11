import { prisma } from './prisma'

// Idempotent boot-time migration. Runs the schema deltas that `prisma db push`
// would run, but from *inside* the app process — where DATABASE_URL resolves
// via Railway's internal DNS. Uses `IF NOT EXISTS` everywhere so re-runs are
// safe and the second boot is a no-op.
//
// Why not `prisma db push`: the Next.js standalone bundle doesn't ship the
// Prisma CLI, and Railway's builder can't reach the internal DB at build time.
// Rather than fight both constraints, we ship the DDL inline.
//
// The `bootPromise` module-level cache guarantees this runs at most once per
// warm process; subsequent requests await the same promise instead of racing.

let bootPromise: Promise<void> | null = null

async function runMigrations() {
  // Enum first — column defaults reference it.
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "ServiceType" AS ENUM ('CONSULTATION', 'RECURRING');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `)

  // ApplicationStatus.NEEDS_REVISION — the enum TYPE predates this value, so
  // prod only has DRAFT/SUBMITTED/APPROVED/REJECTED while schema.prisma (and
  // the admin „შესწორება" action in api/applications/[id]) already writes
  // NEEDS_REVISION. `ADD VALUE IF NOT EXISTS` is idempotent (PG 9.6+).
  //
  // Deliberately NOT wrapped in a `DO $$ … $$` block like the CREATE TYPE above:
  // `ALTER TYPE … ADD VALUE` cannot run inside a transaction block on PG < 12,
  // and a DO block is one. It's issued as its own statement and guarded in JS
  // so an old server refusing it logs instead of aborting the whole boot.
  try {
    await prisma.$executeRawUnsafe(`ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'NEEDS_REVISION';`)
  } catch (err) {
    console.error('[dbBoot] ApplicationStatus NEEDS_REVISION add failed:', err)
  }

  // TutorProfile — service type + standard session length + session buffer.
  // `bufferMin` is the required gap around every session, consumed by
  // lib/availability when deriving bookable starts. Default 0 reproduces
  // today's back-to-back behavior exactly, so no backfill is needed.
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "TutorProfile"
      ADD COLUMN IF NOT EXISTS "serviceType" "ServiceType" NOT NULL DEFAULT 'CONSULTATION',
      ADD COLUMN IF NOT EXISTS "consultationDurationMin" INTEGER NOT NULL DEFAULT 30,
      ADD COLUMN IF NOT EXISTS "bufferMin" INTEGER NOT NULL DEFAULT 0;
  `)

  // TutorProfile — MEASURED response time (median minutes + sample size).
  // Replaces the self-declared `responseHours` as the public signal: that one is
  // typed in by the expert and can't be verified, this one is computed from real
  // Message rows (lib/responseTime defines it, lib/responseTimeStore writes it).
  // Nullable with NO default — null means "not enough data yet", which the UI
  // renders as nothing at all. Existing rows therefore need no backfill to be
  // correct, only to be populated (`npx tsx -r dotenv/config lib/responseTimeStore.ts`).
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "TutorProfile"
      ADD COLUMN IF NOT EXISTS "responseMedianMin" INTEGER,
      ADD COLUMN IF NOT EXISTS "responseSampleN" INTEGER;
  `)

  // Public profile slug — „/tutors/ana-gagoshidze" instead of a raw cuid.
  // Nullable + UNIQUE: uniqueness is what the generator relies on to resolve
  // collisions, and Postgres allows many NULLs under a unique index, so
  // un-backfilled rows coexist fine. The route accepts id OR slug, so this can
  // never orphan a profile.
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "TutorProfile" ADD COLUMN IF NOT EXISTS "slug" TEXT;
  `)
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "TutorProfile_slug_key" ON "TutorProfile"("slug");
  `)

  // Booking — snapshot column + reschedule proposal blob.
  // `rescheduleRequest` holds the pending "party X proposes new time" state
  // until the other side accepts or rejects it. Shape:
  //   { proposedBy: 'STUDENT'|'TUTOR', newStartAt: ISO string, reason?: string, proposedAt: ISO string }
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Booking"
      ADD COLUMN IF NOT EXISTS "serviceType" "ServiceType" NOT NULL DEFAULT 'CONSULTATION',
      ADD COLUMN IF NOT EXISTS "rescheduleRequest" JSONB,
      ADD COLUMN IF NOT EXISTS "autoCompleted" BOOLEAN NOT NULL DEFAULT false,
      -- Set once the ~1h-before session reminder email has been sent, so the
      -- reminder cron never emails the same booking twice.
      ADD COLUMN IF NOT EXISTS "sessionReminderSentAt" TIMESTAMP,
      -- True when the CLIENT proposed this time rather than picking it out of
      -- the expert's published windows (request-based booking, 2026-08-04).
      -- The expert's answer flow is unchanged — PREPARING already meant
      -- „awaiting the expert" — but their UI has to be able to say „this time
      -- is outside your published schedule", or an out-of-schedule request
      -- looks like a bug in the calendar.
      ADD COLUMN IF NOT EXISTS "proposedByStudent" BOOLEAN NOT NULL DEFAULT false,
      -- The client's SECOND and THIRD choice of time, when they named more than
      -- one. Shape: [{ "startAt": ISO string }, …], at most two entries; the
      -- FIRST choice is the booking's own startAt, never duplicated in here.
      -- Written only alongside proposedByStudent, inside the same transaction.
      --
      -- WHY A COLUMN AND NOT A ROW-PER-TIME: an alternate is not a booking. It
      -- claims nothing, blocks nothing, and expires with its parent — exactly
      -- the properties that made "rescheduleRequest" a JSONB blob rather than
      -- the RescheduleRequest table sitting unused next to it. Same call, same
      -- reasons.
      ADD COLUMN IF NOT EXISTS "proposedAlternates" JSONB,
      -- BOG/TBC payment link, pasted by the expert or an admin, shown to the
      -- client as a „გადახდა“ button. Storage and display ONLY: no checkout, no
      -- webhook, no charge, no reconciliation, and PAYMENTS_LIVE is untouched.
      -- It exists so a diaspora client can pay at all before the real
      -- integration lands, and it must stay this dumb until it does.
      ADD COLUMN IF NOT EXISTS "paymentLinkUrl" TEXT;
  `)

  // Category — default type + public visibility toggle.
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Category"
      ADD COLUMN IF NOT EXISTS "defaultServiceType" "ServiceType" NOT NULL DEFAULT 'CONSULTATION',
      ADD COLUMN IF NOT EXISTS "isLive" BOOLEAN NOT NULL DEFAULT true;
  `)

  // Category — status + one-level hierarchy (2026-08-10).
  //
  // The STRUCTURE (which sphere absorbs which) is applied by the reviewed
  // migration in prisma/manual-migrations/2026-08-10-category-hierarchy. This
  // block only guarantees the COLUMNS EXIST, because every public query now
  // reads `status`: on a database that never ran the migration, the site would
  // 500 on its own home page. The backfill mirrors the old boolean, so a
  // deployment that arrives before the migration behaves exactly as it did
  // before it — nothing is hidden or revealed by accident.
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "CategoryStatus" AS ENUM ('VISIBLE', 'HIDDEN', 'REDIRECTED');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `)
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Category"
      ADD COLUMN IF NOT EXISTS "status" "CategoryStatus" NOT NULL DEFAULT 'VISIBLE',
      ADD COLUMN IF NOT EXISTS "parentId" TEXT;
  `)
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "Category"
        ADD CONSTRAINT "Category_parentId_fkey"
        FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Category_parentId_idx" ON "Category" ("parentId");`)
  // Carries the old boolean across on the boot that first adds the column. In
  // steady state it matches nothing: `status` is what writes `isLive`, so a
  // hidden row is never left at the VISIBLE default.
  await prisma.$executeRawUnsafe(`
    UPDATE "Category" SET "status" = 'HIDDEN' WHERE "isLive" = false AND "status" = 'VISIBLE';
  `)

  // Phase-2 default flip: new experts/bookings default to CONSULTATION (instant
  // "available now"), not the legacy RECURRING calendar model. ALTER … SET
  // DEFAULT is idempotent and also updates existing DBs whose columns were
  // created with the old 'RECURRING' default. Existing row *data* is untouched —
  // tutors who were already RECURRING keep their calendar UX.
  await prisma.$executeRawUnsafe(`ALTER TABLE "TutorProfile" ALTER COLUMN "serviceType" SET DEFAULT 'CONSULTATION';`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "Booking" ALTER COLUMN "serviceType" SET DEFAULT 'CONSULTATION';`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "Category" ALTER COLUMN "defaultServiceType" SET DEFAULT 'CONSULTATION';`)

  // User — per-user notification opt-outs (JSON). Nullable → all types enabled.
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "notificationPrefs" JSONB;
  `)

  // Message — stamp for the delayed "unread message" reminder email. Set once a
  // thread's outstanding unread burst has been reminded, so the */15 cron emails
  // a missed message at most once per unread streak (reset when the recipient
  // opens the thread and readAt is stamped). See lib/messageReminders.
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Message"
      ADD COLUMN IF NOT EXISTS "reminderEmailSentAt" TIMESTAMP;
  `)

  // Post — DB-backed blog. Content is authored in the admin panel instead of
  // hardcoded in the page. `status` = 'DRAFT' | 'PUBLISHED'; public /blog shows
  // only PUBLISHED. `body` is Markdown. id/updatedAt are supplied by Prisma on
  // write; the column defaults cover any raw insert.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Post" (
      "id"          TEXT PRIMARY KEY,
      "slug"        TEXT NOT NULL UNIQUE,
      "title"       TEXT NOT NULL,
      "excerpt"     TEXT,
      "body"        TEXT NOT NULL DEFAULT '',
      "coverUrl"    TEXT,
      "tag"         TEXT,
      "status"      TEXT NOT NULL DEFAULT 'DRAFT',
      "authorName"  TEXT,
      "publishedAt" TIMESTAMP,
      "createdAt"   TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt"   TIMESTAMP NOT NULL DEFAULT now()
    );
  `)
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Post_status_publishedAt_idx" ON "Post"("status","publishedAt");`,
  )

  // SiteText — editable marketing copy (key → value override). A missing row
  // falls back to the code default in lib/siteTextDefs, so an empty table is
  // fine. See lib/siteText.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SiteText" (
      "key"       TEXT PRIMARY KEY,
      "value"     TEXT NOT NULL,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    );
  `)

  // Job-run ledger. ONE row per recurring job, holding when it last ran. It is
  // the atomic claim for the traffic-triggered maintenance sweep (lib/sweepRunner):
  // a guarded UPDATE … WHERE "ranAt" < now() - interval … RETURNING lets exactly
  // one request per interval do the work, across every instance.
  //
  // WHY this exists: the Railway `cleanup-cron` reported „Completed" every 15
  // min for days while never actually running the sweep — it requested the
  // endpoint without a valid secret, got the harmless self-doc page, and curl
  // exited 0. Reminders, review nudges and stale-booking cleanup were all dark
  // and nothing surfaced it. The sweep must not depend on that cron alone.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "JobRun" (
      "key"   TEXT PRIMARY KEY,
      "ranAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `)
  // Outcome of the last run, so the admin „სისტემა" panel can show WHAT it did
  // — not merely that it ticked. „It ran" was exactly the false comfort the
  // Railway cron gave for days.
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "JobRun"
      ADD COLUMN IF NOT EXISTS "ok"     BOOLEAN,
      ADD COLUMN IF NOT EXISTS "result" JSONB;
  `)

  // Event — product instrumentation. Append-only; ONE row per tracked action
  // (lib/events is the only writer). Deliberately NOT in schema.prisma: it has
  // no relations, is written by raw SQL, and adding a model would make a
  // `prisma db push` mandatory before the first deploy — the exact coupling
  // this file exists to avoid.
  //
  // `props` is free-form JSONB so a new event type needs no migration; the
  // event NAME is the contract (lib/events → EVENTS). `userId` is a bare TEXT
  // column with NO foreign key on purpose: analytics must never block or
  // cascade with a user delete, and an anonymous visitor writes NULL. It is
  // also the ONLY identifier this table ever holds — no IP, no user-agent.
  //
  // RETENTION: append-only + one row per search means unbounded growth. The
  // maintenance sweep prunes rows older than lib/events → EVENT_RETENTION_DAYS
  // (see EVENT_PRUNE_SQL / pruneEvents there).
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Event" (
      "id"     TEXT PRIMARY KEY,
      "name"   TEXT NOT NULL,
      "at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
      "userId" TEXT,
      "props"  JSONB
    );
  `)
  // Every read is "the recent N of ONE event name" (admin panel) or the prune's
  // age range — both are served by (name, at DESC).
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Event_name_at_idx" ON "Event" ("name", "at" DESC);`,
  )

  // HelpMessage — a person wrote to us FROM the help chat because the bot had no
  // answer. Same boot-time-DDL reasoning as "Event" above (no relations, raw
  // SQL, no migration coupling), but it is NOT analytics and must not live in
  // "Event":
  //   · it is a MESSAGE, with a person waiting for a reply, so it needs a
  //     status the admin can move and an address to answer at. Analytics rows
  //     are append-only and anonymous by design;
  //   · "Event" is PRUNED at 90 days. Deleting somebody's unanswered support
  //     request on a timer is the kind of quiet data loss that reads as „we
  //     ignored you". These are kept until an admin closes them.
  // `email` is stored because it is the reply channel the person chose to give;
  // `question` is what they had asked the bot right before, so the admin sees
  // the failure and the request together.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "HelpMessage" (
      "id"        TEXT PRIMARY KEY,
      "at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
      "route"     TEXT,
      "question"  TEXT,
      "message"   TEXT NOT NULL,
      "email"     TEXT,
      "name"      TEXT,
      "userId"    TEXT,
      "status"    TEXT NOT NULL DEFAULT 'new',
      "handledAt" TIMESTAMPTZ
    );
  `)
  // The admin reads „open ones, newest first" and nothing else.
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "HelpMessage_status_at_idx" ON "HelpMessage" ("status", "at" DESC);`,
  )

  // TutorApplication — YouTube intro-video reference + admin-only verification
  // documents (ID front, selfie-with-doc, certificate scans). All nullable so
  // old rows don't need a backfill.
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "TutorApplication"
      ADD COLUMN IF NOT EXISTS "introVideoUrl" TEXT,
      ADD COLUMN IF NOT EXISTS "introVideoId" TEXT,
      ADD COLUMN IF NOT EXISTS "idDocUrl" TEXT,
      ADD COLUMN IF NOT EXISTS "selfieUrl" TEXT,
      ADD COLUMN IF NOT EXISTS "certificates" JSONB;
  `)

  // ── Teaching packages (2026-08-05) ─────────────────────────────────────────
  // Ships DARK: lib/flags → FEATURE_PACKAGES is false, so nothing reads any of
  // this yet. Created here anyway (rather than at switch-on) so the schema and
  // the code land in the same deploy and the flag flip is a pure UI event.
  //
  // ⚠️ Every column below is ALSO declared in prisma/schema.prisma, deliberately.
  // A column that lives only here is one `prisma db push` away from being
  // silently dropped — that exact mistake shipped once already with
  // Booking.proposedByStudent. If you add to one, add to the other.
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "EnrollmentStatus" AS ENUM ('REQUESTED', 'ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `)
  // What a profile IS (expert vs teacher) — not a Role; see schema.prisma.
  // Defaulting to EXPERT means every existing profile keeps its behaviour and
  // nobody moves when the column appears.
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "ProfileType" AS ENUM ('EXPERT', 'TEACHER');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `)
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "TutorProfile"
      ADD COLUMN IF NOT EXISTS "profileType" "ProfileType" NOT NULL DEFAULT 'EXPERT';
  `)
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "TutorProfile_profileType_idx" ON "TutorProfile"("profileType");`,
  )
  // The ONE gate for the vertical, and an allowlist on purpose: it starts false
  // for every existing profile, so switching the feature on cannot remove
  // anybody from anywhere. (Gating on `serviceType` instead would have: 11 of
  // 21 live profiles carry a legacy RECURRING value nobody reads.)
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "TutorProfile"
      ADD COLUMN IF NOT EXISTS "packagesEnabled" BOOLEAN NOT NULL DEFAULT false;
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Package" (
      "id"               TEXT PRIMARY KEY,
      "tutorId"          TEXT NOT NULL,
      "title"            TEXT NOT NULL,
      "description"      TEXT NOT NULL,
      "lessonsCount"     INTEGER NOT NULL,
      "minutesPerLesson" INTEGER NOT NULL,
      "price"            INTEGER NOT NULL,
      "validDays"        INTEGER NOT NULL DEFAULT 30,
      "active"           BOOLEAN NOT NULL DEFAULT true
    );
  `)
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Package_tutorId_idx" ON "Package"("tutorId");`,
  )
  // Money and lesson counts are SNAPSHOTTED here: editing or deleting the
  // Package must never rewrite a deal that is already running.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Enrollment" (
      "id"             TEXT PRIMARY KEY,
      "packageId"      TEXT,
      "studentId"      TEXT NOT NULL,
      "tutorId"        TEXT NOT NULL,
      "status"         "EnrollmentStatus" NOT NULL DEFAULT 'REQUESTED',
      "lessonsTotal"   INTEGER NOT NULL,
      "lessonsUsed"    INTEGER NOT NULL DEFAULT 0,
      "priceTotal"     INTEGER NOT NULL,
      "perLessonPrice" INTEGER NOT NULL,
      "minutesPerLesson" INTEGER,
      "paidAt"         TIMESTAMP,
      "startsAt"       TIMESTAMP,
      "expiresAt"      TIMESTAMP,
      "createdAt"      TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt"      TIMESTAMP NOT NULL DEFAULT now()
    );
  `)
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Enrollment_studentId_createdAt_idx" ON "Enrollment"("studentId", "createdAt");`,
  )
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Enrollment_tutorId_status_idx" ON "Enrollment"("tutorId", "status");`,
  )
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Enrollment_status_expiresAt_idx" ON "Enrollment"("status", "expiresAt");`,
  )
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Enrollment_packageId_idx" ON "Enrollment"("packageId");`,
  )
  // Lesson LENGTH is a snapshot too — it was the one agreed scalar that was not.
  // Both spend routes used to read it live off the Package, so a teacher editing
  // „90 წუთი" down to „50" silently shortened every not-yet-booked lesson of
  // every running enrollment (DELETE is refused while a package is in use;
  // PATCH was not). Nullable rather than DEFAULT 50: a default is
  // indistinguishable from a package that genuinely sells 50-minute lessons, and
  // „we do not know" must not look like an answer.
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Enrollment"
      ADD COLUMN IF NOT EXISTS "minutesPerLesson" INTEGER;
  `)
  // Backfill the rows that predate the column, from the package they were sold
  // from. Touches only NULLs, so it is idempotent and re-running it can never
  // overwrite a snapshot that has since been taken.
  await prisma.$executeRawUnsafe(`
    UPDATE "Enrollment" e
       SET "minutesPerLesson" = p."minutesPerLesson"
      FROM "Package" p
     WHERE e."packageId" = p."id" AND e."minutesPerLesson" IS NULL;
  `)
  // The whole packages design in one nullable column: a package lesson is an
  // ORDINARY Booking, so reschedule/cancel/video/messages/reminders/disputes
  // keep working untouched. NULL = every booking that exists today.
  // ⚠️ Financial aggregates must filter `enrollmentId IS NULL` — the Enrollment
  // already counted that money.
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Booking"
      ADD COLUMN IF NOT EXISTS "enrollmentId" TEXT;
  `)
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Booking_enrollmentId_idx" ON "Booking"("enrollmentId");`,
  )

  // Indexes — cheap even if already present thanks to IF NOT EXISTS.
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "TutorProfile_serviceType_idx" ON "TutorProfile"("serviceType");`,
  )
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Booking_serviceType_idx" ON "Booking"("serviceType");`,
  )

  // Drop the now-dead live-now / free-trial columns and their indexes. The
  // product removed real-time availability and the free-trial mechanic entirely
  // (see lib/consultation, api/bookings). Idempotent — no-ops once dropped.
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "TutorProfile_liveNow_idx";`)
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "Booking_trial_unique";`)
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "TutorProfile"
      DROP COLUMN IF EXISTS "isAvailableNow",
      DROP COLUMN IF EXISTS "availableUntil",
      DROP COLUMN IF EXISTS "offersFreeTrial";
  `)
  await prisma.$executeRawUnsafe(`ALTER TABLE "Booking" DROP COLUMN IF EXISTS "isTrial";`)

  // Video-flow reconciliation (Batch 6). Historically the approval path did
  // NOT copy `TutorApplication.introVideoUrl` onto the freshly-minted
  // TutorProfile.videoUrl, so every approved tutor started with an empty
  // video field even though they submitted a YouTube link in their apply flow.
  // Backfill in-place — only touches profiles that currently have no video AND
  // have a matching approved application with a videoUrl on file.
  await prisma.$executeRawUnsafe(`
    UPDATE "TutorProfile" tp
       SET "videoUrl" = ta."introVideoUrl"
      FROM "TutorApplication" ta
     WHERE tp."userId" = ta."userId"
       AND ta."status" = 'APPROVED'
       AND ta."introVideoUrl" IS NOT NULL
       AND (tp."videoUrl" IS NULL OR tp."videoUrl" = '')
  `)

  // Null out any legacy `data:video/…;base64,…` blobs left over from the
  // deprecated /api/uploads?kind=video path. These bloated Postgres rows
  // (100 MB → 133 MB base64) and are no longer supported — the tutor is
  // prompted on next profile edit to paste a YouTube URL instead. Non-video
  // data-URLs (avatars, PDFs, etc.) are untouched.
  await prisma.$executeRawUnsafe(
    `UPDATE "TutorProfile" SET "videoUrl" = NULL WHERE "videoUrl" LIKE 'data:video/%'`,
  )

  // ── Security + data-integrity deltas (audit remediation) ───────────────

  // Session.impersonatorId — binds admin-impersonation restore to a server-side
  // value instead of a client-forgeable cookie. See impersonate/exit route.
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Session"
      ADD COLUMN IF NOT EXISTS "impersonatorId" TEXT;
  `)

  // Booking.heldSlotId — exact slot claimed by a scheduled booking, so
  // cancel/decline/reschedule free the right one (never an unrelated slot).
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Booking"
      ADD COLUMN IF NOT EXISTS "heldSlotId" TEXT;
  `)

  // Missing FK / filter indexes flagged by the audit.
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Booking_consultationId_idx" ON "Booking"("consultationId");`)
  // NOTE: "Message_fromId_idx" used to be created here. It is a strict prefix of
  // "Message_fromId_createdAt_idx" (below), so it only cost write amplification —
  // no longer created, and no longer declared in schema.prisma, so the next
  // `prisma db push` retires the copy that still exists in prod.
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Review_studentId_idx" ON "Review"("studentId");`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Dispute_studentId_idx" ON "Dispute"("studentId");`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Favorite_tutorId_idx" ON "Favorite"("tutorId");`)
  // Serves the cleanup cron's BOOKING_REMINDER dedupe (WHERE type=… AND href IN …)
  // and the message-reminder scan's unread window — both grow with history.
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Notification_type_href_idx" ON "Notification"("type", "href");`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Message_readAt_createdAt_idx" ON "Message"("readAt", "createdAt");`)

  // Hot-path indexes (also declared in schema.prisma so a db push keeps them).
  // Postgres does NOT auto-index FKs, so each of these was a sequential scan.
  // Category-filtered browse + /categories counts filter TutorProfile.categoryId.
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TutorProfile_categoryId_idx" ON "TutorProfile"("categoryId");`)
  // Inbox query is `OR: [{fromId:me},{toId:me}] ORDER BY createdAt DESC` — the
  // fromId arm had its composite, the toId arm had to sort. See lib/preThreadInitiators.
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Message_toId_createdAt_idx" ON "Message"("toId", "createdAt");`)
  // Every expert profile view loads that expert's consultation offerings.
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Consultation_tutorId_idx" ON "Consultation"("tutorId");`)

  // ── B2B: companies with a prepaid balance (2026-08-11) ─────────────────
  //
  // The vertical is dark behind `B2B_VISIBILITY` in lib/flags.ts. These tables
  // are created on every deployment and stay EMPTY until an admin fills them —
  // the same contract the packages and diaspora verticals ship on. Creating
  // them here rather than only in the manual migration is what makes the flag
  // the ONLY switch: flipping it must never also require somebody to remember
  // a psql session.
  //
  // Reviewable as one document in prisma/manual-migrations/2026-08-11-b2b/,
  // WITH a rollback. These statements and that file must stay identical.
  //
  // ⚠️ Every column here is also declared in prisma/schema.prisma. That is not
  // duplication for its own sake — an undeclared dbBoot column is one
  // `prisma db push` away from being dropped, which is what the warning block
  // on model Booking is about. If you add a column here, declare it there.
  for (const type of [
    `CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'SUSPENDED');`,
    `CREATE TYPE "CompanyMemberRole" AS ENUM ('OWNER', 'MEMBER');`,
    `CREATE TYPE "CompanyTransactionType" AS ENUM ('TOPUP', 'CHARGE');`,
    `CREATE TYPE "PaymentSource" AS ENUM ('CARD', 'COMPANY_BALANCE');`,
    `CREATE TYPE "BusinessLeadStatus" AS ENUM ('NEW', 'CONTACTED', 'CLOSED');`,
  ]) {
    // CREATE TYPE has no IF NOT EXISTS — the DO block is how the rest of this
    // file spells "idempotent enum".
    await prisma.$executeRawUnsafe(
      `DO $$ BEGIN ${type} EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    )
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Company" (
      "id"        TEXT NOT NULL,
      "name"      TEXT NOT NULL,
      "taxId"     TEXT,
      "balance"   INTEGER NOT NULL DEFAULT 0,
      "status"    "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
      "note"      TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      -- NOT NULL with no DB default, exactly as prisma migrate diff emits it:
      -- @updatedAt is applied by the client on every write, and a default here
      -- would leave a difference for the next prisma db push to "fix".
      -- (No backticks in this string — it is a JS template literal.)
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "Company_pkey" PRIMARY KEY ("id"),
      -- The last line of defence under the conditional-decrement pattern the
      -- API uses: an overdraw is refused by the database rather than recorded
      -- as a debt this product has no concept of.
      CONSTRAINT "Company_balance_nonnegative" CHECK ("balance" >= 0)
    );
  `)
  // Nullable + unique: Postgres allows any number of NULLs under a unique
  // constraint, so a company entered before its paperwork arrived does not
  // collide with the next one.
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Company_taxId_key" ON "Company"("taxId");`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Company_status_createdAt_idx" ON "Company"("status", "createdAt");`)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CompanyMember" (
      "id"        TEXT NOT NULL,
      "companyId" TEXT NOT NULL,
      "userId"    TEXT NOT NULL,
      "role"      "CompanyMemberRole" NOT NULL DEFAULT 'MEMBER',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CompanyMember_pkey" PRIMARY KEY ("id")
    );
  `)
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "CompanyMember_companyId_userId_key" ON "CompanyMember"("companyId", "userId");`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CompanyMember_userId_idx" ON "CompanyMember"("userId");`)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CompanyTransaction" (
      "id"           TEXT NOT NULL,
      "companyId"    TEXT NOT NULL,
      "type"         "CompanyTransactionType" NOT NULL,
      "amount"       INTEGER NOT NULL,
      "balanceAfter" INTEGER NOT NULL,
      -- "bookingId"/"actorId" are plain TEXT with NO foreign key: a ledger row
      -- must outlive its subject. Same reasoning as "AuditLog"."targetId".
      "bookingId"    TEXT,
      "actorId"      TEXT,
      "note"         TEXT,
      "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CompanyTransaction_pkey" PRIMARY KEY ("id"),
      -- Always positive; the direction lives in "type". Stops a negative TOPUP
      -- from becoming an undocumented way to charge somebody.
      CONSTRAINT "CompanyTransaction_amount_positive" CHECK ("amount" > 0)
    );
  `)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CompanyTransaction_companyId_createdAt_idx" ON "CompanyTransaction"("companyId", "createdAt");`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CompanyTransaction_bookingId_idx" ON "CompanyTransaction"("bookingId");`)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "BusinessLead" (
      "id"          TEXT NOT NULL,
      "companyName" TEXT NOT NULL,
      "taxId"       TEXT,
      "contactName" TEXT NOT NULL,
      "phone"       TEXT NOT NULL,
      "email"       TEXT NOT NULL,
      "interest"    TEXT,
      "message"     TEXT,
      "status"      "BusinessLeadStatus" NOT NULL DEFAULT 'NEW',
      "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "BusinessLead_pkey" PRIMARY KEY ("id")
    );
  `)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BusinessLead_status_createdAt_idx" ON "BusinessLead"("status", "createdAt");`)

  // The foreign keys, after both sides exist. CASCADE on membership and
  // deliberately unlike "Booking"'s Restrict: a membership is a permission, not
  // a record of something that happened, and it must never be the reason an
  // account cannot be deleted. The money lives in "CompanyTransaction", which
  // has no FK to a user at all and survives the account either way.
  for (const fk of [
    `ALTER TABLE "CompanyMember" ADD CONSTRAINT "CompanyMember_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
    `ALTER TABLE "CompanyMember" ADD CONSTRAINT "CompanyMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
    `ALTER TABLE "CompanyTransaction" ADD CONSTRAINT "CompanyTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
  ]) {
    await prisma.$executeRawUnsafe(
      `DO $$ BEGIN ${fk} EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    )
  }

  // ── B2B services: the fixed-price catalogue (2026-08-11) ───────────────
  // The product is the SERVICE, not the expert — see the model comment in
  // schema.prisma. Additive: one new table and three nullable columns on
  // BusinessLead, no existing column touched.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "B2BService" (
      "id"             TEXT NOT NULL,
      "direction"      TEXT NOT NULL,
      "title"          TEXT NOT NULL,
      "description"    TEXT,
      "priceGel"       INTEGER NOT NULL,
      "priceOnRequest" BOOLEAN NOT NULL DEFAULT false,
      "order"          INTEGER NOT NULL DEFAULT 0,
      "visible"        BOOLEAN NOT NULL DEFAULT true,
      "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"      TIMESTAMP(3) NOT NULL,
      CONSTRAINT "B2BService_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "B2BService_price_nonnegative" CHECK ("priceGel" >= 0)
    );
  `)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "B2BService_visible_direction_order_idx" ON "B2BService"("visible", "direction", "order");`)

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "BusinessLead"
      ADD COLUMN IF NOT EXISTS "serviceId"   TEXT,
      ADD COLUMN IF NOT EXISTS "agreedPrice" INTEGER,
      ADD COLUMN IF NOT EXISTS "adminNote"   TEXT;
  `)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BusinessLead_serviceId_idx" ON "BusinessLead"("serviceId");`)
  // SET NULL, not CASCADE: retiring a service must never delete the requests it
  // produced — those are the record of who asked for what.
  await prisma.$executeRawUnsafe(
    `DO $$ BEGIN ALTER TABLE "BusinessLead" ADD CONSTRAINT "BusinessLead_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "B2BService"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  )

  // Booking.paidBy — NULLABLE, NO DEFAULT, NO BACKFILL, and that is the point.
  // `null` is what every booking that already exists says, and it MEANS 'CARD'
  // (read it through paymentSourceOf() in lib/b2b.ts, never directly). A
  // DEFAULT would mean an UPDATE across live history to record a fact nobody
  // asserted.
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Booking"
      ADD COLUMN IF NOT EXISTS "paidBy" "PaymentSource";
  `)

  // ── pg_trgm: Georgian-aware expert search ──────────────────────────────
  // Georgian declines heavily („მარკეტინგი" → „მარკეტინგის"/„მარკეტინგში"),
  // so substring matching silently returns nothing for a perfectly normal
  // query. lib/tutorsQuery ranks by trigram similarity instead; these GIN
  // indexes back both that predicate and the ILIKE '%…%' arm it keeps (a
  // gin_trgm_ops index serves LIKE/ILIKE contains too).
  //
  // WRAPPED IN try/catch ON PURPOSE: `CREATE EXTENSION` needs rights the app
  // role may not have on some managed Postgres. pg_trgm is a TRUSTED extension
  // on PG 13+ so a plain DB owner can create it (Railway's managed Postgres
  // does), but if it is ever refused this must NOT take the boot — and it
  // must not: lib/tutorsQuery catches the resulting „function
  // word_similarity does not exist" and degrades to the old substring search.
  // The whole block shares one catch because every index below depends on the
  // gin_trgm_ops opclass the extension installs.
  //
  // Also declared in prisma/schema.prisma (@@index(..., type: Gin)), so no
  // `prisma db push` is required either way — whichever runs first wins and
  // the other is a no-op.
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`)
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "TutorProfile_specialty_trgm_idx" ON "TutorProfile" USING GIN ("specialty" gin_trgm_ops);`,
    )
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "TutorProfile_headline_trgm_idx" ON "TutorProfile" USING GIN ("headline" gin_trgm_ops);`,
    )
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "TutorProfile_bio_trgm_idx" ON "TutorProfile" USING GIN ("bio" gin_trgm_ops);`,
    )
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "User_fullName_trgm_idx" ON "User" USING GIN ("fullName" gin_trgm_ops);`,
    )
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "Category_name_trgm_idx" ON "Category" USING GIN ("name" gin_trgm_ops);`,
    )
  } catch (err) {
    console.error('[dbBoot] pg_trgm setup skipped (search degrades to substring match):', err)
  }
}

export function ensureDbReady(): Promise<void> {
  if (!bootPromise) {
    bootPromise = runMigrations().catch(err => {
      // Transient failures (DB unreachable at cold boot) shouldn't permanently
      // block requests — reset so the NEXT call retries a clean boot…
      console.error('[dbBoot] migration error:', err)
      bootPromise = null
      // …but the CURRENT caller must fail fast instead of proceeding against a
      // possibly-unmigrated schema (which would surface as opaque 500s on
      // missing columns). Re-throw so awaiting routes can return 503.
      throw err
    })
  }
  return bootPromise
}
