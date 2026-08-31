import { createHash } from 'node:crypto'
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

// ⚠️ CACHED ON globalThis IN DEV, exactly as lib/prisma.ts caches its client and
// for exactly the same reason: `next dev` throws the module registry away on
// every recompile, so a module-level `let` is a cache that never hits. Measured
// 2026-08-14 against the Railway proxy — 258ms per round trip × 108 statements
// = 67 SECONDS — and before this line that 67s was paid again after every file
// save, which made local development of anything touching the database
// unusable. Production keeps the plain module-level variable: a server process
// there boots once and the global would only outlive a deploy it must not.
//
// The DDL is idempotent, so a stale cache can never mean an unmigrated schema —
// the worst case is one skipped no-op run inside a single dev session, and
// restarting `npm run dev` clears it.
const globalForBoot = globalThis as unknown as { dbBootPromise?: Promise<void> | null }

let bootPromise: Promise<void> | null = globalForBoot.dbBootPromise ?? null

async function runMigrations() {
  // ── FIRST OF ALL: „MASTER" LEAVES THE DATABASE (2026-08-30) ─────────────
  //
  // Owner: „რაც შეგხვდება ძველი გადარქვი." „მასტერი" is on the retired list in
  // CLAUDE.md and the product has ONE kind of seller — PROVIDER — so the table
  // that holds their application, and the enum that says whether they are a
  // person or a firm, are renamed to match the word the code now uses
  // everywhere else.
  //
  // ⚠️ RENAMES, NOT A COPY. `ALTER TABLE … RENAME` is instant and keeps every
  // row, index and grant; a create-copy-drop would rewrite base64 photo columns
  // for nothing and give the boot a window where both tables exist.
  //
  // ⚠️ AND EVERY STATEMENT IS GUARDED ON THE OLD NAME EXISTING. This set runs on
  // every cold boot until the hash stamp catches up, and on a database that has
  // already been renamed a bare RENAME throws — which, per this file's own
  // rule, would take the WHOLE boot down rather than one statement.
  //
  // ⚠️ IT IS FIRST, AND THAT ORDER IS THE WHOLE DESIGN. Two wrong versions were
  // written before this one, and each failed on a different database:
  //
  //   1. Rename LAST, history keeps the old name. Correct on an empty database
  //      and fatal on the live one — the moment this file's source changes the
  //      stamp is void and the WHOLE set replays, so the very first statement
  //      naming „MasterApplication" hit a table that had already been renamed:
  //      `relation "MasterApplication" does not exist`.
  //   2. Rename last, history renamed too. Fatal on an empty database — the
  //      CREATE minted the new name, so the rename found nothing and an ALTER
  //      600 statements earlier touched a table that did not exist yet.
  //
  // Running it FIRST satisfies both. On an empty database it is a no-op (the
  // guards find nothing) and everything downstream creates the new names
  // directly. On a live one it renames, and everything downstream — replayed in
  // full, as this file always assumes — finds exactly what it expects. The
  // statements below therefore say `ProviderApplication` from here on, and this
  // block is the only place the old name may appear.
  // ⚠️ EVERY GUARD ASKS BOTH SIDES: the old name exists AND the new one does
  // not. „Old exists" alone is not enough, and the gate proved it (2026-08-30):
  // an earlier broken run of this set had already renamed the enum, after which
  // the CREATE TYPE 600 statements above re-minted the old one — so BOTH
  // existed, and a bare RENAME died with `type "ProviderKind" already exists`.
  // A half-applied migration is the normal state of a boot that failed once;
  // a rename that only checks its source cannot survive its own retry.
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'MasterApplication' AND relkind = 'r')
         AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'ProviderApplication' AND relkind = 'r') THEN
        ALTER TABLE "MasterApplication" RENAME TO "ProviderApplication";
      END IF;
      -- ⚠️ AND IT HEALS A HALF-APPLIED STATE RATHER THAN FREEZING IT. Measured
      -- against the live database on 2026-08-30: an earlier broken run had left
      -- BOTH enums, with the column still on the old one — so a guard that only
      -- skips when the target exists would have skipped for ever, leaving
      -- ProviderApplication.kind typed MasterKind with an unused ProviderKind
      -- beside it. Dropping the orphan is safe BECAUSE it is an
      -- orphan: the DROP is conditional on nothing having a column of that type.
      IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MasterKind')
         AND EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProviderKind')
         AND NOT EXISTS (
           SELECT 1 FROM pg_attribute a
             JOIN pg_type t ON t.oid = a.atttypid
            WHERE t.typname = 'ProviderKind' AND a.attnum > 0 AND NOT a.attisdropped
         ) THEN
        DROP TYPE "ProviderKind";
      END IF;
      IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MasterKind')
         AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProviderKind') THEN
        ALTER TYPE "MasterKind" RENAME TO "ProviderKind";
      END IF;
      -- The constraint and index names ride along on a table rename, so they
      -- would keep saying „Master" on a table that no longer does. Cosmetic to
      -- Postgres and to Prisma (both match on columns), and exactly the kind of
      -- half-rename this migration exists to stop.
      IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'MasterApplication_pkey')
         AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'ProviderApplication_pkey') THEN
        ALTER INDEX "MasterApplication_pkey" RENAME TO "ProviderApplication_pkey";
      END IF;
      IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'MasterApplication_userId_key')
         AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'ProviderApplication_userId_key') THEN
        ALTER INDEX "MasterApplication_userId_key" RENAME TO "ProviderApplication_userId_key";
      END IF;
      IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'MasterApplication_status_createdAt_idx')
         AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'ProviderApplication_status_createdAt_idx') THEN
        ALTER INDEX "MasterApplication_status_createdAt_idx" RENAME TO "ProviderApplication_status_createdAt_idx";
      END IF;
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MasterApplication_userId_fkey')
         AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProviderApplication_userId_fkey') THEN
        ALTER TABLE "ProviderApplication" RENAME CONSTRAINT "MasterApplication_userId_fkey" TO "ProviderApplication_userId_fkey";
      END IF;
      -- The price CHECK, created with the table ~600 statements above. That
      -- statement is left as it was: it is the history of a table that WAS
      -- called MasterApplication, and rewriting it would make a fresh boot
      -- create a name this block then fails to find.
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MasterApplication_prices_sane')
         AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProviderApplication_prices_sane') THEN
        ALTER TABLE "ProviderApplication" RENAME CONSTRAINT "MasterApplication_prices_sane" TO "ProviderApplication_prices_sane";
      END IF;
    END $$;
  `)

  // ApplicationStatus.NEEDS_REVISION — the enum TYPE predates this value, so
  // prod only has DRAFT/SUBMITTED/APPROVED/REJECTED while schema.prisma (and
  // the admin „შესწორება" action in api/applications/[id]) already writes
  // NEEDS_REVISION. `ADD VALUE IF NOT EXISTS` is idempotent (PG 9.6+).
  //
  // Deliberately NOT wrapped in a `DO $$ … $$` block like the CREATE TYPEs
  // below: `ALTER TYPE … ADD VALUE` cannot run inside a transaction block on PG < 12,
  // and a DO block is one. It's issued as its own statement and guarded in JS
  // so an old server refusing it logs instead of aborting the whole boot.
  try {
    await prisma.$executeRawUnsafe(`ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'NEEDS_REVISION';`)
  } catch (err) {
    console.error('[dbBoot] ApplicationStatus NEEDS_REVISION add failed:', err)
  }

  // Category — the deprecated public-visibility boolean. Superseded by `status`
  // below and kept only so the hierarchy migration stays reversible.
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Category"
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

  // User — per-user notification opt-outs (JSON). Nullable → all types enabled.
  // …and the operator heartbeat (2026-08-17): the ONLY input to the „ონლაინ
  // ვართ" badge on a client's thread. Stamped by an admin with the panel open;
  // null on every other account forever. See prisma/schema for why it is a
  // heartbeat and not an opening-hours table.
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "notificationPrefs" JSONB,
      ADD COLUMN IF NOT EXISTS "supportSeenAt" TIMESTAMP(3);
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

  // ── Security + data-integrity deltas (audit remediation) ───────────────

  // Session.impersonatorId — binds admin-impersonation restore to a server-side
  // value instead of a client-forgeable cookie. See impersonate/exit route.
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Session"
      ADD COLUMN IF NOT EXISTS "impersonatorId" TEXT;
  `)

  // Missing FK / filter indexes flagged by the audit. Postgres does NOT index a
  // foreign key for free, so each of these was a sequential scan.
  //
  // ⚠️ THE OTHER FOUR WENT ON 2026-08-24 with the tables they indexed —
  // Booking_consultationId, Dispute_studentId, Favorite_tutorId (renamed to
  // providerId by the services-only migration at the foot of this file) and the
  // two Message ones. „Who wrote this review" is the only one whose table
  // survived the consultation product.
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Review_studentId_idx" ON "Review"("studentId");`)
  // Serves the cleanup cron's notification dedupe (WHERE type=… AND href IN …),
  // which grows with history.
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Notification_type_href_idx" ON "Notification"("type", "href");`)

  // ServiceProfile.priceList / ProviderApplication.priceList — a price per
  // service the provider already picked, `{ topicId: lari }` (2026-08-20).
  // Additive and nullable: every existing row keeps meaning „ask", which is
  // what it meant before the column existed.
  await prisma.$executeRawUnsafe(`ALTER TABLE "ServiceProfile" ADD COLUMN IF NOT EXISTS "priceList" JSONB;`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "ProviderApplication" ADD COLUMN IF NOT EXISTS "priceList" JSONB;`)

  // ── CreditEntry: the provider's balance, as a ledger (2026-08-20) ───────
  //
  // Created empty on every deployment. The balance is the SUM of these rows —
  // there is no counter column anywhere, deliberately (see the model's note).
  //
  // ⚠️ THE UNIQUE INDEX IS THE IDEMPOTENCY. `(userId, grantKey)` refuses a
  // second „photo is worth 15₾" row however many times the profile is saved,
  // and — because Postgres treats NULLs as distinct — leaves spends, which
  // repeat by nature, entirely unconstrained. That one line is the whole
  // mechanism; do not add a second table to do it.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CreditEntry" (
      "id"          TEXT PRIMARY KEY,
      "userId"      TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      "amountTetri" INTEGER NOT NULL,
      "reason"      TEXT NOT NULL,
      "grantKey"    TEXT,
      "refId"       TEXT,
      "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "CreditEntry_userId_grantKey_key" ON "CreditEntry"("userId", "grantKey");`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CreditEntry_userId_createdAt_idx" ON "CreditEntry"("userId", "createdAt");`)

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
      "format"         TEXT,
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
  // Added after the table shipped, so an ALTER as well as the CREATE above.
  await prisma.$executeRawUnsafe(`ALTER TABLE "B2BService" ADD COLUMN IF NOT EXISTS "format" TEXT;`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "B2BService" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;`)
  // `kind` — CONSULTATION | TRAINING. Added 2026-08-12; see the schema comment
  // for why the one `direction` field could not carry both questions.
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "B2BService" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'CONSULTATION';`,
  )
  // ONE-TIME, IDEMPOTENT BACKFILL. Rows written before the column existed said
  // „training" the only way they could: in the direction or the title. This
  // reads that back out so nothing has to be re-typed by hand. It only ever
  // touches rows still holding the default, so re-running it cannot undo an
  // admin's later correction.
  await prisma.$executeRawUnsafe(`
    UPDATE "B2BService"
       SET "kind" = 'TRAINING'
     WHERE "kind" = 'CONSULTATION'
       AND ("direction" ILIKE '%ტრენინგ%' OR "title" ILIKE '%ტრენინგ%');
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

  // ── Requests: the client describes, providers bid (2026-08-14) ─────────
  //
  // The subsystem is dark behind FEATURE_REQUESTS (lib/requests.ts). These
  // three tables are created on every deployment and stay EMPTY until somebody
  // uses them — the same contract the B2B block above ships on, and the reason
  // the flag can be the only switch: flipping it must never also require
  // somebody to remember a psql session.
  //
  // Reviewable as one document in prisma/manual-migrations/2026-08-14-requests/,
  // WITH a rollback. These statements and that file must stay identical.
  //
  // ⚠️ Additive only. Not one existing table is altered — `Booking`,
  // `Consultation`, `Package`, `Enrollment`, `AvailabilitySlot`, `BusinessLead`
  // and `B2BService` are untouched by every statement below.
  // ⚠️ `RequestBudget` and `RequestDeadline` are ABSENT ON PURPOSE — they were
  // here for one day and the 2026-08-14-request-topics migration drops them.
  // A budget that must express „500–1 000₾" and „20–40₾ ერთ გაკვეთილზე" is not
  // one enum, and a timing whose legal values depend on `kind` cannot be an
  // enum at all. Do not add them back; see that migration's header.
  for (const type of [
    `CREATE TYPE "ServiceRequestStatus" AS ENUM ('NEW', 'VERIFIED', 'REJECTED', 'MATCHED', 'CLOSED');`,
    `CREATE TYPE "RequestOfferStatus" AS ENUM ('SENT', 'WITHDRAWN', 'ACCEPTED', 'DECLINED');`,
    `CREATE TYPE "RequestProviderKind" AS ENUM ('EXPERT', 'COMPANY');`,
  ]) {
    await prisma.$executeRawUnsafe(
      `DO $$ BEGIN ${type} EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    )
  }

  // ── INVITED, added to an enum that already exists ────────────────────────
  //
  // The client writing to an expert before that expert has offered anything
  // (2026-08-18). See prisma/schema for why it is a status on the offer row.
  //
  // ⚠️ IT CANNOT RIDE IN THE LOOP ABOVE. `CREATE TYPE` only runs on a database
  // that has never seen the type, so every existing deployment would skip it
  // and then fail on the first INSERT of the new value.
  //
  // ⚠️ AND IT CANNOT RIDE IN A `DO $$ … $$` BLOCK EITHER, which is why it does
  // not use this file's usual idiom for enums. `ALTER TYPE … ADD VALUE` is
  // refused inside a transaction block, and a DO block IS one — so the
  // defensive wrapper that makes every other enum statement idempotent is
  // exactly what would make this one throw (25001).
  //
  // ⚠️ WRAPPED IN try/catch ON PURPOSE, like the pg_trgm block at the bottom of
  // this file. `ensureDbReady` RE-THROWS, and every route awaits it — so a
  // statement that fails here does not degrade one feature, it 500s the entire
  // site. An enum value is additive and harmless to miss: without it the invite
  // button errors and nothing else changes. That trade is not close.
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TYPE "RequestOfferStatus" ADD VALUE IF NOT EXISTS 'INVITED';`,
    )
  } catch (err) {
    console.error('[dbBoot] RequestOfferStatus.INVITED not added (invites will fail):', err)
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ServiceRequest" (
      "id"           TEXT NOT NULL,
      -- The code we read down a phone line. UNIQUE below, and minted from
      -- crypto randomness rather than a sequence: it is the client's only key
      -- to their own request, so a guessable one hands out a phone number.
      "publicRef"    TEXT NOT NULL,
      -- The shape of the need, and what it is FOR. Both TEXT and read through
      -- lib/requestTopics — see the 2026-08-14-request-topics migration for why
      -- neither is an enum and why "topic" is not a Category FK.
      "kind"         TEXT NOT NULL DEFAULT 'CONSULTATION',
      "topic"        TEXT NOT NULL DEFAULT 'other',
      "categoryId"   TEXT,
      "description"  TEXT NOT NULL,
      -- Numbers, not a band enum: „500–1 000₾“ and „20–40₾ ერთ გაკვეთილზე“ are
      -- not the same question. NULL max is the open top band.
      "budgetMin"    INTEGER NOT NULL DEFAULT 0,
      "budgetMax"    INTEGER,
      "budgetUnit"   TEXT NOT NULL DEFAULT 'PER_SESSION',
      "timing"       TEXT NOT NULL DEFAULT 'flexible',
      "format"       TEXT NOT NULL DEFAULT 'EITHER',
      "city"         TEXT NOT NULL,
      "contactName"  TEXT NOT NULL,
      "phone"        TEXT NOT NULL,
      "email"        TEXT,
      "userId"       TEXT,
      "status"       "ServiceRequestStatus" NOT NULL DEFAULT 'NEW',
      "adminNote"    TEXT,
      "verifiedAt"   TIMESTAMP(3),
      -- Plain TEXT with no FK, like "AuditLog"."actorId": a record of something
      -- that happened must outlive the account that did it.
      "verifiedById" TEXT,
      "offerLimit"   INTEGER NOT NULL DEFAULT 3,
      "offerCount"   INTEGER NOT NULL DEFAULT 0,
      "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      -- NOT NULL with no DB default, exactly as prisma migrate diff emits it
      -- for @updatedAt (see the "Company" table above for the full reasoning).
      "updatedAt"    TIMESTAMP(3) NOT NULL,
      CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id"),
      -- The last line of defence under the conditional-increment the offer
      -- endpoint uses: a fourth offer is refused by the database rather than
      -- recorded as a limit this product does not enforce.
      CONSTRAINT "ServiceRequest_offerCount_within_limit" CHECK ("offerCount" >= 0 AND "offerCount" <= "offerLimit"),
      CONSTRAINT "ServiceRequest_offerLimit_positive" CHECK ("offerLimit" > 0)
    );
  `)
  // ── Grown to cover every sphere, 2026-08-14 ────────────────────────────
  // The CREATE above already carries these for a fresh deployment; this ALTER
  // is what moves the one that shipped hours earlier with the enum columns.
  // Idempotent, and safe with or without rows — the defaults exist so the
  // statement cannot fail, not because anything relies on them.
  // Reviewable as prisma/manual-migrations/2026-08-14-request-topics/.
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "ServiceRequest"
      ADD COLUMN IF NOT EXISTS "kind"       TEXT    NOT NULL DEFAULT 'CONSULTATION',
      ADD COLUMN IF NOT EXISTS "topic"      TEXT    NOT NULL DEFAULT 'other',
      ADD COLUMN IF NOT EXISTS "budgetMin"  INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "budgetMax"  INTEGER,
      ADD COLUMN IF NOT EXISTS "budgetUnit" TEXT    NOT NULL DEFAULT 'PER_SESSION',
      ADD COLUMN IF NOT EXISTS "timing"     TEXT    NOT NULL DEFAULT 'flexible',
      ADD COLUMN IF NOT EXISTS "format"     TEXT    NOT NULL DEFAULT 'EITHER';
  `)
  await prisma.$executeRawUnsafe(
    `DO $$ BEGIN ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_budget_range" CHECK ("budgetMin" >= 0 AND ("budgetMax" IS NULL OR "budgetMax" >= "budgetMin")); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  )
  // The clarifying answers ("audience", "level", ...) — a JSONB bag whose legal
  // content lives in lib/requestTopics -> EXTRAS and is zod-checked at the
  // door. Reviewable as prisma/manual-migrations/2026-08-14-request-details/.
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "ServiceRequest" ADD COLUMN IF NOT EXISTS "details" JSONB;`,
  )
  // The automation flags (2026-08-17). Timestamps rather than derivations: the
  // cron ticks every 15 minutes, so „already nudged" must be WRITTEN or every
  // tick inside the eligible window re-sends. Reviewable as
  // prisma/manual-migrations/2026-08-17-request-automation/.
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "ServiceRequest"
      ADD COLUMN IF NOT EXISTS "providerNudgeAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "clientNudgeAt"   TIMESTAMP(3);
  `)
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ServiceRequest_status_verifiedAt_idx" ON "ServiceRequest"("status", "verifiedAt");`,
  )
  // The enum-backed columns, and their types with them. Nothing outside this
  // subsystem ever referenced either.
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "ServiceRequest"
      DROP COLUMN IF EXISTS "budget",
      DROP COLUMN IF EXISTS "deadline";
  `)
  for (const t of ['RequestBudget', 'RequestDeadline']) {
    await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "${t}";`)
  }
  // How this person wants to be helped — asked in the wizard, before they send
  // (2026-08-18). It decides whether the waiting screen offers the expert list
  // and a message button; it does NOT decide who is told about the request. See
  // prisma/schema for why those two are separate.
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "ServiceRequest"
      ADD COLUMN IF NOT EXISTS "pickMode" TEXT NOT NULL DEFAULT 'OFFERS';
  `)

  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ServiceRequest_publicRef_key" ON "ServiceRequest"("publicRef");`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ServiceRequest_status_createdAt_idx" ON "ServiceRequest"("status", "createdAt");`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ServiceRequest_categoryId_status_idx" ON "ServiceRequest"("categoryId", "status");`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ServiceRequest_topic_status_idx" ON "ServiceRequest"("topic", "status");`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ServiceRequest_kind_status_idx" ON "ServiceRequest"("kind", "status");`)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RequestOffer" (
      "id"           TEXT NOT NULL,
      "requestId"    TEXT NOT NULL,
      "providerKind" "RequestProviderKind" NOT NULL,
      "expertUserId" TEXT,
      "companyId"    TEXT,
      "priceGel"     INTEGER NOT NULL,
      "daysEstimate" INTEGER,
      "message"      TEXT NOT NULL,
      "status"       "RequestOfferStatus" NOT NULL DEFAULT 'SENT',
      "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"    TIMESTAMP(3) NOT NULL,
      CONSTRAINT "RequestOffer_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "RequestOffer_price_positive" CHECK ("priceGel" > 0),
      -- EXACTLY ONE provider column, asserted here as well as in
      -- offerProviderError() (lib/requests.ts). The function is the one place
      -- the rule is CHECKED — it can name which half was wrong. This is the
      -- backstop for anything that ever writes the table without going through
      -- it, which is the shape of bug that only shows up in a report months on.
      CONSTRAINT "RequestOffer_exactly_one_provider" CHECK (
        ("expertUserId" IS NOT NULL AND "companyId" IS NULL)
        OR ("expertUserId" IS NULL AND "companyId" IS NOT NULL)
      )
    );
  `)
  // ── How to read `priceGel`, and the CHECK that had to move with it ──────
  //
  // ⚠️ THIS FIXES A BUG THAT WAS ALREADY LIVE. `RequestOffer_price_positive`
  // demanded `priceGel > 0`, and the INVITED rows added on 2026-08-18 carry 0
  // because a conversation has no price — so every „მიმოწერა" tap failed at the
  // database. `CREATE TABLE IF NOT EXISTS` cannot repair an existing table, so
  // the constraint is dropped and re-added explicitly.
  //
  // The replacement states all three legal zeroes rather than relaxing to
  // `>= 0`: a plain offer with no price is still a mistake, and saying so in
  // the constraint is what stops the next reader from assuming otherwise.
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "RequestOffer"
      ADD COLUMN IF NOT EXISTS "priceKind" TEXT NOT NULL DEFAULT 'FIXED';
  `)
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "RequestOffer" DROP CONSTRAINT IF EXISTS "RequestOffer_price_positive";
      ALTER TABLE "RequestOffer" ADD CONSTRAINT "RequestOffer_price_positive" CHECK (
        "priceGel" > 0
        -- The client wrote first; nobody has named a price yet.
        OR "status" = 'INVITED'
        -- „ვიზიტი უფასოა, სამუშაოს ადგილზე შევაფასებ“ — a real offer with a
        -- real zero in it.
        OR "priceKind" = 'ON_SITE'
      );
    EXCEPTION WHEN others THEN NULL; END $$;
  `)

  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "RequestOffer_requestId_expertUserId_key" ON "RequestOffer"("requestId", "expertUserId");`)
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "RequestOffer_requestId_companyId_key" ON "RequestOffer"("requestId", "companyId");`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RequestOffer_expertUserId_status_idx" ON "RequestOffer"("expertUserId", "status");`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RequestOffer_companyId_status_idx" ON "RequestOffer"("companyId", "status");`)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RequestAccess" (
      "id"        TEXT NOT NULL,
      "kind"      "RequestProviderKind" NOT NULL,
      "userId"    TEXT,
      "companyId" TEXT,
      "active"    BOOLEAN NOT NULL DEFAULT true,
      "note"      TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "RequestAccess_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "RequestAccess_exactly_one_subject" CHECK (
        ("userId" IS NOT NULL AND "companyId" IS NULL)
        OR ("userId" IS NULL AND "companyId" IS NOT NULL)
      )
    );
  `)
  // Nullable + unique on both, the same trick "Company"."taxId" relies on:
  // Postgres allows any number of NULLs under a unique constraint, so the two
  // nullable columns do not fight each other.

  // ── What a visiting master does, and where (2026-08-17) ─────────────────
  // The supply side of `kind: SERVICE`. NOT an access row — see prisma/schema:
  // a plumber is an ordinary allowlisted person, and this only says what they
  // are filed under. "services" holds TOPIC IDS from lib/requestTopics, the same
  // vocabulary a request is written in, which is what lets stage-3 routing be an
  // exact string match instead of a sphere translation that is null for 65 of
  // 171 topics.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ServiceProfile" (
      "id"         TEXT NOT NULL,
      "userId"     TEXT NOT NULL,
      -- Empty is legal and means „filled nothing in yet": a profile that exists
      -- but lists no service is simply never routed to, which is the honest
      -- outcome and not an error state to guard against.
      "services"   TEXT[] NOT NULL DEFAULT '{}',
      "areas"      TEXT[] NOT NULL DEFAULT '{}',
      "calloutFee" INTEGER,
      "priceFrom"  INTEGER,
      "available"  BOOLEAN NOT NULL DEFAULT true,
      "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ServiceProfile_pkey" PRIMARY KEY ("id"),
      -- A price nobody can charge is a typo, not an offer. The ceiling is
      -- deliberately generous; the floor is what stops a 0₾ call-out reading as
      -- „free" when it means „not filled in" (that is what NULL is for).
      CONSTRAINT "ServiceProfile_prices_sane" CHECK (
        ("calloutFee" IS NULL OR ("calloutFee" > 0 AND "calloutFee" <= 100000))
        AND ("priceFrom" IS NULL OR ("priceFrom" > 0 AND "priceFrom" <= 1000000))
      )
    );
  `)
  // ── A company can be a master too (2026-08-18) ──────────────────────────
  // Owner: „სერვისების ნაწილი დარეგისტრირებული ბიზნესმენები და ნაწილი
  // ინდივიდუალური." Same table, because a firm and a one-man plumber are told
  // about work identically and bid identically — only the counterparty differs,
  // and the client is entitled to know which.
  //
  // `userId` becomes nullable so the other half can exist. The „exactly one"
  // rule is a CHECK rather than a convention, the same shape RequestOffer and
  // RequestAccess already use.
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "ServiceProfile"
      ADD COLUMN IF NOT EXISTS "companyId" TEXT;
  `)
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "ServiceProfile" ALTER COLUMN "userId" DROP NOT NULL;
    EXCEPTION WHEN others THEN NULL; END $$;
  `)
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "ServiceProfile" DROP CONSTRAINT IF EXISTS "ServiceProfile_exactly_one_subject";
      ALTER TABLE "ServiceProfile" ADD CONSTRAINT "ServiceProfile_exactly_one_subject" CHECK (
        ("userId" IS NOT NULL AND "companyId" IS NULL)
        OR ("userId" IS NULL AND "companyId" IS NOT NULL)
      );
    EXCEPTION WHEN others THEN NULL; END $$;
  `)
  // The face and the sentence (2026-08-18). Added late, because /services
  // shipped as name + tag list and read as a directory of nobody — see the
  // schema comments for why the photo is a column and why it must never be
  // selected into a list.
  await prisma.$executeRawUnsafe(`ALTER TABLE "ServiceProfile" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "ServiceProfile" ADD COLUMN IF NOT EXISTS "about" TEXT;`)
  // Added 2026-08-18 with the column: the application had been collecting these
  // and approval had nowhere to put them. Default '{}' so every existing row is
  // valid the moment the column appears.
  await prisma.$executeRawUnsafe(`ALTER TABLE "ServiceProfile" ADD COLUMN IF NOT EXISTS "workPhotos" TEXT[] NOT NULL DEFAULT '{}';`)

  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ServiceProfile_companyId_key" ON "ServiceProfile"("companyId");`)

  // Stage 5 (2026-08-19): a public address and a switch for it. Its own slug
  // namespace (per-table uniqueness — see the schema comment); published
  // defaults TRUE so every already-approved master keeps their listing.
  await prisma.$executeRawUnsafe(`ALTER TABLE "ServiceProfile" ADD COLUMN IF NOT EXISTS "slug" TEXT;`)
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ServiceProfile_slug_key" ON "ServiceProfile"("slug");`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "ServiceProfile" ADD COLUMN IF NOT EXISTS "published" BOOLEAN NOT NULL DEFAULT true;`)

  // Stage 7 (2026-08-19): a job can be finished and reviewed without a Job
  // table. RequestOffer grows kind/doneAt/doneBy/closedAt; Review learns to hang
  // off an offer.
  //
  // ⚠️ THE OTHER HALF OF THIS BLOCK WENT ON 2026-08-24. It widened
  // Review.bookingId / Review.tutorId to nullable and added a
  // „bookingId IS NOT NULL OR offerId IS NOT NULL" CHECK, so that a review could
  // hang off either a booking or an offer during the crossover. There is no
  // booking any more: the services-only migration at the foot of this file drops
  // both columns and that constraint, and `offerId` is the only thing left for a
  // review to hang on.
  await prisma.$executeRawUnsafe(`DO $$ BEGIN CREATE TYPE "RequestOfferKind" AS ENUM ('QUOTE', 'BOOKING'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "RequestOffer" ADD COLUMN IF NOT EXISTS "kind" "RequestOfferKind" NOT NULL DEFAULT 'QUOTE';`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "RequestOffer" ADD COLUMN IF NOT EXISTS "doneAt" TIMESTAMP(3);`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "RequestOffer" ADD COLUMN IF NOT EXISTS "doneBy" TEXT;`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "RequestOffer" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "offerId" TEXT;`)
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Review_offerId_key" ON "Review"("offerId");`)
  await prisma.$executeRawUnsafe(`DO $$ BEGIN
    ALTER TABLE "Review" ADD CONSTRAINT "Review_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "RequestOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`)

  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ServiceProfile_userId_key" ON "ServiceProfile"("userId");`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ServiceProfile_available_idx" ON "ServiceProfile"("available");`)
  // ⚠️ GIN, and it is the reason this table can be routed on at all. Stage 3
  // asks „who lists this topic" — `"services" @> ARRAY['plumb-leak']` — and a
  // btree cannot answer a containment test on an array, so without this every
  // routed request is a sequential scan of every provider. Prisma cannot express
  // a GIN index on a scalar list, which is why it lives here and not in the
  // schema alongside the others.
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ServiceProfile_services_gin" ON "ServiceProfile" USING GIN ("services");`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ServiceProfile_areas_gin" ON "ServiceProfile" USING GIN ("areas");`)

  // ── A tradesperson asking to be listed (2026-08-18) ─────────────────────
  // The object that did not exist: until now a master could only be admitted
  // by an admin typing their id into /admin → access. That is not a product,
  // it is a favour — there was no way to APPLY, no queue, and nothing for the
  // applicant to look at afterwards. See prisma/schema → ProviderApplication.
  //
  // ⚠️ THE ENUM IS CREATED BEFORE THE TABLE, and defensively. `ProviderKind` is
  // new, so on a database that predates this deploy the CREATE TABLE below
  // would fail on an unknown type — and `dbBoot` runs before the first request
  // is served, so that failure is the whole site, not one screen.
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "ProviderKind" AS ENUM ('INDIVIDUAL', 'COMPANY');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ProviderApplication" (
      "id"            TEXT PRIMARY KEY,
      "userId"        TEXT NOT NULL,
      "kind"          "ProviderKind" NOT NULL DEFAULT 'INDIVIDUAL',
      "fullName"      TEXT NOT NULL,
      "phone"         TEXT NOT NULL,
      "companyName"   TEXT,
      "taxId"         TEXT,
      "services"      TEXT[] NOT NULL DEFAULT '{}',
      "areas"         TEXT[] NOT NULL DEFAULT '{}',
      "about"         TEXT NOT NULL,
      "yearsExp"      INTEGER,
      "calloutFee"    INTEGER,
      "priceFrom"     INTEGER,
      "photoUrl"      TEXT,
      "workPhotos"    TEXT[] NOT NULL DEFAULT '{}',
      "status"        "ApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
      "moderatorNote" TEXT,
      "reviewedAt"    TIMESTAMP(3),
      "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      -- The same bounds lib/providerApplication enforces, restated where a raw
      -- INSERT cannot get past them. A price of zero is not „free", it is a
      -- form that was submitted empty and read as a number.
      CONSTRAINT "ProviderApplication_prices_sane" CHECK (
        ("calloutFee" IS NULL OR ("calloutFee" > 0 AND "calloutFee" <= 100000))
        AND ("priceFrom" IS NULL OR ("priceFrom" > 0 AND "priceFrom" <= 1000000))
        AND ("yearsExp" IS NULL OR ("yearsExp" >= 0 AND "yearsExp" <= 70))
      )
    );
  `)
  // One application per account, upserted — a re-submit after NEEDS_REVISION
  // updates the row rather than queueing a second one, exactly as
  // TutorApplication does.
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ProviderApplication_userId_key" ON "ProviderApplication"("userId");`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProviderApplication_status_createdAt_idx" ON "ProviderApplication"("status", "createdAt");`)

  // ── What happened to an offer (2026-08-17) ──────────────────────────────
  // The append-only record a PRICE will be read from: the owner's decision is
  // that an expert pays when the client opens their offer. The read receipt we
  // already had (RequestMessage.readByClientAt) cannot carry that — it is
  // written inside `after()` with a bare catch, it is mutable, and it stamps
  // every unread message at once. See prisma/schema → OfferEvent.
  //
  // ⚠️ THE UNIQUE INDEX IS THE BILLING RULE. „Opened twice costs once" is
  // enforced here, by the database, and not by a read-then-write that two
  // 15-second polls arriving together would both pass.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "OfferEvent" (
      "id"      TEXT NOT NULL,
      "offerId" TEXT NOT NULL,
      "type"    TEXT NOT NULL,
      "at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      -- Context for a dispute, never read by a rule.
      "meta"    JSONB,
      CONSTRAINT "OfferEvent_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "OfferEvent_offer_fk" FOREIGN KEY ("offerId")
        REFERENCES "RequestOffer"("id") ON DELETE CASCADE
    );
  `)
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "OfferEvent_offerId_type_key" ON "OfferEvent"("offerId", "type");`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "OfferEvent_type_at_idx" ON "OfferEvent"("type", "at");`)

  // ── One conversation per offer (2026-08-17) ─────────────────────────────
  // The client has NO ACCOUNT, so the existing "Message" table (both sides are
  // User FKs) cannot carry this: the client side is identified by possession of
  // the request. Reviewable as prisma/manual-migrations/2026-08-17-request-chat/.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RequestMessage" (
      "id"        TEXT NOT NULL,
      -- NULLABLE, and null is a THREAD: the client talking to us, from the
      -- moment they press send until an offer exists. See prisma/schema.
      "offerId"   TEXT,
      "requestId" TEXT NOT NULL,
      "fromClient" BOOLEAN NOT NULL,
      "fromUserId" TEXT,
      "body"      TEXT NOT NULL,
      "readByClientAt"   TIMESTAMP(3),
      "readByProviderAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "RequestMessage_pkey" PRIMARY KEY ("id"),
      -- A CLIENT message carries no author. That is the security half — the
      -- endpoint DERIVES the side and a row claiming to be the client while
      -- naming a User is the exact forgery it refuses.
      --
      -- ⚠️ The mirror half ("fromClient" = false AND "fromUserId" IS NOT NULL)
      -- was here for one day and had to go: the FK below is SET NULL, so
      -- deleting a provider account nulls their author column, the mirror half
      -- then rejects the update, and the DELETE fails — an account that can
      -- never be deleted because the person once typed a sentence. Same trap
      -- RequestOffer avoided by choosing CASCADE. Here CASCADE is wrong (a
      -- company-owned offer outlives the member who wrote on it, and the thread
      -- is what the company answers for), so the CHECK gives way instead.
      -- „A provider message names its author" survives as an INSERT-time rule
      -- in lib/requestChat's only writer, pinned by tests/requests.test.ts.
      CONSTRAINT "RequestMessage_author_matches_side" CHECK (
        "fromClient" = false OR "fromUserId" IS NULL
      ),
      CONSTRAINT "RequestMessage_body_not_empty" CHECK (length(btrim("body")) > 0)
    );
  `)
  // The same relaxation for a database that already booted the one-day-old
  // strict version — CREATE TABLE IF NOT EXISTS cannot reach it. Conditional,
  // so this runs once and every later boot skips it: the replacement definition
  // contains no „IS NOT NULL".
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'RequestMessage_author_matches_side'
          AND pg_get_constraintdef(oid) LIKE '%IS NOT NULL%'
      ) THEN
        ALTER TABLE "RequestMessage" DROP CONSTRAINT "RequestMessage_author_matches_side";
        ALTER TABLE "RequestMessage" ADD CONSTRAINT "RequestMessage_author_matches_side"
          CHECK ("fromClient" = false OR "fromUserId" IS NULL);
      END IF;
    END $$;
  `)
  // ── The platform thread's one schema requirement (2026-08-17) ────────────
  // Same shape of repair, same reason: the table already exists in production
  // with "offerId" NOT NULL, and CREATE TABLE IF NOT EXISTS cannot reach it.
  // DROP NOT NULL is idempotent in effect but not in log noise, so it is asked
  // for only when it is actually still there.
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'RequestMessage' AND column_name = 'offerId'
          AND is_nullable = 'NO'
      ) THEN
        ALTER TABLE "RequestMessage" ALTER COLUMN "offerId" DROP NOT NULL;
      END IF;
    END $$;
  `)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RequestMessage_offerId_createdAt_idx" ON "RequestMessage"("offerId", "createdAt");`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RequestMessage_requestId_createdAt_idx" ON "RequestMessage"("requestId", "createdAt");`)
  for (const fk of [
    `ALTER TABLE "RequestMessage" ADD CONSTRAINT "RequestMessage_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "RequestOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
    `ALTER TABLE "RequestMessage" ADD CONSTRAINT "RequestMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
    `ALTER TABLE "RequestMessage" ADD CONSTRAINT "RequestMessage_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;`,
  ]) {
    await prisma.$executeRawUnsafe(`DO $$ BEGIN ${fk} EXCEPTION WHEN duplicate_object THEN NULL; END $$;`)
  }

  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "RequestAccess_userId_key" ON "RequestAccess"("userId");`)
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "RequestAccess_companyId_key" ON "RequestAccess"("companyId");`)

  // The foreign keys, after every side exists.
  //
  // ServiceRequest → Category is RESTRICT: a sphere with live requests must
  // fail loudly on delete rather than silently unfile them.
  // ServiceRequest → User is SET NULL, deliberately unlike "Booking"'s Restrict:
  // deleting an account must not be refused because of a request, and must not
  // erase it either — what somebody asked for stays readable with no name on it.
  // Everything else cascades: an offer without its request, or an allowlist row
  // without its subject, is a row that cannot be read at all.
  for (const fk of [
    `ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;`,
    `ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;`,
    `ALTER TABLE "RequestOffer" ADD CONSTRAINT "RequestOffer_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
    `ALTER TABLE "RequestOffer" ADD CONSTRAINT "RequestOffer_expertUserId_fkey" FOREIGN KEY ("expertUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
    `ALTER TABLE "RequestOffer" ADD CONSTRAINT "RequestOffer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
    `ALTER TABLE "RequestAccess" ADD CONSTRAINT "RequestAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
    `ALTER TABLE "RequestAccess" ADD CONSTRAINT "RequestAccess_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
    // ProviderApplication → User, CASCADE (2026-08-18). Not a judgement call: the
    // row IS the person — their name, phone, face photo and a paragraph about
    // themselves — so it cannot outlive the account the way a ServiceRequest's
    // anonymised history can. SET NULL is not even available (the column is NOT
    // NULL, one application per account), and RESTRICT would make an account
    // undeletable because somebody once applied to fix taps. Deliberately
    // allowlisted in tests/userDeletion.test.ts rather than excused there.
    `ALTER TABLE "ProviderApplication" ADD CONSTRAINT "ProviderApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
    // ⚠️ THESE TWO WERE MISSING, AND THE GAP WAS REAL (found 2026-08-18 by
    // deleting three test accounts and watching their profiles survive).
    //
    // `ServiceProfile` declares `onDelete: Cascade` on both columns in
    // prisma/schema — but this table is created by the raw DDL above, which
    // never emitted the foreign keys, so PRODUCTION HAD NONE AT ALL. Deleting a
    // master left a row whose `userId` pointed at nothing: still `available`,
    // still matching in the routing query, and rendered on /services with the
    // name read through a relation that now resolves to null.
    //
    // Nothing reported it. The Prisma client believes the relation exists, so
    // it never complains; the page just draws „—" where a name should be. This
    // is exactly the class of defect tests/userDeletion.test.ts exists to catch,
    // and it caught the ProviderApplication edge above the same day — it could not
    // catch this one, because a foreign key that was never written is not a
    // foreign key that changed.
    `ALTER TABLE "ServiceProfile" ADD CONSTRAINT "ServiceProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
    `ALTER TABLE "ServiceProfile" ADD CONSTRAINT "ServiceProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
  ]) {
    await prisma.$executeRawUnsafe(
      `DO $$ BEGIN ${fk} EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    )
  }

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
  // ── two roles, not three, and neither of them is „student" (2026-08-21) ────
  //
  // Owner: „კონსულტანტი საერთოდ უნდა ამოვიღოთ. ორი უნდა დავტოვოთ — ჩვეულებრივი
  // მყიდველი და სერვისის გამყიდველი. და სტუდენტი არ უნდა იყოს მყიდველი,
  // მომხმარებელია ეს."
  //
  // WHY IT MATTERED. `Role` was STUDENT / TUTOR / ADMIN, with no provider value,
  // so somebody selling SERVICES had to be stored as STUDENT — the same word as
  // somebody who has only ever bought. Measured that day: 26 sellers were TUTOR,
  // 2 sellers were STUDENT, and 30 plain buyers were STUDENT too. The column
  // could not answer „who is this", which is exactly what a role is for.
  //
  // `ALTER TYPE … ADD VALUE` cannot run inside a transaction block on PG < 12,
  // so each is its own statement and guarded in JS, exactly like
  // ApplicationStatus.NEEDS_REVISION at the top of this file.
  //
  // ⚠️ THE BACKFILL THAT USED TO FOLLOW IS GONE (2026-08-24). It moved rows off
  // STUDENT/TUTOR by asking whether the account held a TutorProfile, and that
  // table no longer exists. The services-only migration at the foot of this file
  // does the same work against ServiceProfile and then DROPS the two dead values
  // from the enum, so after it has run there is nothing left for a backfill to
  // find. These two `ADD VALUE`s stay because they are what a database that has
  // never seen either word still needs.
  for (const value of ['USER', 'PROVIDER']) {
    try {
      await prisma.$executeRawUnsafe(`ALTER TYPE "Role" ADD VALUE IF NOT EXISTS '${value}';`)
    } catch (err) {
      console.error(`[dbBoot] Role ${value} add failed:`, err)
    }
  }

  // ── the two foreign keys Postgres was never asked to index (2026-08-21) ────
  // A FK gets no index for free. Both of these are ON DELETE SET NULL, so every
  // account deletion had to seq-scan the child table to find the rows to null —
  // and account deletion is a real, tested flow (app/api/admin/users/[id],
  // tests/userDeletion.test.ts). Cheap now while the tables are small; the point
  // is that it stops being cheap silently.
  // Reviewable as prisma/manual-migrations/2026-08-21-fk-indexes/.
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ServiceRequest_userId_idx" ON "ServiceRequest" ("userId");`,
  )
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "RequestMessage_fromUserId_idx" ON "RequestMessage" ("fromUserId");`,
  )

  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`)
    // ⚠️ THE THREE TutorProfile ONES WENT ON 2026-08-24 (specialty, headline,
    // bio) with the table. Their replacements are on the provider profile and
    // are created by the services-only migration below, AFTER the columns it
    // adds exist — a GIN index on a column that is not there yet would abort
    // the whole boot from inside this try/catch's blind spot.
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "User_fullName_trgm_idx" ON "User" USING GIN ("fullName" gin_trgm_ops);`,
    )
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "Category_name_trgm_idx" ON "Category" USING GIN ("name" gin_trgm_ops);`,
    )
  } catch (err) {
    console.error('[dbBoot] pg_trgm setup skipped (search degrades to substring match):', err)
  }
  // ── THE CONSULTATION PRODUCT IS REMOVED (2026-08-24) ───────────────────────
  //
  // Owner: „მინდა რომ მცოდნეზე კონსულტაციები საერთოდ ამოვიღოთ და მოვარგოთ
  // სერვისებზე რაც ჩანაფიქრში იყო."
  //
  // The executable twin of prisma/manual-migrations/2026-08-24-services-only/,
  // which carries the long version of every note below plus the guards. Read
  // that one; this one is what actually runs.
  //
  // ⚠️ IT MUST STAY LAST IN THIS FUNCTION. Everything above assumes the tables
  // it drops still exist on a database that has never been migrated, and every
  // ServiceProfile column it adds is a column the statements above do not know
  // about. Appending after it is fine; inserting before it is a boot that dies
  // on „relation TutorProfile does not exist".
  //
  // ⚠️ THE 27 PROFILES ARE MIGRATED, NOT DELETED, AND THEY KEEP THEIR IDS AND
  // SLUGS — so /experts/<slug> answers the same URL it answered yesterday, and
  // Certificate/Education/Experience/Favorite only need their COLUMN renamed
  // because the row they point at still has that id.

  // 1. The provider profile absorbs the professional columns.
  await prisma.$executeRawUnsafe(`
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
  `)
  // SET NULL, never CASCADE: an admin retiring a sphere must not delete the
  // people filed under it.
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServiceProfile_categoryId_fkey') THEN
        ALTER TABLE "ServiceProfile" ADD CONSTRAINT "ServiceProfile_categoryId_fkey"
          FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$;
  `)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ServiceProfile_categoryId_idx" ON "ServiceProfile" ("categoryId");`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ServiceProfile_featured_idx" ON "ServiceProfile" ("featured");`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ServiceProfile_published_available_idx" ON "ServiceProfile" ("published", "available");`)
  // ServiceProfile.servicesConfirmedAt — „have they LOOKED at the list".
  // Additive and nullable; null is the honest state for everybody the day it
  // appears. Step 2 above seeded each migrated provider with their whole SPHERE
  // (a provider with no services is invisible to routing), which is why all four
  // lawyers claim all seven legal services and read as one person on a card.
  // Deriving the real list from their own bios was built and deliberately NOT
  // applied: a bio proves what somebody does, never what they do not, so it
  // would have taken „დღგ" from an accountant who had not typed the word and
  // dropped them out of every queue naming it. Owner: „წაშლა არ გვინდა, მათ
  // უნდა შევიდნენ ისევ თავიან ექაუნთზე." This column only records whether they
  // have been back; /work/services stamps it on save.
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "ServiceProfile"
      ADD COLUMN IF NOT EXISTS "servicesConfirmedAt" TIMESTAMP(3);
  `)

  // The one application form now asks for a profession too.
  await prisma.$executeRawUnsafe(`ALTER TABLE "ProviderApplication" ADD COLUMN IF NOT EXISTS "professions" TEXT[] NOT NULL DEFAULT '{}';`)

  // 2. The 27 people move.
  //
  // `services[]` is seeded from the SPHERE they are already filed under, through
  // the taxonomy's own `Topic.categorySlug` map (lib/requestTopics). A provider
  // with no services is invisible to routing, so „nothing ticked" would migrate
  // them into SILENCE; the sphere is what we actually know about them, and they
  // narrow it themselves on /work/services. The map is written out because SQL
  // cannot read the TypeScript vocabulary; a sub-sphere falls through to its
  // parent (`advokati` → `law`, `sales` → `marketing`, `finance` → `tax`).
  //
  // The whole block is a no-op once "TutorProfile" is gone — plpgsql resolves
  // names at execution, and the early RETURN means these statements never run.
  await prisma.$executeRawUnsafe(`
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
        ARRAY['TBILISI'],
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
        0,
        0
      FROM "TutorProfile" t
      LEFT JOIN "Category" c       ON c."id" = t."categoryId"
      LEFT JOIN "Category" cp      ON cp."id" = c."parentId"
      LEFT JOIN _cat_topics own    ON own.slug = c."slug"
      LEFT JOIN _cat_topics parent ON parent.slug = cp."slug"
      ON CONFLICT ("id") DO NOTHING;

      -- ⚠️ NO "updatedAt" — the table does not have one, and assuming it did is
      -- what this statement failed on the first time it was run against the real
      -- database (2026-08-25: column updatedAt of relation RequestAccess does
      -- not exist). An allowlist row records an admission; there is no
      -- second event to stamp. It failed BEFORE any DROP, which is the whole
      -- reason the drops are last.
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

      UPDATE "User" u SET "role" = 'PROVIDER'
       WHERE u."role" <> 'ADMIN'
         AND EXISTS (SELECT 1 FROM "TutorProfile" t WHERE t."userId" = u."id");
    END $$;
  `)

  // 🔒 NOT `t.rating` / `t.reviewsCount` above. Those were 0 for all 27 anyway,
  // and they described BOOKING reviews; the new number is derived from reviews
  // on finished jobs, of which they have none. Never carry a rating across.

  // 3. The credential tables follow their owner — the rename is enough, because
  //    the new profile carries the OLD id.
  await prisma.$executeRawUnsafe(`
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
        EXECUTE format('DELETE FROM %I x WHERE NOT EXISTS (SELECT 1 FROM "ServiceProfile" s WHERE s."id" = x."providerId")', tbl);
        EXECUTE format(
          'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("providerId") REFERENCES "ServiceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE',
          tbl, tbl || '_providerId_fkey');
        EXECUTE format('DROP INDEX IF EXISTS %I', tbl || '_tutorId_idx');
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I ("providerId")', tbl || '_providerId_idx', tbl);
      END LOOP;
    END $$;
  `)

  // 4. A saved provider.
  await prisma.$executeRawUnsafe(`
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
  `)
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "Favorite_userId_tutorId_key";`)
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "Favorite_tutorId_idx";`)
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Favorite_userId_providerId_key" ON "Favorite" ("userId", "providerId");`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Favorite_providerId_idx" ON "Favorite" ("providerId");`)

  // 5. A review hangs on a finished JOB. 0 rows on production, so nothing is
  //    lost by dropping the booking half.
  //
  // ⚠️ THE CHECK COMES OFF FIRST. `Review_attached_to_something` names TWO
  // columns, and Postgres refuses to DROP COLUMN out from under a multi-column
  // constraint — it only auto-drops the single-column ones.
  await prisma.$executeRawUnsafe(`ALTER TABLE "Review" DROP CONSTRAINT IF EXISTS "Review_attached_to_something";`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "Review" DROP CONSTRAINT IF EXISTS "Review_bookingId_fkey";`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "Review" DROP CONSTRAINT IF EXISTS "Review_tutorId_fkey";`)
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "Review_tutorId_createdAt_idx";`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "Review" DROP COLUMN IF EXISTS "bookingId";`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "Review" DROP COLUMN IF EXISTS "tutorId";`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Review_createdAt_idx" ON "Review" ("createdAt");`)

  // 6. A request kind called „კონსულტაცია" becomes „შეხვედრა". `kind` is a plain
  //    TEXT column (never an enum, deliberately — lib/requestTopics says why),
  //    so this is one UPDATE.
  await prisma.$executeRawUnsafe(`UPDATE "ServiceRequest" SET "kind" = 'MEETING' WHERE "kind" = 'CONSULTATION';`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "ServiceRequest" ALTER COLUMN "kind" SET DEFAULT 'MEETING';`)

  // 7. The machinery. Children first — Review and Favorite were repointed above,
  //    so nothing outside this list references any of them.
  await prisma.$executeRawUnsafe(`ALTER TABLE "Category" DROP COLUMN IF EXISTS "defaultServiceType";`)
  // ⚠️ 'RescheduleRequest', NOT 'LegacyRescheduleRequest'. The Prisma MODEL was
  // called LegacyRescheduleRequest and carried @@map("RescheduleRequest"), so the
  // table on disk has always had the shorter name. Naming the model here was a
  // silent no-op, and the miss surfaced two steps later when DROP TYPE
  // "RescheduleStatus" refused because that table still held the type.
  for (const table of [
    'RescheduleRequest', 'Dispute', 'Message', 'Enrollment', 'Package',
    'Booking', 'AvailabilitySlot', 'Consultation', 'TutorApplication', 'TutorProfile',
  ]) {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${table}" CASCADE;`)
  }
  for (const type of [
    'BookingStatus', 'PayoutStatus', 'ServiceType', 'ProfileType',
    'EnrollmentStatus', 'RescheduleStatus', 'DisputeReason', 'DisputeOutcome',
  ]) {
    await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "${type}";`)
  }

  // 8. Two dead enum values on Role.
  //
  // ⚠️ AFTER THE DROPS, AND IT USED TO BE BEFORE THEM. Postgres will not drop an
  // enum type while a column still holds it, and `Booking.cancelledBy` was a
  // `Role` — so this ran, renamed the type, and then died on „cannot drop type
  // Role_old because other objects depend on it", taking the whole boot with it.
  // Found on 2026-08-25 by running dbBoot against the real database. With the
  // tables gone, "User"."role" is the only column left holding the type.
  // STUDENT and TUTOR were the original pair,
  //    STUDENT and TUTOR were the original pair,
  //    renamed to USER/PROVIDER when the site stopped being a tutoring platform
  //    and kept only because Postgres cannot drop a value in place. It REFUSES
  //    rather than moves anybody: a straggler is a bug upstream, not something
  //    to guess about.
  await prisma.$executeRawUnsafe(`
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
  `)

  // 9. Un-seed the university subjects that step 2's sphere map dragged in.
  //    `higher → ბუღალტერია / სამართალი / მენეჯმენტი / ფინანსები` are what a
  //    student ticks to be TAUGHT a subject; a practising advocate filed under
  //    one is offering a university course. 14 of 29 public profiles carried
  //    one and it sorted FIRST on their card, which is why every lawyer read
  //    „სამართალი · ხელშეკრულება · +6" and looked like the same person.
  //    Removing them unroutes nobody — each keeps 2–7 real services. The map
  //    above no longer adds them; this is for databases that ran the old one.
  await prisma.$executeRawUnsafe(`
    UPDATE "ServiceProfile"
       SET "services" = ARRAY(SELECT unnest("services") EXCEPT SELECT unnest(ARRAY['accounting-l', 'law-l', 'management-l', 'finance-l', 'economics-l', 'statistics-l', 'medicine-l']))
     WHERE "services" && ARRAY['accounting-l', 'law-l', 'management-l', 'finance-l', 'economics-l', 'statistics-l', 'medicine-l'];
  `)

  // 10. The bell still pointed at the pages that went. Measured on the day: 88 of
  //    479 notifications carried an href under /me/bookings or /work/bookings,
  //    39 of them still unread — a person taps „ჯავშანი შეიქმნა" and lands on a
  //    404 for a booking that exists nowhere any more.
  //
  // ⚠️ BY TYPE, NOT BY HREF. A BOOKING_* row lost its subject with the table, so
  // there is nothing left for it to describe. Matching on the href would also
  // catch `/apply`, which still resolves (308 → /join) and whose
  // APPLICATION_STATUS rows are about an application that does still exist.
  await prisma.$executeRawUnsafe(`DELETE FROM "Notification" WHERE "type" LIKE 'BOOKING\\_%';`)

  // 11. The trigram indexes the catalogue's search needs, on the columns that
  //    replaced TutorProfile.specialty / .headline / .bio. Last, because the
  //    columns they cover are added by step 1 above.
  //
  // ⚠️ NO COUNT GUARDS HERE, unlike the reviewable copy. That file is run once
  // by a person who can read the failure; this one runs at first request, where
  // a RAISE is a site-wide 503 — and „fewer than 29 profiles" is simply TRUE on
  // a fresh developer database. The guards live in
  // prisma/manual-migrations/2026-08-24-services-only/up.sql and were checked
  // against production on the day.
  try {
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "ServiceProfile_headline_trgm_idx" ON "ServiceProfile" USING GIN ("headline" gin_trgm_ops);`,
    )
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "ServiceProfile_about_trgm_idx" ON "ServiceProfile" USING GIN ("about" gin_trgm_ops);`,
    )
  } catch (err) {
    console.error('[dbBoot] provider trigram indexes skipped (search degrades to substring match):', err)
  }

  // ── A REQUEST MAY CARRY PHOTOS (2026-08-29) ──────────────────────────────
  //
  // Owner: „ყველაფერი უნდა იყოს მარტივად… მაქსიმალურად მარტივად, ორივეს
  // მხარეს." A photo of the leaking tap is the simplest thing a client can
  // give and the most useful thing a provider can get — it is what lets an
  // offer name a real price instead of opening a conversation to find one out.
  // Airtasker makes it a step of its own („Snap a photo — help taskers
  // understand what needs doing"); this is the same move.
  //
  // ⚠️ SAME SHAPE AS `ServiceProfile.workPhotos`, deliberately: a `String[]` of
  // base64 data URIs, capped in the schema (lib/requests → MAX_REQUEST_PHOTOS)
  // rather than in SQL. And the same hazard: these are BLOBS. They must never
  // be selected into a list payload — the queue, the offers list and the admin
  // table all read this row, and one careless `photos` in a SELECT would put
  // megabytes on the wire.
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "ServiceRequest" ADD COLUMN IF NOT EXISTS "photos" TEXT[] NOT NULL DEFAULT '{}';`,
  )




}

