/*
 * Unit tests for the view ↔ URL sync logic on /signin and /signup.
 *
 * Run with:  npx tsx --test tests/signin-view-state.test.ts
 *
 * Covers `viewFromParams` — the pure helper that makes the URL the single
 * source of truth for which auth view is shown (fixes the signin flash and the
 * view/URL drift on back/forward and shared `?view=` links). The `fallback`
 * argument is each route's default view: /signin passes 'signin', /signup
 * passes 'signup'; an explicit valid `?view=` always wins.
 *
 * The helper lives in app/signin/auth-client.tsx (a client component pulled in
 * by both routes). Importing a JSX client module into a plain node:test run is
 * brittle, so we mirror the exact logic below and test it directly. If the
 * helper changes, update this copy to match.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

type View = 'signin' | 'signup' | 'verify' | 'reset' | 'onboarding'
type ViewParamsLike = { get(key: string): string | null } | null | undefined

// ── Mirror of viewFromParams() in app/signin/auth-client.tsx — keep in sync. ──
const VIEWS: readonly View[] = ['signin', 'signup', 'verify', 'reset', 'onboarding']
function viewFromParams(params: ViewParamsLike, fallback: View = 'signin'): View {
  const v = params?.get('view')
  return v && (VIEWS as readonly string[]).includes(v) ? (v as View) : fallback
}
// ──────────────────────────────────────────────────────────────────────

// URLSearchParams satisfies the { get } shape the helper expects — the same
// contract Next's ReadonlyURLSearchParams (from useSearchParams) provides.
const params = (qs: string) => new URLSearchParams(qs)

test('each valid ?view= maps to its view', () => {
  for (const v of VIEWS) {
    assert.equal(viewFromParams(params(`view=${v}`)), v)
  }
})

test('missing ?view= defaults to signin (no flash of the wrong view)', () => {
  assert.equal(viewFromParams(params('')), 'signin')
  assert.equal(viewFromParams(params('email=a@b.com&redirect=/student')), 'signin')
})

test('unknown / malformed ?view= falls back to signin', () => {
  assert.equal(viewFromParams(params('view=hacker')), 'signin')
  assert.equal(viewFromParams(params('view=')), 'signin')
  assert.equal(viewFromParams(params('view=SignUp')), 'signin') // case-sensitive
})

test('other query params do not affect the derived view', () => {
  assert.equal(viewFromParams(params('view=signup&email=a@b.com')), 'signup')
  assert.equal(viewFromParams(params('redirect=/tutor&view=reset')), 'reset')
})

test('null / undefined params (pre-hydration) default to signin', () => {
  assert.equal(viewFromParams(null), 'signin')
  assert.equal(viewFromParams(undefined), 'signin')
})

test('route fallback applies when ?view= is missing or invalid (/signup)', () => {
  assert.equal(viewFromParams(params(''), 'signup'), 'signup')
  assert.equal(viewFromParams(params('email=a@b.com'), 'signup'), 'signup')
  assert.equal(viewFromParams(params('view=hacker'), 'signup'), 'signup')
  assert.equal(viewFromParams(null, 'signup'), 'signup')
})

test('explicit valid ?view= overrides the route fallback', () => {
  assert.equal(viewFromParams(params('view=signin'), 'signup'), 'signin')
  assert.equal(viewFromParams(params('view=verify'), 'signup'), 'verify')
})
