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

  // TutorProfile — service type + standard session length.
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "TutorProfile"
      ADD COLUMN IF NOT EXISTS "serviceType" "ServiceType" NOT NULL DEFAULT 'CONSULTATION',
      ADD COLUMN IF NOT EXISTS "consultationDurationMin" INTEGER NOT NULL DEFAULT 30;
  `)

  // Booking — snapshot column + reschedule proposal blob.
  // `rescheduleRequest` holds the pending "party X proposes new time" state
  // until the other side accepts or rejects it. Shape:
  //   { proposedBy: 'STUDENT'|'TUTOR', newStartAt: ISO string, reason?: string, proposedAt: ISO string }
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Booking"
      ADD COLUMN IF NOT EXISTS "serviceType" "ServiceType" NOT NULL DEFAULT 'CONSULTATION',
      ADD COLUMN IF NOT EXISTS "rescheduleRequest" JSONB,
      ADD COLUMN IF NOT EXISTS "autoCompleted" BOOLEAN NOT NULL DEFAULT false;
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
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Message_fromId_idx" ON "Message"("fromId");`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Review_studentId_idx" ON "Review"("studentId");`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Dispute_studentId_idx" ON "Dispute"("studentId");`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Favorite_tutorId_idx" ON "Favorite"("tutorId");`)
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
