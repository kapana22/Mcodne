// Static guards for the teaching-packages vertical (planned 2026-08-05).
//
// Run: npx tsx tests/packages.test.ts   (also picked up by `npm run check`)
//
// Pure source-level invariants — no browser, no dev server, no DB. Each one
// pins a mistake this codebase has ALREADY made once, in a different feature:
//
//   A. A column created only in lib/dbBoot and never declared in
//      prisma/schema.prisma is one `prisma db push` away from being silently
//      dropped. Booking.proposedByStudent shipped exactly that way and would
//      have erased every client-proposed booking.
//   B. The vertical must ship dark behind ONE flag, the way FEATURE_ABROAD
//      did — so a half-finished feature cannot reach a visitor.
//   C. The gate is TutorProfile.packagesEnabled, NOT ServiceType.RECURRING.
//      Measured on production 2026-08-05: 11 of 21 profiles already carry
//      RECURRING as a legacy default that nothing reads. Gating browse on
//      serviceType would have deleted half the public catalog in one deploy.
//      An allowlist that starts empty can only ever yield an empty page.
//   D. Booking.enrollmentId must stay NULLABLE — every booking that exists
//      today has no enrollment, and a NOT NULL column would fail to add.

import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { releaseBookingCredit } from '../lib/bookingCredit'

const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

let failures = 0
function check(name: string, ok: boolean, hint: string) {
  if (ok) {
    console.log(`✓ ${name}`)
  } else {
    failures++
    console.error(`✗ ${name}\n    ${hint}`)
  }
}

const schema = read('prisma/schema.prisma')
const boot = read('lib/dbBoot.ts')
const flags = read('lib/flags.ts')

// ── A. every packages column in dbBoot is declared in schema.prisma ──────────
// The pairing is the whole point: dbBoot is what actually reaches production,
// schema.prisma is what `db push` treats as the truth. Drift between them is
// silent until the day someone runs a push.
{
  const cols = [
    ['TutorProfile', 'packagesEnabled'],
    ['Booking', 'enrollmentId'],
  ] as const
  for (const [model, col] of cols) {
    check(
      `A: dbBoot adds ${model}.${col} AND schema.prisma declares it`,
      boot.includes(`"${col}"`) && new RegExp(`^\\s*${col}\\s`, 'm').test(schema),
      `${col} exists in only one of the two. A column that lives only in dbBoot is dropped by the next \`prisma db push\`; one that lives only in schema.prisma never reaches prod (Railway's builder can't run the CLI against the internal DB).`,
    )
  }

  // Same rule for the two new tables and their enum.
  for (const table of ['Package', 'Enrollment']) {
    check(
      `A: ${table} exists in both dbBoot DDL and schema.prisma`,
      boot.includes(`CREATE TABLE IF NOT EXISTS "${table}"`) &&
        new RegExp(`^model ${table} \\{`, 'm').test(schema),
      `${table} must be created by dbBoot (that is what runs in production) and declared in schema.prisma (that is what db push preserves).`,
    )
  }
  check(
    'A: EnrollmentStatus enum exists in both',
    boot.includes('CREATE TYPE "EnrollmentStatus"') && schema.includes('enum EnrollmentStatus'),
    'The enum type must be created before any column defaults to one of its values.',
  )
}

// ── B. one rollout constant, interpreted in exactly one place ────────────────
{
  const pkg = read('lib/packages.ts')
  check(
    'B: PACKAGES_VISIBILITY is one of the declared stages',
    /export const PACKAGES_VISIBILITY: PackagesVisibility = '(off|admin|signed-in|public)'/.test(flags),
    'A pair of booleans ("enabled" + "adminOnly") can contradict each other and the contradiction always surfaces in the one place somebody forgot. One question, one constant.',
  )
  check(
    'B2: PACKAGES_VISIBILITY is IMPORTED only by lib/packages.ts',
    (() => {
      // Only real coupling counts — an `import { PACKAGES_VISIBILITY }`. A
      // comment that merely names the constant is documentation and must not
      // fail this guard, or the guard teaches people to stop explaining things.
      //
      // What it does catch: a second call site deciding for itself what "on"
      // means. There is one interpreter (canSeePackages) precisely so that
      // question cannot develop two answers.
      const { execSync } = require('child_process') as typeof import('child_process')
      const hits = execSync(
        `grep -rlE "import[^;]*\\bPACKAGES_VISIBILITY\\b" --include="*.ts" --include="*.tsx" app components lib tests 2>/dev/null || true`,
        { cwd: root, encoding: 'utf8' },
      ).trim().split('\n').filter(Boolean)
      // This file matches its own grep pattern; it is the guard, not a caller.
      return hits.every(f => f === 'lib/packages.ts' || f === 'tests/packages.test.ts')
    })(),
    'Import canSeePackages() / packagesFeatureExists() from lib/packages instead of importing the raw constant and comparing it at the call site.',
  )
  check(
    'B3: canSeePackages returns false for a signed-out viewer in the admin stage',
    /case 'admin':\s*\n\s*return role === 'ADMIN'/.test(pkg),
    'The admin stage must test the role explicitly. `role !== null` or a truthiness check would let any signed-in student in.',
  )
  check(
    'B3b: every stage is handled, so a new one cannot silently default to visible',
    ["'off'", "'admin'", "'signed-in'", "'public'"].every(s => pkg.includes(`case ${s}:`)),
    'canSeePackages switches on the stage with no default branch — add the case, or TypeScript stops narrowing and the function returns undefined (falsy, but by accident rather than by decision).',
  )
}

