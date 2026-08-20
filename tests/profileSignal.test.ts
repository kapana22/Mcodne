// Unit tests for the expert-facing „is my profile working?" signal.
//
// Run: npx tsx tests/profileSignal.test.ts
//
// Pure unit test (no browser, no dev server, no DB), in the style of
// tests/availability.test.ts and tests/events.test.ts. The three things that
// decide whether the number an expert sees is TRUE all live in pure functions,
// and all three are pinned here:
//
//   1. THE BOT FILTER — a crawler sweeping every profile would hand every
//      expert on the platform the same fake „views" number. The filter errs
//      toward NOT counting (no user-agent at all = automated), because
//      under-reporting is honest and over-reporting is the exact lie this
//      feature exists to avoid. Real browser UAs must survive it.
//   2. THE SELF-VIEW / ADMIN EXCLUSION — an expert reloading their own profile
//      must never move their own counter, and moderation traffic is not demand.
//   3. THE DEDUPE WINDOW — one human visit hits /api/tutors/[id] more than once
//      (profile fetch + booking-sheet self-fetch + reschedule picker), so the
//      first hit counts and repeats inside the window don't.
//   4. THE DIAGNOSIS — the card's whole value is the sentence, so the SELECTION
//      is asserted (by stable key, never by Georgian copy): a blocker the expert
//      can clear outranks any reading of the numbers, „too few views" is never
//      dressed up as a verdict, and zero is never spun as encouragement.
//
// No Math.random(), no Date.now() in an assertion — every case is deterministic
// (firstViewInWindow takes an injectable `now`).

import {
  EVENTS,
  BOT_UA_MARKERS,
  PROFILE_VIEW_DEDUPE_MS,
  isBotUserAgent,
  countsAsProfileView,
  profileViewKey,
  firstViewInWindow,
} from '../lib/events'
import {
  diagnose,
  MIN_SIGNAL_VIEWS,
  RATE_MIN_VIEWS,
  LOW_CONVERSION,
} from '../app/work/_components/ProfileSignal'

