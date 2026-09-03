'use client'
// /signin — the „შესვლა“ view.

import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { Container } from '@/components/Container'
import { Eyebrow } from '@/components/Eyebrow'
import { authErrorMessage } from '@/lib/authErrors'
import { emailFormatError } from '@/lib/emailRule'
import { FIELD_ERROR_BORDER, useFault } from '@/components/FieldError'
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

/**
 * THE MARKETING HALF OF THE DOOR — a green card, not bare text on paper.
 *
 * ⚠️ RESTYLED 2026-08-31, AND NOTHING IT SAYS CHANGED. The pill, the headline,
 * the sentence and the three points are word for word what was here; only the
 * surface under them moved. The redesign gives the site exactly ONE material
 * for „this is what we are" — the green radial card the home page's hero, the
 * „როგორ მუშაობს" page and the provider's status band all use — and this
 * column was the last marketing surface still drawn as loose text on the cream
 * ground beside a white form. Two different treatments of the same job on one
 * screen is what made the door look older than the pages either side of it.
 *
 * ⚠️ THE THREE POINTS ARE STILL HONEST, and that is the part worth keeping
 * whatever the surface: no invented counts, no stock faces. They were rewritten
 * on 2026-08-26 because they promised „უფასო დაჯავშნა · გადაწყვიტე ჯავშნის
 * შემდეგ" on a site with no booking; sign-in is the last screen before somebody
 * commits and must not reintroduce a trust lie.
 */
