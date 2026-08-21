// ONE PAGE FOR „რას ვყიდი?" — /work/services (2026-08-19).
//
// Run: npx tsx tests/servicesPage.test.ts   (also in `npm test`)
//
// The provider had TWO answers to one question: the „სესიები" tab of
// /work/profile (the bookable consultation types) and /work/service-profile
// (the trades, the cities, the price, the switch). Two screens, two halves of
// one workspace — the split CLAUDE.md's product model forbids, since this site
// sells SERVICES and a consultation is one KIND of service.
//
// This file pins the merge: one page holds both halves, each behind its own
// capability, the trades half keeps the 404 the old route answered with, the
// old address 308s (executed through the real middleware, like
// tests/redirects.test.ts), the profile page has no services tab left, and
// neither half's list endpoint drags a base64 column across the wire.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { middleware } from '../middleware'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const has = (p: string) => existsSync(join(ROOT, p))
/** Source with comments stripped — a comment quoting the old shape is history,
 *  a live line carrying it is the regression. */
// ⚠️ BLOCK COMMENTS FIRST, then the line ones. Stripping `//` lines first eats
// the ` */` that closes a `/** … */` block and leaves a dangling `/**`, which
// the block regex then matches against the NEXT `*/` in the file — swallowing
// a hundred lines of real code and failing assertions about code that is there.
const codeOf = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(l => !/^\s*\/\//.test(l))
    .join('\n')

const PAGE = 'app/work/services/page.tsx'

/* ═══════════ A. one page, outside both route groups ═════════════════════ */

test('§A the page exists, sits outside both guards, and the two old surfaces are gone', () => {
  for (const p of [PAGE, 'app/work/services/_consultations.tsx', 'app/work/services/_trades.tsx']) {
    assert.ok(has(p), `${p} is missing`)
  }
  // ⚠️ NOT IN A ROUTE GROUP. app/work/(expert) requires the EXPERT role and
  // app/work/(provider) 404s anybody the allowlist does not name — a page BOTH
  // must open cannot live in either, or half its audience is locked out.
  assert.ok(!has('app/work/(expert)/services'), 'the page moved into the expert group — a master can no longer open it')
  assert.ok(!has('app/work/(provider)/services'), 'the page moved into the provider group — an expert can no longer open it')
  // The two surfaces it replaced.
  assert.ok(!has('app/work/(provider)/service-profile'), 'the master still has a second page for what they sell')
  assert.ok(!has('app/work/(expert)/profile/_tabServices.tsx'), 'the profile page still carries the services tab')
  // Re-verified per request, like the two group layouts beside it.
  assert.match(codeOf(PAGE), /export const dynamic = 'force-dynamic'/)
})

/* ═══════════ B. the gate ════════════════════════════════════════════════ */

test('§B the gate: signed in, at least one capability, else notFound() — never a redirect', () => {
  const src = codeOf(PAGE)
  assert.match(src, /const\s+user\s+=\s+await\s+getCurrentUser\(\)\s*\n\s*if\s+\(!user\)\s+notFound\(\)/,
    'a signed-out visitor no longer gets the 404')
  assert.match(src, /if\s+\(!showConsultations\s+&&\s+!showTrades\)\s+notFound\(\)/,
    'somebody with neither capability is admitted to an empty page')
  // ⚠️ 404 AND NEVER 403 OR /signin. A redirect tells a stranger the page is
  // real and worth coming back to with an account — the one thing the 404
  // exists to deny (lib/requestsServer says it at length).
  assert.doesNotMatch(src, /redirect\(|requireRole\(|requireUser\(/,
    'the services page redirects — that tells a stranger the page is real')
})

test('§C each half is drawn by its own capability, and the trades half keeps the provider gate', () => {
  const src = codeOf(PAGE)
  // CONSULT — the TutorProfile row the old tab needed to render at all.
  assert.match(src, /const\s+showConsultations\s+=\s+caps\.includes\('CONSULT'\)/,
    'the consultation half is no longer keyed on the CONSULT capability')
  assert.match(src, /const caps = await capabilitiesOf\(user\.id\)/,
    'the page stopped reading capabilities — the halves cannot be keyed on them')
  // WORK — literally the two checks the old route made: the layout's
  // `providerAllowed` (the supply-side switch + the allowlist) and the page's
  // own `provider` (is there an identity to hang a ServiceProfile on).
  assert.match(src, /const showTrades = viewer\.providerAllowed && viewer\.provider !== null/,
    'the trades half lost the provider gate the old route had')
  assert.match(src, /const viewer = await requestsViewer\(\)/)
  // Both halves, on ONE page, and never behind a tab bar: two tabs here would
  // read as two products — the consultation-vs-service primary axis the
  // product model forbids.
  assert.match(src, /\{showConsultations && \(/)
  assert.match(src, /\{showTrades && \(/)
  assert.match(src, /<ConsultationsSection \/>/)
  assert.match(src, /<ServiceProfileForm \/>/)
  assert.doesNotMatch(src, /role="tab"|activeTab|TabPanel/, 'the two halves are behind a tab bar again')
  // One heading each, and the page keeps the name both old surfaces used.
  assert.match(src, /title="ჩემი სერვისები"/)
  assert.match(src, /<h2 className="font-display text-h3 font-bold text-ink-900">კონსულტაციები<\/h2>/)
  assert.match(src, /<h2 className="font-display text-h3 font-bold text-ink-900">სამუშაოები<\/h2>/)
})

/* ═══════════ D. the old address ═════════════════════════════════════════ */

const ORIGIN = 'https://mcodne.ge'
const where = (path: string) => {
  const r = middleware(new NextRequest(`${ORIGIN}${path}`))
  return { status: r.status, to: r.headers.get('location') }
}

test('§D /work/service-profile 308s to /work/services, in one hop, and lands on a live page', () => {
  assert.deepEqual(where('/work/service-profile'), { status: 308, to: `${ORIGIN}/work/services` })
  // Prefix-plus-slash too: nothing ever lived under it, so a deeper path is a
  // typo and belongs on the page rather than on a 404.
  assert.deepEqual(where('/work/service-profile/x'), { status: 308, to: `${ORIGIN}/work/services` })
  // …and the target is not itself redirected — a retired URL lands in one hop.
  assert.equal(where('/work/services').status, 200, '/work/services is redirected or blocked')
  // Segment boundary: a name that merely starts with the same letters is not
  // the old address.
  assert.equal(where('/work/service-profiles').status, 200)
  // The 308 sits with the other permanent moves, above the feature gate — so
  // an old link redirects rather than 404ing when the supply side is off.
  const mw = read('middleware.ts')
  assert.ok(mw.indexOf("'/work/service-profile'") < mw.indexOf('isRequestPath('),
    'the services 308 moved below the requests gate')
})

/* ═══════════ E. the profile page kept everything else ═══════════════════ */

test('§E /work/profile lost the services tab and nothing else', () => {
  const src = codeOf('app/work/(expert)/profile/page.tsx')
  assert.doesNotMatch(src, /ServicesTab|_tabServices/, 'the services tab is still mounted on the profile page')
  assert.match(src, /\{\['პროფილი',\s+'კვალიფიკაცია',\s+'ანგარიში'\]\.map/,
    'the profile tab bar is not the three remaining tabs')
  // The three panels that stay, still imported and still mounted.
  for (const tab of ['ProfileTab', 'CredentialsTab', 'AccountTab']) {
    assert.match(src, new RegExp(`<${tab}\\b`), `${tab} left the profile page`)
  }
  for (const f of ['_tabProfile.tsx', '_tabCredentials.tsx', '_tabAccount.tsx', '_parts.tsx', '_types.ts']) {
    assert.ok(has(`app/work/(expert)/profile/${f}`), `${f} is missing`)
  }
  // …and it says where they went. Until the rail carries the item, this link is
  // the only trace of the move a returning expert would see.
  assert.match(src, /href="\/work\/services"/, 'the profile page does not say where the services tab went')
  // Nothing on this page deletes a consultation any more, and the confirm
  // paradigm is intact for the rows that remain.
  assert.doesNotMatch(src, /kind: 'cons'/, 'the profile page still deletes services')
  assert.doesNotMatch(codeOf('app/work/(expert)/profile/_types.ts'), /'cons'/)
  assert.match(src, /<ConfirmModal/)
  // The anchors moved with the sections, so the reveal map must not claim them.
  assert.doesNotMatch(src, /'section-availability'|'section-consultations'/,
    'the profile page still maps anchors that live on /work/services')
  assert.match(codeOf('app/work/services/_consultations.tsx'), /id="section-availability"/)
  assert.match(codeOf('app/work/services/_consultations.tsx'), /id="section-consultations"/)
})

test('§F the behaviour moved with it: same endpoints, same switch, same uploader', () => {
  const cons = codeOf('app/work/services/_consultations.tsx')
  // Create / edit / delete, exactly the three the tab had.
  assert.match(cons, /fetch\('\/api\/tutor\/consultations',\s+\{\s*\n?\s*method:\s+'POST'/)
  assert.match(cons, /fetch\(`\/api\/tutor\/consultations\/\$\{id\}`,\s+\{\s*\n?\s*method:\s+'PATCH'/)
  assert.match(cons, /fetch\(`\/api\/tutor\/consultations\/\$\{pendingDelete\}`,\s+\{\s+method:\s+'DELETE'\s+\}\)/)
  // A booked type cannot be deleted, and the reason is still named.
  assert.match(cons, /j\.error === 'IN_USE'/)
  assert.match(cons, /<ServiceTypeAndAvailability/)
  assert.match(cons, /<PackagesSection \/>/)
  assert.match(cons, /<StudentsSection \/>/)

  const trades = codeOf('app/work/services/_trades.tsx')
  assert.match(trades, /fetch\('\/api\/provider\/service-profile',\s+\{\s+cache:\s+'no-store'\s+\}\)/)
  assert.match(trades, /method: 'PUT'/)
  // The master's own switch, the gaps line, the photo and the sentence.
  assert.match(trades, /ახალი მოთხოვნები მომდის/, 'the paused/available switch is gone')
  assert.match(trades, /data\.gaps\.length > 0/, 'the „ჯერ არ ხარ სიაში" line is gone')
  assert.match(trades, /<PhotoUploader/, 'the photo uploader is gone')
  assert.match(trades, /MAX_SERVICES/, 'the trades cap is gone')
})

/* ═══════════ G. no base64 column crosses the wire ═══════════════════════ */

test('§G neither half ships an image column in a list payload', () => {
  // The photo is a base64 column of a few hundred kilobytes. The GET the trades
  // half opens with COUNTS it and sends a boolean; the bytes are drawn through
  // /api/masters/[id]/photo, which is what the public card uses too.
  const api = codeOf('app/api/provider/service-profile/route.ts')
  const select = api.slice(api.indexOf('findUnique'), api.indexOf('const hasPhoto'))
  assert.doesNotMatch(select, /photoUrl: true/, 'the service-profile GET selects the base64 photo into its payload')
  assert.match(api, /hasPhoto/, 'the photo boolean is gone — the form cannot say „ფოტო ატვირთულია"')
  assert.match(codeOf('app/work/services/_trades.tsx'), /\/api\/masters\/\$\{profileId\}\/photo/,
    'the stored photo is no longer drawn through its own URL')
  // …and the consultation list carries no such column at all (title, minutes,
  // price, tier), so the findMany below stays a plain read.
  const cons = codeOf('app/api/tutor/consultations/route.ts')
  assert.doesNotMatch(cons, /photo|image|avatar|base64/i, 'a consultation now carries an image — the list must select around it')
})
