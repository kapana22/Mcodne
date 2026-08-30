// Static regression guards for the 2026-07-17 role-routing/session audit.
//
// Run: npx tsx tests/auth-routing.test.ts
//
// Pure source-level invariants — no browser, no dev server, no DB. Each guard
// pins a fix from the auth/routing audit:
//
//   A. lib/roleHome.ts is the ONLY place the role→home ternary map lives.
//      It used to be hand-copied in five files and had started to drift.
//   B. /signin and /signup bounce already-signed-in users server-side, but
//      ONLY for the plain signin/signup views — verify/reset/onboarding run
//      WITH a live session and must keep rendering.
//   C. Every auth-gated segment layout is guarded AND force-dynamic:
//      student, tutor, admin (requireRole) + settings, notifications
//      (requireUser). settings/notifications used to flash an authenticated
//      shell to anonymous visitors.
//   D. The auth APIs that mint a session (signin, otp/verify, reset/confirm)
//      return the server-decided `home` via postAuthHome, so pending expert
//      applicants land on /join instead of vanishing into /student.
//   E. The Google OAuth callback uses postAuthHome + the g_oauth_next cookie
//      (validated via safeInternalPath) instead of an inline role map.
//   F. signOut clears the non-user-scoped localStorage drafts so they can't
//      leak to the next account on a shared device.
//   G. AppShell re-fetches /api/me per route change (deps [path]) so the
//      mobile BottomNav role can't go stale across in-app session
//      transitions.

import { readFileSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

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

// ── A. single source of truth for role→home ──────────────────────────────────
{
  const roleHome = read('lib/roleHome.ts')
  check(
    'A1: lib/roleHome.ts defines the canonical map',
    /'\/admin'/.test(roleHome) && /'\/work'/.test(roleHome) && /'\/me'/.test(roleHome),
    'homeForRole must map ADMIN→/admin, TUTOR→/work, else /me in lib/roleHome.ts',
  )
  // Any inline `'/admin' : … '/work' : … '/me'` ternary outside
  // lib/roleHome.ts is a re-forked copy of the map.
  let hits = ''
  try {
    hits = execSync(
      `grep -rn "'/admin'.*'/work'.*'/me'" app lib --include='*.ts' --include='*.tsx' | grep -v 'lib/roleHome.ts' || true`,
      { cwd: root, encoding: 'utf8' },
    ).trim()
  } catch { /* grep unavailable → skip, A1 still covers the canon */ }
  check(
    'A2: no inline role→home ternary outside lib/roleHome.ts',
    hits === '',
    `import homeForRole from lib/roleHome (client) or lib/auth (server) instead:\n${hits}`,
  )
}

// ── B. /signin + /signup bounce signed-in users, sub-views exempt ────────────
{
  for (const p of ['app/signin/page.tsx', 'app/signup/page.tsx']) {
    const src = read(p)
    check(
      `B: ${p} bounces signed-in users off the plain auth views`,
      /getCurrentUser/.test(src) &&
        /postAuthHome/.test(src) &&
        /redirect\(/.test(src) &&
        /view === 'signin' \|\| view === 'signup'/.test(src),
      'must call getCurrentUser + redirect(postAuthHome) ONLY when ?view= is absent/signin/signup — verify/reset/onboarding run with a live session and must still render.',
    )
  }
}

// ── C. guarded + force-dynamic layouts ───────────────────────────────────────
{
  const cases: Array<[string, RegExp]> = [
    // TUTOR is deliberate, not a leak: a dual-role user (expert who is also a
    // client) reaches their OWN client-side bookings/messages here. Data is
    // scoped by ?space=client|expert, not by the layout guard.
    ['app/me/layout.tsx', /requireRole\(\[ROLE\.USER, ROLE\.PROVIDER, ROLE\.ADMIN\]\)/],
    // ⚠️ IT WAS `app/work/(expert)/layout.tsx` WITH A requireRole UNTIL
    // 2026-08-24. That route group went with the consultation product, and the
    // screens it wrapped (/work, /work/services, /work/profile, /work/jobs)
    // each gate themselves on `requestsViewer()` instead. What is left under a
    // layout is the request queue and the thread list, and both answer a
    // stranger with notFound() rather than a redirect — the shell above them is
    // deliberately NOT a guard (see app/work/layout.tsx).
    ['app/work/(provider)/layout.tsx', /viewer\.providerAllowed\) notFound\(\)/],
    ['app/work/messages/layout.tsx', /notFound\(\)/],
    ['app/admin/layout.tsx', /requireRole\('ADMIN'\)/],
    ['app/settings/layout.tsx', /requireUser\(\)/],
    ['app/notifications/layout.tsx', /requireUser\(\)/],
  ]
  for (const [p, guard] of cases) {
    const src = read(p)
    check(
      `C: ${p} is guarded and force-dynamic`,
      guard.test(src) && /export const dynamic = 'force-dynamic'/.test(src),
      'auth-gated segment layouts must re-verify the session per request (guard + force-dynamic).',
    )
  }
}

// ── D. session-minting auth APIs return the server-decided home ──────────────
{
  for (const p of [
    'app/api/auth/signin/route.ts',
    'app/api/auth/otp/verify/route.ts',
    'app/api/auth/reset/confirm/route.ts',
  ]) {
    const src = read(p)
    check(
      `D: ${p} returns home via postAuthHome`,
      /postAuthHome/.test(src) && /home:/.test(src),
      'clients route by the returned `home` (pending applicants → /join); without it they fall back to the bare role map.',
    )
  }
}

// ── E. Google callback: postAuthHome + validated deep-link, no inline map ────
{
  const start = read('app/api/auth/google/route.ts')
  const cb = read('app/api/auth/google/callback/route.ts')
  check(
    'E: google start persists a validated ?redirect= in g_oauth_next',
    /safeInternalPath/.test(start) && /g_oauth_next/.test(start),
    'the OAuth round-trip must carry the deep-link in a short-lived cookie, validated as an internal path.',
  )
  check(
    'E: google callback uses safeInternalPath(g_oauth_next) ?? postAuthHome',
    /g_oauth_next/.test(cb) && /safeInternalPath/.test(cb) && /postAuthHome/.test(cb),
    'callback must re-validate the cookie and fall back to postAuthHome — never an inline role map.',
  )
}

// ── F. signOut clears non-user-scoped drafts ─────────────────────────────────
{
  const src = read('lib/signout.ts')
  const keys = ['mcodne:recent-tutors', 'mcodne:apply-draft', 'mcodne:signup-draft', 'mtsodne:onboarding']
  check(
    'F: signOut removes shared-device draft/history localStorage keys',
    keys.every(k => src.includes(k)) && /removeItem/.test(src),
    `logout must clear ${keys.join(', ')} — they are not keyed by user id and leak to the next account otherwise.`,
  )
}

// ── G. AppShell role probe re-runs per navigation ────────────────────────────
{
  const src = read('components/AppShell.tsx')
  check(
    'G: AppShell /api/me effect depends on [path]',
    /\}, \[path\]\)/.test(src),
    'a fetch-once ([]) role serves stale BottomNav tabs after in-app session transitions (impersonation, promotion).',
  )
}

console.log('')
if (failures > 0) {
  console.error(`${failures} auth-routing invariant(s) violated`)
  process.exit(1)
}
console.log('all auth-routing invariants hold')