/* ── the stamp: why the second boot costs two round-trips, not 166 ─────────── */
//
// Every statement above is idempotent, so re-running the set is SAFE — it was
// just never CHEAP. Measured 2026-08-21 against the Railway proxy: 166
// statements × ~600ms = 102 SECONDS, paid in full by every cold process. In
// production that is the first request after each deploy; in the test suite it
// was the entire gate — `npm run check` spent 110s, of which 100s was two test
// files (abroad, b2b) each booting the schema once, while the other 96 files
// finished in under a second between them.
//
// So the set records that it ran. THE STAMP IS A HASH OF ITS OWN SOURCE, not a
// version number somebody has to remember to raise: add a statement, change a
// statement, delete one — the text of `runMigrations` changes, the hash changes
// and the whole set runs again on the next boot. There is no bookkeeping step
// to forget, which is the failure mode every hand-maintained migration counter
// eventually has.
//
// The hash is taken over the TRANSPILED body, so esbuild has already dropped the
// comments and normalised the spacing inside `runMigrations` — rewording the
// prose above a statement does not cost a 102-second boot, while any real
// statement survives into the text and moves the hash. Pinned by
// tests/dbBootStamp.test.ts.
//
// ⚠️ IT ERRS TOWARDS RUNNING, NOT SKIPPING, and that is the whole point. The
// emitted body also carries the names esbuild gave this module's imports, so an
// edit ELSEWHERE in this file can shift it and re-run the set once (observed
// 2026-08-21 when the test seams below were added: one 108-second boot, then a
// fresh stamp and 10 seconds thereafter). A spurious re-run costs a minute of a
// gate; a spurious SKIP would cost a missing column in production. If the two
// ever have to trade, they trade this way round.
//
// ⚠️ WHAT THE STAMP DOES NOT PROMISE. It says „this exact DDL has been applied
// to this database", not „the schema matches". Someone dropping a column by
// hand is invisible to it — as it is to any migration system that trusts its
// own ledger. Everything here is additive, so the repair is the same as it ever
// was: `DELETE FROM "_DbBootStamp"` and restart, and all 166 run again.
const STAMP_TABLE = '_DbBootStamp'

