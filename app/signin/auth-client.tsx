'use client'
import React, { useState, useRef, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

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

function redirectAfterSignin(role: string) {
  const explicit = readRedirectParam()
  const dest = explicit
    ?? (role === 'ADMIN' ? '/admin' : role === 'TUTOR' ? '/tutor' : '/student')
  window.location.href = dest
}

/* ───── Icons ───── */
const Icon = {
  arrow:   (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14M13 5l7 7-7 7" /></svg>,
  back:    (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M19 12H5M11 19l-7-7 7-7" /></svg>,
  check:   (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m4 12 5 5L20 6" /></svg>,
  eye:     (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>,
  eyeOff:  (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m3 3 18 18M10.6 6.1A10 10 0 0 1 12 6c6.5 0 10 7 10 7a17 17 0 0 1-3.1 4M6.4 7.6A17 17 0 0 0 2 12s3.5 7 10 7c1.3 0 2.5-.2 3.6-.7M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>,
  star:    (p: any) => <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="m12 2 2.95 6.5L22 9.3l-5.2 4.9 1.4 7L12 17.8 5.8 21.2l1.4-7L2 9.3l7.05-.8L12 2Z" /></svg>,
  lock:    (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="4.5" y="11" width="15" height="10" rx="2" /><path d="M8 11V7.5a4 4 0 0 1 8 0V11" /></svg>,
  shield:  (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></svg>,
  mail:    (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 5.5L20 7" /></svg>,
  phone:   (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 16.9v2.7a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h2.7a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L7.1 10a16 16 0 0 0 6 6l1.5-1.5a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2Z" /></svg>,
  refresh: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 12a9 9 0 0 1 15.5-6L21 4M21 4v6h-6M21 12a9 9 0 0 1-15.5 6L3 20M3 20v-6h6" /></svg>,
  warn:    (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3 2 21h20L12 3Z" /><path d="M12 10v5M12 18h0" /></svg>,
  camera:  (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 8a2 2 0 0 1 2-2h2.5l1.5-2h6l1.5 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" /><circle cx="12" cy="13" r="3.5" /></svg>,
  video:   (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="2" y="6" width="14" height="12" rx="2" /><path d="m16 10 6-3v10l-6-3" /></svg>,
  play:    (p: any) => <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M8 5v14l11-7L8 5Z" /></svg>,
  upload:  (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>,
  file:    (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5" /></svg>,
  plus:    (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 5v14M5 12h14" /></svg>,
  x:       (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m6 6 12 12M18 6 6 18" /></svg>,
  trash:   (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6" /></svg>,
  spark:   (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" /></svg>,
  globe:   (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18" /></svg>,
  info:    (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9" /><path d="M12 16v-5M12 8v.01" /></svg>,
  clock:   (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  heart:   (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 20s-7-4.4-9.5-9A5 5 0 0 1 12 6a5 5 0 0 1 9.5 5C19 15.6 12 20 12 20Z" /></svg>,
}

const Logo = ({ size = 'md' }: { size?: 'sm' | 'md' }) => (
  <div className="inline-flex items-center" aria-label="მცოდნე">
    <img src="/logo.svg" alt="მცოდნე" className={`${size === 'sm' ? 'h-6' : 'h-7'} w-auto object-contain select-none`} draggable={false} />
  </div>
)

const VerifiedMark = ({ size = 14 }: { size?: number }) => (
  <span className="inline-flex items-center justify-center rounded-full bg-brand-500 text-white shrink-0" style={{ width: size, height: size }}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" width={size * 0.55} height={size * 0.55}><path d="m4 12 5 5L20 6" /></svg>
  </span>
)

const GoogleMark = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4">
    <path fill="#4285F4" d="M22.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h5.9a5.03 5.03 0 0 1-2.18 3.3v2.74h3.53c2.06-1.9 3.25-4.72 3.25-8.23Z" />
    <path fill="#34A853" d="M12 23c2.94 0 5.4-.98 7.2-2.65l-3.52-2.74c-.98.66-2.23 1.05-3.68 1.05a6.45 6.45 0 0 1-6.05-4.45H2.31v2.83A10.92 10.92 0 0 0 12 23Z" />
    <path fill="#FBBC05" d="M5.95 14.21A6.6 6.6 0 0 1 5.6 12c0-.77.13-1.51.35-2.21V6.96H2.31A11 11 0 0 0 1.08 12c0 1.78.43 3.46 1.23 4.99l3.64-2.78Z" />
    <path fill="#EA4335" d="M12 5.36c1.6 0 3.04.55 4.17 1.63l3.12-3.12C17.4 2.1 14.94 1 12 1A10.92 10.92 0 0 0 2.31 6.96l3.64 2.83C6.82 7.32 9.21 5.36 12 5.36Z" />
  </svg>
)

const AppleMark = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 text-ink-900" fill="currentColor">
    <path d="M16.4 12.8c0-2.4 2-3.6 2.1-3.6-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.6.9-.8 0-1.9-.9-3.1-.8-1.6 0-3 .9-3.8 2.4-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.4 1.2 0 1.6-.7 3-.7 1.4 0 1.8.7 3.1.7 1.3 0 2.1-1.2 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7 0-.1-2.5-.9-2.5-3.7ZM14 5.6c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.7-1.3Z" />
  </svg>
)

const inputCls = 'w-full h-12 px-3.5 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-[14.5px] text-ink-900 placeholder:text-ink-400 transition-colors'

const Field = ({ label, hint, optional, required, children }: { label: string; hint?: string; optional?: boolean; required?: boolean; children: React.ReactNode }) => (
  <div>
    <label className="flex items-baseline gap-2 mb-2">
      <span className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700">{label}{required && <span className="text-danger-500 ml-0.5" aria-hidden>*</span>}</span>
      {optional && <span className="text-[10.5px] text-ink-400">სურვილისამებრ</span>}
    </label>
    {children}
    {hint && <p className="mt-1.5 text-[11.5px] text-ink-500">{hint}</p>}
  </div>
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
          className={`w-11 h-13 sm:w-[52px] sm:h-14 rounded-card border-2 bg-white text-center font-display text-[22px] font-bold text-ink-900 tabular-nums focus:ring-2 focus:ring-brand-100 focus:outline-none transition-colors ${d ? 'border-brand-500' : 'border-ink-200 focus:border-brand-500'}`}
        />
      ))}
    </div>
  )
}

/* ───── Auth shell — header + footer ───── */
const AuthHeader = ({ view, setView }: { view: View; setView: (v: View) => void }) => (
  <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-ink-200">
    <div className="max-w-[1280px] mx-auto px-6 sm:px-8 lg:px-12 h-16 flex items-center justify-between gap-4">
      <button type="button" onClick={() => setView('signin')}><Logo /></button>
      <nav className="hidden md:flex items-center gap-2">
        {/* Language toggle disabled until i18n lands — a button that does
            nothing is worse than absent chrome. */}
        <span className="inline-flex items-center gap-1 h-9 px-2.5 rounded-pill bg-ink-50 text-ink-500 cursor-default" title="მალე გახდება ხელმისაწვდომი">
          <Icon.globe className="w-3.5 h-3.5" />
          <span className="font-display text-[11px] font-semibold uppercase tracking-[0.14em]">ქარ</span>
        </span>
        <div className="w-px h-5 bg-ink-200 mx-1.5" />
        {view === 'signin' ? (
          <>
            <span className="text-[12.5px] text-ink-600">პირველად აქ ხარ?</span>
            <button type="button" onClick={() => setView('signup')} className="h-9 px-3.5 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] tracking-wide inline-flex items-center gap-1.5 transition-colors">
              შექმენი ანგარიში <Icon.arrow className="w-3.5 h-3.5" />
            </button>
          </>
        ) : view === 'signup' ? (
          <>
            <span className="text-[12.5px] text-ink-600">გყავს ანგარიში?</span>
            <button type="button" onClick={() => setView('signin')} className="h-9 px-3.5 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] tracking-wide inline-flex items-center gap-1.5 transition-colors">
              შესვლა <Icon.arrow className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setView('signin')} className="h-9 px-3 rounded-btn font-display font-semibold text-[12.5px] tracking-wide text-ink-700 hover:bg-ink-50 inline-flex items-center gap-1.5 transition-colors">
            <Icon.back className="w-3.5 h-3.5" /> შესვლის გვერდზე
          </button>
        )}
      </nav>
      {/* Mobile header CTA mirrors the desktop nav: always offers the
          OTHER view, never the one already on screen. */}
      <button
        type="button"
        onClick={() => setView(view === 'signup' ? 'signin' : 'signup')}
        className="md:hidden h-10 px-3.5 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12px] tracking-wide inline-flex items-center gap-1 transition-colors"
      >
        {view === 'signup' ? 'შესვლა' : 'რეგისტრაცია'}
      </button>
    </div>
  </header>
)

const AuthFooter = () => (
  <footer className="border-t border-ink-200 bg-white">
    <div className="max-w-[1280px] mx-auto px-6 sm:px-8 lg:px-12 py-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div className="flex items-center gap-3 text-[12px] text-ink-500">
        <Icon.shield className="w-3.5 h-3.5 text-ink-400" />
        <span>SSL · bcrypt · 2FA მზადაა</span>
        <span className="hidden sm:inline text-ink-300">·</span>
        <span className="hidden sm:inline">escrow: <span className="font-display font-semibold text-ink-700">TBC</span> · <span className="font-display font-semibold text-ink-700">BOG</span> · <span className="font-display font-semibold text-ink-700">SOLO</span></span>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-ink-500">
        <a href="/terms" className="hover:text-ink-900 transition-colors min-h-[32px] inline-flex items-center">წესები</a>
        <a href="/privacy" className="hover:text-ink-900 transition-colors min-h-[32px] inline-flex items-center">კონფიდენციალურობა</a>
        <a href="/help" className="hover:text-ink-900 transition-colors min-h-[32px] inline-flex items-center">დახმარება</a>
        <span className="text-ink-300">·</span>
        <span>© 2026 მცოდნე</span>
      </div>
    </div>
  </footer>
)

/* ═══════════════════════════════════════════════════════════════════ */
/* SIGN IN VIEW                                                         */
/* ═══════════════════════════════════════════════════════════════════ */

const SignInIntro = () => (
  <div>
    {/* Trust pill */}
    <span className="inline-flex items-center gap-2 h-7 pl-2.5 pr-3 rounded-pill bg-white border border-ink-200 shadow-xs mb-8">
      <Icon.shield className="w-3.5 h-3.5 text-brand-600" />
      <span className="text-[12px] text-ink-700">ხელით შერჩეული, გადამოწმებული ექსპერტები</span>
    </span>

    <h1 className="font-display text-[34px] xs:text-[38px] sm:text-[44px] lg:text-[64px] font-bold leading-[1.02] sm:leading-[0.96] tracking-[-0.028em] text-ink-900 motion-safe:animate-rise-in">
      კეთილი იყოს<br />
      <span className="text-brand-600">დაბრუნება.</span>
    </h1>
    <p className="text-[14.5px] sm:text-[17px] text-ink-700 mt-5 sm:mt-7 leading-[1.6] max-w-[440px] motion-safe:animate-rise-in" style={{ animationDelay: '80ms' }}>
      ხელით შერჩეული ექსპერტები გელოდება. შესვლა წამში — სესია 60 წამში. სადაც გაჩერდი, იქიდან განაგრძე.
    </p>

    {/* Avatar stack + count */}
    <div className="mt-10 lg:mt-12 pt-8 border-t border-ink-200 flex items-center gap-3.5">
      <div className="flex -space-x-2.5">
        {[12, 33, 47, 5, 22].map(i => (
          <img key={i} src={`https://i.pravatar.cc/80?img=${i}`} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-white" />
        ))}
        <div className="w-9 h-9 rounded-full bg-ink-100 ring-2 ring-white inline-flex items-center justify-center font-display text-[10.5px] font-bold tabular-nums text-ink-700">+133</div>
      </div>
      <div className="text-[13px] text-ink-700">
        <div className="font-display font-semibold text-ink-900">+138 ექსპერტი ხელმისაწვდომი</div>
        <div className="text-[11.5px] text-ink-500 mt-0.5">დღეს · საშუალო პასუხის დრო 4 წთ</div>
      </div>
    </div>

    {/* Editorial testimonial */}
    <figure className="mt-9 lg:mt-10 pt-8 border-t border-ink-200">
      <span className="inline-flex items-center gap-0.5 text-warning-500 mb-4">
        {Array.from({ length: 5 }).map((_, i) => <Icon.star key={i} className="w-4 h-4" />)}
      </span>
      <blockquote className="font-display text-[20px] lg:text-[24px] leading-[1.35] font-medium tracking-[-0.005em] text-ink-800">
        „45 წუთში მივიღე პასუხი იმაზე, რასაც 3 თვე ვეძებდი. ფასი — ერთი ლანჩი."
      </blockquote>
      <figcaption className="mt-5 flex items-center gap-3">
        <img src="https://i.pravatar.cc/120?img=47" alt="" className="w-9 h-9 rounded-full object-cover ring-1 ring-ink-200" />
        <div className="min-w-0">
          <div className="font-display text-[13.5px] font-bold text-ink-900 tracking-tight">ანი ბერიძე</div>
          <div className="text-[11.5px] text-ink-500">Founder · Solo</div>
        </div>
      </figcaption>
    </figure>
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
          'შეცდომა, ცადეთ თავიდან'
        )
        setSubmitting(false)
        return
      }
      redirectAfterSignin(data.role)
    } catch {
      setErrMsg('ქსელის შეცდომა')
      setSubmitting(false)
    }
  }

  return (
    <div className="w-full">
      <div className="bg-white rounded-card border border-ink-200 shadow-card p-7 sm:p-8 lg:p-9 motion-safe:animate-scale-in" style={{ animationDelay: '160ms' }}>
        <div className="mb-7 lg:mb-8">
          <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-2">შესვლა · 30 წამში</div>
          <div className="font-display text-[20px] font-bold text-ink-900 tracking-tight">აქტიური ანგარიში</div>
          <p className="text-[13px] text-ink-500 mt-1.5 leading-snug">გააგრძელე იქიდან, სადაც გაჩერდი.</p>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <a href="/api/auth/google" className="h-12 px-4 rounded-btn border border-ink-200 bg-white hover:bg-ink-50 hover:border-ink-300 inline-flex items-center justify-center gap-2.5 font-display font-medium text-[13px] text-ink-800 tracking-wide transition-colors">
            <GoogleMark /> Google
          </a>
          <button type="button" disabled aria-disabled title="მალე გახდება ხელმისაწვდომი" className="h-12 px-4 rounded-btn border border-ink-200 bg-ink-50 inline-flex items-center justify-center gap-2.5 font-display font-medium text-[13px] text-ink-400 tracking-wide cursor-not-allowed">
            <AppleMark /> Apple
            <span className="text-[9.5px] font-semibold uppercase tracking-widest text-ink-400 ml-1">მალე</span>
          </button>
        </div>

        <div className="flex items-center gap-3 my-7">
          <div className="flex-1 h-px bg-ink-200" />
          <span className="font-display text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-400">ან ელფოსტით</span>
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
            <span className="text-[13px] text-ink-700">გახსოვდე ჩემი მოწყობილობა 30 დღით</span>
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
                <svg viewBox="0 0 24 24" className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" /></svg>
                ვამოწმებთ…
              </>
            ) : (
              <>შესვლა <Icon.arrow className="w-4 h-4" /></>
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
        <button type="button" onClick={() => setView('signup')} className="font-display font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-2 decoration-brand-300">დარეგისტრირდი · ანგარიში წამში</button>
      </p>
    </div>
  )
}

const SignInView = ({ setView }: { setView: (v: View) => void }) => (
  <main id="main" className="relative max-w-[1280px] mx-auto px-5 sm:px-10 lg:px-12 pt-6 sm:pt-14 lg:pt-20 pb-16 sm:pb-20 lg:pb-24">
    {/* Mobile is form-first: the marketing intro (headline, avatars,
        testimonial) drops BELOW the form so the email field is the first
        thing on screen. Desktop keeps intro-left / form-right. */}
    <div className="grid lg:grid-cols-[1fr_minmax(0,520px)] gap-10 sm:gap-14 lg:gap-16 xl:gap-24 items-start">
      <div className="order-2 lg:order-1 min-w-0"><SignInIntro /></div>
      <div className="order-1 lg:order-2 min-w-0"><SignInForm setView={setView} /></div>
    </div>
  </main>
)

/* ═══════════════════════════════════════════════════════════════════ */
/* SIGN UP VIEW                                                         */
/* ═══════════════════════════════════════════════════════════════════ */

const RoleSwitch = ({ role, setRole }: { role: 'learn' | 'teach'; setRole: (r: 'learn' | 'teach') => void }) => (
  <div className="grid grid-cols-2 gap-2 p-1.5 rounded-card bg-ink-100 mb-8">
    {[
      { v: 'learn' as const, t: 'ვეძებ ექსპერტს', s: 'კლიენტი · 60 წმ' },
      { v: 'teach' as const, t: 'ვარ ექსპერტი',   s: 'მინდა ვაკონსულტირო · ~12 წთ' },
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
  const [topic, setTopic] = useState('ბიზნეს-სტრატეგია')
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
    if (!first) { setErrMsg('შეიყვანე სახელი'); return }
    if (!email) { setErrMsg('შეიყვანე ელფოსტა'); return }
    if (pw.length < 8) { setErrMsg('პაროლი მინიმუმ 8 სიმბოლო'); return }
    if (!agree) { setErrMsg('დაეთანხმე წესებს'); return }
    setSubmitting(true); setErrMsg(null)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: first.trim(), email: email.trim().toLowerCase(), password: pw, role: 'STUDENT' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrMsg(
          data.error === 'EMAIL_TAKEN' ? 'ეს ელფოსტა უკვე გამოყენებულია' :
          data.error === 'INVALID' ? 'შეავსე ყველა ველი (პაროლი მინიმუმ 8 სიმბოლო)' :
          data.error === 'RATE_LIMITED' ? `ბევრი მცდელობა — სცადე ${Math.ceil((data.retryInSec ?? 60)/60)} წუთში` :
          'შეცდომა, ცადეთ თავიდან'
        )
        setSubmitting(false)
        return
      }
      // Kick off email verification (non-blocking) and redirect to verify view.
      fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), purpose: 'verify' }),
      }).catch(() => {})
      clearSignupDraft()
      window.location.href = `/signin?view=verify&email=${encodeURIComponent(email.trim().toLowerCase())}`
    } catch {
      setErrMsg('ქსელის შეცდომა')
      setSubmitting(false)
    }
  }

  return (
    <div>
      {/* Google/Apple SSO are not wired yet — mirror the SignInForm treatment
          (disabled + "მალე" tooltip) so users don't get a dead click. */}
      <div className="grid grid-cols-2 gap-2.5">
        <a href="/api/auth/google" className="h-12 px-4 rounded-btn border border-ink-200 bg-white hover:bg-ink-50 hover:border-ink-300 inline-flex items-center justify-center gap-2.5 font-display font-medium text-[13px] text-ink-800 tracking-wide transition-colors"><GoogleMark /> Google</a>
        <button type="button" disabled aria-disabled="true" title="მალე გახდება ხელმისაწვდომი" className="h-12 px-4 rounded-btn border border-ink-200 bg-ink-50 inline-flex items-center justify-center gap-2.5 font-display font-medium text-[13px] text-ink-400 tracking-wide cursor-not-allowed">
          <AppleMark /> Apple
        </button>
      </div>

      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px bg-ink-200" />
        <span className="font-display text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-400">ან შეავსე</span>
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

        <Field label="რა გაინტერესებს" optional>
          <div className="flex flex-wrap gap-1.5">
            {['ბიზნეს-სტრატეგია', 'კარიერა', 'საგადასახადო', 'მარკეტინგი', 'სამართალი', 'პროდუქტი'].map(t => (
              <button key={t} type="button" onClick={() => setTopic(t)} className={`px-3 h-8 rounded-pill text-[12.5px] font-display font-medium tracking-wide transition-colors ${topic === t ? 'bg-accent-600 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'}`}>
                {t}
              </button>
            ))}
          </div>
        </Field>

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

        <button type="submit" disabled={submitting || !agree || !first || !email || pw.length < 8} className="w-full h-12 mt-2 rounded-btn bg-brand-500 hover:bg-brand-600 disabled:bg-ink-200 disabled:text-ink-400 disabled:cursor-not-allowed text-white font-display font-semibold text-[14px] tracking-wide inline-flex items-center justify-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2">
          {submitting ? (
            <>
              <svg viewBox="0 0 24 24" className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" /></svg>
              ვქმნით ანგარიშს…
            </>
          ) : (
            <>ანგარიშის შექმნა <Icon.arrow className="w-4 h-4" /></>
          )}
        </button>
        {!submitting && (!first || !email || pw.length < 8 || !agree) && (
          // One next-step hint at a time — why the button is grey.
          <p className="text-[11.5px] text-ink-500 text-center">
            {!first ? 'შეიყვანე სახელი' : !email ? 'შეიყვანე ელფოსტა' : pw.length < 8 ? 'პაროლი — მინიმუმ 8 სიმბოლო' : 'დაეთანხმე წესებს გასაგრძელებლად'}
          </p>
        )}

        <p className="text-center text-[12.5px] text-ink-500 mt-2 leading-relaxed">
          ანგარიშის შექმნა უფასოა — პირველ სესიას დაჯავშნი <span className="font-display font-semibold text-brand-700">წუთებში</span>, escrow-ით დაცულად.
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
          'შეცდომა, ცადეთ თავიდან'
        )
        setSubmitting(false)
        return
      }
      // Fire off email verification (non-blocking), then hand off to /apply —
      // the single expert-onboarding form. No expert data is collected here.
      fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), purpose: 'verify' }),
      }).catch(() => {})
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
            აქ მხოლოდ ანგარიშს შევქმნით. ექსპერტიზას, პორტფოლიოსა და ფასს <span className="font-display font-semibold text-ink-800">შემდეგ გვერდზე</span> შეავსებ — ერთხელ. განცხადებას გავამოწმებთ <span className="font-display font-semibold text-ink-800">48 საათში</span>.
          </p>
        </div>
      </div>

      <div className="p-6 lg:p-8">
        {/* SSO not wired yet — disabled to avoid a dead click (mirrors sign-in). */}
        <div className="grid grid-cols-2 gap-2.5">
          <a href="/api/auth/google" className="h-12 px-4 rounded-btn border border-ink-200 bg-white hover:bg-ink-50 hover:border-ink-300 inline-flex items-center justify-center gap-2.5 font-display font-medium text-[13px] text-ink-800 tracking-wide transition-colors"><GoogleMark /> Google</a>
          <button type="button" disabled aria-disabled="true" title="მალე გახდება ხელმისაწვდომი" className="h-12 px-4 rounded-btn border border-ink-200 bg-ink-50 inline-flex items-center justify-center gap-2.5 font-display font-medium text-[13px] text-ink-400 tracking-wide cursor-not-allowed">
            <AppleMark /> Apple
          </button>
        </div>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-ink-200" />
          <span className="font-display text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-400">ან შეავსე</span>
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
                <svg viewBox="0 0 24 24" className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" /></svg>
                ვქმნით ანგარიშს…
              </>
            ) : (
              <>ანგარიშის შექმნა და გაგრძელება <Icon.arrow className="w-4 h-4" /></>
            )}
          </button>
          {!submitting && (!first.trim() || !last.trim() || !email || pw.length < 8 || !agree) && (
            <p className="text-[11.5px] text-ink-500 text-center">
              {!first.trim() ? 'შეიყვანე სახელი' : !last.trim() ? 'შეიყვანე გვარი' : !email ? 'შეიყვანე ელფოსტა' : pw.length < 8 ? 'პაროლი — მინიმუმ 8 სიმბოლო' : 'დაეთანხმე წესებს გასაგრძელებლად'}
            </p>
          )}

          <p className="text-center text-[12.5px] text-ink-500 mt-2 leading-relaxed">
            შემდეგ ნაბიჯზე — ექსპერტის სრული განცხადება, <span className="font-display font-semibold text-brand-700">ერთხელ</span> შესავსები.
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
      <span className="inline-flex items-center gap-1 h-4 px-1.5 rounded-pill bg-brand-500 text-white font-display text-[9px] font-bold uppercase tracking-[0.14em]">{role === 'learn' ? '60წმ' : '12წთ'}</span>
      <span className="text-[12px] text-ink-700 font-display font-medium">
        {role === 'learn' ? 'მცოდნე-ის რეგისტრაცია' : 'ექსპერტის განცხადება'}
      </span>
    </span>

    {role === 'learn' ? (
      <>
        <h1 className="font-display text-[44px] lg:text-[64px] font-bold leading-[0.96] tracking-[-0.03em] text-ink-900 motion-safe:animate-rise-in">
          შემოგვიერთდი.<br />
          <span className="text-brand-600">ფასი წინასწარ ცნობილია.</span>
        </h1>
        <p className="text-[16px] sm:text-[17px] text-ink-700 mt-6 sm:mt-7 leading-[1.6] max-w-[440px]">
          ანგარიში წამში იქმნება. თანხა ინახება <span className="font-display font-semibold text-ink-900">escrow-ში</span> სესიის ბოლომდე — ფასი წინასწარ ცნობილია, გადაიხდი მხოლოდ შედეგზე.
        </p>

        <ol className="mt-10 lg:mt-12 space-y-6">
          {[
            { n: '01', t: 'ფასი წინასწარ ცნობილია', d: 'ერთი ფასი, ერთი გვერდი — გადაიხდი მხოლოდ დაჯავშნისას.' },
            { n: '02', t: 'Escrow დაცვა',        d: 'თანხა გადადის მხოლოდ წარმატებული სესიის შემდეგ.' },
            { n: '03', t: 'ხელით გადამოწმებული', d: 'ყოველი ექსპერტი ინდივიდუალურად ვამოწმებთ — CV, პორტფოლიო, ვიდეო-გასაუბრება.' },
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

        {/* Avatar proof */}
        <div className="mt-10 lg:mt-12 pt-8 border-t border-ink-200 flex items-center gap-3.5">
          <div className="flex -space-x-2.5">
            {[12, 33, 47, 5].map(i => (
              <img key={i} src={`https://i.pravatar.cc/80?img=${i}`} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-white" />
            ))}
            <div className="w-9 h-9 rounded-full bg-ink-100 ring-2 ring-white inline-flex items-center justify-center font-display text-[10.5px] font-bold tabular-nums text-ink-700">+138</div>
          </div>
          <div className="text-[12.5px] text-ink-700">
            <div className="font-display font-semibold text-ink-900">3,200+ მომხმარებელი უკვე გვერდითაა</div>
            <div className="text-[11px] text-ink-500 mt-0.5">საშუალო შეფასება <span className="font-display font-semibold text-ink-700">4.94</span> · 2,400+ მიმოხილვა</div>
          </div>
        </div>
      </>
    ) : (
      <>
        <h1 className="font-display text-[44px] lg:text-[64px] font-bold leading-[0.96] tracking-[-0.03em] text-ink-900">
          გახდი მცოდნე.<br />
          <span className="text-brand-600">შემოსავალი — 7 დღეში.</span>
        </h1>
        <p className="text-[16px] sm:text-[17px] text-ink-700 mt-6 sm:mt-7 leading-[1.6] max-w-[440px]">
          შენ ირჩევ ფასს, დროს და თემას. ჩვენ ვუვლით escrow-ს, გადასახადებსა და მომხმარებლების მოძიებას. <span className="font-display font-semibold text-ink-900">15% საკომისიო</span> — საუკეთესო ბაზარზე.
        </p>

        <dl className="mt-10 lg:mt-12 grid grid-cols-3 gap-x-6 sm:gap-x-8">
          {[
            { n: '15%',    l: 'საკომისიო',     d: 'ბაზრის ნორმა · 25%' },
            { n: '₾2 400', l: 'საშ. შემოს. / თვე', d: 'მე-3 თვიდან' },
            { n: '94%',    l: 'ბრუნდება',       d: 'მე-2 თვეშიც' },
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
              { n: '01', t: 'შეავსე განცხადება',  d: '~12 წუთი' },
              { n: '02', t: 'ჩვენი რევიუ',         d: '48 საათში' },
              { n: '03', t: 'პროფილი ცოცხალდება',  d: 'დასტურის შემდეგ' },
              { n: '04', t: 'პირველი გადარიცხვა',  d: '7 დღეში' },
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
  return (
    <main id="main" className="relative max-w-[1280px] mx-auto px-6 sm:px-10 lg:px-12 pt-6 sm:pt-14 lg:pt-20 pb-16 lg:pb-20">
      {/* Form-first on mobile (see SignInView) — the role switch + form come
          before the pitch so signup starts immediately. */}
      <div className={`grid gap-12 lg:gap-20 items-start ${role === 'teach' ? 'lg:grid-cols-[1fr_1.15fr]' : 'lg:grid-cols-2'}`}>
        <div className="order-2 lg:order-1 min-w-0"><SignUpIntro role={role} /></div>
        <div className="order-1 lg:order-2 min-w-0">
          <RoleSwitch role={role} setRole={setRole} />
          {role === 'learn' ? <StudentSignUp setView={setView} /> : <TutorSignUp setView={setView} />}
        </div>
      </div>
    </main>
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
            // an in-app path; otherwise route by role.
            const nextRaw = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('next') : null
            const safeNext = nextRaw && nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : null
            const dest = safeNext ?? (body.role === 'ADMIN' ? '/admin' : body.role === 'TUTOR' ? '/tutor' : '/student')
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
    <main id="main" className="relative max-w-[520px] mx-auto px-6 lg:px-8 pt-14 lg:pt-20 pb-20">
      <div className="flex items-baseline justify-between gap-3 mb-10 pb-5 border-b border-ink-100">
        <span className="font-display text-[10px] font-semibold uppercase tracking-[0.24em] text-ink-500 tabular-nums">№ 03/04 · ნაბიჯი</span>
        <span className="font-mono text-[10px] tabular-nums text-ink-400">VERIFY · 06/13</span>
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
            <span className="text-ink-500">დაიწყე მცოდნე-ზე.</span>
          </h1>
          <p className="mt-4 text-[14px] text-ink-600 leading-[1.6]">პირველი სესია დაჯავშნე წუთებში — ექსპერტები მზად არიან.</p>
          <button type="button" onClick={() => setView('onboarding')} className="mt-7 h-12 px-6 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13.5px] inline-flex items-center gap-2 transition-colors">
            გავაგრძელოთ <Icon.arrow className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="w-16 h-16 rounded-full bg-brand-50 text-brand-700 inline-flex items-center justify-center mb-6">
            <Icon.mail className="w-7 h-7" />
          </div>
          <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-2">ელფოსტის დადასტურება</div>
          <h1 className="font-display text-[34px] lg:text-[40px] font-bold text-ink-900 tracking-tight leading-[1.1]">
            6-ციფრიანი კოდი —<br />
            <span className="text-ink-500 break-all">{email || 'შენ ელფოსტაზე'}</span>
          </h1>
          <p className="mt-4 text-[14px] text-ink-600 leading-[1.6] max-w-[400px]">
            შემოვა 30 წამში — შეამოწმე inbox და spam. გამგზავნი — <span className="font-display font-semibold text-ink-700">no-reply@mcodne.ge</span>
          </p>

          <div className="mt-8 flex items-center justify-center">
            <CodeInput value={code} onChange={setCode} />
          </div>

          {verifying && (
            <div className="mt-5 inline-flex items-center justify-center w-full gap-2 font-display text-[12.5px] font-semibold text-brand-700">
              <svg viewBox="0 0 24 24" className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" /></svg>
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
            კოდი არ მოვიდა? Spam / Promotions შემოწმდი. თუ 2 წუთში მაინც არაა — მოგვწერე <a href="mailto:hi@mcodne.ge" className="font-medium text-brand-700 hover:text-brand-800 underline underline-offset-2">hi@mcodne.ge</a>-ზე.
          </div>
        </>
      )}
    </main>
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
      setStep('done')
    } catch {
      setErrMsg('ქსელის შეცდომა. სცადე თავიდან.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main id="main" className="relative max-w-[560px] mx-auto px-6 lg:px-8 pt-14 lg:pt-20 pb-20">
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
                }`}>{done ? <Icon.check className="w-2.5 h-2.5" /> : i + 1}</span>
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
            <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-2">დაგვიწყდა პაროლი</div>
            <h1 className="font-display text-[28px] lg:text-[34px] font-bold text-ink-900 tracking-tight leading-[1.1]">
              მოგვწერე ელფოსტა — დანარჩენი<br /> 30 წამში მოვაგვარებთ.
            </h1>
            <p className="mt-3 text-[14px] text-ink-600 leading-[1.55] max-w-[440px]">
              ერთჯერად ბმულს გავუგზავნით ანგარიშის ელფოსტაზე. ბმული ცარიელდება 15 წუთში.
            </p>
            <label className="block mt-7">
              <span className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700">ანგარიშის ელფოსტა</span>
              <input type="email" autoFocus value={email} onChange={e => { setEmail(e.target.value); if (errMsg) setErrMsg(null) }} placeholder="anu@gmail.com" className="w-full mt-2 h-12 px-3.5 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-[14.5px] text-ink-900 placeholder:text-ink-400 transition-colors" />
            </label>
            <button type="submit" disabled={!email || sending} className="mt-6 w-full h-12 rounded-btn bg-brand-500 hover:bg-brand-600 disabled:bg-ink-200 disabled:text-ink-400 text-white font-display font-semibold text-[14px] tracking-wide inline-flex items-center justify-center gap-2 transition-colors">
              {sending ? (
                <>
                  <svg viewBox="0 0 24 24" className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" /></svg>
                  ვუგზავნით…
                </>
              ) : (
                <>გავაგზავნოთ ბმული <Icon.arrow className="w-4 h-4" /></>
              )}
            </button>
            <div className="mt-5 grid grid-cols-[auto_1fr] gap-2.5 items-start p-3.5 rounded-card bg-ink-50/60 border border-ink-200">
              <Icon.shield className="w-4 h-4 text-ink-500 mt-0.5" />
              <p className="text-[11.5px] text-ink-600 leading-[1.5]">
                თუ ანგარიში არ ჩანს ჩვენთან, არ მოგწერთ — უსაფრთხოებისთვის. შემოწმე ჯერ ნახე spam, შემდეგ მოგვწერე <a href="mailto:hi@mcodne.ge" className="text-brand-700 hover:text-brand-800 font-medium underline underline-offset-2 decoration-brand-300">hi@mcodne.ge</a>.
              </p>
            </div>
          </form>
        )}

        {step === 'check' && (
          <div>
            <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-2">შემოწმე შენი Inbox</div>
            <h1 className="font-display text-[28px] lg:text-[34px] font-bold text-ink-900 tracking-tight leading-[1.1]">
              ბმული გავუგზავნეთ —<br /><span className="text-ink-500 break-all">{email || 'შენ ელფოსტაზე'}</span>
            </h1>
            <p className="mt-3 text-[14px] text-ink-600 leading-[1.55]">
              Inbox-ში ან Spam-ში გადახედე "მცოდნე · პაროლის აღდგენა"-ს. ბმული ცარიელდება 15 წუთში.
            </p>

            <div className="mt-7 rounded-card border border-ink-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-ink-100 bg-ink-50/50 flex items-center justify-between text-[11px] text-ink-500 tabular-nums font-mono">
                <span className="inline-flex items-center gap-1.5"><Icon.mail className="w-3 h-3" /> inbox · 1 ახალი</span>
                <span>ახლა · 14:32</span>
              </div>
              <div className="p-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-card bg-brand-500 inline-flex items-center justify-center shrink-0">
                  <span className="font-display text-white font-bold text-[14px]">მ</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-[13px] font-bold text-ink-900 truncate">მცოდნე</span>
                    <span className="inline-flex items-center h-4 px-1.5 rounded-pill bg-brand-50 border border-brand-200 text-brand-700 font-display text-[9px] font-bold uppercase tracking-[0.14em]">გადამოწმდა</span>
                  </div>
                  <div className="text-[12px] text-ink-700 mt-0.5 font-display font-semibold">პაროლის აღდგენის ბმული</div>
                  <p className="text-[11.5px] text-ink-500 mt-0.5 leading-[1.4] line-clamp-1">დააწექი ღილაკს ქვემოთ ან გადადი ბმულზე — 15 წუთის განმავლობაში მუშაობს…</p>
                </div>
              </div>
              <div className="px-4 py-3 border-t border-ink-100 flex items-center justify-between">
                <span className="font-mono text-[10.5px] tabular-nums text-ink-400">to: {email || 'you@gmail.com'}</span>
                <button type="button" onClick={() => setStep('reset')} className="h-8 px-3 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[11.5px] inline-flex items-center gap-1.5 transition-colors">
                  ბმულის გახსნა <Icon.arrow className="w-3 h-3" />
                </button>
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
            <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-2">ახალი პაროლი</div>
            <h1 className="font-display text-[28px] lg:text-[34px] font-bold text-ink-900 tracking-tight leading-[1.1]">
              აირჩიე პაროლი — <br /><span className="text-ink-500">გაუმეორებელი, მტკიცე.</span>
            </h1>
            <p className="mt-3 text-[14px] text-ink-600 leading-[1.55] max-w-[440px]">
              ძველი პაროლი გათიშულია. შეცვლის შემდეგ — გათიშავ ყველა მოწყობილობას უსაფრთხოებისთვის.
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
                      {r.ok && <Icon.check className="w-2.5 h-2.5" />}
                    </span>
                    <span className={r.ok ? 'text-ink-700 line-through decoration-ink-300' : 'text-ink-700'}>{r.l}</span>
                  </li>
                ))}
              </ul>
            </div>
            <button type="submit" disabled={!ok || submitting} className="mt-7 w-full h-12 rounded-btn bg-brand-500 hover:bg-brand-600 disabled:bg-ink-200 disabled:text-ink-400 text-white font-display font-semibold text-[14px] tracking-wide inline-flex items-center justify-center gap-2 transition-colors">
              {submitting ? (
                <>
                  <svg viewBox="0 0 24 24" className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" /></svg>
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
              მზადაა. შესვლისთვის<br />ახალი პაროლი გამოიყენე.
            </h1>
            <p className="mt-3 text-[14px] text-ink-600 leading-[1.55] max-w-[440px]">
              უსაფრთხოებისთვის გავთიშეთ ყველა სხვა მოწყობილობა — საჭიროა ხელახლა შესვლა iPad-ზე, ან სხვა ბრაუზერში.
            </p>
            <div className="mt-7 rounded-card bg-brand-50/40 border border-brand-200 p-4 grid grid-cols-[auto_1fr] gap-3">
              <Icon.shield className="w-4 h-4 text-brand-700 mt-0.5" />
              <div>
                <div className="font-display text-[12.5px] font-bold text-ink-900 mb-1">გირჩევთ — 2FA-ის ჩართვა</div>
                <p className="text-[11.5px] text-ink-700 leading-[1.5]">SMS კოდი ან ავტენტიფიკატორი დაამატე — ერთჯერად პაროლი + 2-ე ფაქტორი ვერ გადააქცევს ვერავინ.</p>
              </div>
            </div>
            <button onClick={() => setView('signin')} type="button" className="mt-7 w-full h-12 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[14px] tracking-wide inline-flex items-center justify-center gap-2 transition-colors">
              შესვლა ახალი პაროლით <Icon.arrow className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <p className="mt-5 text-center text-[12px] text-ink-500">
        დახმარება გჭირდება?{' '}
        <a href="mailto:hi@mcodne.ge" className="font-display font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-2 decoration-brand-300">hi@mcodne.ge</a>
      </p>
    </main>
  )
}

/* ═══════════════════════════════════════════════════════════════════ */
/* ONBOARDING VIEW (post-signup wizard)                                 */
/* ═══════════════════════════════════════════════════════════════════ */

const ONB_STEPS = [
  { id: 1, l: 'სფეროები',    s: 'რას ეძებ' },
  { id: 2, l: 'შენი ფონი',   s: 'რომელ ეტაპზე ხარ' },
  { id: 3, l: 'ხელმისაწვდომი', s: 'როდის გელოდი' },
  { id: 4, l: 'პირველი მატჩი', s: 'შერჩეული ექსპერტი' },
] as const

const AREAS = [
  { id: 'business', l: 'ბიზნეს-სტრატეგია', n: 32 },
  { id: 'product',  l: 'პროდუქტი / UX',    n: 24 },
  { id: 'finance',  l: 'ფინანსები / გადასახადი', n: 18 },
  { id: 'career',   l: 'კარიერა / FAANG',  n: 28 },
  { id: 'marketing',l: 'მარკეტინგი / Growth', n: 21 },
  { id: 'law',      l: 'IT სამართალი',     n: 12 },
  { id: 'fundraise',l: 'Fundraising / VC', n: 14 },
  { id: 'design',   l: 'დიზაინი / Brand',  n: 19 },
]

const LEVELS = [
  { id: 'pre',    l: 'წინასწარ',  sub: 'იდეა მაქვს, ჯერ ბიზნესი არ მაქვს' },
  { id: 'early',  l: 'ადრეული',   sub: 'სტარტაპი 1—2 წელია, MVP ან მცირე revenue' },
  { id: 'growth', l: 'მზარდი',    sub: 'team 5—25, revenue გვაქვს, ფონდს ვძებნით' },
  { id: 'scale',  l: 'მასშტაბი',   sub: 'Series A+, 30+ ადამიანი, საერთაშორისო' },
]

const OnboardingView = ({ setView }: { setView: (v: View) => void }) => {
  const [step, setStep] = useState(1)
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
    <main id="main" className="relative max-w-[1280px] mx-auto px-6 sm:px-10 lg:px-12 pt-10 lg:pt-14 pb-20">
      <div className="grid lg:grid-cols-[260px_1fr] gap-10 lg:gap-14">
        {/* Sidebar */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-500 mb-2">ნაბიჯი {step} / 4</div>
          <h2 className="font-display text-[22px] font-bold text-ink-900 tracking-tight leading-tight mb-1">გაცნობა — 2 წუთში</h2>
          <p className="text-[12.5px] text-ink-600 leading-[1.5] mb-6">პასუხები → შენი მატჩი 142 ექსპერტში.</p>

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
            გადახტომა <Icon.arrow className="w-3.5 h-3.5" />
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
              <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-2">№ 01 — სფეროები</div>
              <h1 className="font-display text-[32px] lg:text-[40px] font-bold text-ink-900 tracking-[-0.02em] leading-[1.05]">
                რაში გჭირდება ცოდნა?
              </h1>
              <p className="mt-3 text-[14.5px] text-ink-600 leading-[1.55] max-w-[520px]">
                აირჩიე 1—4 სფერო. შემოგატავოთ მხოლოდ ის ექსპერტები. <span className="font-display font-semibold text-ink-900">{areas.length}/4</span> ნიშნი.
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
                      <div className="text-[11.5px] text-ink-500 tabular-nums mt-0.5">{a.n} ექსპერტი</div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="max-w-[720px]">
              <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-2">№ 02 — შენი ფონი</div>
              <h1 className="font-display text-[32px] lg:text-[40px] font-bold text-ink-900 tracking-[-0.02em] leading-[1.05]">
                რომელ ეტაპზე ხარ?
              </h1>
              <p className="mt-3 text-[14.5px] text-ink-600 leading-[1.55] max-w-[520px]">
                ექსპერტი ხედავს კონტექსტს სანამ შემოვა — არ დაგეხარჯება დრო თხრობაზე.
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
              <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-2">№ 03 — ხელმისაწვდომი</div>
              <h1 className="font-display text-[32px] lg:text-[40px] font-bold text-ink-900 tracking-[-0.02em] leading-[1.05]">
                როდის გელოდი ექსპერტი?
              </h1>
              <p className="mt-3 text-[14.5px] text-ink-600 leading-[1.55] max-w-[520px]">
                შენ დროზე მოვძებნი — შაბ-კვ. შენი მოგებაა.
              </p>

              <div className="mt-7">
                <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-2.5">დღეები</div>
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
                <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-2.5">სასურველი დრო</div>
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
                  <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">სასურველი ფასი / სთ</div>
                  <div className="font-display text-[16px] font-bold text-ink-900 tabular-nums">₾{budget}<span className="text-[11.5px] font-medium text-ink-500"> / სთ</span></div>
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
              <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-2">№ 04 — შენი მატჩი</div>
              <h1 className="font-display text-[32px] lg:text-[40px] font-bold text-ink-900 tracking-[-0.02em] leading-[1.05]">
                ეს ემთხვევა შენ — 96%
              </h1>
              <p className="mt-3 text-[14.5px] text-ink-600 leading-[1.55] max-w-[540px]">
                ბიზნეს-სტრატეგია · ფონდი/Series A · ხელმისაწვდომი ხუთშაბათ-პარასკევს · ₾80/სთ. ფასი წინასწარ ცნობილია — escrow-ით დაცული.
              </p>

              <article className="mt-7 rounded-card border border-ink-200 bg-white overflow-hidden">
                <div className="grid sm:grid-cols-[180px_1fr] gap-5 p-5">
                  <div className="relative w-full sm:w-[180px] aspect-square rounded-card overflow-hidden bg-ink-100">
                    <img src="https://images.unsplash.com/photo-1560250097-0b93528c311a?w=320&q=80" alt="გიორგი" className="absolute inset-0 w-full h-full object-cover" />
                    <span className="absolute top-2 right-2 inline-flex items-center justify-center h-6 px-2 rounded-pill bg-success-500 text-white font-display text-[10.5px] font-bold tabular-nums shadow-xs">96% მატჩი</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="font-display text-[20px] font-bold text-ink-900 tracking-tight">გიორგი მელაძე</h3>
                      <VerifiedMark size={14} />
                      <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-pill bg-warning-50 border border-warning-200 text-warning-700 font-display text-[10px] font-bold uppercase tracking-[0.14em]"><Icon.spark className="w-2.5 h-2.5" /> Super</span>
                    </div>
                    <div className="text-[13px] text-ink-600 mt-0.5">ბიზნეს-სტრატეგია · ყოფ. McKinsey · 12 წ. გამოცდილება</div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                      <span className="inline-flex items-center gap-1">
                        <Icon.star className="w-3.5 h-3.5 text-warning-500" />
                        <span className="font-bold text-ink-900 tabular-nums">4.92</span>
                        <span className="text-ink-500">(187)</span>
                      </span>
                      <span className="text-ink-300">·</span>
                      <span className="text-ink-700"><span className="font-semibold">312</span> სესია</span>
                      <span className="text-ink-300">·</span>
                      <span className="text-ink-600 inline-flex items-center gap-1"><Icon.clock className="w-3 h-3" /> ხუთ. 14:00</span>
                    </div>
                    <p className="mt-3 text-[13px] text-ink-700 leading-snug">"10 წელი ვაშენე და ვყიდე კომპანიები — გეტყვი ნამდვილ ცდომილებებს, არა სახელმძღვანელოს."</p>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {[
                        { l: 'სფერო', v: 'ბიზნეს-სტრატ.' },
                        { l: 'ფონი', v: 'ადრეული → მზარდი' },
                        { l: 'ხელმისაწვ.', v: 'ხუთ-პარ' },
                        { l: 'ფასი', v: `₾80 ≤ ₾${budget}` },
                      ].map(r => (
                        <div key={r.l} className="text-[11.5px]">
                          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">{r.l}</span>
                          <div className="font-display font-semibold text-ink-900 tabular-nums">{r.v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="px-5 py-4 border-t border-ink-100 bg-ink-50/40 grid sm:grid-cols-[1fr_auto] gap-3 items-center">
                  <div>
                    <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">პირველი ხელმისაწვდომი</div>
                    <div className="font-display text-[14px] font-bold text-ink-900 tabular-nums">ხუთ. 11 ივნ. · 14:00 — 15:00 · ₾80</div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="h-10 px-4 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-700 font-display font-semibold text-[12.5px] inline-flex items-center gap-1.5 transition-colors">
                      სხვა ვაჩვენო
                    </button>
                    <button type="button" onClick={() => setView('signin')} className="h-10 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] inline-flex items-center gap-2 transition-colors">
                      <Icon.spark className="w-3.5 h-3.5" /> დაჯავშნე სესია
                    </button>
                  </div>
                </div>
              </article>
            </div>
          )}

          {/* Navigation */}
          <div className="mt-10 pt-6 border-t border-ink-100 flex items-center justify-between gap-3">
            <button type="button" onClick={() => step > 1 && setStep(step - 1)} disabled={step === 1} className="h-11 px-3 rounded-btn text-ink-600 hover:text-ink-900 hover:bg-ink-50 disabled:text-ink-300 disabled:hover:bg-transparent font-display font-semibold text-[12.5px] inline-flex items-center gap-1.5 transition-colors">
              <Icon.back className="w-3.5 h-3.5" /> უკან
            </button>
            {step < 4 ? (
              <button type="button" onClick={() => setStep(step + 1)} disabled={step === 1 && areas.length === 0} className="h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 disabled:bg-ink-200 disabled:text-ink-400 text-white font-display font-semibold text-[13px] tracking-wide inline-flex items-center gap-2 transition-colors">
                შემდეგი <Icon.arrow className="w-4 h-4" />
              </button>
            ) : (
              <button type="button" onClick={finish} disabled={areas.length === 0} className="h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 disabled:bg-ink-200 disabled:text-ink-400 text-white font-display font-semibold text-[13px] tracking-wide inline-flex items-center gap-2 transition-colors">
                <Icon.spark className="w-3.5 h-3.5" /> დასრულება
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
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
      <AuthHeader view={view} setView={setView} />
      {view === 'signin' && <SignInView setView={setView} />}
      {view === 'signup' && <SignUpView setView={setView} />}
      {view === 'verify' && <VerifyView setView={setView} />}
      {view === 'reset'  && <ResetView setView={setView} />}
      {view === 'onboarding' && <OnboardingView setView={setView} />}
      <AuthFooter />
    </div>
  )
}


