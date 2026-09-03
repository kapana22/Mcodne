// THE TWO SPACES — restructuring stage 6 (2026-08-19).
//
// Run: npx tsx tests/spaces.test.ts   (also in `npm run check`)
//
// Three workspaces became two spaces: /me is the client's (was /student) and
// /work is the supply side's — the expert's screens (were /tutor) and the
// master's three (were /provider/…) under ONE prefix, ONE shell and TWO guards
// (route groups). This file pins the shape: the routes are where the map says,
// the old addresses 308 segment-for-segment and never swallow /tutors or
// /api/tutor, the master's guard still answers 404 and never redirects, the
// shell draws each group by capability and nothing at all without a session,
// the mobile tab bar reads the space off the path, and no live link to an old
// address survives outside the redirect itself.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { PROVIDER_ROUTE, PROVIDER_WORKSPACE_PATHS, isProviderWorkspacePath, isRequestPath, isProviderPath } from '../lib/requests'
import { homeForRole } from '../lib/roleHome'
import { homeForHats } from '../lib/hats'
import { navFor, WORKSPACE_NAV } from '../components/work/navConfig'
import { titleForPath as clientTitleForPath } from '../components/me/navConfig'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const has = (p: string) => existsSync(join(ROOT, p))

/** Comments and imports removed — the files quote their own history. */
const codeOf = (p: string) =>
  read(p)
    .split('\n')
    .filter(l => !/^\s*(\/\/|\*|--)/.test(l) && !/^import\b/.test(l))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

function sourceFiles(dirs = ['app', 'components', 'lib']): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      if (e === 'node_modules' || e === '.next') continue
      const p = join(dir, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.tsx?$/.test(p)) out.push(p)
    }
  }
  for (const d of dirs) walk(join(ROOT, d))
  return out
}

/* ═══════════ 1. the routes ═══════════════════════════════════════════════ */

test('§A /me carries every client screen; /student is gone', () => {
  for (const p of [
    'app/me/layout.tsx', 'app/me/page.tsx',
    'app/me/favorites/page.tsx', 'app/me/profile/page.tsx',
    // The client's own service requests, and the home section for it. ⚠️ THE
    // BOOKINGS AND THE PAIR INBOX WERE HERE UNTIL 2026-08-24 and went with the
    // product: a client's conversation is the request's own thread.
    'app/me/requests/page.tsx', 'app/me/_requests.tsx',
  ]) assert.ok(has(p), `${p} is missing`)
  assert.ok(!has('app/student'), 'app/student is back — the client space is /me')
  // The guard is the old one: a TUTOR is admitted to their own client side.
  assert.match(codeOf('app/me/layout.tsx'), /requireRole\(\[ROLE\.USER, ROLE\.PROVIDER, ROLE\.ADMIN\]\)/)
  assert.match(codeOf('app/me/layout.tsx'), /ClientShell/)
})

