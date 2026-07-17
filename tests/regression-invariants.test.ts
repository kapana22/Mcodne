// Static regression guards for the 2026-07-17 war-room fixes.
//
// Run: npx tsx tests/regression-invariants.test.ts
//
// Pure source-level invariants — no browser, no dev server, no DB. Each guard
// pins a bug that actually shipped and was expensive to re-find:
//
//   A. Booking modal rendered 2600px tall with its buttons off-screen because
//      the AppShell page wrapper's fadeIn animation left a `transform` on the
//      element (fill-mode both) — a transformed ancestor becomes the containing
//      block for position:fixed descendants. fadeIn must stay opacity-only.
//   B. API routes used requireUser() (page-oriented redirect()) — anonymous
//      fetches got a 307 → /signin HTML with 200, so client res.json() threw
//      an uncaught "Unexpected token '<'". API routes must never import it.
//   C. Home hero/cards hardcoded "/ 60 წთ" while the detail page showed the
//      real consultationDurationMin (30) — a search→detail price/duration lie.
//   D. The /tutors price filter is a MIN-FLOOR (apply logic: t.price < min) —
//      range-style options silently ignored the upper bound and made the
//      default state render as an active filter.
//   E. /api/tutors/[id] must fan out its relation queries with Promise.all —
//      sequential nested includes cost ~10 × 300ms on the remote DB proxy.
//   F. The expert detail page must keep a real error state with a retry
//      button — a failed fetch used to strand users on an infinite skeleton.
//   G. POST /api/bookings must keep notify() out of the response path (after)
//      and its independent pre-checks parallel.

import { readFileSync } from 'fs'
import { join } from 'path'

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

// ── A. fadeIn keyframes must be opacity-only ─────────────────────────────────
{
  const tw = read('tailwind.config.js')
  const m = tw.match(/fadeIn:\s*{[\s\S]*?},/)
  check(
    'A: tailwind fadeIn keyframes contain no transform',
    !!m && !/transform/.test(m[0]),
    'fadeIn is applied by AppShell to the wrapper around EVERY page; any transform (even the identity end state) breaks position:fixed for all modals/drawers/bars.',
  )
}

// ── B. no requireUser() inside app/api ───────────────────────────────────────
{
  const { execSync } = require('child_process')
  let hits = ''
  try {
    // Match actual imports only — comments may legitimately mention the name
    // while explaining why it must not be used.
    hits = execSync(`grep -rlE "import[^;]*\\brequireUser\\b" "${join(root, 'app/api')}"`, { encoding: 'utf8' })
  } catch {
    /* grep exits 1 on zero matches — that is the passing case */
  }
  check(
    'B: no app/api route imports requireUser (redirect-based)',
    hits.trim() === '',
    `API routes must use getCurrentUser() + 401 JSON. Offenders:\n    ${hits.trim().split('\n').join('\n    ')}`,
  )
}

// ── C. no hardcoded 60-minute price labels on the home page ──────────────────
{
  const home = read('app/page.tsx')
  check(
    'C: app/page.tsx has no hardcoded "60 წთ" price label',
    !home.includes('60 წთ'),
    'Duration must come from consultationDurationMin (Expert.durationMin) — the detail page shows the real value and the surfaces must agree.',
  )
  check(
    'C2: home hero next-availability is derived, not a static placeholder',
    home.includes('fmtNextShort') && !home.includes("next: 'დაჯავშნით'"),
    'Expert.next must format t.nextSlotAt (fmtNextShort), never a hardcoded string.',
  )
}

// ── D. price filter stays a min-floor ────────────────────────────────────────
{
  const tutors = read('app/tutors/page.tsx')
  check(
    'D: /tutors PRICE_OPTS are min-floors ("₾N-დან"), not ranges',
    tutors.includes('-დან') && !/₾40\s*–\s*₾80/.test(tutors),
    'The filter apply logic only reads price[0] (t.price < min); range labels lie and the default state renders as active.',
  )
}

