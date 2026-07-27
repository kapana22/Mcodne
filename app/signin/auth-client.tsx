'use client'
import React, { useState, useRef, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { homeForRole, safeInternalPath } from '@/lib/roleHome'
import { COMMISSION_PCT, PAYMENTS_LIVE } from '@/lib/flags'
import { Icon } from '@/components/Icon'
import { Container } from '@/components/Container'
import { Eyebrow } from '@/components/Eyebrow'
import { PublicTopBar } from '@/components/PublicTopBar'
import { Footer } from '@/components/Footer'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'

type View = 'signin' | 'signup' | 'verify' | 'reset' | 'onboarding'

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

function viewFromParams(params: ViewParamsLike, fallback: View = 'signin'): View {
  const v = params?.get('view')
  return v && (VIEWS as readonly string[]).includes(v) ? (v as View) : fallback
}

/* Per-view document titles. `/signin` and `/signup` get correct titles from
 * their route layouts' metadata; this client-side sync covers the cases static
 * metadata can't: legacy `?view=signup` deep links and the verify/reset/
 * onboarding sub-views, so the tab always names what's on screen. */
const VIEW_TITLES: Record<View, string> = {
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

function readSignupDraft(): SignupDraft {
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

function writeSignupDraft(next: SignupDraft) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(SIGNUP_DRAFT_KEY, JSON.stringify(next)) } catch {}
}

function clearSignupDraft() {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(SIGNUP_DRAFT_KEY) } catch {}
}

function readEmailParam(): string | null {
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

function redirectAfterSignin(role: string, home?: string | null) {
  // Precedence: explicit ?redirect= deep-link → server-decided landing
  // (`home` from the auth API — role home, or /apply for a pending expert
  // applicant) → shared role map as the fallback.
  const explicit = readRedirectParam()
  const dest = explicit ?? safeInternalPath(home) ?? homeForRole(role)
  window.location.href = dest
}

// Google SSO must not drop an in-flight ?redirect= deep-link: hand it to the
// OAuth start route, which persists it across the round-trip in a short-lived
// cookie. Plain <a href="/api/auth/google"> stays as the no-JS fallback.
function startGoogleSignin(e: React.MouseEvent<HTMLAnchorElement>) {
  const next = readRedirectParam()
  if (next) {
    e.preventDefault()
    window.location.href = `/api/auth/google?redirect=${encodeURIComponent(next)}`
  }
}


const GoogleMark = () => (
  <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4">
    <path fill="#4285F4" d="M22.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h5.9a5.03 5.03 0 0 1-2.18 3.3v2.74h3.53c2.06-1.9 3.25-4.72 3.25-8.23Z" />
    <path fill="#34A853" d="M12 23c2.94 0 5.4-.98 7.2-2.65l-3.52-2.74c-.98.66-2.23 1.05-3.68 1.05a6.45 6.45 0 0 1-6.05-4.45H2.31v2.83A10.92 10.92 0 0 0 12 23Z" />
    <path fill="#FBBC05" d="M5.95 14.21A6.6 6.6 0 0 1 5.6 12c0-.77.13-1.51.35-2.21V6.96H2.31A11 11 0 0 0 1.08 12c0 1.78.43 3.46 1.23 4.99l3.64-2.78Z" />
    <path fill="#EA4335" d="M12 5.36c1.6 0 3.04.55 4.17 1.63l3.12-3.12C17.4 2.1 14.94 1 12 1A10.92 10.92 0 0 0 2.31 6.96l3.64 2.83C6.82 7.32 9.21 5.36 12 5.36Z" />
  </svg>
)

const inputCls = 'w-full h-12 px-3.5 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-[14.5px] text-ink-900 placeholder:text-ink-400 transition-colors'

// The whole Field is a <label> wrapping its input, so the label is
// programmatically associated (screen readers announce the real label, not the
// placeholder) without threading ids through every call site.
const Field = ({ label, hint, optional, required, children }: { label: string; hint?: string; optional?: boolean; required?: boolean; children: React.ReactNode }) => (
  <label className="block">
    <span className="flex items-baseline gap-2 mb-2">
      <span className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700">{label}{required && <span className="text-danger-500 ml-0.5" aria-hidden>*</span>}</span>
      {optional && <span className="text-[10.5px] text-ink-400">სურვილისამებრ</span>}
    </span>
    {children}
    {hint && <p className="mt-1.5 text-[11.5px] text-ink-500">{hint}</p>}
  </label>
)

const PwInput = ({ value, onChange, placeholder = 'მინ. 8 სიმბოლო', autoComplete = 'new-password' }: { value: string; onChange: (v: string) => void; placeholder?: string; autoComplete?: string }) => {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete} className="w-full h-12 pl-3.5 pr-11 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-[14.5px] text-ink-900 placeholder:text-ink-400 transition-colors" />
      <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'დამალე' : 'აჩვენე'} className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 inline-flex items-center justify-center rounded-btn text-ink-500 hover:text-ink-800 hover:bg-ink-100 transition-colors">
        {show ? <Icon.eyeOff className="w-4 h-4" /> : <Icon.eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

function strength(pw: string) {
  let s = 0
  if (pw.length >= 8) s++
  if (/[A-Z]/.test(pw)) s++
  if (/[0-9]/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  return s
}

const StrengthBar = ({ pw }: { pw: string }) => {
  const s = strength(pw)
  const labels = ['', 'სუსტი', 'საშუალო', 'კარგი', 'ძლიერი']
  const barCls = (i: number) => {
    if (i > s) return 'bg-ink-200'
    if (s === 1) return 'bg-danger-500'
    if (s === 2) return 'bg-warning-500'
    if (s === 3) return 'bg-brand-500'
    return 'bg-success-500'
  }
  const txt = s === 0 ? 'text-ink-500' : s === 1 ? 'text-danger-700' : s === 2 ? 'text-warning-700' : s === 3 ? 'text-brand-700' : 'text-success-700'
  if (!pw) return <p className="mt-1.5 text-[11.5px] text-ink-500">მინ. 8 სიმბოლო · ერთი ციფრი · ერთი დიდი ასო.</p>
  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className={`flex-1 h-1.5 rounded-full transition-colors duration-mid ease-out-quart ${barCls(i)}`}
            style={{ transitionDelay: `${(i - 1) * 60}ms` }}
          />
        ))}
      </div>
      <p className="mt-1.5 text-[11.5px]">
        <span className={`font-display font-semibold uppercase tracking-[0.14em] text-[10px] ${txt}`}>{labels[s]}</span>
        <span className="text-ink-500 ml-2">{s < 4 ? 'დაამატე სიმბოლო ან ციფრი' : 'პაროლი მტკიცეა'}</span>
      </p>
    </div>
  )
}

const CodeInput = ({ value, onChange, length = 6 }: { value: string; onChange: (v: string) => void; length?: number }) => {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const digits = Array.from({ length }, (_, i) => value[i] ?? '')
  const apply = (next: string[]) => onChange(next.join('').slice(0, length))
  const setOne = (i: number, raw: string) => {
    const d = raw.replace(/\D/g, '')
    if (!d) { const next = digits.slice(); next[i] = ''; apply(next); return }
    if (d.length > 1) {
      const sub = d.slice(0, length - i)
      const next = digits.slice()
      for (let k = 0; k < sub.length; k++) next[i + k] = sub[k]
      apply(next)
      refs.current[Math.min(i + sub.length, length - 1)]?.focus()
      return
    }
    const next = digits.slice(); next[i] = d[0]; apply(next)
    if (i < length - 1) refs.current[i + 1]?.focus()
  }
  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus()
  }
  return (
    <div className="flex gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={e => setOne(i, e.target.value)}
          onKeyDown={e => onKey(i, e)}
          aria-label={`ციფრი ${i + 1}`}
          className={`w-11 h-12 sm:w-[52px] sm:h-14 rounded-card border-2 bg-white text-center font-display text-[22px] font-bold text-ink-900 tabular-nums focus:ring-2 focus:ring-brand-100 focus:outline-none transition-colors ${d ? 'border-brand-500' : 'border-ink-200 focus:border-brand-500'}`}
        />
      ))}
    </div>
  )
}

/* The bespoke AuthHeader/AuthFooter that used to live here are gone: the auth
 * routes now mount the SHARED chrome (<PublicTopBar /> + <Footer />), so the
 * header no longer swaps out — and the footer no longer vanishes — when a
 * visitor taps „შესვლა" from a public page. Switching between the signin and
 * signup views stays possible from inside each form (and from the header's own
 * „დაწყება"), so nothing was lost with the old view-toggle CTA. */

/* ═══════════════════════════════════════════════════════════════════ */
/* SIGN IN VIEW                                                         */
/* ═══════════════════════════════════════════════════════════════════ */

