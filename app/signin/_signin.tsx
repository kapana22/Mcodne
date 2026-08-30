'use client'
// /signin — the „შესვლა“ view.

import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { Container } from '@/components/Container'
import { Eyebrow } from '@/components/Eyebrow'
import { authErrorMessage } from '@/lib/authErrors'
import { Field, GoogleMark, PwInput, inputCls } from './_fields'
import { View, readEmailParam, redirectAfterSignin, startGoogleSignin } from './_model'

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
      <span className="text-meta text-ink-700">გადამოწმებული ექსპერტები</span>
    </span>

    <h1 className="font-display text-display xs:text-display-lg sm:text-display-lg lg:text-hero font-bold leading-[1.02] sm:leading-[0.96] tracking-[-0.028em] text-ink-900 motion-safe:animate-rise-in">
      კეთილი იყოს<br />
      <span className="text-brand-600">დაბრუნება.</span>
    </h1>
    <p className="text-body-lg sm:text-h3 text-ink-700 mt-5 sm:mt-7 max-w-[440px] motion-safe:animate-rise-in" style={{ animationDelay: '80ms' }}>
      აღწერე რა გჭირდება, მიიღე შეთავაზებები, აირჩიე ერთი.
    </p>

    {/* Honest value points — no invented counts or stock (pravatar) faces. The
        landing and /experts deliberately removed exactly that pattern; sign-in,
        the last screen before somebody commits, must not reintroduce a trust
        lie. ⚠️ AND THE THREE POINTS THEMSELVES WERE ONE (2026-08-26): they
        promised „უფასო დაჯავშნა · გადაწყვიტე ჯავშნის შემდეგ" on a site with no
        booking. */}
    <ul className="mt-10 lg:mt-12 pt-8 border-t border-ink-200 space-y-4">
      {[
        { icon: Icon.users, t: 'ხელით შერჩეული ექსპერტები', s: 'ყველა პროფილი გამოწმებული' },
        { icon: Icon.shieldCheck, t: 'უფასო მოთხოვნა', s: 'გადაწყვიტე შეთავაზებების ნახვის შემდეგ' },
        { icon: Icon.clock, t: 'ყველაფერი ერთ ადგილას', s: 'მოთხოვნები და მიმოწერა' },
      ].map((r, i) => (
        <li key={i} className="flex items-start gap-3.5">
          <span className="w-9 h-9 rounded-btn bg-brand-50 text-brand-700 inline-flex items-center justify-center shrink-0">
            <r.icon className="w-4 h-4" />
          </span>
          <div className="pt-0.5">
            <div className="font-display text-body font-semibold text-ink-900">{r.t}</div>
            <div className="text-small text-ink-500 mt-0.5">{r.s}</div>
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

  // Why a failed Google round-trip sent them back here. The callback redirects
  // to /signin?error=<code> and every one of those codes used to land on this
  // form with no message at all — an expired state cookie was indistinguishable
  // from a button that does nothing. Copy lives in lib/authErrors.ts.
  const params = useSearchParams()
  const ssoError = authErrorMessage(params?.get('error'))

  // Prefill from `?email=` if present — handles the reset-password → signin
  // handoff (the reset flow appends the confirmed email to the URL).
  useEffect(() => {
    const paramEmail = readEmailParam()
    if (paramEmail) setEmail(paramEmail)
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !pw) { setErrMsg('შეიყვანე ელფოსტა და პაროლი'); return }
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
      {/* FADE, NOT SCALE — and no delay. `scale-in` on a card this big is the
          wrong instrument, measured 2026-08-13: the card is 553px tall on a
          390px screen, and scaling 0.96 → 1 about the default centre origin
          starts its BOTTOM edge 11px high and travels it down into place. The
          password field, „დაგავიწყდა?" and the submit button all sit in that
          lower half, so the part of the form you are about to touch is the part
          that visibly drops — while every glyph, border and the `shadow-card`
          re-rasterises at a fractional scale each frame, which is the shimmer.
          Opacity moves nothing and rasterises once. The 160ms delay goes with
          it: `fade-in` deliberately carries no fill-mode (see CLAUDE.md), so a
          delay would hold the card at full opacity and then snap it to zero —
          and CLAUDE.md's own rule is that an entrance must never delay a
          control becoming usable. */}
      <div className="bg-white rounded-card border border-ink-200 shadow-card p-7 sm:p-8 lg:p-9 motion-safe:animate-fade-in">
        <div className="mb-7 lg:mb-8">
          <Eyebrow className="mb-2">შესვლა</Eyebrow>
          <div className="font-display text-h2 font-bold text-ink-900 tracking-tight">შენი ანგარიში</div>
          <p className="text-small text-ink-500 mt-1.5 leading-snug">შედი და გააგრძელე.</p>
        </div>

        {ssoError && (
          <div role="alert" className="mb-6 rounded-field bg-danger-50 border border-danger-200 px-3 py-2.5 text-small text-danger-700 leading-[1.45] break-words">
            {ssoError}
          </div>
        )}

        <a href="/api/auth/google" onClick={e => startGoogleSignin(e, { remember })} className="h-12 w-full px-4 rounded-btn border border-ink-200 bg-white hover:bg-ink-50 hover:border-ink-300 inline-flex items-center justify-center gap-2.5 font-display font-medium text-small text-ink-800 tracking-wide transition-colors duration-fast">
          <GoogleMark /> Google-ით გაგრძელება
        </a>

        <div className="flex items-center gap-3 my-7">
          <div className="flex-1 h-px bg-ink-200" />
          <Eyebrow as="span" tone="muted">ან ელფოსტით</Eyebrow>
          <div className="flex-1 h-px bg-ink-200" />
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field label="ელფოსტა">
            <input type="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={e => { setEmail(e.target.value); if (errMsg) setErrMsg(null) }} placeholder="anu@gmail.com" autoComplete="email" className={inputCls} />
          </Field>

          <div>
            <div className="flex items-baseline justify-between mb-2">
              <label className="block font-display text-micro font-semibold uppercase text-ink-700">პაროლი</label>
              <button type="button" onClick={() => setView('reset')} className="tap-area text-meta text-brand-700 hover:text-brand-800 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1 rounded">დაგავიწყდა?</button>
            </div>
            <PwInput value={pw} onChange={(v) => { setPw(v); if (errMsg) setErrMsg(null) }} placeholder="მინ. 8 სიმბოლო" autoComplete="current-password" />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none pt-1">
            <span className={`w-4 h-4 rounded border-[1.5px] inline-flex items-center justify-center transition-colors duration-fast ${remember ? 'bg-brand-500 border-brand-500' : 'border-ink-300 bg-white hover:border-ink-400'}`}>
              {remember && <Icon.check className="w-3 h-3 text-white" />}
            </span>
            <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="sr-only" />
            <span className="text-small text-ink-700">დამიმახსოვრე 30 დღით</span>
          </label>

          {errMsg && (
            <div role="alert" className="rounded-field bg-danger-50 border border-danger-200 px-3 py-2 text-small text-danger-700 leading-[1.45] break-words">{errMsg}</div>
          )}
          <button
            type="submit"
            // Enabled only when the form is actually submittable — both fields
            // filled (mirrors signup, where validity gates the button too).
            // The empty-field check inside submit() stays as a fallback.
            disabled={submitting || !email.trim() || !pw}
            // Disabled = clearly grey (same language as signup) — a branded
            // "disabled" button reads as tappable and invites dead taps.
            className="w-full h-12 mt-6 rounded-btn bg-gradient-cta hover:brightness-105 disabled:bg-none disabled:bg-ink-100 disabled:text-ink-500 disabled:cursor-not-allowed text-white font-display font-semibold text-body-lg tracking-wide inline-flex items-center justify-center gap-2 transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
          >
            {submitting ? (
              <>
                <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4 motion-safe:animate-spin" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" /></svg>
                ვამოწმებთ…
              </>
            ) : (
              <>შესვლა</>
            )}
          </button>
          {!submitting && (!email.trim() || !pw) && (
            // Say WHY the button is off — otherwise it's a mystery dead CTA.
            <p className="text-meta text-ink-500 text-center mt-2">
              {!email.trim() && !pw ? 'შეიყვანე ელფოსტა და პაროლი' : !email.trim() ? 'შეიყვანე ელფოსტა' : 'შეიყვანე პაროლი'}
            </p>
          )}
        </form>
      </div>

      {/* Sign up CTA below the card */}
      <p className="text-center text-small text-ink-600 mt-6">
        არ გაქვს ანგარიში?{' '}
        <button type="button" onClick={() => setView('signup')} className="tap-area font-display font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-2 decoration-brand-300">დარეგისტრირდი უფასოდ</button>
      </p>
    </div>
  )
}

export const SignInView = ({ setView }: { setView: (v: View) => void }) => {
  // WHY the visitor is here. Signup already showed „ერთი ნაბიჯიღა დარჩა" on a
  // booking redirect; sign-in — the MORE common branch — showed the generic
  // marketing intro, so the highest-drop-off screen in the funnel gave no sign
  // it had remembered the expert and the slot being held.
  const params = useSearchParams()
  const redirect = params?.get('redirect') || params?.get('next') || ''
  const bookingIntent = redirect.includes('/experts/')
  const applyIntent = !bookingIntent && redirect.startsWith('/join')
  return (
  <Container as="main" id="main" className="relative pt-6 sm:pt-14 lg:pt-20 pb-16 sm:pb-20 lg:pb-24">
    {/* Mobile is form-first: the marketing intro (headline, avatars,
        testimonial) drops BELOW the form so the email field is the first
        thing on screen. Desktop keeps intro-left / form-right. */}
    <div className="grid lg:grid-cols-[1fr_minmax(0,520px)] gap-10 sm:gap-14 lg:gap-16 xl:gap-24 items-start">
      <div className="order-2 lg:order-1 min-w-0"><SignInIntro /></div>
      <div className="order-1 lg:order-2 min-w-0">
        {(bookingIntent || applyIntent) && (
          <div className="mb-5 rounded-card border border-ink-200 bg-ink-50/60 px-4 py-3">
            <div className="font-display text-small font-bold text-ink-900">ერთი ნაბიჯიღა დარჩა</div>
            <p className="text-meta text-ink-600 mt-0.5">
              {bookingIntent ? 'შედი — მოთხოვნა გაგრძელდება იქიდან, სადაც შეწყვიტე.' : 'შედი — განაცხადი გაგრძელდება.'}
            </p>
          </div>
        )}
        <SignInForm setView={setView} />
      </div>
    </div>
  </Container>
  )
}