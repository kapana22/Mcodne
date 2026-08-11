/*
 * The B2B vertical — the hiding, and the money rules.
 *
 * Run with:  npx tsx tests/b2b.test.ts
 *
 * WHY THIS FILE EXISTS. A feature that ships dark has exactly one failure mode
 * that matters, and it is silent: something leaks. A stray link, a sitemap
 * entry, a route that renders instead of 404ing — none of these break a build,
 * none of them show up in a typecheck, and all of them are discovered by a user
 * or a crawler rather than by us. The whole point of shipping dark is that the
 * darkness is VERIFIED, not assumed. tests/abroad.test.ts makes the same
 * argument at length; this file is its sibling.
 *
 * The second half is money, which is the one thing here that can be wrong while
 * looking completely fine.
 *
 * ⚠️ GROWS WITH THE VERTICAL. Sections are added as each stage lands — §2 (the
 * route) at stage 3, §3 (the admin surfaces) at stage 4, §4 (the charge) at
 * stage 5. A section that is not here yet is not a section that passed.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { B2B_VISIBILITY, PAYMENTS_LIVE, type B2BVisibility } from '../lib/flags'
import {
  B2B_ROUTE, canSeeB2B, b2bVisibleTo, b2bFeatureExists,
  paymentSourceOf, isBalancePaid, canSpendBalance,
} from '../lib/b2b'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/* ═══════════ 1. it ships dark ══════════════════════════════════════════ */

test('the flag is the ONLY switch', () => {
  // The promise made in lib/flags.ts is that one line turns the vertical on.
  // An env var or a second boolean would quietly break that promise — you would
  // flip the flag, nothing would happen, and the next person would add a third.
  //
  // This is also the assertion the owner asked about directly: the original
  // request was for `B2B_ENABLED=false` in the environment. It is a constant
  // instead, because tests/abroad.test.ts already pins the same rule for the
  // diaspora vertical and two conventions for „is this feature on" is exactly
  // the drift both files exist to prevent.
  const flags = read('lib/flags.ts')
  assert.match(flags, /export const B2B_VISIBILITY: B2BVisibility = '(off|admin|public)'\s*$/m)
  assert.doesNotMatch(read('lib/b2b.ts'), /process\.env/,
    'lib/b2b reads an env var — the flag is no longer the only switch')

  // NOT pinned to 'off'. Same decision, and for the same reason, as the removed
  // FEATURE_ABROAD pin: the owner must be able to look at their own vertical on
  // the real domain without editing a test. What matters is not the value but
  // that every value keeps the guarantees below — and those run at all three.
  assert.ok(['off', 'admin', 'public'].includes(B2B_VISIBILITY))
})

test('the gate answers correctly at ALL THREE stages, not just this one', () => {
  // Every (stage × viewer) combination, executed for real. This is why
  // b2bVisibleTo takes the stage as an argument: the vertical spends its whole
  // life at 'off', so a gate closed over the constant would ship with the
  // 'admin' and 'public' branches never once executed, and the day somebody
  // flips the flag is the day they run for the first time.
  //
  // The shape is the point: nobody but an admin gets in before 'public', and an
  // anonymous visitor never gets in before it either.
  const VIEWERS = ['ADMIN', 'TUTOR', 'STUDENT', null, undefined, ''] as const
  const EXPECTED: Record<B2BVisibility, boolean[]> = {
    //          ADMIN  TUTOR  STUDENT  null   undef  ''
    off:    [   false, false, false,   false, false, false],
    admin:  [   true,  false, false,   false, false, false],
    public: [   true,  true,  true,    true,  true,  true ],
  }
  for (const stage of ['off', 'admin', 'public'] as const) {
    VIEWERS.forEach((viewer, i) => {
      assert.equal(
        b2bVisibleTo(stage, viewer), EXPECTED[stage][i],
        `stage '${stage}' × viewer ${JSON.stringify(viewer)}`,
      )
    })
    // A role we have never heard of is not an admin, at any stage. Guards
    // against a future `canSeeB2B(user.someOtherField)` typo passing silently.
    assert.equal(b2bVisibleTo(stage, 'admin'), stage === 'public',
      `stage '${stage}': the role check must be case-sensitive`)
  }

  // …and the wrapper the whole app actually calls is that function applied to
  // the constant, with nothing extra in between. Without this, the exhaustive
  // table above could be describing a function nobody uses.
  for (const viewer of VIEWERS) {
    assert.equal(canSeeB2B(viewer), b2bVisibleTo(B2B_VISIBILITY, viewer),
      'canSeeB2B has drifted from b2bVisibleTo — there are two gates now')
  }

  assert.equal(b2bFeatureExists(), B2B_VISIBILITY !== 'off')
})