const SignInIntro = () => (
  <div>
    {/* Trust pill */}
    <span className="inline-flex items-center gap-2 h-7 pl-2.5 pr-3 rounded-pill bg-white border border-ink-200 shadow-xs mb-8">
      <Icon.shieldCheck className="w-3.5 h-3.5 text-brand-600" />
      <span className="text-[12px] text-ink-700">გადამოწმებული ექსპერტები</span>
    </span>

    <h1 className="font-display text-[34px] xs:text-[38px] sm:text-[44px] lg:text-[64px] font-bold leading-[1.02] sm:leading-[0.96] tracking-[-0.028em] text-ink-900 motion-safe:animate-rise-in">
      კეთილი იყოს<br />
      <span className="text-brand-600">დაბრუნება.</span>
    </h1>
    <p className="text-[14.5px] sm:text-[17px] text-ink-700 mt-5 sm:mt-7 leading-[1.6] max-w-[440px] motion-safe:animate-rise-in" style={{ animationDelay: '80ms' }}>
      აირჩიე ექსპერტი, დაჯავშნე, შეხვდი.
    </p>

    {/* Honest value points — no invented counts or stock (pravatar) faces. The
        landing and /tutors deliberately removed exactly that pattern; sign-in,
        the last screen before a booking, must not reintroduce a trust lie. */}
    <ul className="mt-10 lg:mt-12 pt-8 border-t border-ink-200 space-y-4">
      {[
        { icon: Icon.users, t: 'ხელით შერჩეული ექსპერტები', s: 'ყველა პროფილი გამოწმებული' },
        { icon: Icon.shieldCheck, t: 'უფასო დაჯავშნა', s: 'გადაწყვიტე ჯავშნის შემდეგ' },
        { icon: Icon.clock, t: 'ყველაფერი ერთ ადგილას', s: 'ჯავშნები და მიმოწერა' },
      ].map((r, i) => (
        <li key={i} className="flex items-start gap-3.5">
          <span className="w-9 h-9 rounded-btn bg-brand-50 text-brand-700 inline-flex items-center justify-center shrink-0">
            <r.icon className="w-4 h-4" />
          </span>
          <div className="pt-0.5">
            <div className="font-display text-[14px] font-semibold text-ink-900">{r.t}</div>
            <div className="text-[12.5px] text-ink-500 mt-0.5">{r.s}</div>
          </div>
        </li>
      ))}
    </ul>
  </div>
)

const SignInForm = ({ setView }: { setView: (v: View) => void }) => {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [remember, setRemember] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  // Prefill from `?email=` if present — handles the reset-password → signin
  // handoff (the reset flow appends the confirmed email to the URL).
  useEffect(() => {
    const paramEmail = readEmailParam()
    if (paramEmail) setEmail(paramEmail)
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !pw) { setErrMsg('შეავსე ელფოსტა და პაროლი'); return }
    setSubmitting(true); setErrMsg(null)
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password: pw, rememberMe: remember }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrMsg(
          data.error === 'BAD_CREDENTIALS' ? 'არასწორი ელფოსტა ან პაროლი' :
          data.error === 'INVALID' ? 'პაროლი მინიმუმ 8 სიმბოლო' :
          data.error === 'RATE_LIMITED' ? `ბევრი მცდელობა — სცადე ${Math.ceil((data.retryInSec ?? 60)/60)} წუთში` :
          'შეცდომა, სცადე თავიდან'
        )
        setSubmitting(false)
        return
      }
      redirectAfterSignin(data.role, data.home)
    } catch {
      setErrMsg('ქსელის შეცდომა')
      setSubmitting(false)
    }
  }

  return (
    <div className="w-full">
      <div className="bg-white rounded-card border border-ink-200 shadow-card p-7 sm:p-8 lg:p-9 motion-safe:animate-scale-in" style={{ animationDelay: '160ms' }}>
        <div className="mb-7 lg:mb-8">
          <Eyebrow className="mb-2">შესვლა</Eyebrow>
          <div className="font-display text-[20px] font-bold text-ink-900 tracking-tight">შენი ანგარიში</div>
          <p className="text-[13px] text-ink-500 mt-1.5 leading-snug">შედი და გააგრძელე.</p>
        </div>

        <a href="/api/auth/google" onClick={startGoogleSignin} className="h-12 w-full px-4 rounded-btn border border-ink-200 bg-white hover:bg-ink-50 hover:border-ink-300 inline-flex items-center justify-center gap-2.5 font-display font-medium text-[13px] text-ink-800 tracking-wide transition-colors">
          <GoogleMark /> Google-ით გაგრძელება
        </a>

        <div className="flex items-center gap-3 my-7">
          <div className="flex-1 h-px bg-ink-200" />
          <Eyebrow as="span" tone="muted">ან ელფოსტით</Eyebrow>
          <div className="flex-1 h-px bg-ink-200" />
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field label="ელფოსტა">
            <input type="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={e => { setEmail(e.target.value); if (errMsg) setErrMsg(null) }} placeholder="anu@gmail.com" autoComplete="email" autoFocus className={inputCls} />
          </Field>

          <div>
            <div className="flex items-baseline justify-between mb-2">
              <label className="block font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700">პაროლი</label>
              <button type="button" onClick={() => setView('reset')} className="text-[12px] text-brand-700 hover:text-brand-800 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1 rounded">დაგავიწყდა?</button>
            </div>
            <PwInput value={pw} onChange={(v) => { setPw(v); if (errMsg) setErrMsg(null) }} placeholder="მინ. 8 სიმბოლო" autoComplete="current-password" />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none pt-1">
            <span className={`w-4 h-4 rounded border-[1.5px] inline-flex items-center justify-center transition-colors ${remember ? 'bg-brand-500 border-brand-500' : 'border-ink-300 bg-white hover:border-ink-400'}`}>
              {remember && <Icon.check className="w-3 h-3 text-white" />}
            </span>
            <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="sr-only" />
            <span className="text-[13px] text-ink-700">დამიმახსოვრე 30 დღით</span>
          </label>

          {errMsg && (
            <div role="alert" className="rounded-field bg-danger-50 border border-danger-200 px-3 py-2 text-[12.5px] text-danger-700 leading-[1.45] break-words">{errMsg}</div>
          )}
          <button
            type="submit"
            // Enabled only when the form is actually submittable — both fields
            // filled (mirrors signup, where validity gates the button too).
            // The empty-field check inside submit() stays as a fallback.
            disabled={submitting || !email.trim() || !pw}
            // Disabled = clearly grey (same language as signup) — a branded
            // "disabled" button reads as tappable and invites dead taps.
            className="w-full h-12 mt-6 rounded-btn bg-gradient-cta hover:brightness-105 disabled:bg-none disabled:bg-ink-200 disabled:text-ink-400 disabled:cursor-not-allowed text-white font-display font-semibold text-[14px] tracking-wide inline-flex items-center justify-center gap-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
          >
            {submitting ? (
              <>
                <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" /></svg>
                ვამოწმებთ…
              </>
            ) : (
              <>შესვლა</>
            )}
          </button>
          {!submitting && (!email.trim() || !pw) && (
            // Say WHY the button is off — otherwise it's a mystery dead CTA.
            <p className="text-[11.5px] text-ink-500 text-center mt-2">
              {!email.trim() && !pw ? 'შეიყვანე ელფოსტა და პაროლი' : !email.trim() ? 'შეიყვანე ელფოსტა' : 'შეიყვანე პაროლი'}
            </p>
          )}
        </form>
      </div>

      {/* Sign up CTA below the card */}
      <p className="text-center text-[13px] text-ink-600 mt-6">
        არ გაქვს ანგარიში?{' '}
        <button type="button" onClick={() => setView('signup')} className="font-display font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-2 decoration-brand-300">დარეგისტრირდი უფასოდ</button>
      </p>
    </div>
  )
}

const SignInView = ({ setView }: { setView: (v: View) => void }) => (
  <Container as="main" id="main" className="relative pt-6 sm:pt-14 lg:pt-20 pb-16 sm:pb-20 lg:pb-24">
    {/* Mobile is form-first: the marketing intro (headline, avatars,
        testimonial) drops BELOW the form so the email field is the first
        thing on screen. Desktop keeps intro-left / form-right. */}
    <div className="grid lg:grid-cols-[1fr_minmax(0,520px)] gap-10 sm:gap-14 lg:gap-16 xl:gap-24 items-start">
      <div className="order-2 lg:order-1 min-w-0"><SignInIntro /></div>
      <div className="order-1 lg:order-2 min-w-0"><SignInForm setView={setView} /></div>
    </div>
  </Container>
)

/* ═══════════════════════════════════════════════════════════════════ */
/* SIGN UP VIEW                                                         */
/* ═══════════════════════════════════════════════════════════════════ */

const RoleSwitch = ({ role, setRole }: { role: 'learn' | 'teach'; setRole: (r: 'learn' | 'teach') => void }) => (
  <div className="grid grid-cols-2 gap-2 p-1.5 rounded-card bg-ink-100 mb-8">
    {[
      { v: 'learn' as const, t: 'ვეძებ ექსპერტს', s: 'სტუდენტი' },
      { v: 'teach' as const, t: 'ვარ ექსპერტი',   s: 'ვაკონსულტირებ' },
    ].map(r => (
      <button
        key={r.v}
        type="button"
        onClick={() => setRole(r.v)}
        className={`relative text-left px-4 py-3.5 rounded-btn transition-all ${role === r.v ? 'bg-white shadow-card ring-1 ring-ink-200' : 'hover:bg-white/40'}`}
      >
        <div className={`font-display text-[14px] font-bold tracking-wide ${role === r.v ? 'text-ink-900' : 'text-ink-700'}`}>{r.t}</div>
        <div className="text-[12px] mt-0.5 text-ink-500">{r.s}</div>
        {role === r.v && (
          <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-brand-500 inline-flex items-center justify-center">
            <Icon.check className="w-3 h-3 text-white" />
          </span>
        )}
      </button>
    ))}
  </div>
)