/** sha256 of the migration body — changes exactly when the DDL changes. */
function migrationsFingerprint(): string {
  return createHash('sha256').update(runMigrations.toString()).digest('hex').slice(0, 32)
}

/** Test seams. The stamp's whole safety rests on the fingerprint tracking the
 *  DDL, so tests/dbBootStamp.test.ts checks that rather than trusting the
 *  comment above — exported here because neither is otherwise reachable. */
export const __migrationsFingerprint = migrationsFingerprint
export const __runMigrationsSource = () => runMigrations.toString()

async function alreadyApplied(fp: string): Promise<boolean> {
  // One statement to be sure the ledger exists, one to read it. Both are cheap
  // and both must survive a database that has never seen this app before.
  //
  // ⚠️ `CREATE TABLE IF NOT EXISTS` IS NOT RACE-FREE. Two processes issuing it
  // at the same instant can both pass the existence check and one then fails on
  // a duplicate pg_type row — Postgres documents this, and the test gate
  // reproduces it: six lanes, and `abroad` and `b2b` both boot the schema. The
  // loser's throw would propagate as „not applied" and cost that process a full
  // 102-second run of DDL it did not need. A concurrent create means the table
  // is there, which is all this line wanted.
  try {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${STAMP_TABLE}" ("id" INTEGER PRIMARY KEY, "fingerprint" TEXT NOT NULL, "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT now());`,
    )
  } catch { /* another process created it in the same instant */ }
  // The SELECT is NOT wrapped: an unreachable database must reach ensureDbReady
  // as a throw, not be mistaken for „nothing applied yet".
  const rows = await prisma.$queryRawUnsafe<{ fingerprint: string }[]>(
    `SELECT "fingerprint" FROM "${STAMP_TABLE}" WHERE "id" = 1;`,
  )
  return rows.length > 0 && rows[0].fingerprint === fp
}

async function recordApplied(fp: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "${STAMP_TABLE}" ("id", "fingerprint") VALUES (1, '${fp}')
     ON CONFLICT ("id") DO UPDATE SET "fingerprint" = EXCLUDED."fingerprint", "appliedAt" = now();`,
  )
}