// ── B4. the surfaces actually consult the gate ───────────────────────────────
{
  const page = read('app/swavleba/page.tsx')
  check(
    'B4: the teaching route 404s (not 403s) when the viewer may not see it',
    page.includes('canSeePackages') && page.includes('notFound()'),
    'A 403 confirms the page exists and is worth coming back to. While the vertical is private it must be indistinguishable from a typo.',
  )
  check(
    'B5: the teaching route is noindex',
    /robots:\s*\{\s*index:\s*false/.test(page),
    'If the stage is ever flipped to public before the SEO work lands, this is what keeps the page out of the index until that is a deliberate act too.',
  )
  const api = read('app/api/admin/tutors/[id]/packages/route.ts')
  check(
    'B6: the admin toggle API is ADMIN-guarded, feature-gated and audited',
    api.includes("requireRoleApi('ADMIN')") && api.includes('packagesFeatureExists') && api.includes('audit('),
    'This is the one control that lets a person take payment for eight lessons at once — "who enabled whom, and when" must be answerable from AuditLog.',
  )
}

// ── C. the gate is packagesEnabled, not serviceType ──────────────────────────
{
  check(
    'C: TutorProfile.packagesEnabled defaults to false (allowlist, not blocklist)',
    /packagesEnabled\s+Boolean\s+@default\(false\)/.test(schema),
    'It must start false for every existing profile. A default of true would enable the whole catalog the moment the column lands.',
  )
  check(
    'C2: dbBoot adds packagesEnabled with DEFAULT false',
    /"packagesEnabled"\s+BOOLEAN NOT NULL DEFAULT false/.test(boot),
    'A NOT NULL column with no default cannot be added to a populated table; a default of true would silently enable everyone.',
  )
  // The reason this guard exists, restated so nobody "simplifies" the gate to
  // serviceType later: that field is polluted with a legacy value on more than
  // half of production, so it can gate nothing until it is cleaned up.
  check(
    'C3: lib/flags documents why serviceType is NOT the gate',
    flags.includes('packagesEnabled') && /serviceType/.test(flags),
    'Keep the measured reason next to the flag. Without it the next reader sees an unused ServiceType.RECURRING and assumes it is the natural switch.',
  )
  // The teaching route must select on the allowlist and nothing else. Gating on
  // serviceType here is the regression this whole guard set exists to prevent.
  {
    const page = read('app/swavleba/page.tsx')
    check(
      'C4: the teaching route selects on packagesEnabled, not serviceType',
      /packagesEnabled:\s*true/.test(page) && !/serviceType/.test(page),
      'Filtering this page on serviceType would both miss enabled experts and re-introduce the polluted-field problem measured on production.',
    )
  }
}

// ── E. the consultation browse is untouched in this stage ────────────────────
// Deliberate: excluding packagesEnabled experts from /tutors is a phase-3
// decision, and the rule then must be "has packages AND no consultations" —
// not the bare toggle. Enabling an existing consultation expert must never make
// them vanish from the public catalog, which is exactly the failure mode the
// serviceType measurement uncovered.
{
  const q = read('lib/tutorsQuery.ts')
  check(
    'E: lib/tutorsQuery does not filter on packagesEnabled yet',
    !q.includes('packagesEnabled'),
    'If you add this filter, make it "has an active package AND zero consultations" — a bare `packagesEnabled: false` would delete any existing expert the admin enables from /tutors the moment they are enabled.',
  )
}

// ── D. enrollmentId is nullable on both sides ────────────────────────────────
{
  check(
    'D: schema declares Booking.enrollmentId as optional',
    /enrollmentId\s+String\?/.test(schema),
    'Every existing booking has no enrollment. A required column cannot be added, and a package lesson must remain an ordinary Booking so reschedule/cancel/video/messages keep working unchanged.',
  )
  check(
    'D2: dbBoot adds enrollmentId with no NOT NULL',
    /ADD COLUMN IF NOT EXISTS "enrollmentId" TEXT;/.test(boot),
    'ADD COLUMN ... TEXT NOT NULL would abort the boot migration on a populated Booking table.',
  )
}

// ── F. the total price is the only stored price ──────────────────────────────
// The rule the whole composer exists to enforce. If a per-lesson field ever
// becomes an INPUT, the two numbers can disagree and we reprint the „₾80 · 30
// წთ" vs „₾25-დან" bug at package scale.
{
  const editor = read('app/work/(expert)/profile/_packages.tsx')
  const api = read('app/api/tutor/packages/route.ts')
  check(
    'F: the editor derives the per-lesson price and never stores it',
    editor.includes('perLessonPrice(') && !/perLessonPrice:\s/.test(editor) && !/name="perLesson/.test(editor),
    'perLessonPrice must be computed for display only. The teacher types the TOTAL — see the Airtasker rule quoted in lib/packages.',
  )
  check(
    'F2: the Package model itself has no perLessonPrice column',
    (() => {
      // Slice the Package block exactly. A lazy `[\s\S]*?` from "model Package"
      // runs straight through into "model Enrollment", which legitimately DOES
      // carry perLessonPrice — the first version of this guard failed on that.
      const start = schema.indexOf('model Package {')
      if (start < 0) return false
      const body = schema.slice(start, schema.indexOf('\n}', start))
      return !body.includes('perLessonPrice')
    })(),
    'Only Enrollment snapshots perLessonPrice (at purchase, for display). Storing it on Package too would give one price two homes.',
  )
  check(
    'F3: the create API validates lessonsCount against the fixed set',
    api.includes('PACKAGE_LESSON_COUNTS'),
    'A free-form lesson count makes cards incomparable and drops the market unit (8 = 2/week × 4 weeks).',
  )
}

// ── G. both tutor package routes are owner-guarded and feature-gated ─────────
{
  for (const p of ['app/api/tutor/packages/route.ts', 'app/api/tutor/packages/[id]/route.ts']) {
    const src = read(p)
    check(
      `G: ${p.replace('app/api/tutor/', '')} is TUTOR/ADMIN-guarded and feature-gated`,
      src.includes("requireRoleApi([ROLE.PROVIDER, ROLE.ADMIN])") && src.includes('packagesFeatureExists'),
      'Every packages endpoint must 404 while the vertical is off and must never trust the caller for identity.',
    )
  }
  const one = read('app/api/tutor/packages/[id]/route.ts')
  check(
    'G2: editing a package cannot rewrite a running deal',
    one.includes('Enrollment snapshots') || one.includes('snapshots lessonsTotal'),
    'Enrollment stores lessonsTotal/priceTotal/perLessonPrice at purchase. Keep the note — it is why a price edit is safe.',
  )
  check(
    'G3: delete refuses while an enrollment is live',
    /enrollment\.count\(/.test(one) && one.includes("'REQUESTED', 'ACTIVE'"),
    '„The thing I bought disappeared" is not a message a client should have to interpret; deactivating is what `active:false` is for.',
  )
}

// ── H. the schedule gate counts LESSONS, not start ticks ─────────────────────
// The single most tempting wrong implementation: `openStarts.length`. On a
// 15-minute grid a 2-hour window yields 6 starts but holds two 50-minute
// lessons, so that shortcut would tell a teacher an 8-lesson package fits when
// three do — and the person who finds out is the client who already paid.
{
  const { scheduleCapacity, packageFits } = require('../lib/packages') as typeof import('../lib/packages')
  const at = (h: number, m = 0) => new Date(Date.UTC(2026, 7, 10, h, m))

  // One 2-hour window on a 15-min grid → 8 ticks, but only 2 × 50min lessons.
  const twoHours = [at(10), at(10, 15), at(10, 30), at(10, 45), at(11), at(11, 15), at(11, 30), at(11, 45)]
  check(
    'H: capacity packs by lesson length, not by number of start ticks',
    scheduleCapacity(twoHours, 50, 0) === 2,
    `8 ticks in a 2h window must yield 2 lessons of 50min, got ${scheduleCapacity(twoHours, 50, 0)}.`,
  )
  // A 10:00–11:50 window (110 min). computeOpenStarts would offer 10:00…11:00
  // for a 50-minute lesson — never 11:15, because that would end past the edge.
  // Two lessons fit back-to-back (10:00 + 11:00); adding a 20-minute buffer
  // pushes the second past 11:10 and only one fits.
  const oneFiftyTen = [at(10), at(10, 15), at(10, 30), at(10, 45), at(11)]
  check(
    'H2: the teacher buffer separates two lessons of the same package',
    scheduleCapacity(oneFiftyTen, 50, 0) === 2 && scheduleCapacity(oneFiftyTen, 50, 20) === 1,
    `Expected 2 without a buffer and 1 with 20min, got ${scheduleCapacity(oneFiftyTen, 50, 0)} and ${scheduleCapacity(oneFiftyTen, 50, 20)}.`,
  )
  check(
    'H3: an empty calendar has zero capacity and fits nothing',
    scheduleCapacity([], 50, 0) === 0 && packageFits(0, 4) === false,
    'An expert who has published nothing must fail the gate — that is the measured failure this exists to stop (46% of booking attempts).',
  )
  check(
    'H4: capacity exactly equal to the lesson count passes',
    packageFits(4, 4) === true && packageFits(3, 4) === false,
    'The comparison is >=, not >.',
  )

  const fitSrc = read('lib/packageFit.ts')
  check(
    'H5: the fit query keeps windows that OVERLAP the horizon',
    fitSrc.includes('endAt: { gt: now }') && fitSrc.includes('startAt: { lt: until }'),
    'Filtering on startAt alone drops a window opened yesterday that runs through next week — it still holds lessons.',
  )
  check(
    'H6: fit is computed on read, never stored on Package',
    !/model Package[\s\S]{0,600}?(capacity|fits)\s/.test(schema),
    'Published availability changes constantly; a cached "fits" is a promise that quietly stopped being true.',
  )
}

// ── I. spending a credit is atomic, and cancelling gives it back ─────────────
{
  const book = read('app/api/enrollments/[id]/book/route.ts')
  check(
    'I: the credit is spent inside a Serializable transaction',
    /isolationLevel:\s*'Serializable'/.test(book) && book.includes('$transaction'),
    'Read-then-write on lessonsUsed is only safe under Serializable — two tabs clicking at once would otherwise both see "7 of 8" and both write 8, selling a ninth lesson.',
  )
  check(
    'I2: P2034 is retried and is NOT reported as "slot taken"',
    book.includes('P2034') && /runSerializable/.test(book),
    'A serialization conflict means "try again", not "you lost". Production data showed this exact mis-mapping costing 9 of 11 people who reached the final button.',
  )
  check(
    'I3: the booked lesson carries enrollmentId and the per-lesson price',
    /enrollmentId: id/.test(book) && /price: enrollment\.perLessonPrice/.test(book),
    'A package lesson must be an ORDINARY Booking (so reschedule/cancel/video/messages work unchanged) and must never be summed as revenue — see the enrollmentId IS NULL rule.',
  )
  check(
    'I4: a lesson cannot be scheduled past the package expiry',
    /end > e\.expiresAt/.test(book),
    'Otherwise the validity window the client paid for means nothing.',
  )

  // I5–I7 moved to lib/bookingCredit (D1, 2026-08-18) so the expert's decline
  // and the cleanup cron refund the same way; §Q below pins all three callers.
  const cancel = read('app/api/bookings/[id]/cancel/route.ts')
  const credit = read('lib/bookingCredit.ts')
  check(
    'I5: cancelling a package lesson refunds the credit',
    /releaseBookingCredit\(tx, fresh\.enrollmentId/.test(cancel) && /decrement: 1/.test(credit),
    'lessonsUsed counts lessons BOOKED. Without the refund, cancelling once silently costs the client a lesson they paid for.',
  )
  check(
    'I6: the refund is guarded against going negative',
    /lessonsUsed: \{ gt: 0 \}/.test(credit),
    'A negative balance is the kind of state worth making impossible rather than merely unlikely.',
  )
  check(
    'I7: an expert-side cancel extends the client’s expiry',
    /\{ cancelledBy \}/.test(cancel) && /extendedExpiry\(/.test(credit) && /cancelledBy === 'PROVIDER'/.test(read('lib/packages.ts')),
    'The client lost a day through no doing of their own; the month they paid for has to grow back.',
  )
}

// ── J. the month grid tells the truth about the month ────────────────────────
{
  const api = read('app/api/tutor/schedule/route.ts')
  const ui = read('app/work/_components/MonthSchedule.tsx')
  check(
    'J: cancelled lessons are not drawn on the calendar',
    !/'CANCELED'/.test(api) && /status: \{ in: \[/.test(api),
    'A cancelled lesson has freed its slot. Drawing it would show a month that is busier than it is — the one thing a calendar must never do.',
  )
  check(
    'J2: the schedule payload carries no avatar blob',
    !/avatarUrl/.test(api.replace(/\/\/.*$/gm, '')),
    'This can be hundreds of rows and a calendar cell shows a name — see tests/apiPayloadHygiene.',
  )
  check(
    'J3: package lessons are distinguishable by more than colour',
    /border border-ink-300/.test(ui) && /bg-brand-600/.test(ui),
    'Filled vs outlined, not green vs grey: colour alone does not carry the distinction for a colour-blind reader.',
  )
  check(
    'J4: the grid scrolls inside its own container',
    /overflow-x-auto/.test(ui),
    'Seven columns must never make the workspace page scroll sideways (CLAUDE.md).',
  )
  check(
    'J5: the range is clamped',
    /parseIntParam/.test(api) && /max: 12/.test(api),
    'An unbounded range is an easy way to ask for every booking ever made.',
  )
}

// ── K. the weekly pattern is all-or-nothing and server-expanded ──────────────
{
  const sch = read('app/api/enrollments/[id]/schedule/route.ts')
  const ui = read('app/me/_pattern.tsx')
  check(
    'K: the whole pattern is booked in ONE Serializable transaction',
    /isolationLevel:\s*'Serializable'/.test(sch) && /for \(const start of picks\)/.test(sch),
    'Six of eight booked with two silently missing is worse than a clean refusal — the client believes their month is planned when it is not.',
  )
  check(
    'K2: openness is re-checked against lessons created earlier in the SAME loop',
    /liveBusy/.test(sch) && /tx\.booking\.findMany/.test(sch),
    'Without an in-loop re-read, two lessons of the same pattern can be written on top of each other.',
  )
  check(
    'K3: the pattern is expanded SERVER-side, from real availability',
    /computeOpenStarts/.test(sch),
    'A client that computed its own candidate starts would be a second, quietly diverging copy of lib/availability.',
  )
  check(
    'K4: the preview comes from the server’s own expansion, not a client guess',
    /dryRun/.test(sch) && /dryRun/.test(ui),
    'The dates shown before committing must be the dates that will be booked.',
  )
  check(
    'K5: a shortfall is reported BEFORE committing',
    /short/.test(sch) && /short/.test(ui),
    '„6 of 8 fit your pattern" has to be visible while the user can still change it.',
  )
  check(
    'K6: credits are re-checked inside the transaction',
    /room < picks\.length/.test(sch),
    'Two tabs committing two patterns at once must not oversell the package.',
  )
}

// ── L. money is counted once, and only once ──────────────────────────────────
// Found 2026-08-05 during a review pass: the rule below existed as a COMMENT on
// the schema for two days and was never applied to either aggregate. A rule that
// lives only in prose is a rule that is not enforced.
// ⚠️ AND IT WAS PINNED TOO NARROWLY (2026-08-12). This block named the two
// files where the rule had ALREADY been applied, so it could only ever pass. It
// never looked at /api/admin/stats, /api/admin/analytics/series or
// /api/tutor/bookings — all three of which were summing package lessons as
// revenue, and the first two feed the admin dashboard's headline number and the
// „კომისია ≈ 15%" derived from it. The sweep below finds the call sites instead
// of trusting a list somebody has to remember to update.
{
  const moneyRoutes: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name === 'route.ts') moneyRoutes.push(p)
    }
  }
  walk(join(root, 'app/api'))
  const offenders = moneyRoutes.filter(p => {
    const src = readFileSync(p, 'utf8')
    // Prisma aggregates over Booking.price…
    const sums = (src.match(/_sum: \{ price: true \}/g) || []).length
    const excl = (src.match(/BOOKING_REVENUE_ONLY/g) || []).length
    if (sums > excl) return true
    // …and the raw-SQL form, which no `BOOKING_REVENUE_ONLY` spread can reach.
    return /sum\(price\)/i.test(src) && !/"enrollmentId" IS NULL/.test(src)
  })
  check(
    `L0: every booking money sum in app/api excludes package lessons${offenders.length ? ` — ${offenders.map(p => p.slice(root.length + 1)).join(', ')}` : ''}`,
    offenders.length === 0,
    'A package lesson price is a share of money already taken at the Enrollment. Spread BOOKING_REVENUE_ONLY in (or add `"enrollmentId" IS NULL` in raw SQL), then add the Enrollment back.',
  )
}
{
  const earn = read('app/api/tutor/earnings/route.ts')
  const fin = read('app/api/admin/finance/route.ts')
  for (const [name, src] of [['tutor/earnings', earn], ['admin/finance', fin]] as const) {
    // Every money aggregate over bookings must spread the exclusion in.
    const sums = (src.match(/_sum: \{ price: true \}/g) || []).length
    const excl = (src.match(/BOOKING_REVENUE_ONLY/g) || []).length
    check(
      `L: ${name} excludes package lessons from every booking money sum`,
      sums > 0 && excl >= sums,
      `${sums} price sums but only ${excl} exclusions. A package lesson's price is a share of money already taken at the Enrollment — summing both counts it twice.`,
    )
  }
  check(
    'L2: package revenue is added back from the Enrollment',
    /enrollment\.aggregate/.test(earn) && /priceTotal/.test(earn),
    'Excluding package lessons without adding enrollment revenue does not fix the double count — it just loses the money instead.',
  )
  check(
    'L3: package revenue is recognised at paidAt',
    /paidAt/.test(earn),
    'The money changed hands when the teacher marked it paid; recognising it per lesson delivered would disagree with what both sides agreed.',
  )
}

// ── M. the two gates agree everywhere ────────────────────────────────────────
{
  const page = read('app/swavleba/page.tsx')
  const reqApi = read('app/api/packages/[id]/request/route.ts')
  check(
    'M: the teaching route lists on BOTH profileType and packagesEnabled',
    /profileType: 'TEACHER'/.test(page) && /packagesEnabled: true/.test(page),
    'Listing on packagesEnabled alone advertised experts the request API refuses with NOT_TEACHER — a page selling something the server will not sell.',
  )
  check(
    'M2: the request API checks the same two gates',
    /profileType !== 'TEACHER'/.test(reqApi) && /packagesEnabled/.test(reqApi),
    'The page hides them; this is what makes hiding them true rather than cosmetic.',
  )
}

// ── N. an enrollment can reach a terminal state ──────────────────────────────
{
  const sweep = read('app/api/internal/cleanup/route.ts')
  check(
    'N: the sweep expires enrollments past their date',
    /status: 'ACTIVE', expiresAt: \{ lt: new Date\(\) \}/.test(sweep),
    'Nothing else moves them. Without this a package stays ACTIVE forever, showing credits the book route will refuse.',
  )
  check(
    'N2: a package is COMPLETED only when no lesson is still outstanding',
    /outstanding/.test(sweep) && /'PREPARING', 'CONFIRMED', 'LIVE'/.test(sweep),
    'All credits spent is not the same as all lessons taught — calling it complete would tell the teacher they are done with eight lessons left to teach.',
  )
  check(
    'N3: both sides are told when a package request is made and accepted',
    /notify\(/.test(read('app/api/packages/[id]/request/route.ts')) &&
      /notify\(/.test(read('app/api/tutor/enrollments/[id]/route.ts')),
    'A request nobody is told about is a row in a table nobody is watching.',
  )
}

// ── P. the weekly pattern is matched in TBILISI, not in the server's zone ────
// Found 2026-08-06. The pattern scheduler filtered candidate starts with
// `d.getHours()` / `d.getDay()`, which read whatever TZ the PROCESS was started
// with. Production sets TZ=Asia/Tbilisi so it agreed with the platform's zone
// by accident of an environment variable; local dev sets nothing, and a client
// abroad was compared against a third clock entirely. The failure never looked
// like a bug — it surfaced as „ამ დღეებსა და საათზე თავისუფალი დრო არ არის" on
// a calendar that was in fact free.
{
  const sched = read('app/api/enrollments/[id]/schedule/route.ts')
  check(
    'P: the schedule route never reads the process timezone',
    !/\.getHours\(\)|\.getDay\(\)|\.getMinutes\(\)/.test(sched),
    'Use tbilisiParts() from lib/tz. getHours()/getDay() answer a different question on every machine, and the answer is silently wrong rather than an error.',
  )
  check(
    'P2: the picker offers and previews Tbilisi wall clock, captioned',
    (() => {
      const ui = read('app/me/_pattern.tsx')
      return ui.includes('sessionTime(') && ui.includes('<TzNote') && !/getHours\(\)/.test(ui)
    })(),
    'The hour the client taps is compared in Tbilisi. Rendering it in the browser zone lets someone abroad mean 16:00 Berlin and be answered about 16:00 Tbilisi.',
  )

  const { tbilisiParts } = require('../lib/tz') as typeof import('../lib/tz')
  // 14:30 UTC = 18:30 Tbilisi, same day (Monday).
  const a = tbilisiParts(new Date('2026-08-10T14:30:00Z'))
  check(
    'P3: tbilisiParts converts the hour regardless of process TZ',
    a.hour === 18 && a.minute === 30 && a.isoDow === 1,
    `Expected Monday 18:30 in Tbilisi, got isoDow=${a.isoDow} ${a.hour}:${a.minute}.`,
  )
  // 21:30 UTC is still Monday in UTC but already Tuesday 01:30 in Tbilisi —
  // the case a getDay() implementation gets wrong without ever throwing.
  const b = tbilisiParts(new Date('2026-08-10T21:30:00Z'))
  check(
    'P4: tbilisiParts rolls the weekday over with the date',
    b.isoDow === 2 && b.hour === 1,
    `Expected Tuesday 01:30 in Tbilisi, got isoDow=${b.isoDow} ${b.hour}:${b.minute}.`,
  )
}

// ── Q. lesson LENGTH is snapshotted like the money ───────────────────────────
// Found 2026-08-06. Enrollment snapshotted lessonsTotal / priceTotal /
// perLessonPrice — and the schema said „every scalar the client agreed to" —
// but not minutesPerLesson. Both spend routes read it live off the Package, so
// a teacher editing „90 წუთი" down to „50" shortened every lesson a client had
// already paid for and not yet booked. Deleting a package in use was refused;
// editing it was the open door.
{
  check(
    'Q: Enrollment declares the lesson-length snapshot',
    /model Enrollment[\s\S]*?minutesPerLesson\s+Int\?/.test(schema) &&
      /ALTER TABLE "Enrollment"[\s\S]{0,200}ADD COLUMN IF NOT EXISTS "minutesPerLesson"/.test(boot),
    'A column in one file and not the other drifts silently — the pairing rule at the top of this file.',
  )
  check(
    'Q2: the request route writes the snapshot at purchase',
    /minutesPerLesson:\s*pkg\.minutesPerLesson/.test(read('app/api/packages/[id]/request/route.ts')),
    'If it is not captured when the deal is struck there is nothing to fall back on later.',
  )
  for (const p of [
    'app/api/enrollments/[id]/book/route.ts',
    'app/api/enrollments/[id]/schedule/route.ts',
    'app/api/student/enrollments/route.ts',
  ]) {
    check(
      `Q3: ${p.replace('app/api/', '')} reads the length through enrollmentMinutes()`,
      read(p).includes('enrollmentMinutes(') && !/package\?\.minutesPerLesson\s*\?\?/.test(read(p)),
      'Reading package.minutesPerLesson directly is reading a value the teacher can still edit.',
    )
  }

  const { enrollmentMinutes } = require('../lib/packages') as typeof import('../lib/packages')
  check(
    'Q4: the snapshot beats the live package',
    enrollmentMinutes({ minutesPerLesson: 90, package: { minutesPerLesson: 50 } }) === 90,
    'The whole point: an edited package must not rewrite a running deal.',
  )
  check(
    'Q5: rows predating the column fall back to their package, then to 50',
    enrollmentMinutes({ minutesPerLesson: null, package: { minutesPerLesson: 90 } }) === 90 &&
      enrollmentMinutes({ minutesPerLesson: null, package: null }) === 50,
    'Backfill covers these; the fallbacks are a net, not behaviour to rely on.',
  )
}

// ── R. marking a package paid is a conditional write ─────────────────────────
// Found 2026-08-06. accept/decline read the row, checked `status === REQUESTED`
// in JS, then wrote unconditionally. Two clicks both passed the check: the
// second re-stamped expiresAt (handing the client days they were not sold) and
// wrote a second „enrollment.markPaid" audit row for one payment — in the one
// place on this platform where a human asserts by hand that money moved.
{
  const src = read('app/api/tutor/enrollments/[id]/route.ts')
  check(
    'R: accept/decline claim the row instead of trusting an earlier read',
    /updateMany\(\{[\s\S]{0,160}status:\s*'REQUESTED'/.test(src) && /claim\.count\s*!==\s*1/.test(src),
    'Same claim-or-lose pattern as app/api/bookings/[id]/cancel. A read-then-write is not a guard against a second tab.',
  )
}

// ── S. the rollout stage moved and the surfaces must move with it ────────────
// Found 2026-08-06. /swavleba was written for the 'admin' stage and kept its
// operator voice after PACKAGES_VISIBILITY became 'signed-in': real clients
// read the „N ჩართული ექსპერტი" tally, the per-package capacity read-out
// („30 დღეში 3 გაკვეთილი 8-იდან" — our scheduling problem, itemised, in front
// of the buyer) and the route printed as a <code> footer. The stage will move
// again, to 'public'; this is the checklist that has to hold when it does.
{
  const page = read('app/swavleba/page.tsx')
  check(
    'S: the operator tally is admin-only',
    /isAdmin && \(\s*<p/.test(page),
    'A parent has no use for how many profiles we have switched on.',
  )
  check(
    'S2: the capacity read-out is admin-only',
    /isAdmin && f && !f\.fits/.test(page),
    'Never show a buyer the internal reason we cannot sell to them.',
  )
  check(
    'S3: the route constant is not printed to clients',
    /isAdmin && \([\s\S]{0,200}PACKAGES_ROUTE/.test(page),
    'A debug footer is not part of the product.',
  )
  check(
    'S4: a client is only offered packages that can actually be sold',
    /const visible = isAdmin/.test(page) && /fits\[p\.id\]\?\.fits/.test(page),
    'POST /api/packages/[id]/request refuses NO_CAPACITY — advertising it offers something the server declines.',
  )
  check(
    // Matches the PROP and its branch, not the word: `disabled={state ===
    // 'busy'}` on the button is correct and must keep working, and the comment
    // explaining the removal naturally contains the word too.
    'S5: the request button has no caller-supplied disabled state left',
    (() => {
      const src = read('app/swavleba/RequestButton.tsx')
      return !/disabled\?:/.test(src) && !/if \(disabled\)/.test(src) && !/<RequestButton[^>]*disabled/.test(page)
    })(),
    'Canon: never a disabled primary CTA. An offer nobody can accept belongs off the page, not greyed out on it.',
  )
  check(
    'S6: the list is ranked for a reader, not by row mtime',
    /orderBy: \[\{ verified: 'desc' \}, \{ rating: 'desc' \}\]/.test(page) && !/orderBy: \{ updatedAt/.test(page),
    '`updatedAt desc` means „whoever edited last is first" — a fact about our database, not a reason to hire someone.',
  )
}

// ── T. the teacher learns the schedule will not hold it BEFORE they sell it ──
// Found 2026-08-06. The gate answered only for SAVED packages, so a teacher
// picked „8 გაკვეთილი", saved, and only then discovered the calendar held
// three. Every input to the answer is in the draft form.
{
  const editor = read('app/work/(expert)/profile/_packages.tsx')
  check(
    'T: the draft form asks the capacity question',
    /draftMinutes=/.test(editor) && /capacity !== null && capacity < d\.lessonsCount/.test(editor),
    'lib/packages: the gate exists so money is not taken for eight lessons that cannot be delivered. After saving is too late to be that gate.',
  )
  check(
    'T2: the API answers it with the same implementation, not a second one',
    /tutorScheduleCapacity/.test(read('app/api/tutor/packages/route.ts')),
    'A client-side capacity calculation would be a second copy of lib/availability.',
  )
  check(
    'T3: the warning has ONE definition, shared by draft and saved rows',
    (editor.match(/განრიგი ვერ იტევს — ვერ გაიყიდება/g) || []).length === 1 &&
      (editor.match(/<CapacityWarning/g) || []).length === 2,
    'Two copies of a warning drift; the saved-row and draft verdicts must read identically.',
  )
  check(
    'T4: ₾0 is never printed as a price',
    /d\.price > 0 \?/.test(editor) && /ფასი — შენ ადგენ/.test(editor) && /d\.price === 0 \? '' :/.test(editor),
    'The anchor bug /apply already paid for: a pre-filled figure was published verbatim by 10 of 19 experts.',
  )
  check(
    'T5: lesson length is a fixed set, like lesson count',
    /const LESSON_MINUTES = \[/.test(editor) && !/min=\{15\} max=\{240\}/.test(editor),
    'The reason the COUNT is fixed („a free-form count makes cards incomparable") applies identically to the length.',
  )
  check(
    'T6: a legacy length outside the set is still selectable',
    /minuteOptions/.test(editor),
    'An unselected radiogroup invites a click that silently rewrites a length the teacher never meant to change.',
  )
}

// ═══════════ U. the credit comes back by every exit (async: the file is CJS, so
// the executed checks live in an IIFE that also prints the summary) (D1, 2026-08-18) ═══════
// `Enrollment.lessonsUsed` counts lessons BOOKED. Until this section only the
// client's own cancel decremented it; the expert's decline and the cleanup
// cron's auto-cancel silently kept the credit — a paid lesson lost with no
// screen saying so. One function, three callers, all inside the transaction
// that flips the booking.
void (async () => {
  const lib = read('lib/bookingCredit.ts')
  check(
    'U1: releaseBookingCredit decrements, floors at zero, and defers the expiry rule to lib/packages',
    /lessonsUsed: \{ gt: 0 \}/.test(lib) && /lessonsUsed: \{ decrement: 1 \}/.test(lib) && /extendedExpiry\(/.test(lib),
    'The credit function stopped guarding at zero, or grew its own copy of the expiry rule.',
  )
  const EXITS: [string, RegExp][] = [
    ['app/api/bookings/[id]/cancel/route.ts', /await releaseBookingCredit\(tx, fresh\.enrollmentId, \{ cancelledBy \}\)/],
    ['app/api/bookings/[id]/route.ts', /await releaseBookingCredit\(tx, booking\.enrollmentId, \{ cancelledBy: 'PROVIDER'/],
    ['app/api/internal/cleanup/route.ts', /await releaseBookingCredit\(tx, b\.enrollmentId\)/],
  ]
  for (const [f, re] of EXITS) {
    const src = read(f)
    check(
      `U2: ${f} gives the credit back inside its transaction`,
      re.test(src),
      'A booking exit that does not call releaseBookingCredit(tx, …) is a paid lesson silently lost.',
    )
    check(
      `U3: ${f} has no private decrement beside the shared one`,
      (src.match(/lessonsUsed: \{ decrement: 1 \}/g) ?? []).length === 0,
      'The decrement moved to lib/bookingCredit so the three exits cannot drift; a local copy is the drift.',
    )
  }
  // Q5–Q7 EXECUTE the function against a recording fake of the transaction
  // client, so the rule is proven and not just grepped for.
  const calls: { op: string; args: any }[] = []
  const expiresAt = new Date('2026-09-01T00:00:00Z')
  const fakeTx = {
    enrollment: {
      updateMany: async (args: any) => { calls.push({ op: 'updateMany', args }); return { count: 1 } },
      findUnique: async (args: any) => { calls.push({ op: 'findUnique', args }); return { expiresAt } },
      update: async (args: any) => { calls.push({ op: 'update', args }); return {} },
    },
  } as any
  await releaseBookingCredit(fakeTx, 'enr_1', { cancelledBy: 'USER' })
  check(
    'U5: a client-side exit decrements once and does not move the expiry',
    calls.filter(c => c.op === 'updateMany').length === 1
      && calls[0].args.where.lessonsUsed.gt === 0
      && calls[0].args.data.lessonsUsed.decrement === 1
      && calls.filter(c => c.op === 'update').length === 0,
    'The client cancelled; the credit comes back, the month they paid for does not grow.',
  )
  calls.length = 0
  await releaseBookingCredit(fakeTx, 'enr_1', { cancelledBy: 'PROVIDER' })
  const upd = calls.find(c => c.op === 'update')
  check(
    'U6: an expert-side exit decrements AND extends the expiry by one day',
    calls.filter(c => c.op === 'updateMany').length === 1
      && !!upd && upd.args.data.expiresAt.getTime() === expiresAt.getTime() + 24 * 60 * 60 * 1000,
    'The expert declined; the client lost a day through no doing of their own.',
  )
  calls.length = 0
  await releaseBookingCredit(fakeTx, null)
  await releaseBookingCredit(fakeTx, undefined)
  check(
    'U7: a booking without an enrollment touches nothing',
    calls.length === 0,
    'Ordinary (non-package) bookings must not reach the enrollment table at all.',
  )
  check(
    'U4: the cleanup sweep selects enrollmentId on the stale-PREPARING rows',
    // (Anchored on studentId since stage 11 — heldSlotId left that select when
    // the legacy `booked` release went; the assertion is about enrollmentId.)
    /studentId: true,\s*enrollmentId: true,/.test(read('app/api/internal/cleanup/route.ts')),
    'Without enrollmentId in the select, releaseBookingCredit is called with undefined and returns early — the bug comes back invisibly.',
  )

  if (failures > 0) {
    console.error(`\n${failures} packages guard(s) FAILED`)
    process.exit(1)
  }
  console.log('\nAll packages guards passed.')
})()