const StudentSignUp = ({ setView }: { setView: (v: View) => void }) => {
  const [first, setFirst] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [agree, setAgree] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  // Restore saved draft (name + email only) on mount. The `?email=` URL param
  // wins so the reset-password → signin prefill flow still works.
  useEffect(() => {
    const draft = readSignupDraft()
    if (draft.first) setFirst(draft.first)
    if (draft.email) setEmail(draft.email)
    const paramEmail = readEmailParam()
    if (paramEmail) setEmail(paramEmail)
  }, [])

  // Persist on every non-password field change.
  useEffect(() => {
    writeSignupDraft({ first, email })
  }, [first, email])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!first.trim()) { setErrMsg('შეიყვანე სახელი'); return }
    // Server requires fullName ≥ 2 chars — mirror it here so the user gets a
    // specific message instead of the generic INVALID error.
    if (first.trim().length < 2) { setErrMsg('სახელი — მინიმუმ 2 სიმბოლო'); return }
    if (!email) { setErrMsg('შეიყვანე ელფოსტა'); return }
    if (pw.length < 8) { setErrMsg('პაროლი მინიმუმ 8 სიმბოლო'); return }
    if (!agree) { setErrMsg('დაეთანხმე წესებს'); return }
    setSubmitting(true); setErrMsg(null)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: first.trim(), email: email.trim().toLowerCase(), password: pw }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrMsg(
          data.error === 'EMAIL_TAKEN' ? 'ეს ელფოსტა უკვე გამოყენებულია' :
          data.error === 'INVALID' ? 'შეავსე ყველა ველი (პაროლი მინიმუმ 8 სიმბოლო)' :
          data.error === 'RATE_LIMITED' ? `ბევრი მცდელობა — სცადე ${Math.ceil((data.retryInSec ?? 60)/60)} წუთში` :
          'შეცდომა, სცადე თავიდან'
        )
        setSubmitting(false)
        return
      }
      // The signup route already created the session (createSession) and email
      // verification is NOT required to use the platform — so skip the OTP
      // interstitial entirely (no verification email, no extra step) and go
      // straight where the user was headed (deep-link) or their workspace home.
      clearSignupDraft()
      redirectAfterSignin(data.role)
    } catch {
      setErrMsg('ქსელის შეცდომა')
      setSubmitting(false)
    }
  }

  return (
    <div>
      {/* Google is the only SSO. */}
      <a href="/api/auth/google" onClick={startGoogleSignin} className="h-12 w-full px-4 rounded-btn border border-ink-200 bg-white hover:bg-ink-50 hover:border-ink-300 inline-flex items-center justify-center gap-2.5 font-display font-medium text-[13px] text-ink-800 tracking-wide transition-colors"><GoogleMark /> Google-ით გაგრძელება</a>

      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px bg-ink-200" />
        <Eyebrow as="span" tone="muted">ან შეავსე</Eyebrow>
        <div className="flex-1 h-px bg-ink-200" />
      </div>

      <form onSubmit={submit} className="space-y-4">
        <Field label="სახელი" required>
          <input type="text" value={first} onChange={e => { setFirst(e.target.value); if (errMsg) setErrMsg(null) }} placeholder="ანი" className={inputCls} />
        </Field>

        <Field label="ელფოსტა" required>
          <input type="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={e => { setEmail(e.target.value); if (errMsg) setErrMsg(null) }} placeholder="anu@gmail.com" autoComplete="email" className={inputCls} />
        </Field>

        <div>
          <label className="block font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700 mb-2">პაროლი<span className="text-danger-500 ml-0.5" aria-hidden>*</span></label>
          <PwInput value={pw} onChange={(v) => { setPw(v); if (errMsg) setErrMsg(null) }} />
          <StrengthBar pw={pw} />
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer select-none pt-2">
          <span className={`mt-0.5 w-4 h-4 rounded border-[1.5px] inline-flex items-center justify-center shrink-0 transition-colors ${agree ? 'bg-brand-500 border-brand-500' : 'border-ink-300 bg-white hover:border-ink-400'}`}>
            {agree && <Icon.check className="w-3 h-3 text-white" />}
          </span>
          <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="sr-only" />
          <span className="text-[12.5px] text-ink-700 leading-[1.5]">
            ვეთანხმები <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:text-brand-800 font-medium underline underline-offset-2 decoration-brand-300">წესებსა</a> და <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:text-brand-800 font-medium underline underline-offset-2 decoration-brand-300">კონფიდენციალურობის პოლიტიკას</a>.
          </span>
        </label>

        {errMsg && (
          <div role="alert" className="rounded-field bg-danger-50 border border-danger-200 px-3 py-2 text-[12.5px] text-danger-700 leading-[1.45] break-words">{errMsg}</div>
        )}

        <button type="submit" disabled={submitting || !agree || first.trim().length < 2 || !email || pw.length < 8} className="w-full h-12 mt-2 rounded-btn bg-brand-500 hover:bg-brand-600 disabled:bg-ink-200 disabled:text-ink-400 disabled:cursor-not-allowed text-white font-display font-semibold text-[14px] tracking-wide inline-flex items-center justify-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2">
          {submitting ? (
            <>
              <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" /></svg>
              ვქმნით ანგარიშს…
            </>
          ) : (
            <>ანგარიშის შექმნა</>
          )}
        </button>
        {!submitting && (first.trim().length < 2 || !email || pw.length < 8 || !agree) && (
          // One next-step hint at a time — why the button is grey.
          <p className="text-[11.5px] text-ink-500 text-center">
            {!first.trim() ? 'შეიყვანე სახელი' : first.trim().length < 2 ? 'სახელი — მინიმუმ 2 სიმბოლო' : !email ? 'შეიყვანე ელფოსტა' : pw.length < 8 ? 'პაროლი — მინიმუმ 8 სიმბოლო' : 'დაეთანხმე წესებს გასაგრძელებლად'}
          </p>
        )}

        <p className="text-center text-[12.5px] text-ink-500 mt-2 leading-relaxed">
          <span className="font-display font-semibold text-brand-700">ჯავშნა ამჟამად უფასოა.</span>
        </p>
      </form>
    </div>
  )
}

/* Expert sign-up — creates ONLY the account. The full expert application
 * (expertise, portfolio, pricing, identity docs) lives at /apply, the single
 * source of expert onboarding. We deliberately do NOT duplicate that form —
 * or its uploads — here; this hands off to /apply after the account is made. */
const TutorSignUp = ({ setView }: { setView: (v: View) => void }) => {
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [agree, setAgree] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!first.trim()) { setErrMsg('შეიყვანე სახელი'); return }
    if (!last.trim()) { setErrMsg('შეიყვანე გვარი'); return }
    if (!email) { setErrMsg('შეიყვანე ელფოსტა'); return }
    if (pw.length < 8) { setErrMsg('პაროლი მინიმუმ 8 სიმბოლო'); return }
    if (!agree) { setErrMsg('დაეთანხმე წესებს'); return }
    setSubmitting(true); setErrMsg(null)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: `${first.trim()} ${last.trim()}`.trim(), email: email.trim().toLowerCase(), password: pw }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrMsg(
          data.error === 'EMAIL_TAKEN' ? 'ეს ელფოსტა უკვე გამოყენებულია' :
          data.error === 'INVALID' ? 'შეავსე ყველა ველი (პაროლი მინიმუმ 8 სიმბოლო)' :
          data.error === 'RATE_LIMITED' ? `ბევრი მცდელობა — სცადე ${Math.ceil((data.retryInSec ?? 60)/60)} წუთში` :
          'შეცდომა, სცადე თავიდან'
        )
        setSubmitting(false)
        return
      }
      // Hand off to /apply — the single expert-onboarding form. It now prefills
      // name + email from this new account, so the expert doesn't re-type them.
      // (No OTP: /apply doesn't require email verification, so sending one here
      // was a wasted email the user never acted on.)
      window.location.href = '/apply'
    } catch {
      setErrMsg('ქსელის შეცდომა')
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white rounded-card border border-ink-200 overflow-hidden">
      <div className="px-6 lg:px-8 py-5 bg-brand-50/60 border-b border-ink-100 grid grid-cols-[auto_1fr] gap-3.5 items-start">
        <Icon.info className="w-4 h-4 mt-0.5 text-brand-700 shrink-0" />
        <div>
          <div className="font-display text-[13px] font-bold text-ink-900 tracking-tight">ჯერ ანგარიში — შემდეგ განცხადება</div>
          <p className="text-[12.5px] text-ink-600 mt-1 leading-[1.5]">
            ექსპერტიზას, პორტფოლიოსა და ფასს <span className="font-display font-semibold text-ink-800">შემდეგ</span> შეავსებ. განცხადებას გავამოწმებთ <span className="font-display font-semibold text-ink-800">48 საათში</span>.
          </p>
        </div>
      </div>

      <div className="p-6 lg:p-8">
        {/* Google is the only SSO. */}
        <a href="/api/auth/google" onClick={startGoogleSignin} className="h-12 w-full px-4 rounded-btn border border-ink-200 bg-white hover:bg-ink-50 hover:border-ink-300 inline-flex items-center justify-center gap-2.5 font-display font-medium text-[13px] text-ink-800 tracking-wide transition-colors"><GoogleMark /> Google-ით გაგრძელება</a>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-ink-200" />
          <Eyebrow as="span" tone="muted">ან შეავსე</Eyebrow>
          <div className="flex-1 h-px bg-ink-200" />
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="სახელი" required>
              <input type="text" value={first} onChange={e => { setFirst(e.target.value); if (errMsg) setErrMsg(null) }} placeholder="ანი" className={inputCls} />
            </Field>
            <Field label="გვარი" required>
              <input type="text" value={last} onChange={e => { setLast(e.target.value); if (errMsg) setErrMsg(null) }} placeholder="ბერიძე" className={inputCls} />
            </Field>
          </div>

          <Field label="ელფოსტა" required>
            <input type="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={e => { setEmail(e.target.value); if (errMsg) setErrMsg(null) }} placeholder="anu@gmail.com" autoComplete="email" className={inputCls} />
          </Field>

          <div>
            <label className="block font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700 mb-2">პაროლი<span className="text-danger-500 ml-0.5" aria-hidden>*</span></label>
            <PwInput value={pw} onChange={(v) => { setPw(v); if (errMsg) setErrMsg(null) }} />
            <StrengthBar pw={pw} />
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer select-none pt-2">
            <span className={`mt-0.5 w-4 h-4 rounded border-[1.5px] inline-flex items-center justify-center shrink-0 transition-colors ${agree ? 'bg-brand-500 border-brand-500' : 'border-ink-300 bg-white hover:border-ink-400'}`}>
              {agree && <Icon.check className="w-3 h-3 text-white" />}
            </span>
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="sr-only" />
            <span className="text-[12.5px] text-ink-700 leading-[1.5]">
              ვეთანხმები <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:text-brand-800 font-medium underline underline-offset-2 decoration-brand-300">ექსპერტის წესებს</a> და <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:text-brand-800 font-medium underline underline-offset-2 decoration-brand-300">კონფიდენციალურობის პოლიტიკას</a>.
            </span>
          </label>

          {errMsg && (
            <div role="alert" className="rounded-field bg-danger-50 border border-danger-200 px-3 py-2 text-[12.5px] text-danger-700 leading-[1.45] break-words">{errMsg}</div>
          )}

          <button type="submit" disabled={submitting || !agree || !first.trim() || !last.trim() || !email || pw.length < 8} className="w-full h-12 mt-2 rounded-btn bg-brand-500 hover:bg-brand-600 disabled:bg-ink-200 disabled:text-ink-400 disabled:cursor-not-allowed text-white font-display font-semibold text-[14px] tracking-wide inline-flex items-center justify-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2">
            {submitting ? (
              <>
                <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" /></svg>
                ვქმნით ანგარიშს…
              </>
            ) : (
              <>ანგარიშის შექმნა</>
            )}
          </button>
          {!submitting && (!first.trim() || !last.trim() || !email || pw.length < 8 || !agree) && (
            <p className="text-[11.5px] text-ink-500 text-center">
              {!first.trim() ? 'შეიყვანე სახელი' : !last.trim() ? 'შეიყვანე გვარი' : !email ? 'შეიყვანე ელფოსტა' : pw.length < 8 ? 'პაროლი — მინიმუმ 8 სიმბოლო' : 'დაეთანხმე წესებს გასაგრძელებლად'}
            </p>
          )}

          <p className="text-center text-[12.5px] text-ink-500 mt-2 leading-relaxed">
            შემდეგ — ექსპერტის განცხადება, <span className="font-display font-semibold text-brand-700">ერთხელ</span>.
          </p>
        </form>
      </div>
    </div>
  )
}

