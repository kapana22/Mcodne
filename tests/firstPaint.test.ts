/*
 * THE FIRST PAINT — what a signed-in person sees before any fetch resolves.
 *
 * Run:  npx tsx tests/firstPaint.test.ts   (also in `npm run check`)
 *
 * ⚠️ WHY THIS FILE EXISTS. Owner, 2026-08-30: „ხანდახან დილეი აქვს, ნახევარს
 * ტვირთავს ხოლმე რაღაცებს და მერე ჩნდება ხოლმე — ესე არ უნდა ხდებოდეს."
 *
 * Measured that day, the server was not the problem: TTFB on the five public
 * pages ran 0.36–1.08s. What moved on screen was drawn TWICE, and both causes
 * are shapes a test can hold still:
 *
 *   1. THE HEADER IS FED HALF AN IDENTITY. It is a client component reading
 *      `useMe`, which probes /api/me after mount, so every page hands it
 *      `initialUser` for the first paint. Four pages built that object by hand
 *      out of `{ id, fullName, avatarUrl, role }` — and the header branches on
 *      `provider` (whether the „მოთხოვნის გაგზავნა" button is for this person)
 *      and reads `balanceTetri` (the credit pill). Neither was there. So a
 *      signed-in provider got the request button drawn and then REMOVED, and
 *      the balance pill arriving late, on every cold load of the busiest pages
 *      on the site. PublicTopBar's own comment claimed `initialUser` „resolves
 *      it in the FIRST paint on every server-rendered page" — it could not.
 *
 *   2. AN <a> TO AN INTERNAL ROUTE. It throws the document away and boots React
 *      again: the chrome redraws, every client probe re-runs, and the page
 *      assembles in front of the reader. eslint calls this an error
 *      (`no-html-link-for-pages`) and one had been sitting in the catalogue's
 *      empty state — the highest-traffic page — the whole time.
 *
 * Both are invisible in a screenshot and invisible to `tsc`. They are only ever
 * caught by someone watching the page load, which is why they lasted.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
/** Source with its comments stripped — an assertion about CODE must not pass or
 *  fail on prose. This file's own notes name `getCurrentUser` in the very file
 *  that must no longer call it. */
const codeOf = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')

/** Every .tsx under the given roots. */
function tsxUnder(dirs: string[]): string[] {
  const out: string[] = []
  const walk = (rel: string) => {
    for (const name of readdirSync(join(ROOT, rel))) {
      const r = `${rel}/${name}`
      if (statSync(join(ROOT, r)).isDirectory()) walk(r)
      else if (name.endsWith('.tsx')) out.push(r)
    }
  }
  dirs.forEach(walk)
  return out
}

