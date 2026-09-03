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

import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
/** The same file with comments removed. Use it whenever a check asks whether
 *  the CODE says something — a guard that greps the raw text also matches the
 *  comment explaining why the code no longer does it, which is how K2a failed
 *  the moment the fix it protects was written down beside it. */
const codeOf = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')

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
  const tutors = read('app/experts/client.tsx')
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

// ── E. the profile keeps its parallel fan-out ────────────────────────────────
{
  // ⚠️ IT WAS `app/api/tutors/[id]/route.ts` UNTIL 2026-08-24. That route was
  // the consultation profile's client-side fetch and went with the product; the
  // provider profile is server-rendered from the model below. The RULE is the
  // one that mattered and it is unchanged — a round trip to the Railway proxy
  // measures ~260ms, so queries that do not depend on each other must go out
  // together or the page quietly costs a second it did not have to.
  const model = read('app/experts/[slug]/_providerData.ts')
  check(
    'E: the provider profile fans its follow-up queries out in parallel',
    model.includes('await Promise.all(['),
    'Sequential follow-up queries pay the ~260ms proxy round trip once per query, for nothing.',
  )
}

/* ⚠️ „F: expert profile has a dedicated error state with retry" WAS HERE AND IS
   GONE (2026-08-24). It pinned `app/experts/[slug]/client.tsx` — the interactive
   consultation profile, which fetched itself from the browser and therefore had
   a fetch that could fail and strand the reader on an infinite skeleton.

   The provider profile is a SERVER component now: there is no client fetch, so
   there is no error state to keep. What answers the same question is `notFound()`
   in page.tsx — a real 404 rather than a blank page — and that is pinned by
   tests/offerLifecycle §E and by the resolver's own tests. The rule the check
   encoded still holds anywhere a page fetches itself: a failed fetch must never
   strand the user on an infinite skeleton. */

/* ⚠️ BLOCKS G AND H WERE HERE AND ARE GONE (2026-08-24) — nine checks over
   `app/api/bookings/route.ts`, `app/api/messages/route.ts` and
   `components/chat/useBookingThread.ts`. All three files went with the
   consultation product, along with the two booking chat panes they served.

   Four of the rules they encoded are not about bookings at all, and the
   surfaces that inherited the behaviour are held to them elsewhere:

     · a POST defers notify() into after(), so the person who pressed the button
       never waits on the two extra round trips it costs — the offer routes do
       this and tests/offerLifecycle pins it;
     · independent pre-checks fan out in Promise.all rather than paying the
       ~260ms proxy round trip once each — block E above now pins this on the
       provider profile;
     · an inbox sorts by LAST MESSAGE time, never by the parent row's
       updatedAt: a parent is not bumped when a message arrives, so sorting on
       it buries the freshest thread. `lib/inboxRows → InboxRow.lastAt` is the
       field, and components/chat/ConversationList still sorts on it — checked
       just below, because that file survived;
     · a thread appends the sender's own bubble optimistically and reconciles
       the temporary id, because waiting seconds for the POST reads as broken.

   And one is a rule about people rather than mechanics, so it is written out
   here even though nothing renders it today: NO STOCK FACES. A random
   `i.pravatar.cc` portrait beside a real client's name reads as a fake
   identity — of that person, to that person. If an avatar is missing, draw the
   placeholder. */

// ── H3. the one inbox still sorts on the message, not the parent row ─────────
{
  const tList = read('components/chat/ConversationList.tsx')
  check(
    'H3: the inbox sorts by last-message time',
    tList.includes('new Date(z.lastAt).getTime() - new Date(a.lastAt).getTime()'),
    'A parent row is not bumped by a message — sorting on it buries fresh threads.',
  )
  check(
    'H4: the inbox has no pravatar stock-face fallback',
    // Match the actual URL, not the word — comments may mention it.
    !tList.includes('i.pravatar.cc'),
    'A random stock face next to a real client name reads as a fake identity.',
  )
}