const SignUpIntro = ({ role }: { role: 'learn' | 'teach' }) => (
  <div className="w-full max-w-full lg:max-w-[480px] lg:sticky lg:top-24 min-w-0">
    {/* Status pill */}
    <span className="inline-flex items-center gap-2 h-7 pl-1.5 pr-3 rounded-pill bg-white border border-ink-200 shadow-xs mb-8">
      <span className="inline-flex items-center gap-1 h-4 px-1.5 rounded-pill bg-brand-500 text-white font-display text-[9px] font-bold uppercase tracking-[0.14em]">უფასო</span>
      <span className="text-[12px] text-ink-700 font-display font-medium">
        {role === 'learn' ? 'რეგისტრაცია' : 'ექსპერტის განცხადება'}
      </span>
    </span>

    {role === 'learn' ? (
      <>
        <h1 className="font-display text-[44px] lg:text-[64px] font-bold leading-[0.96] tracking-[-0.03em] text-ink-900 motion-safe:animate-rise-in">
          შემოგვიერთდი.<br />
          <span className="text-brand-600">ფასი წინასწარ ცნობილია.</span>
        </h1>
        <p className="text-[16px] sm:text-[17px] text-ink-700 mt-6 sm:mt-7 leading-[1.6] max-w-[440px]">
          <span className="font-display font-semibold text-ink-900">ამჟამად ჯავშნა უფასოა</span> — დაცული გადახდა მალე.
        </p>

        <ol className="mt-10 lg:mt-12 space-y-6">
          {[
            { n: '01', t: 'ფასი წინასწარ ცნობილია', d: 'გადაიხდი მხოლოდ დაჯავშნისას.' },
            { n: '02', t: 'დაცული გადახდა (მალე)', d: 'თანხა ერიცხება სესიის შემდეგ.' },
            { n: '03', t: 'ხელით განხილული', d: 'ყველა ექსპერტი — სანამ პლატფორმაზე მოვა.' },
          ].map(b => (
            <li key={b.n} className="grid grid-cols-[48px_1fr] gap-4 items-baseline">
              <span className="font-display text-[24px] font-bold text-brand-700 tabular-nums leading-none">{b.n}</span>
              <div>
                <div className="font-display text-[15.5px] font-bold text-ink-900 tracking-tight">{b.t}</div>
                <p className="text-[13px] text-ink-600 mt-1.5 leading-[1.55]">{b.d}</p>
              </div>
            </li>
          ))}
        </ol>

        {/* Honest trust line — no fabricated faces/counts (the canon removed those
            from the landing + tutors; a real, verifiable promise reads stronger). */}
        <div className="mt-10 lg:mt-12 pt-8 border-t border-ink-200 flex items-center gap-3.5">
          <span className="w-10 h-10 rounded-full bg-brand-50 text-brand-700 inline-flex items-center justify-center shrink-0">
            <Icon.shieldCheck className="w-5 h-5" />
          </span>
          <div className="text-[12.5px] text-ink-700">
            <div className="font-display font-semibold text-ink-900">ექსპერტებს ხელით განვიხილავთ</div>
            <div className="text-[11px] text-ink-500 mt-0.5">გამოცდილება და რეპუტაცია გამოწმებული.</div>
          </div>
        </div>
      </>
    ) : (
      <>
        <h1 className="font-display text-[44px] lg:text-[64px] font-bold leading-[0.96] tracking-[-0.03em] text-ink-900">
          გახდი მცოდნე.<br />
          <span className="text-brand-600">შენი ცოდნა — შენი შემოსავალი.</span>
        </h1>
        {/* Commission tense follows PAYMENTS_LIVE — online payments aren't live
            yet and the platform takes NO cut today, so we must not pitch an
            active deduction. The percentage always reads COMMISSION_PCT
            (lib/flags), never a literal, and the flag-on branch is the copy we
            return to the moment paid bookings ship. */}
        <p className="text-[16px] sm:text-[17px] text-ink-700 mt-6 sm:mt-7 leading-[1.6] max-w-[440px]">
          {PAYMENTS_LIVE ? (
            <>შენ ირჩევ ფასს, დროსა და თემას. <span className="font-display font-semibold text-ink-900">{COMMISSION_PCT}% საკომისიო</span>, დანარჩენი შენია.</>
          ) : (
            <>შენ ირჩევ ფასს, დროსა და თემას. <span className="font-display font-semibold text-ink-900">სრული თანხა შენია</span> — {COMMISSION_PCT}% საკომისიო ონლაინ გადახდების ამოქმედებისას დაიწყება.</>
          )}
        </p>

        <dl className="mt-10 lg:mt-12 grid grid-cols-3 gap-x-6 sm:gap-x-8">
          {[
            PAYMENTS_LIVE
              ? { n: `${COMMISSION_PCT}%`, l: 'საკომისიო', d: 'დანარჩენი შენია' }
              : { n: '0%',                 l: 'საკომისიო', d: 'ახლა სრული თანხა შენია' },
            { n: 'შენ',   l: 'ადგენ ფასს',  d: 'დროსა და თემას' },
            { n: '1 სთ',  l: 'კონსულტაცია', d: 'ვიდეოზარით' },
          ].map(k => (
            <div key={k.l}>
              <dt className="font-display text-[26px] lg:text-[32px] font-bold tabular-nums tracking-[-0.025em] text-ink-900 leading-none">{k.n}</dt>
              <dd className="font-display text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-700 mt-2.5">{k.l}</dd>
              <dd className="text-[11px] text-ink-500 mt-0.5 leading-snug">{k.d}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-10 lg:mt-12 pt-8 border-t border-ink-200">
          <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-700 mb-4">პროცესი · 4 ნაბიჯი</div>
          <ol className="space-y-4">
            {[
              { n: '01', t: 'შეავსე განცხადება',  d: 'მოკლე ფორმა' },
              { n: '02', t: 'ჩვენი რევიუ',         d: '24–48 საათი' },
              { n: '03', t: 'პროფილი ცოცხალდება',  d: 'დასტურის შემდეგ' },
              { n: '04', t: 'პირველი ჯავშანი',     d: 'დაამატე დროები' },
            ].map(s => (
              <li key={s.n} className="grid grid-cols-[32px_1fr_auto] gap-3 items-baseline">
                <span className="font-display font-bold text-brand-700 tabular-nums text-[12px]">{s.n}</span>
                <span className="font-display text-[13.5px] font-semibold text-ink-900 tracking-tight">{s.t}</span>
                <span className="text-[12px] text-ink-500 tabular-nums">{s.d}</span>
              </li>
            ))}
          </ol>
        </div>
      </>
    )}
  </div>
)

const SignUpView = ({ setView }: { setView: (v: View) => void }) => {
  const [role, setRole] = useState<'learn' | 'teach'>('learn')
  const params = useSearchParams()
  const redirect = params?.get('redirect') || params?.get('next') || ''
  // Arriving from a "book / message this expert" tap (redirect points at a
  // profile) → the visitor is unambiguously a CLIENT. Drop the learn/teach fork
  // (the only real decision on this form) and remind them why they're here, so
  // the highest-intent signup has zero extra choices to make.
  const bookingIntent = redirect.includes('/tutors/')
  const effectiveRole = bookingIntent ? 'learn' : role
  return (
    <Container as="main" id="main" className="relative pt-6 sm:pt-14 lg:pt-20 pb-16 lg:pb-20">
      {/* Form-first on mobile (see SignInView) — the role switch + form come
          before the pitch so signup starts immediately. */}
      <div className={`grid gap-12 lg:gap-20 items-start ${effectiveRole === 'teach' ? 'lg:grid-cols-[1fr_1.15fr]' : 'lg:grid-cols-2'}`}>
        <div className="order-2 lg:order-1 min-w-0"><SignUpIntro role={effectiveRole} /></div>
        <div className="order-1 lg:order-2 min-w-0">
          {bookingIntent ? (
            <div className="mb-5 rounded-card border border-ink-200 bg-ink-50/60 px-4 py-3">
              <div className="font-display text-[13px] font-bold text-ink-900">ერთი ნაბიჯიღა დარჩა</div>
              <p className="text-[12px] text-ink-600 mt-0.5">დაასრულე რეგისტრაცია — ჯავშანი გაგრძელდება.</p>
            </div>
          ) : (
            <RoleSwitch role={role} setRole={setRole} />
          )}
          {effectiveRole === 'learn' ? <StudentSignUp setView={setView} /> : <TutorSignUp setView={setView} />}
        </div>
      </div>
    </Container>
  )
}

/* ═══════════════════════════════════════════════════════════════════ */
/* VERIFY EMAIL VIEW                                                    */
/* ═══════════════════════════════════════════════════════════════════ */

const VerifyView = ({ setView }: { setView: (v: View) => void }) => {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [resendIn, setResendIn] = useState(45)
  const [verifying, setVerifying] = useState(false)
  const [verified, setVerified] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const em = new URLSearchParams(window.location.search).get('email')
    if (em) setEmail(em)
  }, [])

  useEffect(() => {
    if (resendIn <= 0) return
    const id = setTimeout(() => setResendIn(r => r - 1), 1000)
    return () => clearTimeout(id)
  }, [resendIn])

  useEffect(() => {
    if (code.length !== 6 || verified || !email) return
    let cancelled = false
    setVerifying(true)
    setErrMsg(null)
    fetch('/api/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    })
      .then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }))
      .then(({ status, body }) => {
        if (cancelled) return
        if (status === 200 && body?.ok) {
          setVerified(true)
          setTimeout(() => {
            // Respect explicit ?next= (from signup "teaching" goal) if it's
            // an in-app path; otherwise the server-decided landing (`home`
            // routes pending expert applicants to /apply), then role map.
            const nextRaw = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('next') : null
            const dest = safeInternalPath(nextRaw) ?? safeInternalPath(body.home) ?? homeForRole(body.role)
            window.location.href = dest
          }, 1200)
        } else {
          setErrMsg(body?.error === 'BAD_CODE' ? 'კოდი არასწორია ან ვადაგადასულია.' : 'შემოწმება ვერ მოხერხდა.')
        }
      })
      .catch(() => { if (!cancelled) setErrMsg('ქსელის შეცდომა.') })
      .finally(() => { if (!cancelled) setVerifying(false) })
    return () => { cancelled = true }
  }, [code, verified, email])

  const resend = async () => {
    if (resendIn > 0 || !email) return
    setResendIn(45)
    setErrMsg(null)
    try {
      await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose: 'verify' }),
      })
    } catch {
      setErrMsg('კოდის ხელახლა გაგზავნა ვერ მოხერხდა.')
    }
  }

  return (
    <Container as="main" size="narrow" id="main" className="relative pt-14 lg:pt-20 pb-20">
      <div className="flex items-baseline justify-between gap-3 mb-10 pb-5 border-b border-ink-100">
        <span className="font-display text-[10px] font-semibold uppercase tracking-[0.24em] text-ink-500">ანგარიშის დადასტურება</span>
      </div>

      {verified ? (
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto rounded-full bg-success-500 text-white inline-flex items-center justify-center mb-6 shadow-pop motion-safe:animate-scale-in">
            <span aria-hidden className="absolute inset-0 rounded-full bg-success-500/30 motion-safe:animate-pulse-soft" />
            <Icon.check className="relative w-10 h-10" />
          </div>
          <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-success-700 mb-2">დადასტურდი</div>
          <h1 className="font-display text-[34px] lg:text-[40px] font-bold text-ink-900 tracking-tight leading-[1.1]">
            ელფოსტა მზადაა — <br />
            <span className="text-ink-500">დაიწყე მცოდნეზე.</span>
          </h1>
          <p className="mt-4 text-[14px] text-ink-600 leading-[1.6]">დაჯავშნე პირველი სესია.</p>
          <button type="button" onClick={() => setView('onboarding')} className="mt-7 h-12 px-6 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13.5px] inline-flex items-center gap-2 transition-colors">
            გავაგრძელოთ
          </button>
        </div>
      ) : (
        <>
          <div className="w-16 h-16 rounded-full bg-brand-50 text-brand-700 inline-flex items-center justify-center mb-6">
            <Icon.mail className="w-7 h-7" />
          </div>
          <Eyebrow className="mb-2">ელფოსტის დადასტურება</Eyebrow>
          <h1 className="font-display text-[34px] lg:text-[40px] font-bold text-ink-900 tracking-tight leading-[1.1]">
            6-ციფრიანი კოდი —<br />
            <span className="text-ink-500 break-all">{email || 'შენს ელფოსტაზე'}</span>
          </h1>
          <p className="mt-4 text-[14px] text-ink-600 leading-[1.6] max-w-[400px]">
            შეამოწმე ელფოსტა და spam. გამგზავნი — <span className="font-display font-semibold text-ink-700">noreply@mcodne.ge</span>
          </p>

          <div className="mt-8 flex items-center justify-center">
            <CodeInput value={code} onChange={setCode} />
          </div>

          {verifying && (
            <div className="mt-5 inline-flex items-center justify-center w-full gap-2 font-display text-[12.5px] font-semibold text-brand-700">
              <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" /></svg>
              ვამოწმებთ კოდს…
            </div>
          )}

          {errMsg && (
            <div role="alert" className="mt-4 rounded-btn border border-danger-200 bg-danger-50 text-danger-800 px-3 py-2 text-[12.5px] font-medium">
              {errMsg}
            </div>
          )}

          <div className="mt-8 pt-7 border-t border-ink-100 flex flex-wrap items-center gap-3 text-[12.5px]">
            <span className="text-ink-600">არ მოვიდა?</span>
            <button type="button" onClick={resend} disabled={resendIn > 0 || !email} className="font-display font-semibold text-brand-700 hover:text-brand-800 disabled:text-ink-400 inline-flex items-center gap-1.5 transition-colors">
              <Icon.refresh className="w-3.5 h-3.5" />
              {resendIn > 0 ? `ხელახლა გაგზავნა · ${resendIn}წმ` : 'ხელახლა გაგზავნა'}
            </button>
            <span className="text-ink-300">·</span>
            <button type="button" onClick={() => setView('signup')} className="font-display font-semibold text-ink-700 hover:text-ink-900">სხვა ელფოსტა</button>
          </div>
          <div className="mt-6 rounded-field bg-ink-50 border border-ink-200 px-3 py-2.5 text-[11.5px] text-ink-600 leading-[1.5]">
            შეამოწმე Spam / Promotions. თუ არა — მოგვწერე <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-brand-700 hover:text-brand-800 underline underline-offset-2">{SUPPORT_EMAIL}</a>-ზე.
          </div>
        </>
      )}
    </Container>
  )
}