const SignInIntro = () => (
  <div className="relative overflow-hidden rounded-band bg-[radial-gradient(120%_140%_at_12%_8%,#26806E_0%,#1E6656_42%,#123A31_100%)] px-6 py-9 text-white sm:px-9 sm:py-11 lg:px-10 lg:py-12">
    {/* The card's own light — the same gesture as the home hero's, so the two
        read as one material rather than as two green rectangles. */}
    <span
      aria-hidden
      className="pointer-events-none absolute -right-12 -top-16 h-[260px] w-[260px] rounded-full bg-white/[0.06]"
    />

    <div className="relative">
      {/* ⚠️ A SHIELD CHIP READING „გადამოწმებული ექსპერტები" STOOD HERE UNTIL
          2026-09-02, and it was the only VISIBLE copy of the claim — the other
          four were metadata. Measured that day: 1 of 26 published providers is
          verified. Owner: „არ უნდა იყოს ტყუილები, როგორც სხვა საიტებზე არის
          ქართულზე… ესეთი რაღაცები არ გვჭირდება."

          Deleted rather than reworded. It was a trust badge on a sign-in
          screen, which is decoration wearing a fact's clothes: the person
          reading it is already a member and is trying to get in. The ✓ that
          means something stays where it is earned — on the card of the one
          provider who has it. */}

      <h1 className="font-display text-display font-extrabold leading-[1.02] tracking-[-0.028em] motion-safe:animate-rise-in sm:text-display-lg sm:leading-[0.96]">
        კეთილი იყოს<br />
        დაბრუნება.
      </h1>
      {/* ⚠️ NO ENTRANCE ANIMATION ON THIS LINE (2026-08-31). It carried
          `motion-safe:animate-rise-in` with an 80ms delay, and `rise-in` holds
          its FROM state through `animation-fill-mode: both` — measured locally
          the moment this column moved onto the green card, the sentence never
          arrived and left a blank band between the headline and the rule. The
          headline above keeps its own; one delayed child was buying nothing
          and could cost the sentence entirely. */}
      <p className="mt-5 max-w-[440px] text-body-lg leading-[1.55] text-white/[0.82] sm:mt-6">
        აღწერე რა გჭირდება, მიიღე შეთავაზებები, აირჩიე ერთი.
      </p>

      <ul className="mt-9 space-y-4 border-t border-white/[0.14] pt-7">
        {[
          { icon: Icon.users, t: 'ხელით შერჩეული ექსპერტები', s: 'ყველა პროფილი გამოწმებული' },
          { icon: Icon.shieldCheck, t: 'უფასო მოთხოვნა', s: 'გადაწყვიტე შეთავაზებების ნახვის შემდეგ' },
          { icon: Icon.clock, t: 'ყველაფერი ერთ ადგილას', s: 'მოთხოვნები და მიმოწერა' },
        ].map((r, i) => (
          <li key={i} className="flex items-start gap-3.5">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-btn bg-white/[0.12]">
              <r.icon className="h-4 w-4" />
            </span>
            <div className="pt-0.5">
              <div className="font-display text-body font-semibold">{r.t}</div>
              <div className="mt-0.5 text-small text-white/[0.7]">{r.s}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  </div>
)

const SignInForm = ({ setView }: { setView: (v: View) => void }) => {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [remember, setRemember] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  // Which box is wrong, and why — see components/FieldError.
  const { fault, fail, props, bad, clearField, reset: clearFault, error } = useFault('signin')

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

  /* ⚠️ `INVALID` MEANT „პაროლი მინიმუმ 8 სიმბოლო" HERE AND THAT WAS A LIE
   * (fixed 2026-08-31). The route's schema is `{ email: z.string().email(),
   * password: z.string().min(1) }` — there is NO length rule on the password at
   * sign-in, and there must not be one: it has to accept whatever the account
   * was created with. So a 400 INVALID can only mean the ADDRESS did not parse,
   * and the one thing this screen said about it was a false statement about a
   * password that was fine. Somebody with „ana@gmail" retyped their password
   * until they gave up.
   *
   * The format is checked here now, with lib/emailRule — literally the same
   * `z.string().email()` the route runs — so the sentence arrives before the
   * round trip and lands on the address.
   *
   * ⚠️ BAD_CREDENTIALS DELIBERATELY POINTS AT NO FIELD. „არასწორი ელფოსტა ან
   * პაროლი" is vague on purpose: naming which half was wrong is an oracle for
   * „does this address have an account here". It stays a form-level line. */
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrMsg(null); clearFault()
    const emailMsg = emailFormatError(email)
    if (emailMsg) { fail('email', emailMsg); return }
    if (!pw) { fail('password', 'შეიყვანე პაროლი'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password: pw, rememberMe: remember }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data.error === 'INVALID') { fail('email', 'ელფოსტა არასწორია'); setSubmitting(false); return }
        setErrMsg(
          data.error === 'BAD_CREDENTIALS' ? 'არასწორი ელფოსტა ან პაროლი' :
          data.error === 'RATE_LIMITED' ? `ბევრი მცდელობა — სცადე ${Math.ceil((data.retryInSec ?? 60)/60)} წუთში` :
          data.message ??
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

        {/* `noValidate` so the handler above gets to name the field: the
            browser's own bubble fires first otherwise, and it speaks the
            BROWSER's language on a Georgian screen. The rules it replaces are
            the route's own, so nothing is lost. */}
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field label="ელფოსტა">
            <input type="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={e => { setEmail(e.target.value); if (errMsg) setErrMsg(null); clearField('email') }} placeholder="anu@gmail.com" autoComplete="email" {...props('email')} className={`${inputCls} ${bad('email') ? FIELD_ERROR_BORDER : ''}`} />
            {error('email')}
          </Field>

          <div>
            <div className="flex items-baseline justify-between mb-2">
              <label className="block font-display text-micro font-semibold uppercase text-ink-700">პაროლი</label>
              <button type="button" onClick={() => setView('reset')} className="tap-area text-meta text-brand-700 hover:text-brand-800 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1 rounded">დაგავიწყდა?</button>
            </div>
            {/* ⚠️ THE „მინ. 8 სიმბოლო" PLACEHOLDER IS LEFT AS THE OWNER WROTE
                IT, and it is worth knowing that it is not this field's rule:
                sign-in accepts whatever the account already has (`min(1)`), so
                nothing here refuses a shorter one. The FALSE part — an INVALID
                response translated into „your password is too short" — is gone;
                the placeholder is copy and copy is the owner's. */}
            <PwInput value={pw} onChange={(v) => { setPw(v); if (errMsg) setErrMsg(null); clearField('password') }} placeholder="მინ. 8 სიმბოლო" autoComplete="current-password" field={props('password')} invalid={bad('password')} />
            {error('password')}
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none pt-1">
            <span className={`w-4 h-4 rounded border-[1.5px] inline-flex items-center justify-center transition-colors duration-fast ${remember ? 'bg-brand-500 border-brand-500' : 'border-ink-300 bg-white hover:border-ink-400'}`}>
              {remember && <Icon.check className="w-3 h-3 text-white" />}
            </span>
            <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="sr-only" />
            <span className="text-small text-ink-700">დამიმახსოვრე 30 დღით</span>
          </label>

          {/* Left for what belongs to no box: BAD_CREDENTIALS (deliberately
              vague — see the note on submit), a suspension, a rate limit, a
              dropped network. */}
          {errMsg && !fault && (
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