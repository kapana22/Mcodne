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
    'app/me/layout.tsx', 'app/me/page.tsx', 'app/me/bookings/page.tsx', 'app/me/bookings/[id]/page.tsx',
    'app/me/messages/page.tsx', 'app/me/messages/[id]/page.tsx', 'app/me/messages/u/[userId]/page.tsx',
    'app/me/favorites/page.tsx', 'app/me/profile/page.tsx',
    // D7 — the client's own service requests, and the home section for it.
    'app/me/requests/page.tsx', 'app/me/_requests.tsx',
  ]) assert.ok(has(p), `${p} is missing`)
  assert.ok(!has('app/student'), 'app/student is back — the client space is /me')
  // The guard is the old one: a TUTOR is admitted to their own client side.
  assert.match(codeOf('app/me/layout.tsx'), /requireRole\(\[ROLE\.USER, ROLE\.PROVIDER, ROLE\.ADMIN\]\)/)
  assert.match(codeOf('app/me/layout.tsx'), /StudentWorkspaceShell/)
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
    assert.match(home, /capabilitiesOf\(user\.id\)/, '/work no longer checks a capability')
    assert.match(home, /if \(!isProvider && !isExpert\) notFound\(\)/, '/work stopped 404ing a stranger')
    assert.doesNotMatch(home, /status: 403|redirect\(/, '/work answers with something other than 404 — that confirms the page exists')
  }
  for (const p of [
    'app/work/(expert)/layout.tsx',
    // ⚠️ THE HOME LEFT THE (expert) GROUP TOO (2026-08-20). It was
    // app/work/(expert)/page.tsx and it rendered a SESSION dashboard, so a
    // WORK-only provider had no home at all — the group's layout dropped them
    // straight into the queue. `/work` is now the one home for both, with the
    // four counts and the balance on it, and the session dashboard is a
    // component it renders only for a CONSULT holder.
    'app/work/page.tsx', 'app/work/_components/SessionDashboard.tsx',
    'app/work/_components/CreditStrip.tsx', 'app/work/_components/DayBoard.tsx',
    // ⚠️ THE LIST LEFT THE (expert) GROUP AND THE DETAIL PAGE DID NOT
    // (2026-08-19). A provider's committed work is one list — a Booking and an
    // ACCEPTED quote are both „work I agreed to do" — and a page inside either
    // route group would hide half of it behind the other group's guard, so
    // /work/jobs sits under the shared shell with a guard of its own.
    'app/work/jobs/page.tsx', 'app/work/(expert)/bookings/[id]/page.tsx',
    'app/work/(expert)/schedule/page.tsx',
    // ⚠️ THE INBOX IS OUTSIDE BOTH GROUPS (2026-08-19). It was in (expert),
    // whose layout sends a WORK-only master to /work/requests — so the one
    // person with offer threads could never open the list carrying them.
    'app/work/messages/page.tsx',
    'app/work/messages/[bookingId]/page.tsx', 'app/work/messages/u/[userId]/page.tsx',
    'app/work/(expert)/earnings/page.tsx', 'app/work/(expert)/profile/page.tsx',
    'app/work/(provider)/layout.tsx', 'app/work/(provider)/requests/page.tsx',
    'app/work/(provider)/requests/[id]/page.tsx', 'app/work/(provider)/offers/page.tsx',
    // ⚠️ „რას ვყიდი?" IS ONE PAGE NOW (2026-08-19) and it is in NEITHER group:
    // /work/service-profile was the master's answer, the „სესიები" tab of
    // /work/profile was the expert's, and /work/services is both halves behind
    // its own gate. Pinned in full by tests/servicesPage.test.ts.
    'app/work/services/page.tsx',
    'app/work/_components/ProfileSignal.tsx',
  ]) assert.ok(has(p), `${p} is missing`)
  assert.ok(!has('app/work/(provider)/service-profile'), 'the master has a second page for what they sell again')
  assert.ok(!has('app/tutor'), 'app/tutor is back — the expert workspace is /work/(expert)')
  assert.ok(!has('app/provider'), 'app/provider is back — the master workspace is /work/(provider)')
  assert.ok(!has('app/work/(expert)/page.tsx'), 'the expert group claimed /work again — it is the shared home')
  assert.ok(!has('app/work/(provider)/_shell.tsx') && !has('app/work/(provider)/page.tsx'),
    'the old provider bar / root redirect page came back — the shell is app/work/layout.tsx and the root is app/work/page.tsx, shared')
  // The route constants agree with the tree.
  assert.equal(PROVIDER_ROUTE, '/work')
  assert.deepEqual([...PROVIDER_WORKSPACE_PATHS], ['/work/requests', '/work/offers'])
  assert.equal(homeForRole('PROVIDER'), '/work')
  assert.equal(homeForRole('USER'), '/me')
})

