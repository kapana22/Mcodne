'use client'
// /signin — the auth model: which view the URL asks for, the signup draft
// that survives a reload, and where a signed-in visitor is sent next.

import React from 'react'
import { homeForRole, safeInternalPath } from '@/lib/roleHome'

export type View = 'signin' | 'signup' | 'verify' | 'reset' | 'onboarding'

/* ───── View ↔ URL ─────
 *
 * The URL is the single source of truth for which auth view is shown, so
 * `?view=signup` links, SSR, and browser back/forward all stay in sync (no
 * signin flash, no state/URL drift). `viewFromParams` is a pure helper —
 * pure and side-effect-free so its logic is unit-testable in isolation.
 *
 * `fallback` lets each route pick its default: `/signin` → 'signin',
 * `/signup` → 'signup'. An explicit valid `?view=` always wins, which keeps
 * legacy `/signin?view=signup` deep links working unchanged.
 *
 * NOTE: the unit test in tests/signin-view-state.test.ts mirrors this exact
 * logic; keep them in sync.
 */
const VIEWS: readonly View[] = ['signin', 'signup', 'verify', 'reset', 'onboarding']

type ViewParamsLike = { get(key: string): string | null } | null | undefined

export function viewFromParams(params: ViewParamsLike, fallback: View = 'signin'): View {
  const v = params?.get('view')
  return v && (VIEWS as readonly string[]).includes(v) ? (v as View) : fallback
}

/* Per-view document titles. `/signin` and `/signup` get correct titles from
 * their route layouts' metadata; this client-side sync covers the cases static
 * metadata can't: legacy `?view=signup` deep links and the verify/reset/
 * onboarding sub-views, so the tab always names what's on screen. */
export const VIEW_TITLES: Record<View, string> = {
  signin: 'შესვლა — მცოდნე',
  signup: 'რეგისტრაცია — მცოდნე',
  verify: 'ელფოსტის დადასტურება — მცოდნე',
  reset: 'პაროლის აღდგენა — მცოდნე',
  onboarding: 'გაცნობა — მცოდნე',
}

/* ───── Signup draft ─────
 *
 * Client-only cache for the signup form (name + email only — never password).
 * Restored on component mount, cleared after a successful signup call.
 */
const SIGNUP_DRAFT_KEY = 'mcodne:signup-draft'
type SignupDraft = { first?: string; last?: string; email?: string }

export function readSignupDraft(): SignupDraft {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(SIGNUP_DRAFT_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return {
      first: typeof parsed.first === 'string' ? parsed.first : undefined,
      last: typeof parsed.last === 'string' ? parsed.last : undefined,
      email: typeof parsed.email === 'string' ? parsed.email : undefined,
    }
  } catch { return {} }
}

export function writeSignupDraft(next: SignupDraft) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(SIGNUP_DRAFT_KEY, JSON.stringify(next)) } catch {}
}

export function clearSignupDraft() {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(SIGNUP_DRAFT_KEY) } catch {}
}

export function readEmailParam(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const v = new URLSearchParams(window.location.search).get('email')
    return v && v.includes('@') ? v : null
  } catch { return null }
}

// Only allow app-internal, absolute paths as post-signin destinations —
// prevents open-redirects to external hosts.
function safeRedirect(next: string | null | undefined): string | null {
  if (!next) return null
  try {
    // Reject anything that isn't a leading-slash internal path.
    if (!next.startsWith('/') || next.startsWith('//')) return null
    // Additional: reject scheme-like patterns (defence-in-depth).
    if (/^\/(https?:|javascript:|data:|vbscript:)/i.test(next)) return null
    return next
  } catch { return null }
}

function readRedirectParam(): string | null {
  if (typeof window === 'undefined') return null
  const url = new URL(window.location.href)
  return safeRedirect(url.searchParams.get('redirect') || url.searchParams.get('next'))
}

/**
 * ⚠️ `formDest` IS THE SAME LESSON `startGoogleSignin` LEARNED THE HARD WAY
 * (added 2026-09-04 for the phone door). A choice made on the FORM — „ვარ
 * ხელოსანი" — is local state and never reaches the URL, so a door that reads
 * only `?redirect=` discards it and drops the person into the client room with
 * no application and no trace they chose anything. That is the exact bug the
 * note on `startGoogleSignin` describes; the phone flow is a third door onto
 * the same forms, and it would have repeated it.
 *
 * The URL parameter still WINS: arriving at /signup?redirect=/join is an
 * instruction from wherever they came from, and a form default must not
 * override it.
 */
export function redirectAfterSignin(role: string, home?: string | null, formDest?: string | null) {
  // Precedence: explicit ?redirect= deep-link → the form's own destination →
  // server-decided landing (`home` from the auth API — role home, or /join for
  // a pending applicant) → shared role map as the fallback.
  const explicit = readRedirectParam()
  const dest = explicit ?? safeRedirect(formDest) ?? safeInternalPath(home) ?? homeForRole(role)
  window.location.href = dest
}

// Google SSO must not drop an in-flight ?redirect= deep-link: hand it to the
// OAuth start route, which persists it across the round-trip in a short-lived
// cookie. Same for „დამიმახსოვრე 30 დღით" — the password path passes it to
// createSession, but the Google callback ignored the checkbox entirely and
// always minted a 30-day session. Only the NON-default is ever sent (both
// params default correctly on the server), so a plain
// <a href="/api/auth/google"> remains a working no-JS fallback.
/**
 * ⚠️ `dest` EXISTS BECAUSE ITS ABSENCE LOST THE ROLE CHOICE (2026-08-18).
 *
 * The owner registered on the live site as a ხელოსანი and landed on /student,
 * as an ordinary client, with no application and no trace that they had ever
 * chosen anything. Traced: they picked „ვარ ხელოსანი" — which is LOCAL STATE,
 * it never touches the URL — and then tapped „Google-ით გაგრძელება", the first
 * and most prominent control on that form. This function read only
 * `readRedirectParam()`, i.e. `window.location.search`; on a bare /signup there
 * is no `?redirect=`, so `qs` came out empty, the early return fired, and the
 * plain `<a href="/api/auth/google">` navigated with nothing attached. The
 * callback then had no destination and fell through to `postAuthHome`.
 *
 * The password path was fine — it holds `dest` in the same closure and assigns
 * `window.location.href` itself. So the bug was invisible to anyone testing
 * with a password, and it silently discarded the single most important thing
 * that screen collects.
 *
 * The URL parameter still WINS over `dest`: arriving at
 * /signup?redirect=/apply/master is an explicit instruction from wherever they
 * came from, and a form's default must never override it.
 */
export function startGoogleSignin(
  e: React.MouseEvent<HTMLAnchorElement>,
  opts?: { remember?: boolean; dest?: string },
) {
  const qp = new URLSearchParams()
  const next = readRedirectParam() ?? safeRedirect(opts?.dest ?? null)
  if (next) qp.set('redirect', next)
  if (opts?.remember === false) qp.set('remember', '0')
  const qs = qp.toString()
  if (!qs) return // nothing to carry — let the href do its job
  e.preventDefault()
  window.location.href = `/api/auth/google?${qs}`
}