// ── E. detail API keeps parallel fan-out ─────────────────────────────────────
{
  const api = read('app/api/tutors/[id]/route.ts')
  check(
    'E: /api/tutors/[id] uses Promise.all for relation queries',
    api.includes('Promise.all'),
    'Sequential nested includes cost ~10 round-trips on the remote DB proxy (~3s per request).',
  )
}

// ── F. detail page keeps its error + retry state ─────────────────────────────
{
  const page = read('app/tutors/[id]/page.tsx')
  check(
    'F: expert profile has a dedicated error state with retry',
    page.includes("loadState === 'error'") && page.includes('სცადე თავიდან'),
    'A failed fetch must never strand the user on an infinite skeleton.',
  )
}

// ── G. booking POST keeps notify out of the response path ────────────────────
{
  const api = read('app/api/bookings/route.ts')
  check(
    'G: POST /api/bookings defers notify() via after()',
    /after\(\s*async/.test(api),
    'notify() costs two extra DB round-trips; the student must not wait on them.',
  )
  check(
    'G2: POST /api/bookings runs independent pre-checks in Promise.all',
    api.includes('Promise.all'),
    'tutor fetch / consultation fetch / covering-slot probe are independent and must fan out.',
  )
}

// ── H. chat system invariants (2026-07-17 fixes) ─────────────────────────────
{
  const api = read('app/api/messages/route.ts')
  check(
    'H: GET /api/messages?bookingId stamps read receipts',
    api.includes('readAt: null') && api.includes('readAt: new Date()'),
    'readAt was NEVER written before — threads stayed "unread" forever.',
  )
  check(
    'H2: POST /api/messages defers notify via after()',
    /after\(\s*async/.test(api),
    'notify + markRelatedRead cost 3 round-trips the sender must not wait on.',
  )
  const sInbox = read('app/student/messages/page.tsx')
  // The tutor inbox moved to the two-pane messages center: the API computes
  // `at` from the last message and ConversationList sorts on it.
  const tList = read('app/tutor/messages/_components/ConversationList.tsx')
  check(
    'H3: inboxes sort by last-message time, not booking.updatedAt',
    sInbox.includes('messages[0]?.createdAt.getTime') &&
      api.includes('at: (last?.createdAt') &&
      tList.includes('new Date(z.at).getTime() - new Date(a.at).getTime()'),
    'booking.updatedAt is not bumped by messages — sorting on it buries fresh threads.',
  )
  check(
    'H4: tutor inbox has no pravatar stock-face fallback',
    // Match the actual URL, not the word — comments may mention it.
    !read('app/tutor/messages/page.tsx').includes('i.pravatar.cc') && !tList.includes('i.pravatar.cc'),
    'A random stock face next to a real client name reads as a fake identity.',
  )
  // The tutor pane now renders the shared <BookingChat>, whose polling and
  // optimistic append live in the useBookingThread hook — guard the hook plus
  // the import, and the student pane's still-local implementation.
  const sPane = read('app/student/bookings/[id]/page.tsx')
  const tPane = read('app/tutor/bookings/[id]/page.tsx')
  const hook = read('components/chat/useBookingThread.ts')
  check(
    'H5: both chat panes poll the thread while visible',
    sPane.includes('/api/messages?bookingId=') &&
      hook.includes('/api/messages?bookingId=') &&
      tPane.includes('BookingChat'),
    'Without polling, incoming messages only appeared on a full page reload.',
  )
  check(
    'H6: both chat panes append optimistically (tmp- reconcile)',
    sPane.includes("`tmp-${Date.now()}`") && hook.includes("`tmp-${Date.now()}`"),
    'Waiting for the POST (seconds on remote DB) before showing your own bubble feels broken.',
  )
}

if (failures > 0) {
  console.error(`\n${failures} regression guard(s) FAILED`)
  process.exit(1)
}
console.log('\nAll regression guards passed.')