/* ═══════════ 2. the guards ═══════════════════════════════════════════════ */

test('§C the two guards: (expert) redirects to sign-in, (provider) answers 404 and NEVER redirects', () => {
  const expert = codeOf('app/work/(expert)/layout.tsx')
  assert.match(expert, /requireRole\(\[ROLE\.PROVIDER, ROLE\.ADMIN\]\)/, 'the expert guard is gone')
  // A WORK-only master is sent to their own screen, before the role guard would
  // bounce them to /me — keyed on the capability, never on a role.
  //
  // ⚠️ THE TARGET IS `/work` SINCE 2026-08-20, not the queue. It was the queue
  // while /work was an expert-only session dashboard, which made the first
  // screen of a provider's workspace a list with no context and no balance.
  assert.match(expert, /if\s+\(caps\.includes\('WORK'\)\)\s+redirect\('\/work'\)/)
  assert.doesNotMatch(expert, /redirect\(`\$\{PROVIDER_ROUTE\}\/requests`\)/,
    'a provider is dropped into the queue again instead of their own home')
  assert.ok(expert.indexOf("caps.includes('WORK')") < expert.indexOf('requireRole('), 'the WORK redirect runs after requireRole — it can never fire')

  const provider = codeOf('app/work/(provider)/layout.tsx')
  assert.match(provider, /const viewer = await requestsViewer\(\)/)
  assert.match(provider, /if \(!viewer\.providerAllowed\) notFound\(\)/, 'the master guard no longer 404s')
  assert.doesNotMatch(provider, /redirect\(|requireRole\(|requireUser\(/, 'the master guard redirects — that tells a stranger the page is real')
  assert.match(read('app/work/(provider)/layout.tsx'), /notFound\(\) and NEVER requireRole\(\)/, 'the comment explaining the 404 is gone')
  assert.match(read('app/work/(provider)/layout.tsx'), /robots: \{ index: false, follow: false \}/)
  // Both re-verify per request.
  for (const f of ['app/work/layout.tsx', 'app/work/(expert)/layout.tsx', 'app/work/(provider)/layout.tsx', 'app/me/layout.tsx']) {
    assert.match(codeOf(f), /export const dynamic = 'force-dynamic'/, `${f} is not force-dynamic`)
  }
})

test('§D the /work shell is chrome only: nothing without a session, groups by capability', () => {
  const shell = codeOf('app/work/layout.tsx')
  assert.match(shell, /const\s+user\s+=\s+await\s+getCurrentUser\(\)\s*\n\s*if\s+\(!user\)\s+return\s+<>\{children\}<\/>/,
    'a signed-out visitor gets chrome — the (provider) 404 is no longer a bare 404')
  assert.doesNotMatch(shell, /redirect\(|notFound\(|requireRole\(|requireUser\(/, 'the shell became a guard')
  assert.match(shell, /const caps = await capabilitiesOf\(user\.id\)/, 'the shell stopped reading capabilities')
  assert.match(shell, /expert:\s+isAdmin\s+\|\|\s+user\.role\s+===\s+ROLE\.PROVIDER\s+\|\|\s+caps\.includes\('CONSULT'\)/, 'the expert group is not keyed on CONSULT')
  assert.match(shell, /work:\s+viewer\s+!==\s+null\s+&&\s+\(caps\.includes\('WORK'\)\s+\|\|\s+viewer\.providerAllowed\)/, 'the master group is not keyed on WORK / the allowlist')
  assert.match(shell, /const\s+viewer\s+=\s+providersOn\(\)\s+\?\s+await\s+requestsViewer\(\)\s+:\s+null/, 'the master group ignores the supply-side switch')
  // ⚠️ ONE LIST, ITEMS BY FUNCTION (2026-08-19). The rail used to draw the
  // expert's group and the master's group with a caption over each — nine rows
  // saying „you are in two products". Owner: „ხელოსნის სივრცე ზედმეტია."
  // What is shared is unconditional; exactly two TOOLS are conditional, each
  // owned by one capability. Nobody may reintroduce a group per kind of person.
  const nav = read('components/tutor/navConfig.ts')
  assert.match(nav, /export const WORKSPACE_NAV: NavItem\[\] = \[/)
  assert.doesNotMatch(nav, /export const PROVIDER_NAV/, 'the rail has a per-person group again')
  assert.match(nav, /\.\.\.WORKSPACE_NAV,\s*\n\s*\.\.\.\(groups\.work\s+\?\s+WORK_ONLY_NAV\s+:\s+\[\]\),\s*\n\s*\.\.\.\(groups\.expert\s+\?\s+CONSULT_ONLY_NAV\s+:\s+\[\]\),/,
    'navFor stopped composing one list from the shared items plus the two conditional tools')
  for (const href of ['/work', '/work/jobs', '/work/messages', '/work/services']) {
    assert.ok(nav.includes(`href: '${href}'`), `the shared rail lost ${href}`)
  }
  for (const href of ['/work/schedule', '/work/earnings', '/work/profile']) {
    assert.ok(nav.includes(`href: '${href}'`), `CONSULT_ONLY_NAV lost ${href}`)
  }
  for (const seg of ['requests', 'offers']) {
    assert.ok(nav.includes('href: `${PROVIDER_ROUTE}/' + seg + '`'), `WORK_ONLY_NAV lost ${seg}`)
  }
  const sidebar = read('components/tutor/WorkspaceSidebar.tsx')
  assert.match(sidebar, /const sections = navFor\(groups\)/)
  assert.match(sidebar, /i > 0 \? '[^']*border-t/, 'the two groups are no longer visually separated')
  // The shell carries the retired provider bar's note and the real role.
  const ws = read('components/tutor/WorkspaceShell.tsx')
  assert.match(ws, /ხედავ როგორც ადმინი — შეთავაზების დაწერა არ შეგიძლია\./)
  assert.match(ws, /onMasterScreen && !isProvider/)
  assert.match(ws, /<WorkspaceTopBar\s+user=\{user\}\s+role=\{role\}\s+\/>/)
  assert.doesNotMatch(read('components/tutor/WorkspaceTopBar.tsx'), /role="TUTOR"/, 'the top bar hard-codes TUTOR again — a master gets the wrong menu')
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
  assert.equal(moved('/student/bookings/abc'), '/me/bookings/abc')
  assert.equal(moved('/student/messages/u/x'), '/me/messages/u/x')
  assert.equal(moved('/tutor'), '/work')
  assert.equal(moved('/tutor/profile'), '/work/profile')
  assert.equal(moved('/tutor/bookings/abc'), '/work/bookings/abc')
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
  const tabExpr = nav.slice(nav.indexOf('const tabs ='), nav.indexOf('// Focused screens'))
  assert.ok(tabExpr.includes("path.startsWith('/me')"), 'BottomNav no longer reads the client space off the path')
  assert.ok(
    tabExpr.indexOf('isProviderWorkspacePath(path)') < tabExpr.indexOf("path.startsWith('/work')"),
    'BottomNav space detection changed — the master test must run BEFORE the /work prefix test',
  )
  for (const href of ['/me', '/me/bookings', '/me/messages', '/me/favorites']) assert.ok(nav.includes(`href: '${href}'`), `STUDENT_TABS lost ${href}`)
  for (const href of ['/work', '/work/jobs', '/work/messages', '/work/profile']) assert.ok(nav.includes(`href: '${href}'`), `TUTOR_TABS lost ${href}`)
  for (const href of ['/work/requests', '/work/offers', '/work/services']) assert.ok(nav.includes(`href: '${href}'`), `PROVIDER_TABS lost ${href}`)
  // ⚠️ AND THE HOME (2026-08-21). /work is the only screen that draws the
  // balance and runs the grant; a phone with no tab for it made the feature
  // desktop-only, which is how „the credits do not exist" was reported.
  assert.ok(
    /PROVIDER_TABS[\s\S]*?href: '\/work'[\s\S]*?\]/.test(nav),
    'PROVIDER_TABS lost its /work home — a provider on a phone cannot reach their balance',
  )
  assert.match(nav, /\/\^\\\/\(\?:me\|work\)\\\/messages\\\/\[\^\/\]\+\$\//, 'the focused-screen regex still names the old spaces')
  assert.match(read('components/AppShell.tsx'), /const inProviderSpace = isProviderWorkspacePath\(path \?\? ''\)/)
  // The switcher and the homes.
  const menu = read('components/UserMenu.tsx')
  assert.match(menu, /const\s+inClientSpace\s+=\s+pathname\.startsWith\('\/me'\)/)
  assert.match(menu, /const\s+inProviderSpace\s+=\s+isProviderWorkspacePath\(pathname\)/)
  assert.match(menu, /const\s+inExpertSpace\s+=\s+pathname\.startsWith\('\/work'\)\s+&&\s+!inProviderSpace/)
  assert.match(menu, /\{ href: '\/work', label: SPACE_LABEL\.EXPERT/)
  assert.match(menu, /\{ href: '\/me', label: SPACE_LABEL\.CLIENT/)
  // ⚠️ ONE DOOR SINCE 2026-08-20. The menu used to push two items — /work for
  // an expert and /work/requests for a provider — so somebody holding both
  // hats read two entries for one room, and the provider's skipped the home
  // screen carrying their balance. /work serves both capabilities now.
  assert.match(menu, /if\s+\(\(isDualRole\s+\|\|\s+isMaster\)\s+&&\s+!inExpertSpace\s+&&\s+!inProviderSpace\)/)
  assert.doesNotMatch(menu, /label: SPACE_LABEL\.MASTER/, 'the second door came back')
  // ⚠️ BEHAVIOUR, NOT THE SOURCE LINE (2026-08-21). This used to pin
  // „MASTER: ${PROVIDER_ROUTE}/requests" as text — and by doing so it pinned the
  // bug: /work is the only screen that grants the profile bonus and draws the
  // balance, and the service half was the one hat sign-in never sent there. The
  // rule is where each hat LANDS, so ask the function.
  assert.equal(homeForHats(['EXPERT', 'CLIENT']), '/work')
  assert.equal(homeForHats(['MASTER', 'CLIENT']), '/work', 'a service provider lands somewhere without a balance on it')
  assert.equal(homeForHats(['CLIENT']), '/me')
  // A company member holds RequestAccess and NO ServiceProfile, so
  // `capabilitiesOf` gives them no WORK capability and /work would 404 them.
  assert.equal(homeForHats(['COMPANY', 'CLIENT']), `${PROVIDER_ROUTE}/offers`)
  // ?space= renamed in lock-step, old values still accepted.
  assert.match(read('lib/messagesUnread.ts'), /export type MessagesSpace = 'client' \| 'expert'/)
  const api = codeOf('app/api/messages/route.ts')
  assert.match(api, /spaceParam === 'client' \|\| spaceParam === 'student' \? 'client'/)
  assert.match(api, /spaceParam === 'expert' \|\| spaceParam === 'tutor' \? 'expert'/)
  assert.doesNotMatch(api, /space === 'student'|space === 'tutor'/, 'the endpoint still branches on the old space names')
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