/* ───── tiny assert harness (matches tests/ vibe) ───── */

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`✓ ${name}`) }
  else { failed++; console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/* ───── event-name contract (the insights reader queries this literal) ───── */

check('EVENTS.PROFILE_VIEW is exactly "profile_view"',
  EVENTS.PROFILE_VIEW === 'profile_view', EVENTS.PROFILE_VIEW)
check('profile_view is distinct from the search events',
  (EVENTS.PROFILE_VIEW as string) !== (EVENTS.SEARCH as string) &&
  (EVENTS.PROFILE_VIEW as string) !== (EVENTS.SEARCH_ZERO as string))

/* ───── 1. the bot filter ───── */

const REAL_BROWSERS = [
  // Chrome / macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  // Safari / iPhone — the single most common UA on this site
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  // Firefox / Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  // Edge
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  // Samsung Internet / Android
  'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
]
for (const ua of REAL_BROWSERS) {
  check(`bot filter: a real browser is NOT a bot — ${ua.slice(0, 34)}…`, isBotUserAgent(ua) === false, ua)
}

const KNOWN_BOTS = [
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
  'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36',
  'curl/8.4.0',
  'Wget/1.21.4',
  'python-requests/2.32.3',
  'axios/1.7.2',
  'okhttp/4.12.0',
  'Go-http-client/2.0',
  'node-fetch/1.0 (+https://github.com/bitinn/node-fetch)',
  'PostmanRuntime/7.39.0',
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'Mozilla/5.0 (compatible; TelegramBot; like TwitterBot)',
]
for (const ua of KNOWN_BOTS) {
  check(`bot filter: automated client is caught — ${ua.slice(0, 30)}…`, isBotUserAgent(ua) === true, ua)
}

check('bot filter: NO user-agent at all counts as automated (every browser sends one)',
  isBotUserAgent(null) && isBotUserAgent(undefined) && isBotUserAgent('') && isBotUserAgent('   '))
check('bot filter: a non-string user-agent counts as automated',
  isBotUserAgent(42 as unknown) && isBotUserAgent({} as unknown))
check('bot filter: matching is case-insensitive',
  isBotUserAgent('GoogleBot/2.1') && isBotUserAgent('CURL/8.4.0'))
check('bot filter: the deny-list is SHORT (a list, not a detection framework)',
  BOT_UA_MARKERS.length <= 30, String(BOT_UA_MARKERS.length))
check('bot filter: every marker is lowercase (matching lowercases the UA once)',
  BOT_UA_MARKERS.every(m => m === m.toLowerCase()))

/* ───── 2. self-view / ADMIN exclusion ───── */

const HUMAN = REAL_BROWSERS[0]

check('counts: an anonymous human viewer counts',
  countsAsProfileView({ userAgent: HUMAN, viewerUserId: null, viewerRole: null, tutorUserId: 'u_expert' }) === true)
check('counts: a signed-in STUDENT counts',
  countsAsProfileView({ userAgent: HUMAN, viewerUserId: 'u_student', viewerRole: 'STUDENT', tutorUserId: 'u_expert' }) === true)
check('counts: ANOTHER expert looking at this profile counts (it is still a real view)',
  countsAsProfileView({ userAgent: HUMAN, viewerUserId: 'u_other', viewerRole: 'TUTOR', tutorUserId: 'u_expert' }) === true)

check('counts: the expert viewing their OWN profile does NOT count',
  countsAsProfileView({ userAgent: HUMAN, viewerUserId: 'u_expert', viewerRole: 'TUTOR', tutorUserId: 'u_expert' }) === false)
check('counts: ADMIN does NOT count (moderation traffic is not demand)',
  countsAsProfileView({ userAgent: HUMAN, viewerUserId: 'u_admin', viewerRole: 'ADMIN', tutorUserId: 'u_expert' }) === false)
check('counts: a bot does NOT count even when signed in',
  countsAsProfileView({ userAgent: 'Googlebot/2.1', viewerUserId: 'u_student', viewerRole: 'STUDENT', tutorUserId: 'u_expert' }) === false)
check('counts: a missing user-agent does NOT count',
  countsAsProfileView({ userAgent: null, viewerUserId: null, viewerRole: null, tutorUserId: 'u_expert' }) === false)
check('counts: self-view exclusion needs BOTH ids — a null tutorUserId cannot silently match a null viewer',
  countsAsProfileView({ userAgent: HUMAN, viewerUserId: null, viewerRole: null, tutorUserId: null }) === true)

/* ───── 3. the dedupe window ───── */

check('key: same viewer + same expert → same key',
  profileViewKey('t1', 'u1', '1.2.3.4', HUMAN) === profileViewKey('t1', 'u1', '9.9.9.9', 'other-ua'),
  'a signed-in viewer keys on their user id, not their device')
check('key: same viewer, DIFFERENT expert → different key (one visit per expert)',
  profileViewKey('t1', 'u1', '1.2.3.4', HUMAN) !== profileViewKey('t2', 'u1', '1.2.3.4', HUMAN))
check('key: two anonymous viewers on different ips → different keys',
  profileViewKey('t1', null, '1.2.3.4', HUMAN) !== profileViewKey('t1', null, '5.6.7.8', HUMAN))
check('key: an anonymous viewer is never confused with a signed-in one',
  profileViewKey('t1', null, '1.2.3.4', HUMAN) !== profileViewKey('t1', 'u1', '1.2.3.4', HUMAN))
check('key: the key is a hash — no raw ip or user-agent survives in it',
  (() => {
    const k = profileViewKey('t1', null, '1.2.3.4', HUMAN)
    return !k.includes('1.2.3.4') && !k.includes('Mozilla') && /^[0-9a-f]{32}$/.test(k)
  })())

{
  const t0 = 1_800_000_000_000
  const k = profileViewKey('t_dedupe', 'u_dedupe', '1.1.1.1', HUMAN)
  check('dedupe: the FIRST hit of a visit counts', firstViewInWindow(k, t0) === true)
  check('dedupe: the booking sheet self-fetching 2s later does NOT count again',
    firstViewInWindow(k, t0 + 2_000) === false)
  check('dedupe: still one visit at the far edge of the window',
    firstViewInWindow(k, t0 + PROFILE_VIEW_DEDUPE_MS - 1) === false)
  check('dedupe: a return visit AFTER the window is a new view',
    firstViewInWindow(k, t0 + PROFILE_VIEW_DEDUPE_MS) === true)

  const other = profileViewKey('t_dedupe', 'u_other', '1.1.1.1', HUMAN)
  check('dedupe: a different viewer in the same window is NOT suppressed',
    firstViewInWindow(other, t0 + 2_000) === true)
  check('dedupe: the window is per-expert, not global',
    firstViewInWindow(profileViewKey('t_other', 'u_dedupe', '1.1.1.1', HUMAN), t0 + 2_000) === true)
  check('dedupe: the window is a sane length (long enough for one visit, short enough for a return)',
    PROFILE_VIEW_DEDUPE_MS >= 5 * 60_000 && PROFILE_VIEW_DEDUPE_MS <= 6 * 3_600_000,
    String(PROFILE_VIEW_DEDUPE_MS))
}

/* ───── 4. the diagnosis sentence ───── */

const d = (views: number, bookings: number, freeMinutes: number | null = 600, days = 7) =>
  diagnose({ days, views, bookings, freeMinutes })

// A blocker the expert can clear outranks every reading of the numbers: with no
// bookable time, a perfect profile still converts nobody, so „fix your bio" would
// be actively wrong advice.
check('diagnosis: 0 views + 0 free time → the TIME is the problem',
  d(0, 0, 0).key === 'no-time-no-views')
check('diagnosis: views but 0 free time → still the TIME, not the profile',
  d(40, 0, 0).key === 'no-time')
check('diagnosis: the no-time verdicts point at the schedule, not the profile',
  d(0, 0, 0).cta?.href === '/work/schedule' && d(40, 0, 0).cta?.href === '/work/schedule')

check('diagnosis: 0 views (with free time) → a VISIBILITY problem',
  d(0, 0).key === 'no-views')
check('diagnosis: the 0-view verdict points at the profile screen that fixes it',
  d(0, 0).cta?.href === '/work/profile')
check('diagnosis: the 0-view verdict states the zero plainly and invents no demand',
  (() => {
    const t = d(0, 0).text
    return t.includes('არავის უნახავს') && !/ბევრ|მალე|დაელოდ/.test(t)
  })(), d(0, 0).text)

check('diagnosis: a handful of views is NOT dressed up as a verdict',
  d(MIN_SIGNAL_VIEWS - 1, 0).key === 'too-few')
check('diagnosis: at MIN_SIGNAL_VIEWS the persuasion reading turns on',
  d(MIN_SIGNAL_VIEWS, 0).key === 'no-bookings')
check('diagnosis: many views + no bookings → a PERSUASION problem, aimed at the profile',
  d(120, 0).key === 'no-bookings' && d(120, 0).cta?.href === '/work/profile')

check('diagnosis: a low rate on enough views → persuasion, aimed at the profile',
  d(RATE_MIN_VIEWS * 5, 1).key === 'low-rate' && d(RATE_MIN_VIEWS * 5, 1).cta?.href === '/work/profile')
check('diagnosis: the same low rate on too few views is NOT called low',
  d(RATE_MIN_VIEWS - 1, 1).key === 'working')
check('diagnosis: LOW_CONVERSION is the boundary — exactly at it is not "low"',
  (() => {
    const views = 100, bookings = Math.round(views * LOW_CONVERSION) // 5% of 100
    return bookings / views >= LOW_CONVERSION && d(views, bookings).key === 'working'
  })())

check('diagnosis: a healthy rate reads as working',
  d(50, 6).key === 'working')
check('diagnosis: more bookings than views is reported as repeat clients, never as >100%',
  (() => {
    const v = d(3, 9)
    return v.key === 'repeat' && !v.text.includes('%')
  })(), d(3, 9).text)
check('diagnosis: equal bookings and views is also the repeat case (100% would be a coincidence, not a rate)',
  d(4, 4).key === 'repeat')

check('diagnosis: unknown free time (null) never fires a no-time verdict',
  d(0, 0, null).key === 'no-views' && d(40, 0, null).key === 'no-bookings')
check('diagnosis: the window length is spoken in the sentence, not just in the toggle',
  diagnose({ days: 30, views: 0, bookings: 0, freeMinutes: 600 }).text.includes('30 დღეში'))
check('diagnosis: every verdict has non-empty text',
  ([d(0, 0, 0), d(9, 0, 0), d(0, 0), d(2, 0), d(60, 0), d(200, 1), d(3, 9), d(50, 6)] as const)
    .every(v => v.text.trim().length > 20))
check('diagnosis: every percentage printed is a real one (0 < pct < 100)',
  (() => {
    for (const [v, b] of [[50, 6], [200, 1], [100, 5]] as const) {
      const m = d(v, b).text.match(/(\d+)%/)
      if (!m) return false
      const p = Number(m[1])
      if (!(p > 0 && p < 100)) return false
      if (p !== Math.round((b / v) * 100)) return false
    }
    return true
  })())

/* ───── summary ───── */

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
