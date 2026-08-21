/*
 * The live room (stage 10) — the screen after send stays open, the address bar
 * becomes the room's, and the answers arrive without a reload.
 *
 * Run with:  npx tsx tests/liveRoom.test.ts   (also picked up by `npm run check`)
 *
 * WHY THIS FILE EXISTS. Every property below is invisible when broken:
 *
 *   · THE STREAM IS A DOOR. /api/requests/[ref]/events answers the same
 *     question as ./status for as long as a tab is open. If it is gated one
 *     notch looser — a 403, a skipped normalisation, no rate limit — nothing on
 *     screen changes and the subsystem has a new way in.
 *   · THE FALLBACK IS THE PRODUCT ON A BAD NETWORK. Every pane that listens to
 *     the stream must still poll when it cannot; if the poll quietly goes, the
 *     room works on the author's laptop and freezes on a phone in a lift.
 *   · THE TRANSFORM IS IN PLACE. A `router.push` on submit would be a flash
 *     and a reload — exactly what the owner asked to remove — and it would
 *     look fine in a screenshot.
 *   · THE MOTION IS THE CLOSED LIBRARY, GATED. A new keyframe or a bare
 *     `animate-*` renders identically for everyone who is not harmed by it.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
/** Comments and imports removed — these files quote their own history. */
const codeOf = (p: string) =>
  read(p)
    .split('\n')
    .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l) && !/^import\b/.test(l))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')

const EVENTS = 'app/api/requests/[ref]/events/route.ts'
const STATUS = 'app/api/requests/[ref]/status/route.ts'
const LIB = 'lib/requestLive.ts'
const CLIENT = 'lib/requestLiveClient.ts'

/* ═══════════ A. the stream route ════════════════════════════════════════ */

