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
  BusinessLeadInput, businessLeadRow, servicePriceLabel, groupByDirection,
} from '../lib/b2b'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/**
 * The file with its COMMENTS AND IMPORTS REMOVED.
 *
 * ⚠️ USE THIS FOR EVERY „X happens before Y" ASSERTION. Three separate
 * assertions in this file were written against the raw source and were
 * VACUOUS — each found its needle in a comment or an import line rather than
 * in code, and each stayed green while mutation-testing deleted the very thing
 * it was guarding:
 *
 *   · the admin gate-order check found `canSeeB2B` in the file header's prose;
 *   · the same check found it in the `import` line;
 *   · the balance-claim check matched a comment quoting `balance: { gte: … }`.
 *
 * The files here are heavily commented BY DESIGN and quote their own code while
 * explaining it, which makes source-text assertions unusually easy to satisfy
 * by accident. Strip first, then assert.
 */
/* ⚠️ LINE COMMENTS COME OFF FIRST, AND THE ORDER IS THE WHOLE FUNCTION.
 *
 * The first version stripped block comments first and destroyed 465 lines of
 * app/api/bookings/route.ts: line 129 of that file is a LINE comment reading
 * „the /student/* surfaces…", so the block-comment regex opened at that `/*`
 * and closed at the next real `*​/` four hundred lines later. Every assertion
 * built on it then matched nothing — which surfaced as a confusing failure on
 * an assertion whose subject was in fact correct.
 *
 * Line-first cannot have that failure: a `/*` inside a `//` line is gone before
 * the block pass ever runs. */