test('the pages that render the header hand it a WHOLE identity', () => {
  // ⚠️ ONE BUILDER, NOT FOUR. The shape has to match what /api/me returns or
  // the flip survives: a first paint that is merely CLOSER still flickers, just
  // rarely enough to stop being reported.
  const server = read('lib/meServer.ts')
  for (const field of ['provider', 'balanceTetri', 'hats']) {
    assert.ok(server.includes(field), `lib/meServer stopped carrying \`${field}\``)
  }
  // It reads the identity the same way /api/me does — one call, not a role guess.
  assert.match(server, /identityOf\(user\.id\)/)
  assert.match(server, /balanceOf\(user\.id\)/)
  // null ≠ 0: a plain client must never be handed a number they cannot spend.
  assert.match(server, /identity\?\.provider \? balanceTetri : null/,
    'meServer hands a balance to somebody who sells nothing')

  // And nobody hand-rolls it any more. This is the exact four-field literal the
  // four pages carried; it is the bug, spelled out, so a copy-paste brings the
  // test down with it.
  for (const f of tsxUnder(['app'])) {
    const s = read(f)
    assert.doesNotMatch(
      s,
      /initialUser\s*=\s*user[\s\S]{0,40}?\{\s*id: user\.id,\s*fullName: user\.fullName,\s*avatarUrl: user\.avatarUrl,\s*role:/,
      `${f} builds initialUser by hand again — it will be missing provider and balanceTetri`,
    )
  }
})

test('the identity read stays off the critical path', () => {
  // ⚠️ INSIDE THE Promise.all, NOT AWAITED AFTER IT. Fixing a flicker by adding
  // a second sequential session read would trade a visible stutter for a slower
  // page, which is the same complaint wearing different clothes.
  const experts = codeOf('app/experts/page.tsx')
  assert.match(experts, /Promise\.all\(\[[\s\S]{0,400}?initialMe\(\),?\s*\]\)/,
    'the catalogue awaits the identity separately — that is a second round trip')
  assert.doesNotMatch(experts, /getCurrentUser\(\)/,
    'the catalogue reads the session twice: once itself and once inside initialMe')
})

test('no <a> points at a route inside this app', () => {
  // The exceptions, and why each one is real:
  //   · app/global-error.tsx renders OUTSIDE the app shell — the router is not
  //     mounted there, so <Link> has nothing to navigate with.
  //   · target="_blank" is a deliberate new tab (the signup's terms links: the
  //     half-filled form must survive the reader checking what they agree to).
  const ALLOW = new Set(['app/global-error.tsx'])
  const bad: string[] = []
  for (const f of tsxUnder(['app', 'components'])) {
    if (ALLOW.has(f)) continue
    const s = read(f)
    for (const m of s.matchAll(/<a\b[^>]*?href=(["'])(\/[^"']*)\1[^>]*>/gs)) {
      const tag = m[0]
      const href = m[2]
      if (tag.includes('target=') || tag.includes('download')) continue
      // Not routes: the auth hand-off and the static asset roots.
      if (/^\/(api|fonts|sitemap|robots)/.test(href)) continue
      bad.push(`${f} → ${href}`)
    }
  }
  assert.deepEqual(bad, [],
    'these <a> tags reload the whole document instead of navigating — use <Link>')
})

test('no signed-in page opens as a spinner over data the session already holds', () => {
  // ⚠️ THE LAST TWO WERE FOUND ON 2026-08-30 in the sweep after /me.
  // /settings rendered a centred „იტვირთება…" over the WHOLE screen until
  // /api/me answered — for a name, a phone and an avatar the session carries.
  // /notifications asked the same endpoint purely to fill the header's name and
  // avatar, so the top bar drew with a hole in it.
  //
  // Both are split now: a server page resolves the identity, the client half
  // keeps every interaction. What they may NOT do again is fetch the viewer on
  // mount — that is the whole defect, and it is one line to reintroduce.
  for (const f of ['app/settings/client.tsx', 'app/notifications/client.tsx']) {
    const s = codeOf(f)
    assert.doesNotMatch(s, /useEffect\([\s\S]{0,200}?fetch\('\/api\/me'\)/,
      `${f} fetches the viewer on mount again — the page will open incomplete`)
  }
  // And the server halves must actually require a session rather than letting
  // the client bounce to /signin, which cannot happen until React has booted.
  for (const f of ['app/settings/page.tsx', 'app/notifications/page.tsx']) {
    assert.match(read(f), /await requireUser\(\)/,
      `${f} leaves the sign-in redirect to the browser`)
  }
})

test('the inbox list is in the first paint, not one round trip later', () => {
  // ⚠️ THE LAST ONE, FOUND 2026-08-30 in the sweep after /settings. The left
  // pane opened from a module-scope cache — which makes a SECOND visit instant
  // and does nothing for the first, the visit that matters — then fetched
  // /api/work/threads. So the inbox showed an empty column and filled it a
  // round trip later, on the one screen where the missing thing is a person
  // waiting for an answer.
  //
  // ⚠️ REWRITTEN 2026-08-31, SAME GUARANTEE, TWO ROOMS. The client's inbox came
  // back with the owner's „Messages" artboard, so this list now takes the room
  // it polls as a prop and the cache is keyed by it. What is asserted is
  // unchanged: the rows are in the FIRST paint, they come from the same helper
  // the poll's route calls, and the poll still runs. The two source lines that
  // used to be pinned as literals were pinning the spelling.
  const list = codeOf('components/chat/ConversationList.tsx')
  assert.match(list,
    /useState<Thread\[\] \| null>\(initialThreads \?\? cachedThreads\.get\(endpoint\) \?\? null\)/,
    'the conversation list opens empty again')
  // …and one cache slot per room, or a dual-role person is shown the wrong
  // inbox for a beat every time they switch.
  assert.match(list, /const cachedThreads = new Map<string, Thread\[\]>\(\)/,
    'the thread cache is shared between the two rooms again')

  // Seeded from the SAME helper the route calls, so the rows on screen and the
  // rows the poll returns cannot disagree — on BOTH sides.
  assert.match(codeOf('app/work/messages/layout.tsx'), /offerInboxRows\(await requestAccessOf\(user\.id\)\)/,
    'the inbox layout stopped reading the rows it hands down')
  assert.match(codeOf('app/api/work/threads/route.ts'), /offerInboxRows\(await requestAccessOf\(user\.id\)\)/,
    'the route and the layout build the inbox two different ways')
  /* ⚠️ THE CLIENT'S HALF MOVED FROM `layout.tsx` TO `page.tsx` (2026-09-02) and
     the guarantee is untouched. That room's inbox stopped being a two-pane
     frame — the right-hand pane drew an offer conversation that the request
     room already draws beside the price it is about, so /me/messages is a list
     now and /me/messages/o/<id> is a resolver into the room. With no second
     slot to fill, a layout wrapping a single page was indirection for nothing.
     What is asserted here has not changed: the rows are seeded from the SAME
     helper the poll's route calls. */
  assert.match(codeOf('app/me/messages/page.tsx'), /clientInboxRows\(user\.id\)/,
    'the client inbox page stopped reading the rows it hands down')
  assert.match(codeOf('app/api/me/threads/route.ts'), /clientInboxRows\(user\.id\)/,
    'the client route and its page build the inbox two different ways')

  // The poll STAYS: a message can arrive while the page is open. It reads the
  // room it was given, and the provider's inbox is still the default.
  /* ⚠️ THE RULE IS „IT STILL POLLS", NOT „IT SPELLS THE CALL THIS WAY"
     (widened 2026-09-01). The literal `fetch(endpoint)` blocked the fix for a
     real defect: neither /api/me/threads nor /api/work/threads sends a
     `Cache-Control`, and `force-dynamic` governs the SERVER cache rather than
     the browser's — so after sending a message the transcript gained it (that
     read is `no-store`) while the row beside it kept the old preview, time and
     unread dot. The options argument is now allowed; what is still pinned is
     that the poll exists and reads the endpoint it was given. */
  assert.match(list, /fetch\(endpoint[,)]/,
    'the inbox stopped refreshing — a message arriving while the page is open would not show')
  assert.match(list, /cache: 'no-store'/,
    'the inbox row can be served from the browser cache — it will show a stale preview after a send')
  assert.match(list, /endpoint = '\/api\/work\/threads'/,
    'the default room is no longer the provider inbox this list was written for')
})
