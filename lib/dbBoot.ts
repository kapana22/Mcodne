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
      ADD COLUMN IF NOT EXISTS "sessionReminderSentAt" TIMESTAMP;
  `)

  // Category — default type + public visibility toggle.
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Category"
      ADD COLUMN IF NOT EXISTS "defaultServiceType" "ServiceType" NOT NULL DEFAULT 'CONSULTATION',
      ADD COLUMN IF NOT EXISTS "isLive" BOOLEAN NOT NULL DEFAULT true;
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