const codeOf = (p: string) =>
  read(p)
    .split('\n')
    .filter(l => !/^\s*\/\//.test(l) && !/^import\b/.test(l))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')

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

test('the ONLY links to /business are admin-gated, and there are exactly two', () => {
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

  // ── THE ALLOWLIST, AND WHY IT IS A LIST AND NOT A WIDER SCAN ─────────────
  // This test started as „nothing links to /business" and it fired, correctly,
  // the moment the owner asked for a way into the page that is not typing the
  // URL (2026-08-11). That is exactly the re-check it exists to force, and the
  // answer is that BOTH new links are admin-only by construction:
  //
  //   UserMenu.tsx      inside ADMIN_ITEMS, an array built only for
  //                     `role === 'ADMIN'`, and behind b2bFeatureExists().
  //   _companies.tsx    inside the admin tab, which is itself filtered out of
  //                     ADMIN_NAV unless the vertical exists — and /admin is
  //                     behind requireRole('ADMIN') at the layout.
  //
  // Named individually rather than excused by a pattern: „anything under
  // app/admin/" would silently bless the next link somebody adds there, and the
  // point of this test is that adding one is a decision, not an accident.
  const ALLOWED = new Map<string, RegExp>([
    // The gate must be ON the line or in its immediate neighbourhood — see the
    // per-file assertions below, which check the mechanism rather than the text.
    ['components/UserMenu.tsx', /b2bFeatureExists\(\)/],
    ['app/admin/_companies.tsx', /OpenBtn href="\/business"/],
  ])

  const offenders: string[] = []
  const seen = new Set<string>()
  for (const f of files) {
    const rel = relative(ROOT, f)
    // The vertical's own files are allowed to know their own URL.
    if (rel.startsWith('app/business/')) continue
    // …and so is lib/b2b.ts, which is where the URL is DEFINED.
    if (rel === 'lib/b2b.ts') continue
    const src = readFileSync(f, 'utf8')
    src.split('\n').forEach((line, i) => {
      // A quoted "/business" or "/business/…" — a link target, not the word.
      if (!/["'`]\/business(["'`/?#])/.test(line)) return
      if (ALLOWED.has(rel)) { seen.add(rel); return }
      offenders.push(`      ${rel}:${i + 1}  ${line.trim()}`)
    })
  }
  assert.equal(offenders.length, 0,
    `something links to ${B2B_ROUTE} outside the admin-only allowlist:\n${offenders.join('\n')}`)

  // A stale allowlist is its own hazard: an entry left behind after the link is
  // removed silently pre-approves the next one added to that file.
  for (const rel of ALLOWED.keys()) {
    assert.ok(seen.has(rel), `${rel} is allowlisted but no longer links to ${B2B_ROUTE} — drop the entry`)
  }

  // …and each allowed link is actually gated. This is the assertion that
  // matters; the allowlist above only says WHERE to look.
  const menu = read('components/UserMenu.tsx')
  const adminItems = menu.slice(menu.indexOf('const ADMIN_ITEMS'), menu.indexOf('export function UserMenu'))
  assert.match(adminItems, /\/business/,
    'the /business entry left ADMIN_ITEMS — it is no longer admin-only')
  assert.match(adminItems, /b2bFeatureExists\(\)/,
    'the /business entry is no longer behind b2bFeatureExists — it would show with the vertical off')
  // ADMIN_ITEMS must stay reachable only for an admin. If that ternary is ever
  // loosened, every item in the array leaks, this one included.
  assert.match(menu, /role\s+===\s+'ADMIN'\s*\?\s*ADMIN_ITEMS\(signOut\)/)
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

/* ═══════════ 2. the route ══════════════════════════════════════════════ */

test('the page 404s behind the gate — actually, not just in principle', () => {
  // Read as source rather than executed: notFound() throws a Next-internal
  // control-flow error whose shape is a framework implementation detail, and a
  // test that pins that shape breaks on a Next upgrade for no reason. What must
  // not change is that the guard is the first thing the route body does, and
  // that it runs BEFORE the page is built.
  const page = read('app/business/page.tsx')
  const body = page.slice(page.indexOf('export default async function Page()'))
  assert.match(body, /^\s*if\s+\(!canSeeB2B\(me\?\.role\)\)\s+notFound\(\)/m)
  assert.ok(
    body.indexOf('notFound()') < body.indexOf('<BusinessLanding'),
    'the guard runs after the page has already been built',
  )
  // notFound, never a redirect or a 403: a redirect to /signin tells an
  // anonymous visitor the page is real and worth coming back to with an
  // account, which is the one thing the 404 exists to deny.
  assert.doesNotMatch(body, /redirect\(/)
})

test('the API endpoint is gated too, and gated FIRST', () => {
  // The failure mode that makes „hidden" meaningless: the page 404s in the
  // browser while the endpoint behind it answers anyone with a curl command.
  // Comments and imports stripped — this file's header names canSeeB2B() in
  // prose, which made the ordering assertions below pass vacuously.
  const route = codeOf('app/api/business/lead/route.ts')
  assert.match(route, /if \(!canSeeB2B\(me\?\.role\)\)/,
    'POST /api/business/lead does not check the gate')
  assert.match(route, /status: 404/, 'the gate must answer 404, not 403')
  // Before the rate limiter, before the body is read, before any DB work — a
  // caller who may not see this vertical must not learn anything from it,
  // including how fast it rate-limits.
  assert.ok(
    route.indexOf('canSeeB2B') < route.indexOf('rateLimit('),
    'the gate runs after the rate limiter — an outsider can still probe the endpoint',
  )
  assert.ok(
    route.indexOf('canSeeB2B') < route.indexOf('req.json()'),
    'the gate runs after the body is parsed',
  )
})

test('the public form endpoint is rate-limited', () => {
  // Unauthenticated at the 'public' stage. Without a limit the table and the
  // inbox are both a free target — the reason /api/contact carries the same
  // budget, which this deliberately matches.
  const route = read('app/api/business/lead/route.ts')
  assert.match(route, /rateLimit\(`b2b-lead:\$\{ip\}`, 5, 60 \* 60\)/)
  assert.match(route, /status: 429/)
})

test('the lead is a ROW first and an email second', () => {
  // /api/contact only emails, and a dropped delivery there loses the message
  // with nothing to recover from. A sales lead must not have that failure mode:
  // the row decides the response, the mail happens afterwards, and a mail
  // failure is swallowed because the lead is already safe.
  const route = read('app/api/business/lead/route.ts')
  // Matched on the CALL, anchored to its own line — `after(` also appears in
  // the file's header comment, and matching that instead made this assertion
  // measure the distance between two comments. It failed for the wrong reason,
  // which is the only thing worse than passing for the wrong reason.
  const afterCall = route.search(/^\s*after\(async \(\) => \{/m)
  assert.ok(afterCall > -1, 'the email is no longer deferred with after()')
  assert.ok(
    route.indexOf('businessLead.create') < afterCall,
    'the email is sent before the row is written',
  )
  assert.match(route, /catch \{ \/\* email is best-effort/)
})

test('the form and the API judge a lead by the SAME schema', () => {
  // Two hand-written copies of „what is a valid lead" is how a field ends up
  // accepted by the browser and rejected by the server. This project has been
  // bitten twice by exactly that gap (certificates max(500), blog covers
  // max(2000) — both named in the pre-deploy gate's header).
  for (const f of ['app/business/LeadForm.tsx', 'app/api/business/lead/route.ts']) {
    assert.match(read(f), /BusinessLeadInput/, `${f} does not use the shared schema`)
  }
  // …and the schema is the one that admits a real lead. Pinned as VALUES rather
  // than as source text, so a ceiling cannot be quietly tightened.
  const ok = {
    companyName: 'შპს მაგალითი', contactName: 'ნინო მაგალიძე',
    phone: '555123456', email: 'info@example.ge',
  }
  assert.equal(BusinessLeadInput.safeParse(ok).success, true, 'a minimal real lead is rejected')
  assert.equal(
    BusinessLeadInput.safeParse({ ...ok, message: 'ა'.repeat(4000) }).success, true,
    'the message ceiling is below what a company actually writes',
  )
  // A foreign number with its country code — the audience this page is for
  // includes companies registered abroad, so a +995-only rule would be wrong.
  assert.equal(BusinessLeadInput.safeParse({ ...ok, phone: '+491701234567' }).success, true)
  // …and the things that must NOT pass.
  assert.equal(BusinessLeadInput.safeParse({ ...ok, phone: '123' }).success, false, 'a junk phone passes')
  assert.equal(BusinessLeadInput.safeParse({ ...ok, email: 'not-an-email' }).success, false)
  assert.equal(BusinessLeadInput.safeParse({ ...ok, companyName: '' }).success, false)
})

test('an unanswered optional field is stored as null, not as an empty string', () => {
  // „They answered, with nothing" and „they did not answer" are different facts,
  // and the admin list has to tell them apart to know what is left to ask.
  const row = businessLeadRow({
    companyName: '  შპს მაგალითი  ', contactName: 'ნინო', phone: '+995 555 12 34 56',
    email: '  INFO@Example.GE ', taxId: '', interest: '   ', message: '',
  })
  assert.equal(row.taxId, null)
  assert.equal(row.interest, null)
  assert.equal(row.message, null)
  assert.equal(row.companyName, 'შპს მაგალითი', 'the name is not trimmed')
  // Normalised on the way in, so two people typing one number two ways produce
  // one value an admin can dial or search.
  assert.equal(row.phone, '+995555123456')
  assert.equal(row.email, 'info@example.ge', 'the address is not lowercased')
})

test('the landing renders with the gate open', () => {
  // The real thing: build the element tree. „Renders" means the function
  // returns without throwing, which exercises every piece of JSX, the Icon
  // lookups (a missing glyph is `undefined` and throws at render — the failure
  // that blanks the admin panel, see tests/adminNav.test.ts) and the STEPS map.
  // No browser, no DB, and it runs while the flag is 'off' — which is the whole
  // point, because otherwise this page's first render is on the day it ships.
  //
  // tsconfig sets jsx:"preserve" (Next compiles the JSX itself), so tsx falls
  // back to the CLASSIC runtime and every component module expects a free
  // `React` binding only Next's compiler would inject. One global satisfies
  // them all. A test-harness detail, not a claim about how the app runs.
  ;(globalThis as any).React ??= require('react')
  const { BusinessLanding } = require('../app/business/BusinessLanding')
  const tree = BusinessLanding()
  assert.ok(tree, 'the landing returned nothing')
})

/* ═══════════ 3. the admin surfaces ═════════════════════════════════════ */

test('every admin B2B endpoint carries BOTH gates, in the right order', () => {
  // canSeeB2B → 404 („no such endpoint here"), THEN requireRoleApi → 401/403
  // („you are not an admin"). Two checks and not one, because at the 'public'
  // stage they come apart: everyone may see /business, nobody but an admin may
  // see these. And canSeeB2B first, so a non-admin learns nothing — not even
  // that admin endpoints exist under this path.
  const ROUTES = [
    'app/api/admin/companies/route.ts',
    'app/api/admin/companies/[id]/route.ts',
    'app/api/admin/companies/[id]/balance/route.ts',
    'app/api/admin/companies/[id]/members/route.ts',
    'app/api/admin/business-leads/route.ts',
  ]
  for (const f of ROUTES) {
    // Comments and imports stripped — see codeOf(). Without it this assertion
    // was satisfied by the file's own header prose and passed while the two
    // checks were swapped inside the handler.
    const src = codeOf(f)
    assert.match(src, /canSeeB2B\(/, `${f}: no B2B gate`)
    assert.match(src, /requireRoleApi\('ADMIN'\)/, `${f}: no admin gate`)
    assert.ok(
      src.indexOf('canSeeB2B') < src.indexOf("requireRoleApi('ADMIN')"),
      `${f}: the admin check runs before the B2B gate — a non-admin can tell the endpoint apart from a missing one`,
    )
    assert.match(src, /status: 404/, `${f}: the B2B gate must answer 404, not 403`)
  }
})

test('a balance moves ONLY through the balance endpoint', () => {
  // Every lari that has ever been on a balance must have a CompanyTransaction
  // explaining it. Two ways that promise breaks, both checked here: an opening
  // balance on create, and a `balance` field on the generic PATCH.
  assert.doesNotMatch(read('app/api/admin/companies/route.ts'), /balance:\s*z\./,
    'company creation accepts an opening balance — the first movement would have no ledger row')
  const patch = read('app/api/admin/companies/[id]/route.ts')
  const patchBody = patch.slice(patch.indexOf('const PatchBody'), patch.indexOf('export async function PATCH'))
  assert.doesNotMatch(patchBody, /balance/,
    'PATCH accepts a balance — it would move money with no transaction row')
})

test('the hand movement claims the row instead of checking it', () => {
  // „A status check you read before the write is not a guard" (CLAUDE.md). Here
  // losing that race overdraws real money, so the decrement carries its whole
  // condition in the WHERE and rejects on count !== 1.
  const src = read('app/api/admin/companies/[id]/balance/route.ts')
  // ⚠️ Anchored to the WHOLE where-clause, not to the condition alone. The
  // file's own comment quotes `balance: { gte: amount }` while explaining why
  // it is there, so the looser pattern matched the PROSE — deleting the real
  // condition from the query left this test green. Found by mutation-testing;
  // it is the second time in this file that a comment satisfied an assertion
  // meant for code, so treat quoted code in a comment as a hazard when writing
  // one of these.
  assert.match(src, /where: \{ id, balance: \{ gte: amount \} \}/, 'the decrement does not claim the row')
  assert.match(src, /claimed\.count !== 1/)
  // …and the number and its ledger row are written in ONE transaction, so a
  // balance can never move with nothing recording why.
  assert.match(src, /prisma\.\$transaction\(async tx =>/)
  assert.ok(
    src.indexOf('companyTransaction.create') > src.indexOf('$transaction'),
    'the ledger row is written outside the transaction that moved the balance',
  )
  // balanceAfter is read back INSIDE the transaction — not computed from a
  // value read before the write, which would record a number the balance never
  // actually held.
  assert.match(src, /findUniqueOrThrow\(\{\s*where:\s+\{\s+id\s+\},\s*select:\s+\{\s+balance:\s+true\s+\}/)
})

test('the admin tab disappears with the vertical, from the SOURCE array', () => {
  // Filtered out of ADMIN_NAV itself, not merely hidden at render — everything
  // downstream (sidebar, mobile drawer, VALID_TABS) is derived from that array,
  // so this is what makes /admin#companies a dead hash with the flag off
  // rather than a tab that opens but is not drawn in the rail.
  const nav = read('app/admin/_nav.tsx')
  assert.match(nav, /\.filter\(it\s+=>\s+it\.id\s+!==\s+'companies'\s+\|\|\s+b2bFeatureExists\(\)\)/)
  assert.match(nav, /VALID_TABS: AdminTab\[\] = ADMIN_NAV\.map/,
    'VALID_TABS stopped being derived — the filter no longer reaches deep links')
  // The tab id must be lowercase letters only: tests/adminNav.test.ts parses
  // the nav with /\{ id: '([a-z]+)',\s+l: '/, so „b2b" would be invisible to
  // every assertion in that file — including the one that stops a bad icon
  // blanking the entire admin panel.
  assert.match(nav, /\{ id: 'companies',\s+l: '/)
})

/* ═══════════ 4. the charge ═════════════════════════════════════════════ */

test('the booking charge is inside the booking transaction', () => {
  // If the charge sat outside, a balance could be spent on a booking that then
  // failed to be created — and runSerializable RETRIES the transaction up to
  // three times on P2034, so a charge outside it would double- or triple-bill.
  const src = read('app/api/bookings/route.ts')
  const txStart = src.indexOf('const attemptBooking = () => prisma.$transaction')
  const txEnd = src.indexOf("{ isolationLevel: 'Serializable' }")
  assert.ok(txStart > -1 && txEnd > txStart, 'the booking transaction moved — re-check this test')
  const body = src.slice(txStart, txEnd)
  assert.match(body, /company\.updateMany/, 'the charge is not inside the booking transaction')
  assert.match(body, /companyTransaction\.create/, 'the ledger row is not inside the booking transaction')
  assert.match(body, /balance: \{ gte: price \}/, 'the charge does not claim the row')
})

test('the charge uses the SERVER price and re-reads membership', () => {
  // Nothing about the request is trusted. `price` is derived above from the
  // consultation row or the expert's rate — a client that sends price 0 and
  // paidBy COMPANY_BALANCE must still be charged the real amount.
  //
  // codeOf, not read — the FOURTH time in this file that a comment satisfied an
  // assertion meant for code. The note in the route explaining why the gate is
  // NOT canSeeB2B(user.role) contains that exact string, so the negative
  // assertion below failed against prose while the code was already correct.
  const src = codeOf('app/api/bookings/route.ts')
  // canSpendAsMember(), NOT canSeeB2B(user.role). Pinned as the exact
  // expression because the difference is what made the feature work at all:
  // gating the CHARGE on the rollout stage left no account able to use it —
  // an employee is a STUDENT (refused by the stage) and an ADMIN cannot book
  // (refused by this route). Found by driving the real flow, not by reading.
  assert.match(src, /const\s+wantsBalance\s+=\s+canSpendAsMember\(\)\s+&&\s+parsed\.data\.paidBy\s+===\s+'COMPANY_BALANCE'/)
  assert.doesNotMatch(src, /canSeeB2B\(user\.role\)/,
    'the charge is gated on the viewer role again — no account can complete the flow')
  assert.match(src, /amount: price/, 'the ledger records a client-supplied amount')
  assert.match(src, /companyMember\.findFirst/, 'membership is not re-read server-side')
  // The status term: a frozen company may receive money but never spend it.
  assert.match(src, /status: 'ACTIVE'/)
})

test('an ordinary booking is untouched by any of it', () => {
  // The promise the whole stage rests on. paidBy is written ONLY when a balance
  // was actually charged, so every other booking still stores null — which
  // paymentSourceOf reads as CARD, the same value the entire history has.
  const src = read('app/api/bookings/route.ts')
  assert.match(src, /\.\.\.\(chargedCompanyId\s+\?\s+\{\s+paidBy:\s+'COMPANY_BALANCE'\s+as\s+const\s+\}\s+:\s+\{\}\)/,
    'paidBy is written unconditionally — ordinary bookings would stop reading as history')
  // …and on the client, the key is absent rather than false: JSON.stringify
  // drops undefined, so a non-member's payload is byte-for-byte the old one.
  assert.match(read('components/booking/BookingFlow.tsx'),
    /paidBy: useBalance \? 'COMPANY_BALANCE' : undefined/)
})

test('the booking sheet makes no request at all while the vertical is off', () => {
  // Not „a request that 404s" — none. Otherwise every booking-sheet open on the
  // site gains a network call for a feature nobody can use, which is a change
  // to the booking path however harmless it looks.
  const src = read('components/booking/CompanyBalance.tsx')
  assert.match(src, /if\s+\(!open\s+\|\|\s+!b2bFeatureExists\(\)\)\s+return/)
  // The fetch failing must never break the flow: this is an OPTIONAL payment
  // method and its absence is exactly what every booking already does.
  assert.match(src, /catch \{/)
  assert.doesNotMatch(src, /setSubmitError|throw new/, 'a failed lookup surfaces an error into the booking flow')
})

/* ═══════════ 5. the money rules ════════════════════════════════════════ */

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
    assert.match(src, /CONSTRAINT\s+"Company_balance_nonnegative"\s+CHECK\s+\("balance"\s+>=\s+0\)/, `${f}: balance CHECK`)
    assert.match(src, /CONSTRAINT\s+"CompanyTransaction_amount_positive"\s+CHECK\s+\("amount"\s+>\s+0\)/, `${f}: amount CHECK`)
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

test('the company detail endpoint returns every field the panel reads', () => {
  // A hard 500 shipped here (found by opening a real company on production,
  // 2026-08-11): the panel reads `_count.members` and `_count.transactions`,
  // the endpoint did not select `_count`, and the detail view threw a
  // TypeError on first render. TypeScript could not catch it — the client
  // declares the response shape BY HAND (`type Detail = Company & …`), so the
  // declaration is a claim about the API rather than a check of it.
  //
  // This test is that check, in the only form available without a running
  // server: every `d.<field>` the component reads must appear in the route's
  // select. Crude, and it would have caught the bug.
  const route = codeOf('app/api/admin/companies/[id]/route.ts')
  const panel = read('app/admin/_companies.tsx')
  const detailBody = panel.slice(panel.indexOf('function CompanyDetail'), panel.indexOf('function CompaniesView'))
  const readFields = new Set([...detailBody.matchAll(/\bd\.(\w+)/g)].map(m => m[1]))
  for (const f of readFields) {
    assert.ok(
      new RegExp(`\\b${f}:`).test(route),
      `the panel reads d.${f} but GET /api/admin/companies/[id] does not select it — that is a 500, not a missing value`,
    )
  }
  // The two that actually broke, pinned by name so the reason survives.
  assert.match(route, /_count:\s+\{\s+select:\s+\{\s+members:\s+true,\s+transactions:\s+true\s+\}\s+\}/)
})

/* ═══════════ 6. the service catalogue ══════════════════════════════════ */

test('the catalogue endpoint carries both gates, like every other admin route', () => {
  const src = codeOf('app/api/admin/b2b-services/route.ts')
  assert.match(src, /canSeeB2B\(/)
  assert.match(src, /requireRoleApi\('ADMIN'\)/)
  assert.ok(src.indexOf('canSeeB2B') < src.indexOf("requireRoleApi('ADMIN')"))
})

test('a retired service never deletes the requests it produced', () => {
  // The requests are the record of who asked for what. A CASCADE here would
  // erase that history the first time somebody tidied the price list — so the
  // FK is SET NULL, in BOTH places the DDL lives.
  for (const f of ['lib/dbBoot.ts', 'prisma/manual-migrations/2026-08-11-b2b-services/up.sql']) {
    assert.match(read(f), /"BusinessLead_serviceId_fkey"\s+FOREIGN\s+KEY\s+\("serviceId"\)\s+REFERENCES\s+"B2BService"\("id"\)\s+ON\s+DELETE\s+SET\s+NULL/, f)
  }
  assert.match(read('prisma/schema.prisma'), /service\s+B2BService\? @relation\(fields: \[serviceId\], references: \[id\], onDelete: SetNull\)/)
})

test('the requested service is verified against the catalogue, never trusted', () => {
  // A crafted POST must not be able to attach an enquiry to a hidden service —
  // or to a string that is not a service at all.
  const src = codeOf('app/api/business/lead/route.ts')
  assert.match(src, /b2BService\.findFirst\(\{[\s\S]*?where:\s+\{\s+id:\s+wantedId,\s+visible:\s+true\s+\}/)
  // …and an unknown id is DROPPED, not rejected: a stale bookmark must not cost
  // us the enquiry.
  assert.match(src, /serviceId: service\?\.id \?\? null/)
})

test('the price label is decided in one place', () => {
  // The page and the admin list both show a price, and „ფასი შეთანხმებით" is a
  // price too. Two copies of that rule is how one surface starts showing 0₾.
  assert.equal(servicePriceLabel({ priceGel: 800, priceOnRequest: false }), '800₾')
  assert.equal(servicePriceLabel({ priceGel: 1500, priceOnRequest: false }), '1,500₾')
  assert.equal(servicePriceLabel({ priceGel: 0, priceOnRequest: true }), 'ფასი შეთანხმებით')
  assert.equal(servicePriceLabel({ priceGel: 800, priceOnRequest: true }), 'ფასი შეთანხმებით',
    'priceOnRequest must win over a stored number')
})

test('services group by direction and keep their order', () => {
  const rows = [
    { direction: 'იურიდიული', order: 2, id: 'b' },
    { direction: 'ფინანსური', order: 0, id: 'c' },
    { direction: 'იურიდიული', order: 1, id: 'a' },
  ]
  const grouped = groupByDirection(rows)
  assert.deepEqual(grouped.map(([d]) => d), ['იურიდიული', 'ფინანსური'])
  assert.deepEqual(grouped[0][1].map(r => r.id), ['a', 'b'], 'order is not respected inside a direction')
})

test('the service card actually renders its format line', () => {
  // This shipped MISSING once. The edit that added it was a scripted
  // string-replace whose target had already changed, and Python's str.replace
  // returns the input unchanged rather than failing — so the field was added to
  // the schema, the API, the admin form and the picker, and the one place a
  // company would read it rendered nothing. Nothing caught it: types were
  // clean, the build passed, and the page looked fine because every service
  // seeded before that deploy had no format anyway.
  const page = read('app/business/BusinessLanding.tsx')
  assert.match(page, /\{s\.format && \(/, 'the card no longer renders format')
  assert.match(page, /format: true/, 'the query no longer selects format')
  // …and every surface that offers the field is still wired, so the next silent
  // no-op edit is caught here rather than on the live page.
  assert.match(read('app/api/admin/b2b-services/route.ts'), /format: \(parsed\.data\.format \?\? ''\)\.trim\(\) \|\| null/)
  assert.match(read('app/admin/_companies.tsx'), /draft\.format/)
  assert.match(read('app/business/LeadForm.tsx'), /s\.format \?/)
})