test('the events route exists and is a Server-Sent Events stream', () => {
  assert.ok(existsSync(join(ROOT, EVENTS)), 'app/api/requests/[ref]/events/route.ts is missing')
  const src = codeOf(EVENTS)
  assert.match(src, /new ReadableStream/, 'the route no longer streams')
  assert.match(src, /'Content-Type': 'text\/event-stream/, 'the stream lost its content type')
  assert.match(src, /'Cache-Control': 'no-store/, 'a stream must never be cached')
  assert.match(src, /export const dynamic = 'force-dynamic'/, 'a stream must not be pre-rendered')
  assert.doesNotMatch(src, /runtime = 'edge'/, 'the stream needs the Node runtime (prisma)')
  // SSE framing: named events the client can subscribe to by name.
  assert.match(src, /event: \$\{event\}\\ndata: /, 'events are not framed as `event:` + `data:`')
  assert.match(src, /send\('status'/, 'the stream stopped sending the status payload')
  assert.match(src, /send\('messages'/, 'the stream stopped sending the messages nudge')
  // A comment line is the heartbeat — not an event, nothing fires client-side.
  assert.match(src, /enc\.encode\(': ping\\n\\n'\)/, 'the heartbeat is gone, or became an event')
})

test('the stream is gated EXACTLY like ./status — publicRef, requestsViewer, 404 never 403', () => {
  const ev = codeOf(EVENTS)
  const st = codeOf(STATUS)
  // The same three checks, in the same order, before any query.
  for (const [name, src] of [['events', ev], ['status', st]] as const) {
    const viewer = src.indexOf('await requestsViewer()')
    const gate = src.indexOf('if (!viewer.clientAllowed)')
    const norm = src.indexOf('normalizePublicRef(')
    const rl = src.indexOf('rateLimit(')
    const db = src.indexOf('await ensureDbReady()')
    assert.ok(viewer >= 0 && gate > viewer, `${name}: requestsViewer gate missing`)
    assert.ok(norm > gate, `${name}: the reference is not normalised after the gate`)
    assert.ok(rl > norm, `${name}: the existence oracle is not throttled`)
    assert.ok(db > rl, `${name}: the database is reached before the gate/throttle`)
    assert.doesNotMatch(src, /403|redirect\(|\/signin/, `${name}: the gate answers something other than 404`)
  }
  // The stream's refusals go through the subsystem's ONE 404.
  assert.match(ev, /if\s+\(!viewer\.clientAllowed\)\s+return\s+requestsNotFound\(\)/)
  assert.match(ev, /if \(!ref\) return requestsNotFound\(\)/)
  // Existence is decided with a real 404 BEFORE the stream opens — a 200 that
  // then closes would make EventSource retry a dead reference forever.
  const first = ev.indexOf('await requestLiveMark(ref)')
  const stream = ev.indexOf('new ReadableStream')
  assert.ok(first > 0 && first < stream, 'existence is not checked before the stream opens')
  assert.match(ev, /if \(!first\) return requestsNotFound\(\)/)
  // Throttled on its own key, so a reconnecting room does not eat the poll's
  // budget — and the poll is what a 429 here falls back to.
  assert.match(ev, /rateLimit\(`request-events:\$\{clientIp\(req\)\}`/, 'the stream shares the poll’s rate-limit key, or has none')
  assert.match(st, /rateLimit\(`request-status:\$\{clientIp\(req\)\}`/, 'the poll’s key moved')
})

test('the stream respects the client going away, and does not live forever', () => {
  const src = codeOf(EVENTS)
  assert.match(src, /req\.signal\.addEventListener\('abort',\s+stop\)/, 'the stream ignores the client disconnecting')
  assert.match(src, /cancel\(\)\s*\{[\s\S]*?closed = true/, 'the stream does not stop when the consumer cancels')
  assert.match(src, /controller\.close\(\)/, 'stop() does not close the stream')
  // The tuning: a tick every 3–5 s (an offer appears „within ~5 s"), a
  // heartbeat under a typical 30 s proxy idle timeout, a 30-minute life.
  const tick = Number(/const TICK_MS = ([\d_]+)/.exec(src)?.[1]?.replace(/_/g, ''))
  const beat = Number(/const HEARTBEAT_MS = ([\d_]+)/.exec(src)?.[1]?.replace(/_/g, ''))
  assert.ok(tick >= 3000 && tick <= 5000, `tick is ${tick} ms, not 3–5 s`)
  assert.ok(beat > 0 && beat <= 30_000, `heartbeat is ${beat} ms — proxies drop idle sockets around 30 s`)
  assert.match(src, /const MAX_AGE_MS = 30 \* 60_000/, 'the 30-minute life moved')
  assert.match(src, /Date\.now\(\)\s+-\s+openedAt\s+>\s+MAX_AGE_MS\)\s+\{\s+stop\(\)/, 'the stream does not close at its max age')
  // Cheap ticks: the fingerprint every tick, the full payload only on change.
  assert.match(src, /const mark = await requestLiveMark\(ref\)/)
  assert.match(src, /if\s+\(mark\.status\s+!==\s+last\.status\)\s+\{\s*const\s+live\s+=\s+await\s+requestLiveStatus\(ref\)/,
    'the full payload is recomputed every tick, or not on change')
  assert.match(src, /if\s+\(mark\.messages\s+!==\s+last\.messages\)\s+send\('messages'/)
  // A route file may export only what Next allows.
  const exportsOf = [...read(EVENTS).matchAll(/^export (?:const|async function|function) (\w+)/gm)].map(m => m[1]).sort()
  assert.deepEqual(exportsOf, ['GET', 'dynamic', 'runtime'], `route.ts exports something Next will refuse: ${exportsOf}`)
})

test('one source of truth: both routes answer from lib/requestLive, and it counts', () => {
  assert.match(codeOf(STATUS), /const live = await requestLiveStatus\(ref\)/, 'the poll route grew its own query')
  assert.match(codeOf(EVENTS), /requestLiveStatus\(ref\)/, 'the stream sends something other than the status payload')
  const lib = codeOf(LIB)
  assert.match(lib, /prisma\.notification\.count/, '„how many were told" is no longer a count')
  assert.match(lib, /prisma\.tutorProfile\.count/, '„how many experts are in this sphere" is no longer a count')
  assert.doesNotMatch(lib, /Math\.random/, 'the live payload invented a number')
  // The tick is one findUnique on the row (plus two counts) — never the list.
  const mark = lib.slice(lib.indexOf('export async function requestLiveMark'))
  assert.match(mark, /prisma\.serviceRequest\.findUnique/, 'the tick stopped being a findUnique')
  assert.doesNotMatch(mark, /tutorProfile\.findMany|avatarUrl/, 'the tick pulls the expert list every few seconds')
  assert.doesNotMatch(mark, /base64|avatarUrl/, 'a blob column in the tick')
})

/* ═══════════ B. the client: EventSource with a polling fallback ══════════ */

test('the browser half opens ONE EventSource per room and reports when it is down', () => {
  const c = codeOf(CLIENT)
  assert.match(c, /new EventSource\(url\)/, 'no EventSource')
  assert.match(c, /typeof window\.EventSource === 'function'/, 'availability is assumed rather than checked')
  assert.match(c, /listener\.onState\?\.\('down'\)\s*return\s+\(\)\s+=>\s+\{\}/, 'a browser without EventSource is not told to poll')
  assert.match(c, /es\.onerror = \(\) => setState\('down'\)/, 'a stream error does not send panes back to polling')
  assert.match(c, /es\.onopen = \(\) => setState\('open'\)/)
  assert.match(c, /addEventListener\('status'/, 'the client does not listen for status events')
  assert.match(c, /addEventListener\('messages'/, 'the client does not listen for messages events')
  // Refcounted: the last pane out closes the socket.
  assert.match(c, /if\s+\(room\.listeners\.size\s+===\s+0\)\s+\{\s*room\.es\.close\(\)/, 'the socket outlives its last listener')
  assert.match(c, /rooms\.get\(ref\) \?\? open\(ref\)/, 'every pane opens its own connection')
})

test('_live uses the stream and keeps the poll as the fallback', () => {
  const live = codeOf('app/request/_live.tsx')
  assert.match(live, /subscribeRequestLive\(publicRef, \{/, 'the panel no longer listens to the stream')
  assert.match(live, /onStatus: p =>/, 'the panel ignores status events')
  assert.match(live, /onState: setLive/, 'the panel does not track whether the stream is up')
  // The poll survives — and runs ONLY while the stream is down.
  assert.match(live, /const POLL_MS = 20_000/, 'the fallback cadence moved')
  assert.match(live, /if\s+\(live\s+===\s+'open'\)\s+return\s*load\(\)\s*const\s+id\s+=\s+window\.setInterval/,
    'the poll no longer yields to the stream, or is gone')
  assert.match(live, /document\.visibilityState === 'visible'/, 'the fallback polls hidden tabs')
  assert.match(live, /\/api\/requests\/\$\{encodeURIComponent\(publicRef\)\}\/status/, 'the fallback stopped reading ./status')
})

test('RequestChat joins the room when it holds the reference, polls otherwise', () => {
  const chat = codeOf('components/RequestChat.tsx')
  assert.match(chat, /if\s+\(!open\s+\|\|\s+!refCode\)\s+return\s*return\s+subscribeRequestLive\(refCode,\s+\{/,
    'the pane subscribes without the reference, or not at all')
  assert.match(chat, /onMessages: \(\) => \{ load\(true\) \}/, 'a messages event does not refetch the thread')
  // The fallback: first read + poll while down; never while the stream is up.
  assert.match(chat, /if\s+\(!open\s+\|\|\s+live\s+===\s+'open'\)\s+return\s*load\(true\)\s*const\s+id\s+=\s+window\.setInterval/,
    'the chat poll no longer yields to the stream, or is gone')
  assert.match(chat, /const POLL_MS = 15_000/, 'the chat fallback cadence moved')
  // The nudge is a nudge: messages still come through the thread's own
  // endpoint (masking, side), never off the stream.
  assert.doesNotMatch(chat, /onMessages: \(\)?\s*=>\s*setMsgs|onStatus/, 'the pane reads message bodies off the stream')
})

test('the offers page re-asks the server on events, through the one render path', () => {
  const lr = codeOf('app/request/_liveRefresh.tsx')
  assert.match(lr, /subscribeRequestLive\(publicRef/, 'the offers page no longer listens')
  assert.match(lr, /router\.refresh\(\)/, 'LiveRefresh grew its own data channel')
  assert.doesNotMatch(lr, /fetch\(/, 'LiveRefresh fetches data itself')
  const page = codeOf('app/request/[ref]/page.tsx')
  assert.match(page, /\(request\.status\s+===\s+'NEW'\s+\|\|\s+request\.status\s+===\s+'VERIFIED'\)\s+&&\s+<LiveRefresh\s+publicRef=\{request\.publicRef\}\s+\/>/,
    'LiveRefresh is not mounted under AutoRefresh’s condition')
  assert.match(page, /\(request\.status\s+===\s+'NEW'\s+\|\|\s+request\.status\s+===\s+'VERIFIED'\)\s+&&\s+<AutoRefresh/,
    'AutoRefresh — the fallback — is gone from the offers page')
})

/* ═══════════ C. the transform in place ═══════════════════════════════════ */

test('the wizard becomes the room in place: no navigation on submit, replaceState to the room’s address', () => {
  const w = codeOf('app/request/RequestWizard.tsx')
  // The submit function, isolated: from its declaration to `advance`.
  const submit = w.slice(w.indexOf('const submit = async'), w.indexOf('const advance ='))
  assert.ok(submit.length > 100, 'submit not found — update this test')
  assert.doesNotMatch(submit, /router\.(push|replace)|window\.location|redirect\(/, 'submit navigates — that is the flash the room exists to remove')
  assert.match(submit, /setSent\(\{/, 'submit no longer renders the room in place')
  // The room renders in the SAME component, from `sent`.
  assert.match(w, /if\s+\(sent\)\s+\{\s*return\s+\(\s*<RequestShell>[\s\S]*?<ThanksCard\s+sent=\{sent\}/, 'the room is no longer rendered in place')
  // The address bar becomes the room's, without a navigation.
  assert.match(w, /window\.history\.replaceState\(window\.history\.state,\s+'',\s+target\)/, 'the URL is not replaced with /request/<ref>')
  assert.match(w, /const\s+target\s+=\s+`\/request\/\$\{sent\.publicRef\}`/)
  // The one legitimate navigation: mounting UNDER a room's address (Back).
  assert.match(w, /if\s+\(\/\^\\\/request\\\/\[\^\/\]\+\$\/\.test\(here\)\)\s+router\.replace\(here\)/, 'a stale wizard under a room’s address no longer hands over')
  // The room enters with the same token every step uses.
  assert.match(w, /<div className="motion-safe:animate-slide-in-b">\s*<ThanksCard/, 'the room lost its entrance, or its guard')
})

test('AppShell treats the intake as one room, so replaceState cannot remount it', () => {
  const shell = codeOf('components/AppShell.tsx')
  assert.match(shell, /<div\s+key=\{inRequests\s+&&\s+!inProviderSpace\s+\?\s+'\/request'\s+:\s+\(path\s+\?\?\s+'\/'\)\}\s+className="motion-safe:animate-fade-in">/,
    'the page wrapper is keyed on the pathname inside the intake — replaceState would remount the room')
})

test('ThanksCard is the room: stations + thread, no link-only terminus', () => {
  const t = codeOf('app/request/_thanks.tsx')
  assert.match(t, /<LiveStatus publicRef=\{sent\.publicRef\} \/>/, 'the stations left the room')
  assert.match(t, /<RequestChat[\s\S]*?thread=\{\{\s+kind:\s+'PLATFORM',\s+refCode:\s+sent\.publicRef\s+\}\}[\s\S]*?defaultOpen/, 'the thread is not open in the room')
})

/* ═══════════ D. motion — the closed library, gated ═══════════════════════ */

const TOKENS = ['fade-in', 'fade-in-fast', 'rise-in', 'slide-in-r', 'slide-in-b', 'scale-in', 'pulse-soft', 'shimmer', 'pulse', 'spin']
const TOUCHED = [
  'app/request/_live.tsx', 'app/request/_thanks.tsx', 'app/request/RequestWizard.tsx',
  'app/request/_liveRefresh.tsx', 'app/request/[ref]/OfferList.tsx', 'app/request/[ref]/page.tsx',
  'components/RequestChat.tsx', 'components/AppShell.tsx',
]

test('every animate-* in the touched files is a library token and carries motion-safe:', () => {
  for (const f of TOUCHED) {
    const src = codeOf(f)
    for (const m of src.matchAll(/(\S*)animate-([a-z-]+)/g)) {
      assert.ok(TOKENS.includes(m[2]), `${f}: minted an animation: animate-${m[2]}`)
      assert.match(m[1], /motion-safe:$/, `${f}: an animation is not motion-safe gated: ${m[0]}`)
    }
  }
})

test('the stations: the live one pulses, a station that lights enters once, the label carries the state', () => {
  const live = codeOf('app/request/_live.tsx')
  assert.match(live, /\{current\s+&&\s+\([\s\S]*?motion-safe:animate-pulse-soft/, 'the pulse left the current station')
  assert.match(live, /key=\{done\s+\?\s+'done'\s+:\s+current\s+\?\s+'current'\s+:\s+'next'\}/, 'the dot no longer re-enters when its state changes')
  assert.match(live, /aria-current=\{current\s+\?\s+'step'\s+:\s+undefined\}/, 'the current station is not announced')
  // The word: with motion removed the label still says which one is live.
  assert.match(live, /current \? 'text-ink-900 font-semibold' : 'text-ink-500'/, 'the current label lost its weight')
  // The count re-enters when it changes — the one place a number appearing IS news.
  assert.match(live, /<div\s+key=\{d\.offerCount\}\s+className="motion-safe:animate-fade-in-fast">/)
})

test('a NEW offer enters with slide-in-b; the ones already on screen do not', () => {
  const ol = codeOf('app/request/[ref]/OfferList.tsx')
  assert.match(ol, /const\s+seenAtMount\s+=\s+useRef<Set<string>\s+\|\s+null>\(null\)/, 'the list forgot which offers were there at mount')
  assert.match(ol, /arrived\(o\.id\)\s+\?\s+'motion-safe:animate-slide-in-b'\s+:\s+''/, 'a new offer has no entrance, or an ungated one')
  // …and the list stays mounted across „nothing" → „one", or the first offer
  // could never be told from one that was always there.
  assert.match(ol, /offers\.length === 0[\s\S]{0,120}\{empty\}/, 'the empty state is not inside the list')
  const page = codeOf('app/request/[ref]/page.tsx')
  assert.doesNotMatch(page, /offers\.length === 0 \?\s*\(\s*<div/, 'the page swaps EmptyState for OfferList again')
  assert.match(page, /empty=\{\s*<EmptyState/, 'the page no longer passes the empty state in')
})

test('the keyframe library is a SHORT, deliberate list', () => {
  // ⚠️ THIS TEST WAS „no new keyframes — the library is closed" AND THE LIBRARY
  // REOPENED (2026-08-20). Closing it was a 📌 CURRENT decision, not a 🔒
  // absolute, and the owner reopened it deliberately after the entrance-only
  // home page: „ძალიან მოძველებული დიზაინი … ანიმაციებით გაძეძგე, რაც
  // მოგვცემს პროფესიონალიზმს."
  //
  // So the ratchet changed shape rather than being deleted, because what it
  // was really protecting is still worth protecting: a list SHORT enough that
  // every entrance is picked BY NAME instead of by number. Two were added and
  // both are named here — `auroraB` (the hero's second drifting light) and
  // `marquee` (the service rail). Adding a third is a decision, not a detail:
  // add it to this list with a line saying what it is for.
  const tw = read('tailwind.config.js')
  const start = tw.indexOf('keyframes: {')
  const end = tw.indexOf('\n      },', start)
  assert.ok(start > 0 && end > start, 'the keyframes block moved — update this test')
  const names = [...tw.slice(start, end).matchAll(/^        ([a-zA-Z]+): \{/gm)].map(m => m[1]).sort()
  assert.deepEqual(names, [
    'drawerInR', 'fadeIn', 'fadeOut', 'lineRise', 'pulseSoft', 'riseIn', 'scaleIn', 'scaleOut',
    'shimmer', 'slideInB', 'slideInR', 'slideOutB', 'slideOutR',
  ], 'tailwind.config.js grew or lost a keyframe')
  const css = read('app/globals.css')
  const cssNames = [...css.matchAll(/^@keyframes (\w+)/gm)].map(m => m[1]).sort()
  assert.deepEqual(cssNames, [
    'auroraA', 'auroraB', 'drawerInR', 'fadeIn', 'marquee', 'pulseSoft', 'riseIn', 'scaleIn', 'shimmer',
    'slideInB', 'slideInR',
  ], 'globals.css grew or lost a keyframe — add it to this list with a line saying what it is for')
})

/* ── THE FIRST SECONDS, AND THE ONE DOOR ────────────────────────────────────
 * Two decisions the owner took on 2026-08-19, both of which look like nothing
 * in a screenshot taken one second later.
 */
test('the screen after send never paints a blank while it is searching', () => {
  const live = read('app/request/_live.tsx')
  // The regression this guards is a one-word edit: `if (!d) return null`. It
  // renders correctly, it types correctly, and it puts an empty hole on the
  // exact screen where the client is asking themselves whether their request
  // went anywhere. Owner: „განცდა არ უნდა შევუქმნათ რომ დაიკარგა მისი
  // მონაწერი."
  assert.doesNotMatch(live, /if \(!d\) return null/, 'the pre-status blank is back — see <Searching />')
  assert.match(live, /if \(!d\) return <Searching \/>/, 'the pre-status state must be the searching card')
  assert.match(live, /ვეძებთ შესაფერის ექსპერტებს/, 'the search must be stated in words, not motion alone')
  // A spinner is not a state: the animated element carries a word beside it,
  // so removing motion leaves the screen still saying what is happening.
  assert.match(live, /motion-safe:animate-pulse-soft/, 'the search ring must stay motion-safe gated')
  // …and it must stop claiming a search once the search is over.
  assert.match(live, /d\.notified === 0 && <SearchingLine \/>/, 'the searching line must retire when experts are notified')
})

test('a call is promised only where a call is coming', () => {
  // Auto-verification (app/api/requests → autoVerified) made „დაგირეკავთ" the
  // exception. A promise that holds for the exception and not the rule is one
  // the ordinary client catches us breaking, on their first contact with us.
  const live = read('app/request/_live.tsx')
  assert.match(live, /d\.status === 'NEW'\s*\n\s*\? 'ჯერ გადავამოწმებთ და დაგირეკავთ\.'/,
    'the call promise must be branch-gated on NEW — the status that really waits for an operator')
  for (const p of ['app/request/_stepContact.tsx', 'app/_home/request.tsx']) {
    assert.doesNotMatch(codeOf(p), /დაგირეკავთ/, `${p} still promises a call to every client`)
  }
})

test('the home page opens ONE door', () => {
  // Owner: „იყოს ამ ეტაპზე ექსპერტები მხოლოდ." Both hero buttons landed on the
  // same catalogue, the second merely arriving with a filter pre-ticked — a
  // choice whose branches meet is a pause the visitor pays for, and it restated
  // the very split the product model retired.
  for (const f of ['app/_home/hero.tsx', 'app/_home/request.tsx', 'components/Footer.tsx']) {
    assert.doesNotMatch(codeOf(f), /type=WORK/, `${f} reopened the second door`)
  }
  // ⚠️ THIS USED TO COUNT `<Btn href="/experts">` AND EXPECT EXACTLY ONE.
  // The rule it enforces („one entrance, and it is the catalogue") is unchanged;
  // the control is not. Since the 2026-08-21 redesign the hero’s entrance is a
  // search FORM whose submit pushes /experts — so counting a button spelling
  // would now pass or fail on markup rather than on the rule. Assert the rule:
  // every destination the hero can send somebody to is the catalogue.
  const hero = codeOf('app/_home/hero.tsx')
  // Every ROUTE-shaped string literal the hero contains (comments and imports
  // are already stripped by codeOf). The search field builds its destination in
  // a template literal, so matching on `href=` alone would see nothing.
  const dests = [...hero.matchAll(/[`'"](\/[a-zA-Z0-9\-_/?=&$.{}]*)/g)].map(m => m[1])
  assert.ok(dests.length > 0, 'the hero must offer a way in')
  assert.deepEqual(
    [...new Set(dests.filter(d => !d.startsWith('/experts')))],
    [],
    'the hero opens ONE door and it is the catalogue',
  )
})