// ── I. admin cannot be demoted to TUTOR via the application flow ─────────────
// A production incident: admin@mcodne.ge visited /apply (guard allowed ADMIN),
// submitted an application, approved it, and the approve route blindly set
// role='TUTOR' — demoting the only admin and locking everyone out of /admin.
// /apply became /join (2026-08-19); the door's page is where the role check
// lives now, and it must send an ADMIN away before any form is drawn.
{
  const joinPage = read('app/join/page.tsx')
  check(
    'I: /join sends an ADMIN to /admin before either form is drawn',
    /user\.role === ROLE\.ADMIN\) redirect\('\/admin'\)/.test(joinPage) &&
      joinPage.indexOf("redirect('/admin')") < joinPage.indexOf('<JoinClient'),
    'An ADMIN reaching /join can submit an application that, once approved, demotes them out of ADMIN.',
  )
  // ⚠️ I2 AND I3 ARE ONE CHECK NOW, AND A STRONGER ONE (2026-08-24). They used
  // to pin two guards on the consultation application — „only a STUDENT may
  // apply" on submit, „never promote a non-student" on approve — because that
  // approval wrote `role = 'TUTOR'` directly onto the applicant, and an admin
  // who applied was demoted out of ADMIN by their own approval.
  //
  // The surviving approval does not write a role AT ALL. It grants a
  // `RequestAccess` row and creates a `ServiceProfile`; being a provider is
  // something you HOLD, not something your role says. So the incident is not
  // guarded against, it is unrepresentable — and what has to stay true is
  // exactly that: no role write in the approval path.
  const approve = read('app/api/provider-applications/[id]/route.ts')
  check(
    'I2: approving an application never writes User.role',
    !/\brole:\s*'(ADMIN|PROVIDER|USER)'/.test(approve) && !/user\.update\(/.test(approve),
    'A role write here is the admin-demotion incident again: the only admin approves their own application and loses /admin.',
  )
  check(
    'I3: the grant is a RequestAccess row, and it is claimed inside the transaction',
    approve.includes('tx.requestAccess.upsert') && approve.includes("status: { not: 'APPROVED' }"),
    'Two admins approving at the same moment must not produce two grants.',
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
  // ⚠️ THE DESTINATION MOVED, THE INVARIANT DID NOT (2026-08-18). This asserted
  // the literal '/apply', and the join door now points at '/signup' — because
  // /apply IS the expert application and a tradesperson tapping the site's only
  // join item landed in the wrong form with no way onward. What §K actually
  // protects is PRESENCE in both chromes and GATING on the real role, and both
  // still hold. It is asserted through `JOIN_HREF` now, which is stronger than
  // the old literal: the two chromes can no longer name different destinations.
  //
  // ⚠️ THE ITEM LEFT THE BAR, THE DOOR DID NOT (stage 9, 2026-08-19). The
  // header names the two verticals and one action now; the join door in the
  // public chrome is (a) „დაარეგისტრირე სერვისი" → JOIN_DOOR_HREF, rendered by
  // PublicTopBar itself and gated by showJoinInvite — which is TRUE for a guest
  // (tests/join.test.ts asserts that pair directly), and (b) for a signed-in
  // person the UserMenu's /join item, which PublicTopBar also renders and K5
  // below pins as gated on the same rule.
  //
  // ⚠️ IT USED TO ASSERT `href={JOIN_HREF}` — the guest's „დაწყება" button —
  // and that button is GONE (2026-08-31). Owner: „დაწყება წაშალე და შესვლაზე
  // გადმოიტანე, ერთი და იგივეს აკეთებს." It did: /signup and /signin render one
  // component (app/signup → app/signin/auth-client, only `defaultView` differs),
  // so the bar had two buttons onto one screen. The old assertion would now fail
  // for a change that removed a DUPLICATE, not a door — and the door it was
  // written to protect is still in the bar under its own name. Presence in both
  // chromes and gating on the real fact are what these lines have always meant,
  // and both still hold; only the element carrying them is named differently.
  check(
    'K: the public header still carries the join door (JOIN_DOOR_HREF, gated; signed-in → the UserMenu item)',
    publicNav.includes('href={JOIN_DOOR_HREF}') && publicNav.includes('<UserMenu'),
    'The public header is the reference surface — if the door leaves it, the two chromes have diverged again.',
  )
  // ⚠️ AND A GUEST IS NEVER STRANDED WITHOUT AN ACCOUNT DOOR. Removing
  // „დაწყება" left ONE auth control in the bar, so it has to be reachable at
  // every width — it was `hidden md:` while the phone's filled button was the
  // other one — and the screen behind it has to offer registration, or the site
  // lost signup from its chrome.
  check(
    'K0b: the guest auth door is in the bar at every width, and it opens a screen that can register',
    /href="\/signin"\n\s+className="tap-shrink h-11/.test(publicNav)
      && !/hidden md:inline-flex[^"]*"\s*>\s*შესვლა/.test(publicNav)
      && read('app/signin/_signin.tsx').includes("setView('signup')"),
    'The one remaining auth button is hidden on phones, or the page behind it no longer offers registration.',
  )
  // ⚠️ K0 IS ABOUT THE GUEST'S DOOR ONLY (2026-08-21). `JOIN_HREF` is /signup
  // because a guest needs the account before the door can ask them anything.
  // Every SIGNED-IN surface uses `JOIN_DOOR_HREF` (/join) instead — see K2.
  check(
    'K0: the guest join door has ONE destination',
    read('lib/roleHome.ts').includes("export const JOIN_HREF = '/signup'"),
    'Two chromes naming their own join URL is exactly how they diverged before.',
  )
  const navConfig = read('components/me/navConfig.ts')
  const sidebar = read('components/me/ClientSidebar.tsx')
  // ⚠️ THE CONSTANT, NOT JUST THE PRESENCE (2026-08-21). This asserted
  // `navConfig.includes('JOIN_HREF')`, which stayed true while the item pointed
  // a SIGNED-IN client at /signup — a page that redirects them straight back to
  // /me. The CTA was present, gated correctly, and led nowhere; §K passed
  // throughout. Pinning the shared constant is what the invariant was always
  // for, and it is the thing that cannot silently rot.
  check(
    'K2: the client workspace sidebar carries the SAME door as the signed-in public chrome',
    navConfig.includes('JOIN_DOOR_HREF') && sidebar.includes('APPLY_LINK'),
    'A signed-in person sent to /signup lands back on /me: the CTA is there, gated right, and dead.',
  )
  check(
    'K2a: and it does not point a signed-in person at the guest door',
    !codeOf('components/me/navConfig.ts').includes('JOIN_HREF'),
    'JOIN_HREF is /signup — correct for a guest, a round trip to nowhere for somebody already signed in.',
  )
  check(
    'K3: the sidebar item is wrapped in <ApplyCtaGate> (real role, not the shell prop)',
    /<ApplyCtaGate>[\s\S]{0,200}APPLY_LINK/.test(sidebar) && sidebar.includes('ApplyCtaGate'),
    'The shell passes a hardcoded role="STUDENT"; only useMe knows the viewer is really a TUTOR.',
  )
  const gate = read('components/ApplyCtaGate.tsx')
  check(
    'K4: ApplyCtaGate reads the viewer from useMe, never from a prop',
    // 2026-08-19: the gate now asks CAPABILITIES, not the role — an approved
    // master keeps role CLIENT, so the role answered „invite them" for somebody
    // who is already a provider. Same rule as before: it reads the viewer
    // itself, because a caller-supplied one is what was wrong in the first place.
    gate.includes('useMe()') && gate.includes('showJoinInvite'),
    'A gate that trusts a caller-supplied viewer is not a gate — the caller is what was wrong.',
  )
  // Still reachable from the account menu too (traced from a real 2026-07-29
  // signup who never found /apply); the sidebar adds a visible path, it does
  // not replace this one.
  const menu = read('components/UserMenu.tsx')
  check(
    'K5: the account menu keeps its own gated /join item',
    // ⚠️ THE ADDRESS IS THE CONSTANT SINCE 2026-08-20 (lib/capabilities →
    // JOIN_DOOR_HREF). Six surfaces typed their own label and three typed their
    // own `?can=`, which is how the header ended up pre-answering the door's
    // question. What K5 protects is unchanged: the item is HERE, and it is gated.
    // ⚠️ AND THE SECOND ARGUMENT IS A BOOLEAN SINCE 2026-08-24. It was
    // `me?.capabilities` — a SET, because a person could sell consultations, or
    // services, or both. There is one thing to sell now, so the question the
    // gate asks collapsed to „is this account already a provider": lib/identity
    // answers it in one read and lib/capabilities → showJoinInvite takes it.
    menu.includes('href: JOIN_DOOR_HREF') && menu.includes('showJoinInvite(role, me?.provider)'),
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
    'L1b: a detail route stays lit under its section (/experts/<profession|trade|expert|provider> → ექსპერტები)',
    // The profile shares the section's own segment (/experts/<slug>), so the
    // prefix rule covers it; the TRADES side of the same catalogue does not
    // (a trade landing, a provider profile) and needed a SECTION_ALIAS for it.
    // Stage 11 collapsed that prefix into /experts, so the PREFIX RULE alone is
    // the whole mechanism again — and it must stay, or the bar goes dark on
    // every detail page.
    /activePath === href \|\| activePath\.startsWith\(href \+ '\/'\)/.test(bar) &&
      !/const SECTION_ALIAS/.test(bar),
    'Exact-match only is what made the highlight disappear when you opened an expert.',
  )
  const home = read('app/page.tsx')
  const homeClient = read('app/HomeClient.tsx')
  // ⚠️ THE MECHANISM MOVED AND THE INVARIANT DID NOT CHANGE (2026-08-30). This
  // named `getCurrentUser()` — the call home used to make — and that spelling
  // was the LESS correct half of the rule: what it resolved was four fields,
  // missing `provider` and `balanceTetri`, so the header still rearranged after
  // hydration for exactly the signed-in provider this line is about. It is
  // `initialMe()` now (lib/meServer), which builds the shape /api/me returns.
  // The invariant is what it always was — the viewer is resolved on the SERVER
  // and handed to the header — and tests/firstPaint holds the new shape.
  check(
    'L2: home resolves the viewer server-side and hands it to the header',
    home.includes('initialMe()') && home.includes('initialUser={initialUser}') &&
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
  const browse = read('app/experts/client.tsx')
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


/* ⚠️ „WHY A BOOKING ENDED" WAS PINNED HERE AND IS GONE (2026-08-24). Eleven
   checks over the cleanup sweep and the two booking detail panes, all of them
   about ONE thing: an ending that nobody performed must still be explained, and
   it must never be blamed on the client.

   The sweep auto-cancelled a booking the expert had left PREPARING past its
   TTL. Three rules came out of that, and they are worth more than the code was:

     · AN AUTOMATIC ENDING WRITES ITS REASON. The row carried `cancelReason` and
       the screen showed it; a cancellation with no explanation reads as the
       site losing your booking.
     · IT REACHES THE PERSON THE SAME WAY THE MANUAL ONES DO. An in-app bell is
       not a signal for a terminal ending — it emailed, reusing the decline
       template rather than growing a second one for a message that exists.
     · NOBODY IS BLAMED BY FALLBACK. The pane named the client by their OWN
       value (`cancelledBy === 'USER'`), never by being the last branch of a
       ternary — because an unrecognised or automatic `cancelledBy` then reads
       as „შენ" to the one person who did nothing.

   The third is the one to carry forward: any screen that attributes an action
   must name each actor explicitly and keep a sentence for „nobody did this".
   The nearest live equivalent is an offer closed by the sweep — see
   lib/offerLifecycle and app/api/internal/cleanup, whose request-side rules are
   pinned by tests/offerLifecycle. */

/* ── The dark verticals are dark ────────────────────────────────────────────
 * Turning these back on is one line each (lib/flags). What is pinned here is
 * that 'off' is honoured where it matters: the landings guard themselves, the
 * admin rail drops the tab from the SOURCE array rather than hiding it, and
 * nothing links a visitor at a 404.
 */
{
  const flags = read('lib/flags.ts')
  // ⚠️ PACKAGES IS NOT ON THIS LIST ANY MORE (2026-08-24), and that is the
  // point of the list. A dark vertical is one whose code is REACHABLE and whose
  // flag flip is the whole of turning it on. Packages stopped being that when
  // the consultation product went: `Package`/`Enrollment` are dropped and a
  // spent lesson was a Booking, so there is nothing behind a switch to flip.
  // The constant, the landing and lib/packages went with it — lib/flags carries
  // the long version and what a revival would have to design first.
  // On the STRIPPED source: the note in lib/flags names the constant several
  // times while explaining why it is gone, and that explanation must stay
  // readable without failing the pin it documents.
  check('the packages flag is gone, not left switched off',
    !codeOf('lib/flags.ts').includes('PACKAGES_VISIBILITY'),
    'a flag with no reader is a control that lies about what it turns on')
  // ⚠️ FOUR PINS WENT HERE ON 2026-09-03, and they went because what they
  // guarded went. They held the B2B vertical and /abroad DARK — the flags at
  // 'off', /business 404-ing behind `canSeeB2B`, the admin tab filtered out of
  // ADMIN_NAV rather than merely unrendered, the one /business link gated at
  // its source. The owner deleted both verticals („ააღარ გვინდა ეგ ორი
  // გვერდი"), so there is no flag left to be flipped by accident and no page
  // left to leak. A pin whose subject no longer exists is not a weaker pin, it
  // is a false one.
  //
  // What SURVIVES is the shape of the argument, and it is still load-bearing
  // for the next dark thing: a tab must leave the ARRAY, not just the render.
  const nav = read('app/admin/_nav.tsx')
  check('VALID_TABS is derived from the filtered array', /VALID_TABS[^=]*= ADMIN_NAV\.map/.test(nav),
    'VALID_TABS stopped following the nav — a dark tab is addressable again')
  // …and the two deleted pages must not reappear in the sitemap, which is the
  // one file where a dead URL costs something real: a crawler asked to fetch it.
  const sitemap = read('app/sitemap.ts')
  for (const path of ['/swavleba', '/business', '/abroad']) {
    check(`the sitemap does not list ${path}`, !sitemap.includes(`'${path}'`), `app/sitemap.ts lists ${path}`)
  }
  for (const gone of ['app/business', 'app/abroad', 'lib/b2b.ts', 'lib/abroad.ts']) {
    check(`${gone} stays deleted`, !existsSync(join(root, gone)),
      'a vertical the owner removed grew back')
  }
}

if (failures > 0) {
  console.error(`\n${failures} regression guard(s) FAILED`)
  process.exit(1)
}
console.log('\nAll regression guards passed.')