/**
 * The migration set, run at most once per database per version of the DDL.
 *
 * A stamp read that FAILS is not a reason to skip the migrations — it is a
 * reason to run them: an unreachable database throws here and is handled by
 * ensureDbReady exactly as before, and a ledger that cannot be read is treated
 * as „not applied", which costs one slow boot and never a wrong schema.
 */
/**
 * True only while the DDL is actually being applied.
 *
 * ⚠️ THIS FLAG IS THE DIFFERENCE BETWEEN „SLOW" AND „GONE" (2026-08-27), and
 * `ensureDbReadyWithin` below is unusable without it. A warm boot is two round
 * trips; a boot that has to apply the set is ~100 SECONDS (the fingerprint
 * changed — CLAUDE.md says so), and that happens legitimately on the first
 * request after a deploy that touches this file. A deadline that cannot tell
 * the two apart would answer the first visitors after such a deploy with an
 * empty catalogue for two minutes, which is a worse lie than a slow page.
 */
let applying = false

async function runMigrationsOnce(): Promise<void> {
  const fp = migrationsFingerprint()
  if (await alreadyApplied(fp)) return
  applying = true
  try {
    await runMigrations()
    await recordApplied(fp)
  } finally {
    applying = false
  }
}

/**
 * `ensureDbReady()` with a DEADLINE, for a render that already knows how to
 * degrade.
 *
 * ⚠️ WHY IT EXISTS (2026-08-27). `ensureDbReady` is right to re-throw — a route
 * that proceeds against an unmigrated schema returns opaque 500s. What it does
 * not control is HOW LONG the throw takes: with Postgres unreachable, Prisma
 * sits on the pool until `pool_timeout` (lib/prisma) and only then refuses.
 * Measured against the standalone build with the database pointed at a black
 * hole: the home page hung for 30 SECONDS and then failed, on a page whose own
 * comment promises „a DB blip must not take the home page down — every branch
 * degrades to an empty list". The catch was there; nothing ever reached it in
 * time.
 *
 * Use this ONLY where an empty render is the honest answer. A workspace screen
 * or a write path must keep waiting and then fail loudly — „no jobs" and „we
 * could not read your jobs" are different sentences and only one of them is
 * true.
 *
 * ⚠️ THE DEADLINE DOES NOT APPLY WHILE THE MIGRATIONS ARE RUNNING. That work is
 * slow ON PURPOSE and it finishes; cutting it short would trade a rare outage
 * for a guaranteed empty page after every DDL deploy. See `applying` above.
 */
export function ensureDbReadyWithin(ms: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (applying) return          // legitimately slow — keep waiting
      reject(new Error(`[dbBoot] not ready within ${ms}ms`))
    }, ms)
    ensureDbReady().then(
      () => { clearTimeout(timer); resolve() },
      err => { clearTimeout(timer); reject(err) },
    )
  })
}

export function ensureDbReady(): Promise<void> {
  if (!bootPromise) {
    bootPromise = runMigrationsOnce().catch(err => {
      // Transient failures (DB unreachable at cold boot) shouldn't permanently
      // block requests — reset so the NEXT call retries a clean boot…
      console.error('[dbBoot] migration error:', err)
      bootPromise = null
      // Cleared on BOTH sides, or a failed boot would be remembered as done for
      // the rest of the dev session and every later request would run against a
      // schema that was never migrated.
      globalForBoot.dbBootPromise = null
      // …but the CURRENT caller must fail fast instead of proceeding against a
      // possibly-unmigrated schema (which would surface as opaque 500s on
      // missing columns). Re-throw so awaiting routes can return 503.
      throw err
    })
    if (process.env.NODE_ENV !== 'production') globalForBoot.dbBootPromise = bootPromise
  }
  return bootPromise
}
