'use client'
// /signin — the „რეგისტრაცია“ view, including the client/expert switch
// and the two role-specific forms behind it.

import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSiteTextMap } from '@/components/SiteTextProvider'
import { SITE_TEXT_DEFAULTS } from '@/lib/siteTextDefs'
import { Icon } from '@/components/Icon'
import { Container } from '@/components/Container'
import { Eyebrow } from '@/components/Eyebrow'
import { Field, GoogleMark, PwInput, StrengthBar, inputCls } from './_fields'
import { PhoneInput } from '@/components/PhoneInput'
import { phoneFormatError } from '@/lib/phone'
import { georgianNameError } from '@/lib/georgianText'
import { View, clearSignupDraft, readEmailParam, readSignupDraft, redirectAfterSignin, startGoogleSignin, writeSignupDraft } from './_model'

/* ═══════════════════════════════════════════════════════════════════ */
/* SIGN UP VIEW                                                         */
/* ═══════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ THREE, AND „სტუდენტი" IS GONE (2026-08-18).
 *
 * Owner: „სტუდენტი — ჩვეულებრივი პროფილი, შეიძლება სახელიც გადაერქვას, რადგან
 * სერვისის აღებისას შეიძლება სტუდენტი საერთოდ არ იყოს."
 *
 * That is exactly right and it was a real mislabel, not a wording preference.
 * The word made sense when every visitor came to be taught. It stopped making
 * sense the day the site started taking „ონკანი ჟონავს" — somebody hiring a
 * plumber is nobody's student, and a form that files them as one is telling
 * them, at the first screen, that they are on the wrong site. „კლიენტი" is what
 * they actually are in both halves of the product, and it is what `lib/hats`
 * has called this identity in code all along.
 *
 * ⚠️ AND THE THIRD OPTION IS THE SUPPLY SIDE OF THE SERVICES VERTICAL. Until
 * now a tradesperson had no way in from this screen at all — the two tiles
 * offered „find an expert" or „be an expert", and a plumber is neither.
 *
 * INDIVIDUAL vs BUSINESS IS NOT ASKED HERE. Owner: „ვინც ტვირთავს — ჩვეულებრივი
 * ადამიანი და ბიზნესი." It is the first question on /apply/master, where the
 * answer actually changes the fields on screen. Asked here it would change
 * nothing, and a question whose answer is discarded is a question that teaches
 * people their answers do not matter.
 *
 * Stacked on mobile: three tiles across a 390px screen leaves ~120px for two
 * lines of Georgian, and the subtitle is the half that says what the tile
 * means.
 */
type SignupRole = 'learn' | 'teach' | 'serve'

// ⚠️ TWO TILES, NOT THREE (2026-08-19). „ვარ ექსპერტი" and „ვარ ხელოსანი" split
// one person into two kinds at the door — the opposite of the model the site is
// built on. Owner: „ექსპერტს აქვს სერვისი რეალურად და პარალელურად აკეთებს
// კონსულტაციასაც. მთელი პრინციპი ეს იყო." So signup asks the only question it
// can answer here — are you looking, or offering — and WHAT you offer is asked
// once, on /join, by the two capability boxes that already exist there.
//
// `serve` survives as a ROLE (an arriving `/join?can=WORK` link still preselects
// the provider side and shows the trades pitch); it is simply no longer a tile.
const SIGNUP_TILES = [
  { v: 'learn' as const, t: 'ვეძებ ექსპერტს', s: 'კლიენტი' },
  { v: 'teach' as const, t: 'ვთავაზობ',       s: 'კონსულტაცია ან სერვისი' },
]