/* ═══════════════════════════════════════════════════════════════════ */
/* PASSWORD RESET VIEW                                                  */
/* ═══════════════════════════════════════════════════════════════════ */

type ResetStep = 'request' | 'check' | 'reset' | 'done'
const RESET_STEPS: { id: ResetStep; l: string }[] = [
  { id: 'request', l: 'ელფოსტა' },
  { id: 'check',   l: 'შემოწმე' },
  { id: 'reset',   l: 'ახალი პაროლი' },
  { id: 'done',    l: 'მზადაა' },
]

const ResetView = ({ setView }: { setView: (v: View) => void }) => {
  const [step, setStep] = useState<ResetStep>('request')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [sending, setSending] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [resendIn, setResendIn] = useState(0)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [resetToken, setResetToken] = useState<string | null>(null)
  // Where the done-step CTA goes. /api/auth/reset/confirm signs the user in on
  // THIS device (it only revokes other sessions), so on success we continue
  // straight into their workspace; null falls back to the signin view.
  const [doneDest, setDoneDest] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const t = new URLSearchParams(window.location.search).get('t')
    if (t) {
      setResetToken(t)
      setStep('reset')
    }
  }, [])

  // Clear any stale error message when the user moves between steps —
  // otherwise a request-step failure sticks around after they land on 'check'.
  useEffect(() => { setErrMsg(null) }, [step])

  useEffect(() => {
    if (resendIn <= 0) return
    const id = setTimeout(() => setResendIn(r => r - 1), 1000)
    return () => clearTimeout(id)
  }, [resendIn])

  const mismatch = confirm.length > 0 && pw !== confirm
  const ok = pw.length >= 8 && !mismatch && confirm.length > 0

  const submitRequest = async () => {
    if (!email || sending) return
    setSending(true)
    setErrMsg(null)
    try {
      const res = await fetch('/api/auth/reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (data?.error === 'RATE_LIMITED') {
        setErrMsg('ბევრი მცდელობა — სცადე მოგვიანებით.')
        return
      }
      setStep('check')
      setResendIn(45)
    } catch {
      setErrMsg('ქსელის შეცდომა. სცადე თავიდან.')
    } finally {
      setSending(false)
    }
  }

  const submitReset = async () => {
    if (!ok || submitting) return
    if (!resetToken) {
      setErrMsg('ბმული ვადაგადასულია ან არასწორია. ითხოვე ახალი.')
      return
    }
    setSubmitting(true)
    setErrMsg(null)
    try {
      const res = await fetch('/api/auth/reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, password: pw }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || data?.ok === false) {
        setErrMsg(data?.error === 'BAD_TOKEN' ? 'ბმული ვადაგადასულია ან უკვე გამოყენებული.' : 'პაროლის შენახვა ვერ მოხერხდა.')
        return
      }
      setDoneDest(safeInternalPath(data?.home) ?? (data?.role ? homeForRole(data.role) : null))
      setStep('done')
    } catch {
      setErrMsg('ქსელის შეცდომა. სცადე თავიდან.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Container as="main" size="narrow" id="main" className="relative pt-14 lg:pt-20 pb-20">
      {/* Steps indicator */}
      <ol className="flex items-center gap-1.5 mb-8">
        {RESET_STEPS.map((s, i) => {
          const idx = RESET_STEPS.findIndex(x => x.id === step)
          const done = i < idx
          const active = i === idx
          return (
            <React.Fragment key={s.id}>
              <li className="inline-flex items-center gap-1.5">
                <span className={`w-5 h-5 rounded-full inline-flex items-center justify-center font-display text-[10px] font-bold tabular-nums ${
                  done ? 'bg-success-500 text-white' :
                  active ? 'bg-brand-500 text-white' :
                  'bg-ink-100 text-ink-500'
                }`}>{done ? <Icon.check className="w-3 h-3" /> : i + 1}</span>
                <span className={`font-display text-[11px] font-semibold tracking-wide ${active ? 'text-ink-900' : 'text-ink-500'}`}>{s.l}</span>
              </li>
              {i < RESET_STEPS.length - 1 && <span className={`w-4 h-px ${done ? 'bg-brand-300' : 'bg-ink-200'}`} />}
            </React.Fragment>
          )
        })}
      </ol>

      <div className="bg-white rounded-card border border-ink-200 shadow-card p-7 lg:p-10 motion-safe:animate-scale-in">

        {errMsg && (
          <div role="alert" className="mb-4 rounded-btn border border-danger-200 bg-danger-50 text-danger-800 px-3 py-2 text-[12.5px] font-medium">
            {errMsg}
          </div>
        )}

        {step === 'request' && (
          <form onSubmit={e => { e.preventDefault(); submitRequest() }}>
            <Eyebrow className="mb-2">პაროლის აღდგენა</Eyebrow>
            <h1 className="font-display text-[28px] lg:text-[34px] font-bold text-ink-900 tracking-tight leading-[1.1]">
              მოგვწერე ელფოსტა —<br /> ბმულს გამოგიგზავნით.
            </h1>
            <p className="mt-3 text-[14px] text-ink-600 leading-[1.55] max-w-[440px]">
              ერთჯერად ბმულს გამოგიგზავნით. ვადა — 1 საათი.
            </p>
            <label className="block mt-7">
              <span className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700">ელფოსტა</span>
              <input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} autoFocus value={email} onChange={e => { setEmail(e.target.value); if (errMsg) setErrMsg(null) }} placeholder="anu@gmail.com" className="w-full mt-2 h-12 px-3.5 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-[14.5px] text-ink-900 placeholder:text-ink-400 transition-colors" />
            </label>
            <button type="submit" disabled={!email || sending} className="mt-6 w-full h-12 rounded-btn bg-brand-500 hover:bg-brand-600 disabled:bg-ink-200 disabled:text-ink-400 text-white font-display font-semibold text-[14px] tracking-wide inline-flex items-center justify-center gap-2 transition-colors">
              {sending ? (
                <>
                  <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" /></svg>
                  ვუგზავნით…
                </>
              ) : (
                <>ბმულის გაგზავნა</>
              )}
            </button>
            <div className="mt-5 grid grid-cols-[auto_1fr] gap-2.5 items-start p-3.5 rounded-card bg-ink-50/60 border border-ink-200">
              <Icon.shieldCheck className="w-4 h-4 text-ink-500 mt-0.5" />
              <p className="text-[11.5px] text-ink-600 leading-[1.5]">
                ბმული მოვა, თუ ანგარიში არსებობს — უსაფრთხოებისთვის. ნახე spam ან მოგვწერე <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-700 hover:text-brand-800 font-medium underline underline-offset-2 decoration-brand-300">{SUPPORT_EMAIL}</a>.
              </p>
            </div>
          </form>
        )}

        {step === 'check' && (
          <div>
            <Eyebrow className="mb-2">შემოწმე ელფოსტა</Eyebrow>
            <h1 className="font-display text-[28px] lg:text-[34px] font-bold text-ink-900 tracking-tight leading-[1.1]">
              ბმული გავუგზავნეთ —<br /><span className="text-ink-500 break-all">{email || 'შენს ელფოსტაზე'}</span>
            </h1>
            <p className="mt-3 text-[14px] text-ink-600 leading-[1.55]">
              ეძებე „მცოდნე · პაროლის აღდგენა“ — შემოსულში ან spam-ში. ვადა — 1 საათი.
            </p>

            <div className="mt-7 rounded-card border border-ink-200 bg-white p-5 flex items-start gap-3.5">
              <span className="w-10 h-10 rounded-card bg-brand-50 text-brand-700 inline-flex items-center justify-center shrink-0">
                <Icon.mail className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <div className="font-display text-[13.5px] font-bold text-ink-900">შეამოწმე ფოსტა</div>
                <p className="text-[12.5px] text-ink-600 mt-1 leading-[1.5]">
                  ბმული გამოვგზავნეთ <span className="font-display font-semibold text-ink-800 break-all">{email || 'შენს ელფოსტაზე'}</span>-ზე. მიჰყევი მას.
                </p>
              </div>
            </div>

            <div className="mt-7 pt-6 border-t border-ink-100 flex flex-wrap items-center gap-3 text-[12.5px]">
              <span className="text-ink-600">არ მოვიდა?</span>
              <button type="button" onClick={submitRequest} disabled={resendIn > 0 || sending} className="font-display font-semibold text-brand-700 hover:text-brand-800 disabled:text-ink-400 inline-flex items-center gap-1.5 transition-colors">
                <Icon.refresh className="w-3.5 h-3.5" />
                {resendIn > 0 ? `ხელახლა გაგზავნა · ${resendIn}წმ` : 'ხელახლა გაგზავნა'}
              </button>
              <span className="text-ink-300">·</span>
              <button type="button" onClick={() => setStep('request')} className="font-display font-semibold text-ink-700 hover:text-ink-900">სხვა ელფოსტა</button>
            </div>
          </div>
        )}

        {step === 'reset' && (
          <form onSubmit={e => { e.preventDefault(); submitReset() }}>
            <Eyebrow className="mb-2">ახალი პაროლი</Eyebrow>
            <h1 className="font-display text-[28px] lg:text-[34px] font-bold text-ink-900 tracking-tight leading-[1.1]">
              აირჩიე პაროლი — <br /><span className="text-ink-500">გაუმეორებელი, მტკიცე.</span>
            </h1>
            <p className="mt-3 text-[14px] text-ink-600 leading-[1.55] max-w-[440px]">
              შეცვლის შემდეგ ყველა სხვა მოწყობილობა გაითიშება.
            </p>
            <div className="mt-7 space-y-4">
              <div>
                <label className="block font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700 mb-2">ახალი პაროლი</label>
                <PwInput value={pw} onChange={(v) => { setPw(v); if (errMsg) setErrMsg(null) }} />
                <StrengthBar pw={pw} />
              </div>
              <div>
                <label className="block font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700 mb-2">გაიმეორე</label>
                <PwInput
                  value={confirm}
                  onChange={(v) => { setConfirm(v); if (errMsg) setErrMsg(null) }}
                  placeholder="იგივე პაროლი"
                />
                {mismatch && (
                  <p className="mt-1.5 text-[11.5px] text-danger-700 inline-flex items-center gap-1.5">
                    <Icon.warn className="w-3 h-3" /> პაროლი არ ემთხვევა
                  </p>
                )}
              </div>
              <ul className="mt-2 space-y-1.5 text-[12px]">
                {[
                  { l: 'მინიმუმ 8 სიმბოლო', ok: pw.length >= 8 },
                  { l: 'ერთი დიდი ასო (A–Z)', ok: /[A-Z]/.test(pw) },
                  { l: 'ერთი ციფრი (0–9)', ok: /[0-9]/.test(pw) },
                  { l: 'ერთი სიმბოლო (!@#…)', ok: /[^A-Za-z0-9]/.test(pw) },
                ].map(r => (
                  <li key={r.l} className="flex items-center gap-2">
                    <span className={`w-4 h-4 rounded-full inline-flex items-center justify-center ${r.ok ? 'bg-success-500 text-white' : 'bg-ink-100 text-ink-400 border border-ink-200'}`}>
                      {r.ok && <Icon.check className="w-3 h-3" />}
                    </span>
                    <span className={r.ok ? 'text-ink-700 line-through decoration-ink-300' : 'text-ink-700'}>{r.l}</span>
                  </li>
                ))}
              </ul>
            </div>
            <button type="submit" disabled={!ok || submitting} className="mt-7 w-full h-12 rounded-btn bg-brand-500 hover:bg-brand-600 disabled:bg-ink-200 disabled:text-ink-400 text-white font-display font-semibold text-[14px] tracking-wide inline-flex items-center justify-center gap-2 transition-colors">
              {submitting ? (
                <>
                  <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" /></svg>
                  ვამოწმებთ…
                </>
              ) : (
                <>პაროლის შენახვა <Icon.lock className="w-4 h-4" /></>
              )}
            </button>
          </form>
        )}

        {step === 'done' && (
          <div>
            <div className="w-14 h-14 rounded-full bg-success-500 text-white inline-flex items-center justify-center mb-5">
              <Icon.check className="w-7 h-7" />
            </div>
            <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-success-700 mb-2">პაროლი შეიცვალა</div>
            <h1 className="font-display text-[28px] lg:text-[34px] font-bold text-ink-900 tracking-tight leading-[1.1]">
              {doneDest ? <>მზადაა. ამ მოწყობილობაზე<br />უკვე შესული ხარ.</> : <>მზადაა. შესვლისთვის<br />ახალი პაროლი გამოიყენე.</>}
            </h1>
            <p className="mt-3 text-[14px] text-ink-600 leading-[1.55] max-w-[440px]">
              სხვა მოწყობილობები გავთიშეთ — იქ ახალი პაროლით შედი.
            </p>
            <div className="mt-7 rounded-card bg-brand-50/40 border border-brand-200 p-4 grid grid-cols-[auto_1fr] gap-3">
              <Icon.shieldCheck className="w-4 h-4 text-brand-700 mt-0.5" />
              <div>
                <div className="font-display text-[12.5px] font-bold text-ink-900 mb-1">ჩართე 2FA</div>
                <p className="text-[11.5px] text-ink-700 leading-[1.5]">დაამატე SMS კოდი ან აუთენტიფიკატორი — მეტი დაცვისთვის.</p>
              </div>
            </div>
            <button
              type="button"
              // Session already live on this device → continue into the
              // workspace; only fall back to the signin form if the confirm
              // response somehow lacked a destination.
              onClick={() => { if (doneDest) window.location.href = doneDest; else setView('signin') }}
              className="mt-7 w-full h-12 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[14px] tracking-wide inline-flex items-center justify-center gap-2 transition-colors"
            >
              {doneDest ? 'გაგრძელება' : 'შესვლა ახალი პაროლით'}
            </button>
          </div>
        )}
      </div>

      <p className="mt-5 text-center text-[12px] text-ink-500">
        დახმარება გჭირდება?{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="font-display font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-2 decoration-brand-300">{SUPPORT_EMAIL}</a>
      </p>
    </Container>
  )
}

/* ═══════════════════════════════════════════════════════════════════ */
/* ONBOARDING VIEW (post-signup wizard)                                 */
/* ═══════════════════════════════════════════════════════════════════ */

const ONB_STEPS = [
  { id: 1, l: 'სფეროები',    s: 'რას ეძებ' },
  { id: 2, l: 'შენი ფონი',   s: 'რომელ ეტაპზე ხარ' },
  { id: 3, l: 'ხელმისაწვდომი', s: 'როდის ხარ თავისუფალი' },
  { id: 4, l: 'პირველი მატჩი', s: 'შერჩეული ექსპერტი' },
] as const

const AREAS = [
  { id: 'business', l: 'ბიზნეს-სტრატეგია' },
  { id: 'product',  l: 'პროდუქტი / UX' },
  { id: 'finance',  l: 'ფინანსები / გადასახადი' },
  { id: 'career',   l: 'კარიერა / FAANG' },
  { id: 'marketing',l: 'მარკეტინგი / Growth' },
  { id: 'law',      l: 'IT სამართალი' },
  { id: 'fundraise',l: 'Fundraising / VC' },
  { id: 'design',   l: 'დიზაინი / Brand' },
]

const LEVELS = [
  { id: 'pre',    l: 'წინასწარ',  sub: 'იდეა მაქვს, ბიზნესი ჯერ არა' },
  { id: 'early',  l: 'ადრეული',   sub: '1—2 წელი, MVP ან მცირე შემოსავალი' },
  { id: 'growth', l: 'მზარდი',    sub: 'გუნდი 5—25, შემოსავალი, ვეძებთ ფონდს' },
  { id: 'scale',  l: 'მასშტაბი',   sub: 'Series A+, 30+ ადამიანი, საერთაშორისო' },
]

const OnboardingView = ({ setView }: { setView: (v: View) => void }) => {
  const [step, setStep] = useState(1)
  // Comfortable step transitions: scroll back to the top on every step change
  // (next OR back) so the user always lands at the start of the new step instead
  // of mid-page — matches the booking flow + /apply wizard behaviour.
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }) }, [step])
  const [areas, setAreas] = useState<string[]>([])
  const [level, setLevel] = useState('early')
  const [role, setRole] = useState('')
  const [avail, setAvail] = useState<string[]>([])
  const [budget, setBudget] = useState(80)

  const toggleArea = (id: string) => setAreas(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 4 ? [...prev, id] : prev)
  const toggleAvail = (d: string) => setAvail(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])

  const finish = () => {
    try {
      if (typeof window !== 'undefined') {
        const primary = areas[0]
        const primarySlug = AREAS.find(a => a.id === primary)?.l ?? ''
        const prefs = { areas, level, role, avail, budget, ts: Date.now() }
        localStorage.setItem('mtsodne:onboarding', JSON.stringify(prefs))
        const params = new URLSearchParams()
        if (primarySlug) params.set('q', primarySlug)
        if (budget) params.set('maxPrice', String(budget))
        window.location.href = `/tutors${params.toString() ? `?${params}` : ''}`
        return
      }
    } catch {}
    setView('signin')
  }

  return (
    <Container as="main" id="main" className="relative pt-10 lg:pt-14 pb-20">
      <div className="grid lg:grid-cols-[260px_1fr] gap-10 lg:gap-14">
        {/* Sidebar */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Eyebrow tone="muted" className="mb-2">ნაბიჯი {step} / 4</Eyebrow>
          <h2 className="font-display text-[22px] font-bold text-ink-900 tracking-tight leading-tight mb-1">მოკლე გაცნობა</h2>
          <p className="text-[12.5px] text-ink-600 leading-[1.5] mb-6">შენს პასუხებზე მოვარგებთ ექსპერტებს.</p>

          <ol className="relative space-y-1">
            <span className="absolute left-[18px] top-3 bottom-3 w-px bg-ink-200" aria-hidden />
            {ONB_STEPS.map(s => {
              const isDone = step > s.id
              const isActive = step === s.id
              return (
                <li key={s.id}>
                  <div className={`group relative w-full flex items-start gap-3 p-2.5 -ml-2 rounded-card ${isActive ? 'bg-brand-50/60' : ''}`}>
                    <span className={`relative z-10 w-9 h-9 shrink-0 rounded-full inline-flex items-center justify-center font-display font-bold text-[12px] tabular-nums transition-colors ${
                      isDone ? 'bg-success-500 text-white' :
                      isActive ? 'bg-brand-500 text-white ring-4 ring-brand-500/15' :
                      'bg-white border-2 border-ink-200 text-ink-400'
                    }`}>
                      {isDone ? <Icon.check className="w-4 h-4" /> : s.id}
                    </span>
                    <div className="min-w-0 pt-1.5">
                      <div className={`font-display text-[13px] font-bold tracking-tight ${isActive ? 'text-ink-900' : isDone ? 'text-ink-500' : 'text-ink-800'}`}>{s.l}</div>
                      <div className="text-[11px] text-ink-500 mt-0.5 leading-snug">{s.s}</div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>

          <button type="button" onClick={() => setView('signin')} className="mt-7 inline-flex items-center gap-1.5 text-[12px] text-ink-500 hover:text-ink-800 transition-colors">
            გადახტომა
          </button>
        </aside>

        {/* Content */}
        <div className="min-w-0">
          {/* Mobile progress */}
          <div className="lg:hidden mb-6 flex items-center gap-1.5">
            {ONB_STEPS.map(s => (
              <span key={s.id} className={`flex-1 h-1 rounded-full ${step > s.id ? 'bg-success-500' : step === s.id ? 'bg-brand-500' : 'bg-ink-200'}`} />
            ))}
            <span className="ml-2 font-mono text-[10px] tabular-nums text-ink-500">{step}/4</span>
          </div>

          {step === 1 && (
            <div className="max-w-[720px]">
              <Eyebrow className="mb-2">№ 01 — სფეროები</Eyebrow>
              <h1 className="font-display text-[32px] lg:text-[40px] font-bold text-ink-900 tracking-[-0.02em] leading-[1.05]">
                რაში გჭირდება ცოდნა?
              </h1>
              <p className="mt-3 text-[14.5px] text-ink-600 leading-[1.55] max-w-[520px]">
                აირჩიე 1—4 სფერო. <span className="font-display font-semibold text-ink-900">{areas.length}/4</span> არჩეული.
              </p>

              <div className="mt-7 grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {AREAS.map(a => {
                  const on = areas.includes(a.id)
                  const disabled = !on && areas.length >= 4
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => !disabled && toggleArea(a.id)}
                      disabled={disabled}
                      className={`relative p-4 rounded-card border text-left transition-all ${
                        on ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/15' :
                        disabled ? 'border-ink-200 bg-ink-50/40 opacity-50 cursor-not-allowed' :
                        'border-ink-200 bg-white hover:border-ink-300 hover:-translate-y-0.5'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <span className={`w-5 h-5 rounded-full inline-flex items-center justify-center transition-colors ${
                          on ? 'bg-brand-500 text-white' : 'bg-white border-2 border-ink-300'
                        }`}>
                          {on && <Icon.check className="w-3 h-3" />}
                        </span>
                      </div>
                      <div className="font-display text-[13.5px] font-bold text-ink-900 tracking-tight">{a.l}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="max-w-[720px]">
              <Eyebrow className="mb-2">№ 02 — შენი ფონი</Eyebrow>
              <h1 className="font-display text-[32px] lg:text-[40px] font-bold text-ink-900 tracking-[-0.02em] leading-[1.05]">
                რომელ ეტაპზე ხარ?
              </h1>
              <p className="mt-3 text-[14.5px] text-ink-600 leading-[1.55] max-w-[520px]">
                ექსპერტი წინასწარ ხედავს კონტექსტს — დრო არ დაიხარჯება.
              </p>

              <div className="mt-7 space-y-2">
                {LEVELS.map(l => {
                  const on = level === l.id
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setLevel(l.id)}
                      className={`w-full p-4 rounded-card border text-left flex items-center gap-4 transition-all ${
                        on ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/15' : 'border-ink-200 bg-white hover:border-ink-300'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-display text-[14.5px] font-bold text-ink-900 tracking-tight">{l.l}</div>
                        <div className="text-[12.5px] text-ink-600 mt-0.5 leading-snug">{l.sub}</div>
                      </div>
                      <span className={`shrink-0 w-5 h-5 rounded-full inline-flex items-center justify-center transition-colors ${
                        on ? 'bg-brand-500 text-white' : 'bg-white border-2 border-ink-300'
                      }`}>
                        {on && <Icon.check className="w-3 h-3" />}
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="mt-8">
                <label className="block font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700 mb-2">შენი როლი <span className="text-[10.5px] text-ink-400 normal-case font-normal tracking-normal">სურვილისამებრ</span></label>
                <input type="text" value={role} onChange={e => setRole(e.target.value)} placeholder="Founder, Product Designer, Marketing Lead…" className={inputCls} />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="max-w-[720px]">
              <Eyebrow className="mb-2">№ 03 — ხელმისაწვდომი</Eyebrow>
              <h1 className="font-display text-[32px] lg:text-[40px] font-bold text-ink-900 tracking-[-0.02em] leading-[1.05]">
                როდის გელოდები ექსპერტს?
              </h1>
              <p className="mt-3 text-[14.5px] text-ink-600 leading-[1.55] max-w-[520px]">
                მოვარგებთ შენს განრიგს.
              </p>

              <div className="mt-7">
                <Eyebrow tone="muted" className="mb-2.5">დღეები</Eyebrow>
                <div className="grid grid-cols-7 gap-1.5">
                  {['ორშ', 'სამშ', 'ოთხ', 'ხუთ', 'პარ', 'შაბ', 'კვ'].map(d => {
                    const on = avail.includes(d)
                    return (
                      <button key={d} type="button" onClick={() => toggleAvail(d)} className={`p-3 rounded-card text-center border transition-all ${
                        on ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/15' : 'border-ink-200 bg-white hover:border-ink-300'
                      }`}>
                        <div className={`font-display text-[11px] font-semibold uppercase tracking-[0.14em] ${on ? 'text-brand-700' : 'text-ink-500'}`}>{d}</div>
                        <div className={`mt-1.5 w-5 h-5 mx-auto rounded-full inline-flex items-center justify-center ${
                          on ? 'bg-brand-500 text-white' : 'bg-ink-100'
                        }`}>
                          {on && <Icon.check className="w-3 h-3" />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="mt-7">
                <Eyebrow tone="muted" className="mb-2.5">სასურველი დრო</Eyebrow>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { l: 'დილით', sub: '08—12' },
                    { l: 'შუადღე', sub: '12—17' },
                    { l: 'საღამოს', sub: '17—22' },
                  ].map(t => (
                    <button key={t.l} type="button" onClick={() => toggleAvail(t.l)} className={`p-3.5 rounded-card border text-left transition-all ${
                      avail.includes(t.l) ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/15' : 'border-ink-200 bg-white hover:border-ink-300'
                    }`}>
                      <div className="font-display text-[13.5px] font-bold text-ink-900 tracking-tight">{t.l}</div>
                      <div className="font-mono text-[11px] tabular-nums text-ink-500">{t.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-7">
                <div className="flex items-baseline justify-between mb-2.5">
                  <Eyebrow tone="muted">სასურველი ფასი</Eyebrow>
                  <div className="font-display text-[16px] font-bold text-ink-900 tabular-nums">₾{budget}<span className="text-[11.5px] font-medium text-ink-500"> / სესია</span></div>
                </div>
                <input type="range" min={30} max={200} step={10} value={budget} onChange={e => setBudget(Number(e.target.value))} className="w-full accent-brand-500" />
                <div className="flex justify-between font-mono text-[10.5px] tabular-nums text-ink-400 mt-1">
                  <span>₾30</span><span>₾80</span><span>₾130</span><span>₾200+</span>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="max-w-[720px]">
              <Eyebrow className="mb-2">№ 04 — მზად ხარ</Eyebrow>
              <h1 className="font-display text-[32px] lg:text-[40px] font-bold text-ink-900 tracking-[-0.02em] leading-[1.05]">
                მზად ხარ
              </h1>
              <p className="mt-3 text-[14.5px] text-ink-600 leading-[1.55] max-w-[540px]">
                შენს პასუხებზე მორგებულ ექსპერტებს გაჩვენებთ. ფასი წინასწარ, დაცული გადახდით.
              </p>

              <div className="mt-7 rounded-card border border-ink-200 bg-white p-5 sm:p-6">
                <Eyebrow tone="muted" className="mb-4">შენი არჩევანი</Eyebrow>
                <div className="space-y-4">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500 mb-1.5">სფეროები</div>
                    <div className="flex flex-wrap gap-1.5">
                      {areas.length ? areas.map(id => (
                        <span key={id} className="inline-flex items-center h-7 px-3 rounded-pill bg-ink-50 border border-ink-200 font-display text-[12px] font-semibold text-ink-800">
                          {AREAS.find(a => a.id === id)?.l ?? id}
                        </span>
                      )) : <span className="text-[12.5px] text-ink-500">ჯერ არ არჩეული</span>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-1">
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500 mb-1">ეტაპი</div>
                      <div className="font-display text-[13.5px] font-semibold text-ink-900">{LEVELS.find(l => l.id === level)?.l ?? '—'}</div>
                    </div>
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500 mb-1">მაქს. ბიუჯეტი</div>
                      <div className="font-display text-[13.5px] font-semibold text-ink-900 tabular-nums">₾{budget} / სესია</div>
                    </div>
                  </div>
                </div>
                <p className="mt-5 pt-4 border-t border-ink-100 text-[12px] text-ink-500 leading-snug">
                  „დასრულება“ გადაგიყვანს შენზე მორგებულ ექსპერტებთან.
                </p>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="mt-10 pt-6 border-t border-ink-100 flex items-center justify-between gap-3">
            <button type="button" onClick={() => step > 1 && setStep(step - 1)} disabled={step === 1} className="h-11 px-3 rounded-btn text-ink-600 hover:text-ink-900 hover:bg-ink-50 disabled:text-ink-300 disabled:hover:bg-transparent font-display font-semibold text-[12.5px] inline-flex items-center gap-1.5 transition-colors">
              <Icon.back className="w-3.5 h-3.5" /> უკან
            </button>
            {step < 4 ? (
              <button type="button" onClick={() => setStep(step + 1)} disabled={step === 1 && areas.length === 0} className="h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 disabled:bg-ink-200 disabled:text-ink-400 text-white font-display font-semibold text-[13px] tracking-wide inline-flex items-center gap-2 transition-colors">
                შემდეგი
              </button>
            ) : (
              <button type="button" onClick={finish} disabled={areas.length === 0} className="h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 disabled:bg-ink-200 disabled:text-ink-400 text-white font-display font-semibold text-[13px] tracking-wide inline-flex items-center gap-2 transition-colors">
                <Icon.spark className="w-3.5 h-3.5" /> დასრულება
              </button>
            )}
          </div>
        </div>
      </div>
    </Container>
  )
}

/* ═══════════════════════════════════════════════════════════════════ */
/* PAGE                                                                 */
/* ═══════════════════════════════════════════════════════════════════ */

// Shared auth page client — rendered by BOTH routes:
//   /signin → <AuthPage defaultView="signin" />
//   /signup → <AuthPage defaultView="signup" />
// useSearchParams requires a Suspense boundary in Next 15.
export default function AuthPage({ defaultView = 'signin' }: { defaultView?: View }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <AuthInner defaultView={defaultView} />
    </Suspense>
  )
}

function AuthInner({ defaultView }: { defaultView: View }) {
  const params = useSearchParams()
  const router = useRouter()

  // View is derived from the URL — the single source of truth. This renders
  // the correct view on first paint (no signin flash for `?view=signup`) and
  // re-syncs automatically on browser back/forward or shared `?view=` links.
  // Without an explicit `?view=`, the route's own default applies (so `/signup`
  // shows the signup form on a clean URL).
  const view = viewFromParams(params, defaultView)

  // Keep the tab title in sync with the visible view (see VIEW_TITLES).
  useEffect(() => { document.title = VIEW_TITLES[view] }, [view])

  // Switching views navigates to the view's canonical URL so route and view
  // never drift: signin → /signin, signup → /signup (first-class routes),
  // everything else → /signin?view=…. Other params (email, redirect/next) are
  // preserved; push() keeps a back-navigable history.
  const setView = (next: View) => {
    const qp = new URLSearchParams(params?.toString() ?? '')
    qp.delete('view')
    // Leaving the verify step via "სხვა ელფოსტა" (or back to signin) must not
    // carry the old address into the next form's prefill.
    if (view === 'verify') qp.delete('email')
    let path = '/signin'
    if (next === 'signup') path = '/signup'
    else if (next !== 'signin') qp.set('view', next)
    const qs = qp.toString()
    router.push(qs ? `${path}?${qs}` : path)
  }

  return (
    <div className="font-sans bg-white text-ink-900 antialiased">
      <PublicTopBar />
      {view === 'signin' && <SignInView setView={setView} />}
      {view === 'signup' && <SignUpView setView={setView} />}
      {view === 'verify' && <VerifyView setView={setView} />}
      {view === 'reset'  && <ResetView setView={setView} />}
      {view === 'onboarding' && <OnboardingView setView={setView} />}
      <Footer />
    </div>
  )
}