test('nothing on the site links to /business', () => {
  // The strongest guarantee in the whole feature, and the easiest to lose: one
  // href in a nav array and the vertical is public regardless of every other
  // precaution here. Scan the real tree. Copied deliberately from
  // tests/abroad.test.ts — this check has already justified itself once.
  const files: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      if (e === 'node_modules' || e === '.next') continue
      const p = join(dir, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.tsx?$/.test(p)) files.push(p)
    }
  }
  for (const d of ['app', 'components', 'lib']) walk(join(ROOT, d))

  const offenders: string[] = []
  for (const f of files) {
    const rel = relative(ROOT, f)
    // The vertical's own files are allowed to know their own URL.
    if (rel.startsWith('app/business/')) continue
    // …and so is lib/b2b.ts, which is where the URL is DEFINED.
    if (rel === 'lib/b2b.ts') continue
    const src = readFileSync(f, 'utf8')
    src.split('\n').forEach((line, i) => {
      // A quoted "/business" or "/business/…" — a link target, not the word.
      if (/["'`]\/business(["'`/?#])/.test(line)) offenders.push(`      ${rel}:${i + 1}  ${line.trim()}`)
    })
  }
  assert.equal(offenders.length, 0, `something links to ${B2B_ROUTE}:\n${offenders.join('\n')}`)
})

test('it is not in the sitemap, and not in the feed', () => {
  const sitemap = read('app/sitemap.ts')
  // STATIC_ROUTES is an allowlist, so absence is the default — pinned anyway,
  // because „add every page to the sitemap" is a plausible future tidy-up.
  assert.doesNotMatch(sitemap, /path: '\/business'/)
  // The feed carries blog posts only, so /business cannot reach it. Pinned so a
  // future „let's add landing pages to the feed" notices this page.
  assert.doesNotMatch(read('app/rss.xml/route.ts'), /business/)
})

test('robots.txt does not name the route — deliberately', () => {
  // The instinct is to add `/business` to Disallow. That is backwards:
  // robots.txt is PUBLIC, so a Disallow line publishes the exact URL the
  // vertical exists to keep unlisted, to anyone who reads it — including every
  // scraper that treats Disallow as a list of interesting places. /abroad is
  // absent from that file for the same reason. The route 404s and carries
  // noindex; that is the hiding.
  assert.doesNotMatch(read('app/robots.ts'), /business/)
})

/* ═══════════ 2. the money rules ════════════════════════════════════════ */

test('a company balance is not a payment gateway', () => {
  // „There is a balance" and „payments are live" are different claims, and only
  // the first one is true. This vertical must never flip PAYMENTS_LIVE as a
  // side effect: that constant gates escrow copy, payout dates and bank names
  // across the whole site, none of which a prepaid balance makes true.
  assert.equal(PAYMENTS_LIVE, false)
})

test('null paidBy means CARD — the entire history depends on it', () => {
  // Booking.paidBy is nullable with no default and was never backfilled, so
  // EVERY booking that existed before 2026-08-11 reads `null`. If a call site
  // ever treats null as „unknown" and hides or flags those bookings, the whole
  // history of the platform changes appearance on deploy.
  assert.equal(paymentSourceOf(null), 'CARD')
  assert.equal(paymentSourceOf(undefined), 'CARD')
  assert.equal(paymentSourceOf('CARD'), 'CARD')
  assert.equal(paymentSourceOf('COMPANY_BALANCE'), 'COMPANY_BALANCE')
  // Anything unrecognised is CARD too: a garbled value must not make a booking
  // look like it spent a company's money.
  assert.equal(paymentSourceOf('company_balance'), 'CARD', 'the comparison is case-sensitive on the enum value')
  assert.equal(paymentSourceOf('nonsense'), 'CARD')

  assert.equal(isBalancePaid(null), false)
  assert.equal(isBalancePaid('COMPANY_BALANCE'), true)
})

test('canSpendBalance refuses the three ways a spend is not allowed', () => {
  const ok = { status: 'ACTIVE', balance: 500 }
  assert.equal(canSpendBalance(ok, 500), true, 'exactly enough IS enough')
  assert.equal(canSpendBalance(ok, 501), false, 'one lari short is short')
  assert.equal(canSpendBalance({ status: 'SUSPENDED', balance: 500 }, 100), false,
    'a suspended company may not spend, however much it holds')
  assert.equal(canSpendBalance(null, 0), false, 'a non-member has no balance to offer')
  assert.equal(canSpendBalance(undefined, 0), false)
  // A free booking against an empty balance. Not a spend anyone can make today
  // (server-side price is the expert's rate), but the predicate must not answer
  // „yes, spend 0" for a company that is suspended — checked above — nor throw.
  assert.equal(canSpendBalance({ status: 'ACTIVE', balance: 0 }, 0), true)
})