const RoleSwitch = ({ role, setRole }: { role: SignupRole; setRole: (r: SignupRole) => void }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1.5 rounded-card bg-ink-100 mb-8">
    {SIGNUP_TILES.map(r => (
      <button
        key={r.v}
        type="button"
        onClick={() => setRole(r.v)}
        className={`relative text-left px-4 py-3.5 rounded-btn transition-all duration-fast ${role === r.v ? 'bg-white shadow-card ring-1 ring-ink-200' : 'hover:bg-white/40'}`}
      >
        <div className={`font-display text-body font-bold tracking-wide ${role === r.v ? 'text-ink-900' : 'text-ink-700'}`}>{r.t}</div>
        <div className="text-meta mt-0.5 text-ink-500">{r.s}</div>
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
  const [phone, setPhone] = useState('')
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
    // Said here, not by a 400 — the API's generic „შეავსე ყველა ველი" names nothing.
    { const e = georgianNameError('სახელი', first); if (e) { setErrMsg(e); return } }
    if (!email) { setErrMsg('შეიყვანე ელფოსტა'); return }
    const phoneMsg = phoneFormatError(phone, { required: true })
    if (phoneMsg) { setErrMsg(phoneMsg); return }
    if (pw.length < 8) { setErrMsg('პაროლი მინიმუმ 8 სიმბოლო'); return }
    if (!agree) { setErrMsg('დაეთანხმე წესებს'); return }
    setSubmitting(true); setErrMsg(null)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: first.trim(), email: email.trim().toLowerCase(), password: pw, phone }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrMsg(
          data.error === 'EMAIL_TAKEN' ? 'ეს ელფოსტა უკვე გამოყენებულია' :
          data.error === 'INVALID_PHONE' ? (data.message ?? 'ტელეფონის ნომერი არასწორია') :
          data.error === 'INVALID_TEXT' ? (data.message ?? 'სახელი ქართულად ჩაწერე') :
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
      <a href="/api/auth/google" onClick={startGoogleSignin} className="h-12 w-full px-4 rounded-btn border border-ink-200 bg-white hover:bg-ink-50 hover:border-ink-300 inline-flex items-center justify-center gap-2.5 font-display font-medium text-small text-ink-800 tracking-wide transition-colors duration-fast"><GoogleMark /> Google-ით გაგრძელება</a>

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

        <Field label="ტელეფონი" required>
          <PhoneInput value={phone} onChange={v => { setPhone(v); if (errMsg) setErrMsg(null) }} className={inputCls} />
        </Field>

        <div>
          <label className="block font-display text-micro font-semibold uppercase text-ink-700 mb-2">პაროლი<span className="text-danger-500 ml-0.5" aria-hidden>*</span></label>
          <PwInput value={pw} onChange={(v) => { setPw(v); if (errMsg) setErrMsg(null) }} />
          <StrengthBar pw={pw} />
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer select-none pt-2">
          <span className={`mt-0.5 w-4 h-4 rounded border-[1.5px] inline-flex items-center justify-center shrink-0 transition-colors duration-fast ${agree ? 'bg-brand-500 border-brand-500' : 'border-ink-300 bg-white hover:border-ink-400'}`}>
            {agree && <Icon.check className="w-3 h-3 text-white" />}
          </span>
          <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="sr-only" />
          <span className="text-small text-ink-700">
            ვეთანხმები <a href="/terms" target="_blank" rel="noopener noreferrer" className="tap-area text-brand-700 hover:text-brand-800 font-medium underline underline-offset-2 decoration-brand-300">წესებსა</a> და <a href="/privacy" target="_blank" rel="noopener noreferrer" className="tap-area text-brand-700 hover:text-brand-800 font-medium underline underline-offset-2 decoration-brand-300">კონფიდენციალურობის პოლიტიკას</a>.
          </span>
        </label>

        {errMsg && (
          <div role="alert" className="rounded-field bg-danger-50 border border-danger-200 px-3 py-2 text-small text-danger-700 leading-[1.45] break-words">{errMsg}</div>
        )}

        <button type="submit" disabled={submitting || !agree || first.trim().length < 2 || !email || pw.length < 8} className="w-full h-12 mt-2 rounded-btn bg-brand-600 hover:bg-brand-700 disabled:bg-ink-100 disabled:text-ink-500 disabled:cursor-not-allowed text-white font-display font-semibold text-body-lg tracking-wide inline-flex items-center justify-center gap-2 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2">
          {submitting ? (
            <>
              <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4 motion-safe:animate-spin" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" /></svg>
              ვქმნით ანგარიშს…
            </>
          ) : (
            <>ანგარიშის შექმნა</>
          )}
        </button>
        {!submitting && (first.trim().length < 2 || !email || pw.length < 8 || !agree) && (
          // One next-step hint at a time — why the button is grey.
          <p className="text-meta text-ink-500 text-center">
            {!first.trim() ? 'შეიყვანე სახელი' : first.trim().length < 2 ? 'სახელი — მინიმუმ 2 სიმბოლო' : !email ? 'შეიყვანე ელფოსტა' : pw.length < 8 ? 'პაროლი — მინიმუმ 8 სიმბოლო' : 'დაეთანხმე წესებს გასაგრძელებლად'}
          </p>
        )}

        <p className="text-center text-small text-ink-500 mt-2 leading-relaxed">
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
const TutorSignUp = ({ setView, kind = 'teach' }: { setView: (v: View) => void; kind?: 'teach' | 'serve' }) => {
  // ⚠️ ONE FORM, TWO DESTINATIONS — deliberately not a second copy. Both sides
  // collect exactly the same thing here (an account: name, surname, email,
  // phone, password) because the identity-specific questions live on the
  // application forms, which is the rule this component's header already
  // states. What differs is the sentence at the top and where it hands off, so
  // those are the only two things this prop changes.
  // No `?can=` from the „ვთავაზობ" tile: the door asks which halves, and
  // pre-ticking one here would answer a question the person has not seen.
  const dest = kind === 'serve' ? '/join?can=WORK' : '/join'
  // ⚠️ EVERY VISIBLE STRING IN THIS COMPONENT MUST ASK `kind`, and one did not
  // (2026-08-18). The consent line read „ვეთანხმები ექსპერტის წესებს" on both
  // branches — so a plumber was ticking a box agreeing to the expert terms.
  // Consent is the one place where the wrong noun is not a typo.
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [pw, setPw] = useState('')
  const [agree, setAgree] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!first.trim()) { setErrMsg('შეიყვანე სახელი'); return }
    if (!last.trim()) { setErrMsg('შეიყვანე გვარი'); return }
    if (!email) { setErrMsg('შეიყვანე ელფოსტა'); return }
    const phoneMsg = phoneFormatError(phone, { required: true })
    if (phoneMsg) { setErrMsg(phoneMsg); return }
    // Each box judged on its own, so „ნინო" + „Beridze" complains about the
    // SURNAME rather than about „name and surname".
    { const e = georgianNameError('სახელი', first); if (e) { setErrMsg(e); return } }
    { const e = georgianNameError('გვარი', last); if (e) { setErrMsg(e); return } }
    if (pw.length < 8) { setErrMsg('პაროლი მინიმუმ 8 სიმბოლო'); return }
    if (!agree) { setErrMsg('დაეთანხმე წესებს'); return }
    setSubmitting(true); setErrMsg(null)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: `${first.trim()} ${last.trim()}`.trim(), email: email.trim().toLowerCase(), password: pw, phone }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrMsg(
          data.error === 'EMAIL_TAKEN' ? 'ეს ელფოსტა უკვე გამოყენებულია' :
          data.error === 'INVALID_PHONE' ? (data.message ?? 'ტელეფონის ნომერი არასწორია') :
          data.error === 'INVALID_TEXT' ? (data.message ?? 'სახელი ქართულად ჩაწერე') :
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
      window.location.href = dest
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
          <div className="font-display text-small font-bold text-ink-900 tracking-tight">ჯერ ანგარიში — შემდეგ განაცხადი</div>
          {kind === 'serve' ? (
            /* Not the expert sentence with two words swapped: „ექსპერტიზა,
               პორტფოლიო და ფასი" names three things the trades form does not
               ask for, and „48 საათი" is a review time we have never measured
               on this queue. Say what is actually next. */
            <p className="text-small text-ink-600 mt-1">
              რას აკეთებ და რომელ ქალაქში — <span className="font-display font-semibold text-ink-800">შემდეგ</span> შეავსებ. შემდეგ დაგირეკავთ.
            </p>
          ) : (
            <p className="text-small text-ink-600 mt-1">
              ექსპერტიზას, პორტფოლიოსა და ფასს <span className="font-display font-semibold text-ink-800">შემდეგ</span> შეავსებ. განაცხადს გავამოწმებთ <span className="font-display font-semibold text-ink-800">48 საათში</span>.
            </p>
          )}
        </div>
      </div>

      <div className="p-6 lg:p-8">
        {/* Google is the only SSO. */}
        {/* ⚠️ `dest` IS PASSED, AND ITS ABSENCE WAS A REAL SHIPPED BUG
            (2026-08-18). „ვარ ხელოსანი" is local state — it never reaches the
            URL — and this button used to carry nothing, so anybody who chose a
            role and then signed in with Google got a plain client account on
            /student, with no application and no record that they had chosen
            anything at all. The password path below was unaffected, which is
            why it survived testing. See _model → startGoogleSignin. */}
        <a
          href="/api/auth/google"
          onClick={e => startGoogleSignin(e, { dest })}
          className="h-12 w-full px-4 rounded-btn border border-ink-200 bg-white hover:bg-ink-50 hover:border-ink-300 inline-flex items-center justify-center gap-2.5 font-display font-medium text-small text-ink-800 tracking-wide transition-colors duration-fast"
        >
          <GoogleMark /> Google-ით გაგრძელება
        </a>

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

          <Field label="ტელეფონი" required>
            <PhoneInput value={phone} onChange={v => { setPhone(v); if (errMsg) setErrMsg(null) }} className={inputCls} />
          </Field>

          <div>
            <label className="block font-display text-micro font-semibold uppercase text-ink-700 mb-2">პაროლი<span className="text-danger-500 ml-0.5" aria-hidden>*</span></label>
            <PwInput value={pw} onChange={(v) => { setPw(v); if (errMsg) setErrMsg(null) }} />
            <StrengthBar pw={pw} />
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer select-none pt-2">
            <span className={`mt-0.5 w-4 h-4 rounded border-[1.5px] inline-flex items-center justify-center shrink-0 transition-colors duration-fast ${agree ? 'bg-brand-500 border-brand-500' : 'border-ink-300 bg-white hover:border-ink-400'}`}>
              {agree && <Icon.check className="w-3 h-3 text-white" />}
            </span>
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="sr-only" />
            <span className="text-small text-ink-700">
              ვეთანხმები <a href="/terms" target="_blank" rel="noopener noreferrer" className="tap-area text-brand-700 hover:text-brand-800 font-medium underline underline-offset-2 decoration-brand-300">{kind === 'serve' ? 'წესებს' : 'ექსპერტის წესებს'}</a> და <a href="/privacy" target="_blank" rel="noopener noreferrer" className="tap-area text-brand-700 hover:text-brand-800 font-medium underline underline-offset-2 decoration-brand-300">კონფიდენციალურობის პოლიტიკას</a>.
            </span>
          </label>

          {errMsg && (
            <div role="alert" className="rounded-field bg-danger-50 border border-danger-200 px-3 py-2 text-small text-danger-700 leading-[1.45] break-words">{errMsg}</div>
          )}

          <button type="submit" disabled={submitting || !agree || !first.trim() || !last.trim() || !email || pw.length < 8} className="w-full h-12 mt-2 rounded-btn bg-brand-600 hover:bg-brand-700 disabled:bg-ink-100 disabled:text-ink-500 disabled:cursor-not-allowed text-white font-display font-semibold text-body-lg tracking-wide inline-flex items-center justify-center gap-2 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2">
            {submitting ? (
              <>
                <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4 motion-safe:animate-spin" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" /></svg>
                ვქმნით ანგარიშს…
              </>
            ) : (
              <>ანგარიშის შექმნა</>
            )}
          </button>
          {!submitting && (!first.trim() || !last.trim() || !email || pw.length < 8 || !agree) && (
            <p className="text-meta text-ink-500 text-center">
              {!first.trim() ? 'შეიყვანე სახელი' : !last.trim() ? 'შეიყვანე გვარი' : !email ? 'შეიყვანე ელფოსტა' : pw.length < 8 ? 'პაროლი — მინიმუმ 8 სიმბოლო' : 'დაეთანხმე წესებს გასაგრძელებლად'}
            </p>
          )}
        </form>
      </div>
    </div>
  )
}

/* Marketing panel beside the signup form. EVERY string here is editable in
 * admin → ტექსტები („რეგისტრაცია — …" groups); nothing on this panel is typed
 * in this file any more (2026-08-05). The commission sentence that used to sit
 * under the expert heading is gone at the owner's request — which is also what
 * unlocked the panel for the CMS: it was a PAYMENTS_LIVE branch interpolating
 * COMMISSION_PCT, and templates are deliberately never editable.
 *
 * Heading step-down (2026-08-05, owner): display-lg/hero (44/64) → display/
 * display-lg (36/44). Scale tokens only — no ad-hoc px. */
const SignUpIntro = ({ role }: { role: SignupRole }) => {
  const s = useSiteTextMap()
  const t = (k: string) => s[k] ?? SITE_TEXT_DEFAULTS[k] ?? ''
  return (
  <div className="w-full max-w-full lg:max-w-[480px] lg:sticky lg:top-24 min-w-0">
    {/* Status pill */}
    <span className="inline-flex items-center gap-2 h-7 pl-1.5 pr-3 rounded-pill bg-white border border-ink-200 shadow-xs mb-8">
      <span className="inline-flex items-center gap-1 h-4 px-1.5 rounded-pill bg-brand-600 text-white font-display text-micro font-bold uppercase">{t('signup.badge')}</span>
      <span className="text-meta text-ink-700 font-display font-medium">
        {t(`signup.${role}.pill`)}
      </span>
    </span>

    {/* ⚠️ THE SERVE PANEL IS ITS OWN, NOT THE EXPERT ONE RELABELLED. The expert
        panel leads with „15% საკომისიო" and a four-step review — numbers that
        are true of consultations and false here: a lead costs a master nothing
        today, and there is no profile to go „live". Reusing it would have made
        the first thing a plumber reads a fee we do not charge them. */}
    {role === 'serve' ? (
      <>
        <h1 className="font-display text-display lg:text-display-lg font-bold leading-[0.98] tracking-[-0.03em] text-ink-900 motion-safe:animate-rise-in">
          {t('signup.serve.title1')}<br />
          <span className="text-brand-600">{t('signup.serve.title2')}</span>
        </h1>
        <p className="text-body-lg sm:text-h3 text-ink-700 mt-6 sm:mt-7 max-w-[440px]">
          {t('signup.serve.sub')}
        </p>
        <ol className="mt-10 lg:mt-12 space-y-6">
          {[1, 2, 3].map(n => (
            <li key={n} className="grid grid-cols-[auto_1fr] gap-4 items-start">
              <span className="font-display text-micro font-bold uppercase text-brand-700 tabular-nums mt-1">
                {`0${n}`}
              </span>
              <div className="min-w-0">
                <div className="font-display text-body font-bold text-ink-900">{t(`signup.serve.step${n}.title`)}</div>
                <p className="text-small text-ink-600 mt-0.5 leading-relaxed">{t(`signup.serve.step${n}.desc`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </>
    ) : role === 'learn' ? (
      <>
        <h1 className="font-display text-display lg:text-display-lg font-bold leading-[0.98] tracking-[-0.03em] text-ink-900 motion-safe:animate-rise-in">
          {t('signup.learn.title1')}<br />
          <span className="text-brand-600">{t('signup.learn.title2')}</span>
        </h1>
        <p className="text-body-lg sm:text-h3 text-ink-700 mt-6 sm:mt-7 max-w-[440px]">
          <span className="font-display font-semibold text-ink-900">{t('signup.learn.subEmphasis')}</span> {t('signup.learn.subRest')}
        </p>

        <ol className="mt-10 lg:mt-12 space-y-6">
          {[
            { n: '01', t: t('signup.learn.step1.title'), d: t('signup.learn.step1.desc') },
            { n: '02', t: t('signup.learn.step2.title'), d: t('signup.learn.step2.desc') },
            { n: '03', t: t('signup.learn.step3.title'), d: t('signup.learn.step3.desc') },
          ].map(b => (
            <li key={b.n} className="grid grid-cols-[48px_1fr] gap-4 items-baseline">
              <span className="font-display text-h1 font-bold text-brand-700 tabular-nums leading-none">{b.n}</span>
              <div>
                <div className="font-display text-body-lg font-bold text-ink-900 tracking-tight">{b.t}</div>
                <p className="text-small text-ink-600 mt-1.5 leading-[1.55]">{b.d}</p>
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
          <div className="text-small text-ink-700">
            <div className="font-display font-semibold text-ink-900">{t('signup.learn.trust.title')}</div>
            <div className="text-meta text-ink-500 mt-0.5">{t('signup.learn.trust.desc')}</div>
          </div>
        </div>
      </>
    ) : (
      <>
        <h1 className="font-display text-display lg:text-display-lg font-bold leading-[0.98] tracking-[-0.03em] text-ink-900">
          {t('signup.teach.title1')}<br />
          <span className="text-brand-600">{t('signup.teach.title2')}</span>
        </h1>
        {/* ONE sentence, and ONE mention of the commission (owner, 2026-08-10).
            The figure is the stat tile directly below — a number belongs in the
            number slot — and repeating it here said the same thing twice, two
            lines apart. `signup.teach.subEmphasis` is RETIRED rather than
            deleted: the key stays in the registry so any row an admin already
            saved for it survives, exactly as the seven home.why.* keys do. */}
        <p className="text-body-lg sm:text-h3 text-ink-700 mt-6 sm:mt-7 max-w-[440px]">
          {t('signup.teach.sub')}
        </p>

        <dl className="mt-10 lg:mt-12 grid grid-cols-3 gap-x-6 sm:gap-x-8">
          {[
            { n: t('signup.teach.stat1.n'), l: t('signup.teach.stat1.label'), d: t('signup.teach.stat1.desc') },
            { n: t('signup.teach.stat2.n'), l: t('signup.teach.stat2.label'), d: t('signup.teach.stat2.desc') },
            { n: t('signup.teach.stat3.n'), l: t('signup.teach.stat3.label'), d: t('signup.teach.stat3.desc') },
          ].map(k => (
            <div key={k.l}>
              <dt className="font-display text-h1 lg:text-display font-bold tabular-nums tracking-[-0.025em] text-ink-900 leading-none">{k.n}</dt>
              <dd className="font-display text-micro font-semibold uppercase text-ink-700 mt-2.5">{k.l}</dd>
              <dd className="text-meta text-ink-500 mt-0.5 leading-snug">{k.d}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-10 lg:mt-12 pt-8 border-t border-ink-200">
          <div className="font-display text-micro font-semibold uppercase text-ink-700 mb-4">{t('signup.teach.processEyebrow')}</div>
          <ol className="space-y-4">
            {[
              { n: '01', t: t('signup.teach.step1.title'), d: t('signup.teach.step1.desc') },
              { n: '02', t: t('signup.teach.step2.title'), d: t('signup.teach.step2.desc') },
              { n: '03', t: t('signup.teach.step3.title'), d: t('signup.teach.step3.desc') },
              { n: '04', t: t('signup.teach.step4.title'), d: t('signup.teach.step4.desc') },
            ].map(step => (
              <li key={step.n} className="grid grid-cols-[32px_1fr_auto] gap-3 items-baseline">
                <span className="font-display font-bold text-brand-700 tabular-nums text-meta">{step.n}</span>
                <span className="font-display text-body font-semibold text-ink-900 tracking-tight">{step.t}</span>
                <span className="text-meta text-ink-500 tabular-nums">{step.d}</span>
              </li>
            ))}
          </ol>
        </div>
      </>
    )}
  </div>
  )
}

export const SignUpView = ({ setView }: { setView: (v: View) => void }) => {
  const [role, setRole] = useState<SignupRole>('learn')
  const params = useSearchParams()
  const redirect = params?.get('redirect') || params?.get('next') || ''
  // Arriving from a "book / message this expert" tap (redirect points at a
  // profile) → the visitor is unambiguously a CLIENT. Drop the learn/teach fork
  // (the only real decision on this form) and remind them why they're here, so
  // the highest-intent signup has zero extra choices to make.
  const bookingIntent = redirect.includes('/experts/')
  // redirect=/join is the single most unambiguous EXPERT signal on the site —
  // yet this form used to preselect „სტუდენტი" and make the applicant notice
  // and fix a pre-answered question (wrong-role accounts were the real
  // failure). Same fork-drop as bookingIntent, opposite branch.
  // ⚠️ THE TRADES HALF IS CHECKED FIRST AND IT IS NOT A NICETY. Both halves
  // live under /join, so a plain prefix test would have read a plumber
  // arriving from the trades pitch as an EXPERT — dropped the fork, preselected
  // the wrong branch, and sent them to the expert form after signup, which is
  // the exact wrong-role account this whole block exists to prevent (see the
  // note below). Adding a second door under the same prefix silently broke the
  // first one; since 2026-08-19 the half is named by `?can=` and read here.
  const joinIntent = !bookingIntent && redirect.startsWith('/join')
  const masterIntent = joinIntent && /[?&]can=WORK\b/.test(redirect) && !/[?&]can=[^&]*CONSULT/.test(redirect)
  const applyIntent = joinIntent && !masterIntent
  const effectiveRole: SignupRole =
    bookingIntent ? 'learn' : masterIntent ? 'serve' : applyIntent ? 'teach' : role
  // Both handoffs show the same „one step left" note: the account is a step
  // inside an application they already started, not a new decision.
  const continuingApplication = applyIntent || masterIntent
  return (
    <Container as="main" id="main" className="relative pt-6 sm:pt-14 lg:pt-20 pb-16 lg:pb-20">
      {/* Form-first on mobile (see SignInView) — the role switch + form come
          before the pitch so signup starts immediately. */}
      <div className={`grid gap-12 lg:gap-20 items-start ${effectiveRole === 'teach' ? 'lg:grid-cols-[1fr_1.15fr]' : 'lg:grid-cols-2'}`}>
        <div className="order-2 lg:order-1 min-w-0"><SignUpIntro role={effectiveRole} /></div>
        <div className="order-1 lg:order-2 min-w-0">
          {continuingApplication ? (
            <div className="mb-5 rounded-card border border-ink-200 bg-ink-50/60 px-4 py-3">
              <div className="font-display text-small font-bold text-ink-900">ერთი ნაბიჯიღა დარჩა</div>
              <p className="text-meta text-ink-600 mt-0.5">დაასრულე რეგისტრაცია — განაცხადი გაგრძელდება.</p>
            </div>
          ) : bookingIntent ? (
            <div className="mb-5 rounded-card border border-ink-200 bg-ink-50/60 px-4 py-3">
              <div className="font-display text-small font-bold text-ink-900">ერთი ნაბიჯიღა დარჩა</div>
              <p className="text-meta text-ink-600 mt-0.5">დაასრულე რეგისტრაცია — ჯავშანი გაგრძელდება.</p>
            </div>
          ) : (
            // The switch defaults to „learn" with its check already drawn, so
            // nothing on screen signals that a decision is pending — it reads as
            // a filter, not a question. A real signup (2026-07-29) completed as
            // a STUDENT, then spent ten minutes looking for how to become an
            // expert. One label turns inert chrome back into a fork.
            <div>
              <div className="font-display text-meta font-semibold uppercase text-ink-500 mb-2">ვინ ხარ?</div>
              <RoleSwitch role={role} setRole={setRole} />
            </div>
          )}
          {effectiveRole === 'learn'
            ? <StudentSignUp setView={setView} />
            : <TutorSignUp setView={setView} kind={effectiveRole} />}
        </div>
      </div>
    </Container>
  )
}