test('§B /work carries both groups under one shell; /tutor and /provider are gone', () => {
  assert.ok(has('app/work/layout.tsx'), 'the /work shell layout is missing')
  // ⚠️ THIS LINE SAID THE OPPOSITE UNTIL 2026-08-20, and it was right at the
  // time: /work was the EXPERT's session dashboard, so a file at app/work/page
  // would have served it to anybody the shell let through. What changed is what
  // the home IS — the four counts and the balance, which both capabilities need
  // — so it moved out of the group and took the group's guard with it, the same
  // move /work/services and /work/jobs already made. Outside is only safe with
  // a gate of its own, so that gate is asserted here rather than assumed.
  assert.ok(has('app/work/page.tsx'), 'the shared workspace home is missing')
  {
    const home = codeOf('app/work/page.tsx')
    assert.match(home, /getCurrentUser\(\)/, '/work no longer checks who is asking')
    assert.match(home, /sellsHere\(user\.id\)/, '/work no longer checks whether they sell anything')
    assert.match(home, /notFound\(\)/, '/work stopped 404ing a stranger')
    assert.doesNotMatch(home, /status: 403|redirect\(/, '/work answers with something other than 404 — that confirms the page exists')
  }
  for (const p of [
    // ⚠️ THE HOME LEFT THE (expert) GROUP TOO (2026-08-20). It was
    // app/work/(expert)/page.tsx and it rendered a SESSION dashboard, so a
    // WORK-only provider had no home at all — the group's layout dropped them
    // straight into the queue. `/work` is now the one home for both, with the
    // four counts and the balance on it, and the session dashboard is a
    // component it renders only for a CONSULT holder.
    'app/work/page.tsx',
    /* ⚠️ `DayBoard.tsx` WAS PINNED HERE AND IS GONE (2026-08-29). Its four
       cells — ახალი მოთხოვნები · პასუხს ველოდები · ხელში მაქვს · წაუკითხავი —
       are the same four numbers the flow's stage bar and the rail's badge now
       print beside the work they belong to, so the home was a second place to
       learn them. What a home is for is the ONE thing to do next, and that band
       is asserted below. */
    'app/work/_components/CreditStrip.tsx',
    // ⚠️ THE LIST LEFT THE (expert) GROUP AND THE DETAIL PAGE DID NOT
    // (2026-08-19). A provider's committed work is one list — a Booking and an
    // ACCEPTED quote are both „work I agreed to do" — and a page inside either
    // route group would hide half of it behind the other group's guard, so
    // /work/jobs sits under the shared shell with a guard of its own.
    'app/work/jobs/page.tsx',
    // ⚠️ THE INBOX IS OUTSIDE BOTH GROUPS (2026-08-19). It was in (expert),
    // whose layout sends a WORK-only master to /work/requests — so the one
    // person with offer threads could never open the list carrying them.
    'app/work/messages/page.tsx', 'app/work/messages/o/[offerId]/page.tsx',
    // ⚠️ „ვინ ვარ?" LEFT THE (expert) GROUP TOO (2026-08-21) — the same move
    // /work/services made, for the same reason and one day later. `(expert)`
    // requires the EXPERT role and redirects a WORK-only provider out, so the
    // master had NO profile page: their photo and their sentence were edited
    // inside „ჩემი სერვისები", which then answered two questions while the rail
    // carried a „პროფილი" row that opened for one half of the supply side.
    // Owner: „ეს სივრცე ძველებურად არის მოწყობილი — კონსულტაციაზეა აგებული."
    'app/work/profile/page.tsx',
    'app/work/(provider)/layout.tsx', 'app/work/(provider)/requests/page.tsx',
    'app/work/(provider)/requests/[id]/page.tsx', 'app/work/(provider)/offers/page.tsx',
    // ⚠️ „რას ვყიდი?" IS ONE PAGE NOW (2026-08-19) and it is in NEITHER group:
    // /work/service-profile was the master's answer, the „სესიები" tab of
    // /work/profile was the expert's; since 2026-08-30 it is the ONE editor for
    // the row and /work/account is the switch and the password beside it.
    // its own gate. Pinned in full by tests/servicesPage.test.ts.
    'app/work/account/page.tsx',
  ]) assert.ok(has(p), `${p} is missing`)
  // ⚠️ `app/work/_components/ProfileSignal.tsx` WAS IN THAT LIST AND IS DELETED
  // (2026-08-26). It diagnosed a profile by views-against-BOOKINGS and „free
  // time", linked at /work/schedule, and nothing had imported it since
  // 2026-08-24 — this assertion was the only thing requiring it to exist.
  assert.ok(!has('app/work/(provider)/service-profile'), 'the master has a second page for what they sell again')
  // ⚠️ THE (expert) GROUP ITSELF IS GONE (2026-08-24) — with the calendar, the
  // earnings report, the booking detail page and the guard that redirected a
  // service provider out of all three.
  assert.ok(!has('app/work/(expert)'), 'the consultation route group came back')
  assert.ok(!has('app/tutor'), 'app/tutor is back — the workspace is /work')
  assert.ok(!has('app/provider'), 'app/provider is back — the master workspace is /work/(provider)')
  assert.ok(!has('app/work/(provider)/_shell.tsx') && !has('app/work/(provider)/page.tsx'),
    'the old provider bar / root redirect page came back — the shell is app/work/layout.tsx and the root is app/work/page.tsx, shared')
  // The route constants agree with the tree.
  assert.equal(PROVIDER_ROUTE, '/work')
  assert.deepEqual([...PROVIDER_WORKSPACE_PATHS], ['/work/requests', '/work/offers'])
  assert.equal(homeForRole('PROVIDER'), '/work')
  assert.equal(homeForRole('USER'), '/me')
})

/* ═══════════ 2. the guards ═══════════════════════════════════════════════ */

test('§C the one guard: (provider) answers 404 and NEVER redirects', () => {
  // ⚠️ THERE WERE TWO (2026-08-24). `app/work/(expert)/layout.tsx` ran
  // `requireRole` and then bounced a WORK-only provider to /work with
  // `consultRoomVerdict` — a rule that existed because a service provider kept
  // meeting a booking calendar. Both the group and the rule went with the
  // consultation product; what is left is the queue's own gate, which was
  // always the stricter and stranger one.
  const provider = codeOf('app/work/(provider)/layout.tsx')
  assert.match(provider, /const viewer = await requestsViewer\(\)/)
  assert.match(provider, /if \(!viewer\.providerAllowed\) notFound\(\)/, 'the master guard no longer 404s')
  assert.doesNotMatch(provider, /redirect\(|requireRole\(|requireUser\(/, 'the master guard redirects — that tells a stranger the page is real')
  assert.match(read('app/work/(provider)/layout.tsx'), /notFound\(\) and NEVER requireRole\(\)/, 'the comment explaining the 404 is gone')
  assert.match(read('app/work/(provider)/layout.tsx'), /robots: \{ index: false, follow: false \}/)
  // Both re-verify per request.
  for (const f of ['app/work/layout.tsx', 'app/work/(provider)/layout.tsx', 'app/me/layout.tsx']) {
    assert.match(codeOf(f), /export const dynamic = 'force-dynamic'/, `${f} is not force-dynamic`)
  }
})

test('§D the /work shell is chrome only: nothing without a session, groups by capability', () => {
  const shell = codeOf('app/work/layout.tsx')
  assert.match(shell, /const\s+user\s+=\s+await\s+getCurrentUser\(\)\s*\n\s*if\s+\(!user\)\s+return\s+<>\{children\}<\/>/,
    'a signed-out visitor gets chrome — the (provider) 404 is no longer a bare 404')
  assert.doesNotMatch(shell, /redirect\(|notFound\(|requireRole\(|requireUser\(/, 'the shell became a guard')
  assert.match(shell, /const provider = await isProvider\(user\.id\)/, 'the shell stopped reading whether they sell anything')
  // ⚠️ ONE GROUP SINCE 2026-08-24. There were two — the consultation tools and
  // the request queue — and the first was keyed on a verdict that existed to
  // keep a service provider off a booking calendar. The queue's row still
  // follows the ALLOWLIST rather than the profile, because an admin and a
  // company member reach it by another door.
  assert.match(shell, /work:\s+viewer\s+!==\s+null\s+&&\s+\(provider\s+\|\|\s+viewer\.providerAllowed\)/,
    'the queue row is not keyed on the allowlist')
  assert.match(shell, /const\s+viewer\s+=\s+providersOn\(\)\s+\?\s+await\s+requestsViewer\(\)\s+:\s+null/, 'the master group ignores the supply-side switch')
  // ⚠️ ONE LIST, AND IT IS THE PIPELINE (2026-08-21). The rail drew four shared
  // rows, then the master's two, then the expert's three — ten rows that read as
  // two products stacked, with the expert's old workspace on the end. Owner:
  // „ეს სივრცე ძველებურად არის მოწყობილი — კონსულტაციაზეა აგებული და ამიტომ
  // არაკომფორტულია." Nobody may reintroduce a group per kind of person, and
  // this is asserted by CALLING navFor rather than by matching how it is spelt.
  const nav = read('components/work/navConfig.ts')
  assert.doesNotMatch(nav, /export const PROVIDER_NAV/, 'the rail has a per-person group again')

  /* The home is one action, not a board of counts. */
  const home = read('app/work/page.tsx')
  assert.ok(!existsSync(join(ROOT, 'app/work/_components/DayBoard.tsx')),
    'the four-cell board is back — those counts live on the flow and the rail now')
  assert.match(home, /const nextUp =/, 'the home lost the one-thing-to-do band')

  const railOf = (g: { work: boolean }) =>
    navFor(g).flatMap(s => s.items).map(i => i.href)

  /* Demand enters after the home, then the work, then what you sell, then who
     you are. „გრაფიკი" and „შემოსავალი" were the tail of this list until
     2026-08-24 and went with the calendar they described.

     ⚠️ AND „/work/requests" LEFT THE RAIL ON 2026-08-29 — five rows, not six.
     It was never a destination of its own: an open request is the FIRST STAGE
     of a job, and the two rows named three stages of one thing, so a provider
     had to remember which page a piece of work was sitting on. Owner: „ერთი
     ნაკადი გახდეს." The address is untouched and its guard is untouched; it is
     reached from the stage bar (app/work/_components/WorkTabs), and the row
     that replaced it MATCHES it — asserted below — so the rail still lights up
     while somebody is on the queue.

     ⚠️ THE RAIL IS THE SAME FOR BOTH GROUPS NOW, and that is the real change
     this pins: nothing in it depends on the allowlist any more. */
  /* ⚠️ AND „/work/balance" JOINED IT ON 2026-09-01, between the last row about
     selling and the row that is not about selling. `CREDITS_ENFORCED` had been
     true the whole time with no page to read the rules on: the balance was
     drawn in three places (the pill, the strip, the profile bar) and all three
     print a TOTAL, so „ეს 65₾ საიდან მოვიდა" had no answer anywhere on the
     site. The position is the argument — see the note on the row itself. */
  assert.deepEqual(railOf({ work: true }), [
    '/work', '/work/jobs', '/work/messages', '/work/profile', '/work/balance', '/work/account',
  ], 'the rail is no longer the service pipeline in order')
  assert.deepEqual(railOf({ work: false }), railOf({ work: true }),
    'a rail row depends on the allowlist again — every destination in it opens for both')

  // The one row that replaced two must still own all three addresses, or a
  // provider standing on the queue sees nothing lit in the rail.
  const flowRow = WORKSPACE_NAV.find(i => i.href === '/work/jobs')!
  for (const p of ['/work/jobs', '/work/offers', '/work/requests']) {
    assert.ok(flowRow.match(p), `the flow row stopped matching ${p}`)
  }
  assert.equal(flowRow.badgeKey, 'openRequests',
    'the queue badge is not on the row that now leads to the queue')

  // ⚠️ THE TWO PAGES BOTH HALVES OPEN ARE IN EVERY RAIL. „რას ვყიდი"
  // ⚠️ ONE EDITOR SINCE 2026-08-30. „რას ვყიდი" and „ვინ ვარ" were two rows
  // here because they were two tables; they became one row on 2026-08-24 and
  // one page six days later. /work/profile was inside
  // the (expert) group until 2026-08-21, so a master had no profile page at all
  // and their photo lived inside „ჩემი სერვისები", which is why the rail read
  // as two products with one question answered twice.
  for (const g of [{ work: false }, { work: true }]) {
    const rail = railOf(g)
    for (const href of ['/work', '/work/jobs', '/work/messages', '/work/profile', '/work/account']) {
      assert.ok(rail.includes(href), `${JSON.stringify(g)} lost the shared destination ${href}`)
    }
  }
  // The consultation tools are gone, not hidden.
  assert.deepEqual(railOf({ work: true }).filter(h => h === '/work/schedule' || h === '/work/earnings'), [],
    'the calendar and the earnings report came back')
  assert.ok(!railOf({ work: false }).includes('/work/requests'),
    'somebody who cannot bid is shown the requests feed')
  // …and „შეთავაზებები" is a STAGE of a job now, not a rail row of its own —
  // /work/offers is reached from the jobs tab bar and the jobs row stays lit.
  assert.ok(!railOf({ work: true }).includes('/work/offers'),
    'the offers page is a rail row again — a sent offer is the first stage of a job')
  const jobs = navFor({ work: true }).flatMap(s => s.items).find(i => i.href === '/work/jobs')!
  assert.ok(jobs.match('/work/offers'), 'the jobs row stops lighting up on the offers page it now owns')

  const sidebar = read('components/work/WorkspaceSidebar.tsx')
  assert.match(sidebar, /const sections = navFor\(groups\)/)
  assert.match(sidebar, /i > 0 \? '[^']*border-t/, 'the two groups are no longer visually separated')
  // The shell carries the retired provider bar's note and the real role.
  const ws = read('components/work/WorkspaceShell.tsx')
  assert.match(ws, /ხედავ როგორც ადმინი — შეთავაზების დაწერა არ შეგიძლია\./)
  assert.match(ws, /onMasterScreen && !isProvider/)
  assert.match(ws, /<WorkspaceTopBar\s+user=\{user\}\s+role=\{role\}/)
  assert.doesNotMatch(read('components/work/WorkspaceTopBar.tsx'), /role="TUTOR"/, 'the top bar hard-codes TUTOR again — a master gets the wrong menu')
})

/* ═══════════ 3. the redirects ════════════════════════════════════════════ */

// The same predicate + rewrite the middleware runs, evaluated on real paths.
const SPACE_MOVES: [string, string][] = [['/student', '/me'], ['/tutor', '/work'], ['/provider', '/work']]
const moved = (p: string): string | null => {
  for (const [from, to] of SPACE_MOVES) {
    if (p === from || p.startsWith(from + '/')) {
      const rest = p.slice(from.length)
      return from === '/provider' && rest === '' ? `${to}/requests` : to + rest
    }
  }
  return null
}

test('§E the old addresses 308 segment-for-segment, and only on a segment boundary', () => {
  assert.equal(moved('/student'), '/me')
  assert.equal(moved('/student/favorites'), '/me/favorites')
  assert.equal(moved('/tutor'), '/work')
  assert.equal(moved('/tutor/profile'), '/work/profile')
  assert.equal(moved('/provider'), '/work/requests')
  assert.equal(moved('/provider/requests/abc'), '/work/requests/abc')
  assert.equal(moved('/provider/offers'), '/work/offers')
  assert.equal(moved('/provider/service-profile'), '/work/service-profile')
  // NEVER these.
  for (const p of ['/tutors', '/tutors/ana', '/tutorsx', '/api/tutor/nav-badges', '/api/student/bookings', '/api/provider/offers', '/students', '/providers', '/experts/x', '/me', '/work', '/work/requests']) {
    assert.equal(moved(p), null, `${p} was redirected`)
  }
  // Guard the middleware source against drift from this executable copy.
  const mw = codeOf('middleware.ts')
  assert.match(mw, /\['\/student', '\/me'\],\s*\n\s*\['\/tutor', '\/work'\],\s*\n\s*\['\/provider', '\/work'\],/)
  assert.match(mw, /if\s+\(p\s+===\s+from\s+\|\|\s+p\.startsWith\(from\s+\+\s+'\/'\)\)/, 'the segment-boundary test changed')
  assert.match(mw, /url\.pathname\s+=\s+from\s+===\s+'\/provider'\s+&&\s+rest\s+===\s+''\s+\?\s+`\$\{to\}\/requests`\s+:\s+to\s+\+\s+rest/)
  const start = mw.indexOf('SPACE_MOVES')
  const block = mw.slice(start, mw.indexOf('isRequestPath('))
  assert.match(block, /NextResponse\.redirect\(url, 308\)/, 'must be permanent AND method-preserving, like the other blocks')
  assert.doesNotMatch(block, /url\.search = ''/, 'the query string must survive (?tab=, ?review=1, ?reminder=)')
  assert.ok(start > 0 && start < mw.indexOf('isRequestPath('), 'the space redirects must sit with the other 308s, before the requests gate')
})

/* ═══════════ 4. the gates and the space test ═════════════════════════════ */

test('§F the subsystem owns three /work screens, never /work — and the chrome reads the same three', () => {
  for (const p of PROVIDER_WORKSPACE_PATHS) {
    assert.ok(isRequestPath(p) && isProviderPath(p) && isProviderWorkspacePath(p), `${p} is not the master's`)
    assert.ok(isRequestPath(p + '/x') && isProviderWorkspacePath(p + '/x'))
  }
  for (const p of ['/work', '/work/', '/work/bookings', '/work/profile', '/work/requests-x', '/me', '/me/requests']) {
    assert.ok(!isRequestPath(p) && !isProviderPath(p) && !isProviderWorkspacePath(p), `${p} was swallowed — the expert workspace would 404 with the subsystem off`)
  }
  // BottomNav: /me → client tabs, the master's three → PROVIDER_TABS, other /work → expert tabs; order matters.
  const nav = read('components/BottomNav.tsx')
  // ⚠️ THE ORDER IS THE RULE, not the spelling of the expression (2026-08-21).
  // This pinned the whole ternary verbatim, so adding the capability branch that
  // /work needed — the home is BOTH halves', and the path alone cannot say whose
  // it is — failed a test about something else entirely. What must hold is that
  // the master's three exact paths are tested BEFORE the /work prefix they live
  // under; that is the distinction, and it is what is asserted.
  //
  // ⚠️ THE INTERMEDIATE `space` VARIABLE IS GONE (2026-08-21). Once USER and
  // PROVIDER replaced STUDENT and TUTOR, both kinds of seller became one ROLE —
  // so the role could no longer choose between the trades tabs and the expert
  // tabs, and the choice moved to the CAPABILITY, where it always belonged. The
  // ternary now selects the tab set directly. The ORDER is still the rule, and
  // it is still read off the same expression.
  // ⚠️ TWO ASSERTIONS RETIRED HERE ON 2026-08-30, both for shapes the code no
  // longer has. The ordering rule („the master test must run BEFORE the /work
  // prefix test") protected a choice between two supply-side tab sets; there is
  // one now, so there is no order to get wrong. And `/me/requests` left
  // STUDENT_TABS with the rail row of the same name — the home IS the request
  // list, so a tab for it opened the screen the first tab already opens.
  const tabExpr = nav.slice(nav.indexOf('const tabs ='), nav.indexOf('// Focused screens'))
  assert.ok(tabExpr.includes("path.startsWith('/me')"), 'BottomNav no longer reads the client space off the path')
  assert.ok(tabExpr.includes("path.startsWith('/work')"), 'BottomNav no longer reads the provider space off the path')
  for (const href of ['/me', '/me/favorites']) assert.ok(nav.includes(`href: '${href}'`), `STUDENT_TABS lost ${href}`)
  // ⚠️ ONE SUPPLY-SIDE SET SINCE 2026-08-30, so the two loops that stood here —
  // one for TUTOR_TABS, one for PROVIDER_TABS — are one loop, and it is the
  // rail's five rows exactly (components/work/navConfig → WORKSPACE_NAV).
  // „მოთხოვნები" is not among them and must not be: the rail collapsed it into
  // „სამუშაოები" (owner: „ერთი ნაკადი გახდეს") because an open request, the
  // offer sent for it and the work won are three stages of ONE job. The tab
  // LIGHTS UP on that path instead, which is asserted just below.
  // ⚠️ FOUR, NOT FIVE (2026-08-30). „ანგარიში" is a rail row and deliberately
  // NOT a phone tab: five tabs is the ceiling on a bottom bar, and a password
  // is not something anybody reaches for from one. The four below are the ones
  // a provider actually moves between.
  for (const href of ['/work', '/work/jobs', '/work/messages', '/work/profile']) {
    assert.ok(nav.includes(`href: '${href}'`), `PROVIDER_TABS lost ${href}`)
  }
  const providerTabs = nav.slice(nav.indexOf('const PROVIDER_TABS'), nav.indexOf('// Keyed by the two roles'))
  for (const gone of ['/work/offers', '/work/requests']) {
    assert.ok(!providerTabs.includes(`href: '${gone}'`), `${gone} is a phone tab of its own again`)
    assert.ok(providerTabs.includes(`startsWith('${gone}')`),
      `nothing on the provider's phone bar lights up on ${gone}`)
  }
  // ⚠️ AND THE HOME (2026-08-21). /work is the only screen that draws the
  // balance and runs the grant; a phone with no tab for it made the feature
  // desktop-only, which is how „the credits do not exist" was reported.
  assert.ok(
    /PROVIDER_TABS[\s\S]*?href: '\/work'[\s\S]*?\]/.test(nav),
    'PROVIDER_TABS lost its /work home — a provider on a phone cannot reach their balance',
  )
  /* ⚠️ THE SPACES ARE THE RULE, NOT THE PATH SHAPE (widened 2026-09-01).
     This matched the focused-screen regex CHARACTER FOR CHARACTER, including
     `messages/[^/]+` — a one-segment path, which is the shape booking threads
     had. Conversations have lived at `/…/messages/o/<offerId>` since
     2026-08-19, so the regex it was pinning had matched nothing for months and
     the tab bar sat on top of every composer; the pin was holding the bug in
     place. What §F is about is that the two SPACES are `me` and `work` — never
     the retired `student`/`tutor` — so that is what is asserted, on whatever
     thread path the bar currently recognises. */
  assert.match(nav, /isFocusedScreen[\s\S]{0,600}\(\?:me\|work\)\\\/messages/,
    'the focused-screen regex still names the old spaces')
  assert.doesNotMatch(nav, /\(\?:student\|tutor\)/, 'the retired spaces are back in the phone bar')
  assert.match(read('components/AppShell.tsx'), /const inProviderSpace = isProviderWorkspacePath\(path \?\? ''\)/)
  // The switcher and the homes.
  const menu = read('components/UserMenu.tsx')
  assert.match(menu, /const\s+inClientSpace\s+=\s+pathname\.startsWith\('\/me'\)/)
  assert.match(menu, /const\s+inProviderSpace\s+=\s+isProviderWorkspacePath\(pathname\)/)
  assert.match(menu, /const\s+inExpertSpace\s+=\s+pathname\.startsWith\('\/work'\)\s+&&\s+!inProviderSpace/)
  assert.match(menu, /\{ href: '\/work', label: SPACE_LABEL\.PROVIDER/)
  assert.match(menu, /\{ href: '\/me', label: SPACE_LABEL\.CLIENT/)
  // ⚠️ ONE DOOR SINCE 2026-08-20. The menu used to push two items — /work for
  // an expert and /work/requests for a provider — so somebody holding both
  // hats read two entries for one room, and the provider's skipped the home
  // screen carrying their balance. /work serves both capabilities now.
  assert.match(menu, /if\s+\(\(isDualRole\s+\|\|\s+sellsHere\)\s+&&\s+!inExpertSpace\s+&&\s+!inProviderSpace\)/)
  // ⚠️ BEHAVIOUR, NOT THE SOURCE LINE (2026-08-21). This used to pin
  // „MASTER: ${PROVIDER_ROUTE}/requests" as text — and by doing so it pinned the
  // bug: /work is the only screen that grants the profile bonus and draws the
  // balance, and the service half was the one hat sign-in never sent there. The
  // rule is where each hat LANDS, so ask the function.
  assert.equal(homeForHats(['PROVIDER', 'CLIENT']), '/work', 'a provider lands somewhere without a balance on it')
  assert.equal(homeForHats(['CLIENT']), '/me')
  // A company member holds RequestAccess and NO ServiceProfile, so they are not
  // a `provider` and /work would 404 them.
  assert.equal(homeForHats(['COMPANY', 'CLIENT']), `${PROVIDER_ROUTE}/offers`)
  // ⚠️ THE `?space=` PARAMETER WENT WITH THE PAIR INBOX (2026-08-24). It told
  // /api/messages which side of a booking's conversation to list; there is one
  // inbox now (offer threads) and no endpoint to ask.
})

/* ═══════════ 5. no live link to an old address ═══════════════════════════ */

test('§G no live /student, /tutor or /provider link survives in app, components or lib', () => {
  // The offer-lifecycle files landed the same night and were repointed; the
  // carve-out that named them is gone. There is no allowlist here on purpose.
  const IN_FLIGHT = new Set<string>([])
  const offenders: string[] = []
  const carried: string[] = []
  for (const f of sourceFiles()) {
    const rel = relative(ROOT, f)
    codeOf(rel).split('\n').forEach((line, i) => {
      // A quoted old address on a segment boundary. `/tutors` (the catalogue)
      // and `/api/tutor|student|provider/*` (route paths) are not addresses that
      // moved and never match here.
      if (!/["'`]\/(student|tutor|provider)(["'`/?#])/.test(line)) return
      ;(IN_FLIGHT.has(rel) ? carried : offenders).push(`      ${rel}:${i + 1}  ${line.trim()}`)
    })
  }
  assert.equal(offenders.length, 0, `live links to a retired address:\n${offenders.join('\n')}`)
  // …and the same in the middleware, outside its own redirect block.
  const mw = codeOf('middleware.ts')
  const outside = mw.slice(0, mw.indexOf('SPACE_MOVES')) + mw.slice(mw.indexOf('isRequestPath('))
  assert.doesNotMatch(outside, /["'`]\/(student|tutor|provider)(["'`/?#])/)
  // The carried set is bounded by the list above; a NEW file with an old
  // address is an offender, not a carry.
  assert.equal(carried.length, 0, `nothing may carry an old address any more: ${carried.length}`)
})

/* ═══════════ 6. one header rule, both rooms ══════════════════════════════ */

test('the eyebrow names a parent you cannot see — never the room you are in', () => {
  // ⚠️ THE RULE AND ITS EVIDENCE LIVE IN components/PageHeader. Audited
  // 2026-08-30: eight headers, four with an eyebrow and four without, and
  // nothing deciding which. The four disagreed about what an eyebrow even
  // names — the space, the thing, or the title again.
  //
  // On a top-level page the eyebrow names the room, which the rail is already
  // saying in a lit row ~40px to its left. On a DETAIL page it is the one fact
  // the screen cannot otherwise give you. So: detail pages only.
  //
  // ⚠️ THE LIST IS A CEILING, NOT A ROSTER (2026-09-01, the owner's design
  // canvas → „Expert Jobs"). It was an EQUALITY, which smuggled in a second
  // rule nobody ever argued for: that a detail page MUST wear an eyebrow. The
  // canvas redrew /work/requests/[id] without a <PageHeader> at all — the job's
  // own outcome is the h1 („კლიენტმა შეგარჩია"), and the layout it draws has no
  // room above it — so the page left the set and the equality read that as the
  // regression it is not. Only one direction has evidence behind it: an eyebrow
  // on a TOP-LEVEL page repeats the lit rail row beside it. A detail page
  // dropping one costs nobody anything. So what is checked is the direction
  // that harms: nothing OUTSIDE this list may carry an eyebrow.
  const DETAIL = [
    'app/work/(provider)/offers/[offerId]/page.tsx',
    'app/work/(provider)/requests/[id]/page.tsx',
  ]
  const withEyebrow: string[] = []
  for (const f of tsxUnderSpaces()) {
    const s = codeOf(f)
    if (/<PageHeader[\s\S]{0,240}?eyebrow=/.test(s)) withEyebrow.push(f)
  }
  assert.deepEqual(withEyebrow.filter(f => !DETAIL.includes(f)), [],
    'a top-level page grew an eyebrow again — the rail already says where you are')
  // …and the allowlist has to keep naming real pages, or it rots into a comment:
  // a permission for a file that no longer exists permits nothing and hides that
  // it permits nothing.
  for (const f of DETAIL) {
    assert.doesNotThrow(() => codeOf(f), `${f} is allowed an eyebrow and no longer exists`)
  }
})

test('a page title is the rail row that was clicked', () => {
  // Clicking „პროფილი" and landing on „ჩემი პროფილი" is a small dissonance
  // paid on every page. „ჩემი" inside somebody's own workspace answers a
  // question nobody asked — except where it separates two real things, which
  // is why „ჩემი სერვისები" (mine, not the catalogue's) keeps it.
  const labels = new Set(WORKSPACE_NAV.map(i => i.label))
  // ⚠️ „პროფილი" BECAME „ჩემი გვერდი" ON 2026-08-30. The row is the same
  // destination; the word changed because the page stopped being half of the
  // answer — it is now everything a client reads, services and prices included.
  assert.ok(labels.has('ჩემი გვერდი'), 'the provider rail lost its profile row')
  assert.ok(labels.has('ანგარიში'), 'the provider rail lost its account row')
  /* ⚠️ /me/profile IS PINNED THROUGH ITS CRUMB NOW (2026-09-02), and that is
     the rule this test was always about rather than a loophole in it. The page
     stopped drawing its own `PageHeader title="პროფილი"` on that day: it was a
     second implementation of /settings — 367 lines re-doing the same name,
     phone and password forms over the same endpoints — and it renders
     app/settings' own screen now, whose h1 reads „პარამეტრები".

     So the rail row and the screen genuinely name different things, which is
     exactly what `crumb` exists for („the rail row is a place and the crumb
     names what is on the screen", NavItem) and what „მთავარი" → „ჩემი
     მოთხოვნები" has done since the canvas. What must not drift is the pair the
     READER sees: the bar above the screen and the h1 inside it. This asserts
     that pair through `titleForPath`, the function ClientTopBar actually calls,
     rather than through a literal in a file. */
  assert.equal(clientTitleForPath('/me/profile'), 'პარამეტრები',
    'the /me/profile crumb no longer names the screen it opens')
  assert.match(read('app/settings/client.tsx'), /title="პარამეტრები"/,
    'the account screen no longer prints the h1 its crumb promises')

  for (const [file, title] of [
    // ⚠️ `app/me/requests/page.tsx` WAS HERE AND IS A REDIRECT NOW (2026-08-30):
    // the home draws the list, and a home's title is a greeting in both rooms,
    // so it has no rail-row title to match.
    ['app/work/(provider)/offers/page.tsx', 'შეთავაზებები'],
  ] as const) {
    assert.match(read(file), new RegExp(`title="${title}"`),
      `${file} no longer titles itself the way its rail row is spelled`)
  }
  for (const f of ['app/me/profile/page.tsx', 'app/work/(provider)/offers/page.tsx']) {
    assert.doesNotMatch(read(f), /title="ჩემი /,
      `${f} put „ჩემი" back in front of a title inside the reader's own workspace`)
  }
})

/** Every .tsx under the two workspaces. */
function tsxUnderSpaces(): string[] {
  const out: string[] = []
  const walk = (rel: string) => {
    for (const name of readdirSync(join(ROOT, rel))) {
      const r = `${rel}/${name}`
      if (statSync(join(ROOT, r)).isDirectory()) walk(r)
      else if (name.endsWith('.tsx')) out.push(r)
    }
  }
  walk('app/work'); walk('app/me')
  return out
}
