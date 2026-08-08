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

import { readFileSync, readdirSync } from 'fs'
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
    // REWRITTEN 2026-07-27. The original guard required the hero to RENDER a
    // derived next-availability line (`fmtNextShort`). That preview was removed
    // by product decision on 2026-07-21 — a slot-less expert is now routed to
    // „მიწერე ექსპერტს" instead of being advertised with a time. What still
    // matters is the thing the guard was really protecting: no FAKE availability.
    'C2: home hero never advertises a hardcoded availability promise',
    !home.includes("next: 'დაჯავშნით'") && !/ხელმისაწვდომია\s+ახლავე/.test(home),
    'A static "available now" string next to a real expert is a fabricated claim.',
  )
}

// ── D. price filter stays a min-floor ────────────────────────────────────────
{
  // The filter UI (PRICE_OPTS etc.) moved to client.tsx when /tutors was split
  // into a server page.tsx (SSR seed) + client.tsx (interactive list).
  const tutors = read('app/tutors/client.tsx')
  check(
    // REWRITTEN 2026-07-27. The original guard banned RANGE labels because the
    // apply logic only read price[0], so „₾50–100" lied. The filter is now a
    // real two-bound range (dual-handle slider + NO_CAP sentinel), so ranges are
    // correct — what must hold instead is that BOTH bounds are actually applied.
    'D: /tutors price filter applies both bounds, not just the floor',
    tutors.includes('filters.price[1]') && tutors.includes('NO_CAP'),
    'Reading only price[0] makes the upper bound decorative — the label would promise a cap the list ignores.',
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
  // Interactive profile moved to client.tsx (page.tsx is now the thin SEO/SSR
  // server wrapper — Phase 0.6 split).
  const page = read('app/tutors/[id]/client.tsx')
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
  // BOTH inboxes became two-pane centers whose list is the SHARED
  // components/chat/ConversationList (was app/tutor/messages/_components/…),
  // rendered from the layout. app/student/messages/page.tsx is now just the
  // desktop "pick a conversation" placeholder, so the old per-page sort
  // assertion can never hold — the substance moved to the API + shared list,
  // and both halves are still asserted below.
  const tList = read('components/chat/ConversationList.tsx')
  check(
    'H3: inboxes sort by last-message time, not booking.updatedAt',
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
  // Both panes are split across `_*.tsx` files beside their page.tsx (the
  // student pane's <BookingChat> now sits in _body.tsx), so read the whole
  // route directory — the invariant is about the pane, not about one file.
  const readDir = (d: string) => readdirSync(join(root, d))
    .filter(f => f.endsWith('.tsx'))
    .sort()
    .map(f => read(join(d, f)))
    .join('\n')
  const sPane = readDir('app/student/bookings/[id]')
  const tPane = readDir('app/tutor/bookings/[id]')
  const hook = read('components/chat/useBookingThread.ts')
  check(
    // REWRITTEN 2026-07-27. Both guards used to assert that the STUDENT pane
    // carried its own local copy of the polling + optimistic-append logic. That
    // duplication is gone: both panes now render the shared <BookingChat>, and
    // the behavior lives once in useBookingThread. Guard the unified shape —
    // asserting the old per-pane copies would push the duplication back.
    'H5: both chat panes use the shared thread, which polls while visible',
    sPane.includes('BookingChat') &&
      tPane.includes('BookingChat') &&
      hook.includes('/api/messages?bookingId='),
    'Without polling, incoming messages only appeared on a full page reload.',
  )
  check(
    'H6: the shared thread appends optimistically and reconciles tmp- ids',
    hook.includes("`tmp-${Date.now()}`") && hook.includes('upsert'),
    'Waiting for the POST (seconds on remote DB) before showing your own bubble feels broken; without id reconcile the bubble duplicates.',
  )
}

// ── I. admin cannot be demoted to TUTOR via the application flow ─────────────
// A production incident: admin@mcodne.ge visited /apply (guard allowed ADMIN),
// submitted an application, approved it, and the approve route blindly set
// role='TUTOR' — demoting the only admin and locking everyone out of /admin.
{
  const applyLayout = read('app/apply/layout.tsx')
  check(
    'I: /apply layout admits STUDENT only (never ADMIN)',
    /requireRole\(\[\s*'STUDENT'\s*\]\)/.test(applyLayout) && !/'ADMIN'/.test(applyLayout),
    'An ADMIN reaching /apply can submit an application that, once approved, demotes them out of ADMIN.',
  )
  const submit = read('app/api/applications/route.ts')
  check(
    'I2: application submit rejects non-students',
    submit.includes("role !== 'STUDENT'") && submit.includes('ONLY_STUDENTS_CAN_APPLY'),
    'Only a STUDENT may apply — an ADMIN/TUTOR submission is a role-integrity hazard.',
  )
  const approve = read('app/api/applications/[id]/route.ts')
  check(
    'I3: application approve never promotes a non-student (no admin demotion)',
    approve.includes("app.user.role !== 'STUDENT'") && approve.includes('CANNOT_PROMOTE_ADMIN'),
    'Approve sets role=TUTOR; without a STUDENT-only guard it demotes an admin who applied.',
  )
}

// ── J. impersonation swaps the session cookie exactly once ───────────────────
// destroySession()+createSession() chained emits delete+set for the same cookie
// in one response; browsers can apply them out of order, intermittently landing
// the impersonated session on the wrong/empty identity. replaceSession writes once.
{
  const start = read('app/api/admin/impersonate/[userId]/route.ts')
  const exit = read('app/api/admin/impersonate/exit/route.ts')
  check(
    'J: impersonate start/exit use replaceSession (no delete+set cookie race)',
    start.includes('replaceSession') && !start.includes('destroySession') &&
      exit.includes('replaceSession'),
    'Chaining destroySession()+createSession() races the Set-Cookie ordering — use replaceSession.',
  )
  const me = read('app/api/me/route.ts')
  check(
    'J2: /api/me is no-store so the header never shows a stale role',
    me.includes("dynamic = 'force-dynamic'") && me.includes('no-store'),
    'A cached /api/me keeps the top bar showing the previous role after an impersonation swap.',
  )
}

// ── K. „გახდი ექსპერტი" is present in BOTH chromes, gated on the REAL role ───
// Reported 2026-08-07: a signed-in student sees the apply CTA as a top-level
// nav item on every public page, then walks into /student and it is gone — it
// survived only one click deep, inside the avatar dropdown. Two halves, and
// each half is a separate way to break it:
//   · presence — the workspace sidebar must carry the same door as the public
//     nav, or the CTA "disappears" exactly where a student spends their time;
//   · gating   — the student shell hardcodes role="STUDENT" on its chrome, but
//     /student also admits a TUTOR using their client side. An ungated item
//     there invites an approved expert to become one: the 2026-07-22 bug.
{
  const publicNav = read('components/PublicTopBar.tsx')
  check(
    'K: the public nav still carries /apply, gated by showApplyCta',
    publicNav.includes("href: '/apply'") && publicNav.includes('showApplyCta'),
    'The public nav is the reference surface — if the item leaves it, the two chromes have diverged again.',
  )
  const navConfig = read('components/student/navConfig.ts')
  const sidebar = read('components/student/StudentSidebar.tsx')
  check(
    'K2: the student workspace sidebar carries the same /apply door',
    navConfig.includes("href: '/apply'") && sidebar.includes('APPLY_LINK'),
    'Without it the CTA vanishes the moment a student enters their own workspace — the reported bug.',
  )
  check(
    'K3: the sidebar item is wrapped in <ApplyCtaGate> (real role, not the shell prop)',
    /<ApplyCtaGate>[\s\S]{0,200}APPLY_LINK/.test(sidebar) && sidebar.includes('ApplyCtaGate'),
    'The shell passes a hardcoded role="STUDENT"; only useMe knows the viewer is really a TUTOR.',
  )
  const gate = read('components/ApplyCtaGate.tsx')
  check(
    'K4: ApplyCtaGate reads the role from useMe, never from a prop',
    gate.includes('useMe()') && gate.includes('showApplyCta'),
    'A gate that trusts a caller-supplied role is not a gate — the caller is what was wrong.',
  )
  // Still reachable from the account menu too (traced from a real 2026-07-29
  // signup who never found /apply); the sidebar adds a visible path, it does
  // not replace this one.
  const menu = read('components/UserMenu.tsx')
  check(
    'K5: the account menu keeps its own gated /apply item',
    menu.includes("href: '/apply'") && menu.includes('showApplyCta(role)'),
    'On mobile the avatar menu is the ONLY path — the sidebar is desktop-only (hidden lg:flex).',
  )
}

// ── L. the public header must look the same on every public page ────────────
// Reported 2026-08-07: „the whole menu changes on the expert page." Two causes,
// both of them the header being told about the page instead of reading it:
//   L1 — the ACTIVE item was a hand-threaded `activeHref` prop that exactly two
//        surfaces ever passed (/tutors, /apply). So „ექსპერტები" was lit on the
//        browse list and went dark the instant you opened an expert, and every
//        marketing page lit nothing while you stood on it.
//   L2 — home rendered <PublicTopBar/> with no `initialUser`, so it fell back
//        to the client probe: a signed-in TUTOR saw „გახდი ექსპერტი" paint and
//        then vanish once /api/me landed, on the busiest page on the site.
{
  const bar = read('components/PublicTopBar.tsx')
  check(
    'L1: the active nav item is DERIVED from usePathname, not passed in',
    bar.includes('usePathname()') && /const isActive = \(href: string\)/.test(bar) &&
      !/const active = activeHref === item\.href/.test(bar),
    'A per-page prop means every new page can forget it — and 12 of 14 already had.',
  )
  check(
    'L1b: a detail route stays lit under its section (/tutors/[id] → ექსპერტები)',
    bar.includes("activePath.startsWith(href + '/')"),
    'Exact-match only is what made the highlight disappear when you opened an expert.',
  )
  const home = read('app/page.tsx')
  const homeClient = read('app/HomeClient.tsx')
  check(
    'L2: home resolves the viewer server-side and hands it to the header',
    home.includes('getCurrentUser()') && home.includes('initialUser={initialUser}') &&
      homeClient.includes('<PublicTopBar initialUser={initialUser} />'),
    'Without it the header rearranges after hydration for any signed-in expert.',
  )
  check(
    'L2b: home stays force-dynamic (what makes the server-side session free)',
    /export const dynamic = 'force-dynamic'/.test(home),
    'If home ever goes static, getCurrentUser() there becomes a build-time error, not a header fix.',
  )
  // L3 — reported AGAIN 2026-08-08, same sentence, third cause: /tutors swapped
  // the whole bar for the workspace shell when the viewer was a STUDENT. The
  // items themselves changed (მთავარი · ჯავშნები · მიმოწერა), and opening an
  // expert from that list swapped them back. A public page renders the public
  // header for every viewer — the role belongs in the Logo target and UserMenu,
  // which this header already carries, not in which sections exist.
  const browse = read('app/tutors/client.tsx')
  check(
    'L3: browse renders the PUBLIC header for every viewer, role included',
    browse.includes('<PublicTopBar initialUser={initialUser} />') &&
      !browse.includes('StudentAppBar'),
    'A per-role header means the menu changes under the reader mid-journey.',
  )
  check(
    'L3b: browse does not re-introduce the activeHref prop',
    !/activeHref=/.test(browse),
    'Passing it is what made the highlight go dark the moment you opened an expert (L1).',
  )
}

if (failures > 0) {
  console.error(`\n${failures} regression guard(s) FAILED`)
  process.exit(1)
}
console.log('\nAll regression guards passed.')