test('canSpendBalance is documented as NOT being the guard', () => {
  // The real protection against overdrawing is a conditional UPDATE inside the
  // booking transaction, not this function. That distinction lives in a comment
  // and comments rot, so the comment itself is pinned: if somebody deletes the
  // warning while „tidying", the next person may reasonably read this predicate
  // as the guard and drop the claim-the-row pattern.
  const src = read('lib/b2b.ts')
  assert.match(src, /THIS IS NOT A GUARD/,
    'the warning above canSpendBalance is gone — a read-then-write will follow')
  assert.match(src, /gte: price/,
    'the comment no longer names the conditional-claim pattern it points at')
})

/* ═══════════ 3. the schema keeps its promises ══════════════════════════ */

test('the ledger has no foreign key to a booking or a person', () => {
  // A money row must outlive its subject. A FK to Booking or User would either
  // take the row with the deleted subject (CASCADE) or block the delete
  // (RESTRICT), and both are wrong for an accounting record — the first loses
  // the money trail, the second makes an account undeletable for a reason the
  // operator cannot see. Same reasoning as AuditLog.targetId.
  //
  // tests/userDeletion.test.ts §C guards the other half of this (that the ONE
  // person-edge, CompanyMember→User, is a real cascade). Between them the
  // account-deletion story is covered from both ends.
  const boot = read('lib/dbBoot.ts')
  const ledger = boot.slice(boot.indexOf('CREATE TABLE IF NOT EXISTS "CompanyTransaction"'))
  const table = ledger.slice(0, ledger.indexOf('CREATE TABLE'))
  assert.doesNotMatch(table, /REFERENCES/,
    'CompanyTransaction grew a foreign key — a deleted booking or account can now erase the money trail')
  assert.doesNotMatch(
    boot,
    /ALTER TABLE "CompanyTransaction" ADD CONSTRAINT \w*_(bookingId|actorId)_fkey/,
    'the ledger grew a foreign key on bookingId/actorId',
  )
})

test('the database refuses an overdraw and a negative movement', () => {
  // Belt to the conditional-UPDATE braces. If any code path ever manages to
  // drive a balance below zero, Postgres refuses the write rather than
  // recording a debt this product has no concept of — and a negative TOPUP
  // cannot become an undocumented way to charge somebody.
  //
  // Checked in BOTH places the DDL lives, because they are two files that must
  // not drift: lib/dbBoot runs on every deploy, the migration is the reviewable
  // document with the rollback next to it.
  for (const f of ['lib/dbBoot.ts', 'prisma/manual-migrations/2026-08-11-b2b/up.sql']) {
    const src = read(f)
    assert.match(src, /CONSTRAINT "Company_balance_nonnegative" CHECK \("balance" >= 0\)/, `${f}: balance CHECK`)
    assert.match(src, /CONSTRAINT "CompanyTransaction_amount_positive" CHECK \("amount" > 0\)/, `${f}: amount CHECK`)
  }
})

test('the migration has a rollback, and it warns about the ledger', () => {
  // A down.sql that silently drops the only record of who paid what is worse
  // than no down.sql, because it will be run in a hurry by someone who assumes
  // „rollback" means „undo". The warning and the pg_dump line are the file's
  // most important content.
  const down = read('prisma/manual-migrations/2026-08-11-b2b/down.sql')
  assert.match(down, /pg_dump/, 'the rollback does not tell you how to keep the ledger')
  assert.match(down, /DROP COLUMN IF EXISTS "paidBy"/)
  for (const t of ['Company', 'CompanyMember', 'CompanyTransaction', 'BusinessLead']) {
    assert.match(down, new RegExp(`DROP TABLE IF EXISTS "${t}"`), `${t} is not rolled back`)
  }
  // The trap the 2026-08-10 rollback documents: dbBoot re-creates everything on
  // the next boot, so rolling back while the new build is serving restores the
  // tables EMPTY. Ordering instructions are the fix, so they are pinned.
  assert.match(down, /redeploy the previous build/i)
})

test('every dbBoot column is declared in schema.prisma', () => {
  // The warning block on model Booking says it plainly: a dbBoot column that
  // schema.prisma does not know about is one `prisma db push` away from being
  // dropped. For paidBy that would silently erase which bookings a company paid
  // for; for the four tables it would drop the ledger.
  const schema = read('prisma/schema.prisma')
  assert.match(schema, /paidBy\s+PaymentSource\?/)
  for (const m of ['model Company ', 'model CompanyMember ', 'model CompanyTransaction ', 'model BusinessLead ']) {
    assert.match(schema, new RegExp(m), `${m.trim()} is created by dbBoot but not declared`)
  }
  // And no default on paidBy — a DEFAULT would mean backfilling live history.
  assert.doesNotMatch(schema, /paidBy\s+PaymentSource\?\s*@default/,
    'paidBy grew a default — every existing booking would have to be backfilled')
})
