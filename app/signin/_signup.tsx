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
import { FIELD_ERROR_BORDER, useFault } from '@/components/FieldError'
import { phoneFormatError } from '@/lib/phone'
import { emailFormatError } from '@/lib/emailRule'
import { passwordError } from '@/lib/passwordPolicy'
import { firstMissing } from '@/lib/signupCompleteness'
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
// ⚠️ TWO ROLES, AND THERE WERE THREE (2026-08-24). `teach` was the
// consultation applicant and `serve` the trades one; they signed up on the same
// form, differing only in the panel beside it and — this is the part that
// mattered — in the noun on the consent line. There is one provider now, so
// there is one word for them, and `serve` is it.
type SignupRole = 'learn' | 'serve'

// ⚠️ TWO TILES, NOT THREE (2026-08-19). „ვარ ექსპერტი" AND „ვარ ხელოსანი" — the
// PAIR — split one person into two kinds at the door, which is the opposite of
// the model the site is built on. (The wording „ვარ ექსპერტი" came back on
// 2026-09-02 as the single supply tile, at the owner's request. That is not the
// old split returning: what was wrong was asking WHICH KIND of provider before
// anybody had said they were one, and there is one tile for that now.) Owner: „ექსპერტს აქვს სერვისი რეალურად და პარალელურად აკეთებს
// კონსულტაციასაც. მთელი პრინციპი ეს იყო." So signup asks the only question it
// can answer here — are you looking, or offering — and WHAT you offer is asked
// once, on /join, by the two capability boxes that already exist there.
//
// `serve` survives as a ROLE (an arriving `/join?can=WORK` link still preselects
// the provider side and shows the trades pitch); it is simply no longer a tile.
/* ⚠️ TWO WORDS, NO SUBTITLE (2026-09-02). Owner, holding a screenshot of this
   control: „აქ ვეძებ ექსპერტს, ვარ ექსპერტი — დაწერე, მხოლოდ მეტი არაფერი."
   The tiles carried a second line each („კლიენტი", „ჩემი სერვისი") that named
   the same thing again in the site's other vocabulary — a label under a label,
   on a two-way choice where the labels are already sentences about the reader.
   ⚠️ AND „ვთავაზობ" BECAME „ვარ ექსპერტი", which reads as the mirror of the
   first tile: both now answer „which are you", in the same grammar. */
const SIGNUP_TILES = [
  { v: 'learn' as const, t: 'ვეძებ ექსპერტს' },
  { v: 'serve' as const, t: 'ვარ ექსპერტი' },
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
        {role === r.v && (
          <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-brand-500 inline-flex items-center justify-center">
            <Icon.check className="w-3 h-3 text-white" />
          </span>
        )}
      </button>
    ))}
  </div>
)

/* ⚠️ EVERY CHECK ON BOTH FORMS BELOW USED TO END IN ONE `setErrMsg` LINE AT THE
 * FOOT OF THE CARD (fixed 2026-08-31). Five fields, one sentence, and no mark
 * on the box it was about — so „ნომერი არასწორია" under a filled-in form left
 * the reader comparing five values against one adjective. Each check now names
 * its own field (components/FieldError): the border reddens, `aria-invalid` and
 * `aria-describedby` tell a screen reader which control and why, and the cursor
 * moves there.
 *
 * ⚠️ AND THE EMAIL WAS NEVER CHECKED AT ALL. Both forms tested `!email` while
 * /api/auth/signup parses `z.string().email()`, so a typo passed the client,
 * returned a bare 400, and this screen translated it into „შეავსე ყველა ველი
 * (პაროლი მინიმუმ 8 სიმბოლო)" — a sentence about a password that was fine, on a
 * form whose address was one character short. lib/emailRule runs the route's own
 * `.email()` here first. */
const StudentSignUp = ({ setView }: { setView: (v: View) => void }) => {
  const [first, setFirst] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [pw, setPw] = useState('')
  const [agree, setAgree] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const { fault, fail, props, bad, clearField, reset: clearFault, error } = useFault('signup')
  /** Every field change does the same three things. */
  const touch = (field: string) => { if (errMsg) setErrMsg(null); clearField(field) }
  /** No `last` — the client form asks for one name. */
  const gap = firstMissing({ first, email, phone, pw, agree })

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
    setErrMsg(null); clearFault()
    if (!first.trim()) { fail('name', 'შეიყვანე სახელი'); return }
    // Server requires fullName ≥ 2 chars — mirror it here so the user gets a
    // specific message instead of the generic INVALID error.
    if (first.trim().length < 2) { fail('name', 'სახელი — მინიმუმ 2 სიმბოლო'); return }
    // Said here, not by a 400 — the API's generic „შეავსე ყველა ველი" names nothing.
    { const e = georgianNameError('სახელი', first); if (e) { fail('name', e); return } }
    { const e = emailFormatError(email); if (e) { fail('email', e); return } }
    const phoneMsg = phoneFormatError(phone, { required: true })
    if (phoneMsg) { fail('phone', phoneMsg); return }
    // `passwordError` is the floor AND the ceiling the route's `min(8).max(120)`
    // states. The old check had only the floor, so a pasted 200-character
    // passphrase came back INVALID and was blamed on the length being too SHORT.
    { const e = passwordError(pw); if (e) { fail('password', e); return } }
    // Not a field with a box, so nothing to focus — the consent line is the
    // last thing on the form and already in view.
    if (!agree) { setErrMsg('დაეთანხმე წესებს'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: first.trim(), email: email.trim().toLowerCase(), password: pw, phone }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSubmitting(false)
        // The three the route names a field for. EMAIL_TAKEN carries none but
        // there is only one address on the form, so it is unambiguous.
        if (data.error === 'EMAIL_TAKEN') { fail('email', 'ეს ელფოსტა უკვე გამოყენებულია'); return }
        if (data.error === 'INVALID_PHONE') { fail('phone', data.message ?? 'ტელეფონის ნომერი არასწორია'); return }
        if (data.error === 'INVALID_TEXT') { fail('name', data.message ?? 'სახელი ქართულად ჩაწერე'); return }
        setErrMsg(
          // ⚠️ NO LONGER „(პაროლი მინიმუმ 8 სიმბოლო)". Every rule this screen
          // can predict is checked above, so a bare INVALID now means something
          // it did not predict — and guessing a cause is what sent people to
          // retype a password that was never the problem.
          data.error === 'INVALID' ? 'შეავსე ყველა ველი სწორად' :
          data.error === 'RATE_LIMITED' ? `ბევრი მცდელობა — სცადე ${Math.ceil((data.retryInSec ?? 60)/60)} წუთში` :
          'შეცდომა, სცადე თავიდან'
        )
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

      {/* `noValidate` — see the note on the sign-in form: the browser's bubble
          fires before this handler can name a field, and it is not Georgian. */}
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="სახელი" required>
          <input type="text" value={first} onChange={e => { setFirst(e.target.value); touch('name') }} placeholder="ანი" {...props('name')} className={`${inputCls} ${bad('name') ? FIELD_ERROR_BORDER : ''}`} />
          {error('name')}
        </Field>

        <Field label="ელფოსტა" required>
          <input type="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={e => { setEmail(e.target.value); touch('email') }} placeholder="anu@gmail.com" autoComplete="email" {...props('email')} className={`${inputCls} ${bad('email') ? FIELD_ERROR_BORDER : ''}`} />
          {error('email')}
        </Field>

        <Field label="ტელეფონი" required>
          <PhoneInput value={phone} onChange={v => { setPhone(v); touch('phone') }} className={`${inputCls} ${bad('phone') ? FIELD_ERROR_BORDER : ''}`} field={props('phone')} />
          {error('phone')}
        </Field>

        <div>
          <label className="block font-display text-micro font-semibold uppercase text-ink-700 mb-2">პაროლი<span className="text-danger-500 ml-0.5" aria-hidden>*</span></label>
          <PwInput value={pw} onChange={(v) => { setPw(v); touch('password') }} field={props('password')} invalid={bad('password')} />
          {error('password')}
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

        {/* Left for what has no field: the consent tick, a rate limit, a
            network drop. Anything with a field is ON the field. */}
        {errMsg && !fault && (
          <div role="alert" className="rounded-field bg-danger-50 border border-danger-200 px-3 py-2 text-small text-danger-700 leading-[1.45] break-words">{errMsg}</div>
        )}

        <button type="submit" disabled={submitting || gap !== null} className="w-full h-12 mt-2 rounded-btn bg-brand-600 hover:bg-brand-700 disabled:bg-ink-100 disabled:text-ink-500 disabled:cursor-not-allowed text-white font-display font-semibold text-body-lg tracking-wide inline-flex items-center justify-center gap-2 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2">
          {submitting ? (
            <>
              <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4 motion-safe:animate-spin" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" /></svg>
              ვქმნით ანგარიშს…
            </>
          ) : (
            <>ანგარიშის შექმნა</>
          )}
        </button>
        {!submitting && gap && (
          // One next-step hint at a time — why the button is grey. Same source
          // as `disabled` above, so the two can never name different fields.
          <p className="text-meta text-ink-500 text-center">{gap.message}</p>
        )}

        <p className="text-center text-small text-ink-500 mt-2 leading-relaxed">
          <span className="font-display font-semibold text-brand-700">მოთხოვნა ამჟამად უფასოა.</span>
        </p>
      </form>
    </div>
  )
}

/* Expert sign-up — creates ONLY the account. The full expert application
 * (expertise, portfolio, pricing, identity docs) lives at /apply, the single
 * source of expert onboarding. We deliberately do NOT duplicate that form —
 * or its uploads — here; this hands off to /apply after the account is made. */
// ⚠️ IT TOOK A `kind` AND NO LONGER DOES (2026-08-24). One provider, one set of
// words — and the word that had to change is on the CONSENT line: the default
// branch read „ვეთანხმები ექსპერტის წესებს", so the tile that says
// „ჩემი სერვისი" was asking a plumber to agree to the expert terms. Consent is
// the one place where the wrong noun is not a typo (CLAUDE.md).
const ProviderSignUp = ({ setView }: { setView: (v: View) => void }) => {
  // ⚠️ ONE FORM, TWO DESTINATIONS — deliberately not a second copy. Both sides
  // collect exactly the same thing here (an account: name, surname, email,
  // phone, password) because the identity-specific questions live on the
  // application forms, which is the rule this component's header already
  // states. What differs is the sentence at the top and where it hands off, so
  // those are the only two things this prop changes.
  // No `?can=` from the „ვთავაზობ" tile: the door asks which halves, and
  // pre-ticking one here would answer a question the person has not seen.
  // ⚠️ `?can=WORK` WENT WITH THE SECOND WIZARD. /join is the one door and it
  // ignores the parameter; carrying it would only put a dead query string into
  // every provider signup link on the site.
  const dest = '/join'
  // ⚠️ EVERY VISIBLE STRING IN THIS COMPONENT MUST ASK `kind`, and one did not
  // (2026-08-18). The consent line read „ვეთანხმები ექსპერტის წესებს" on both
  // branches — so a plumber was ticking a box agreeing to the expert terms.
  // Consent is the one place where the wrong noun is not a typo.
  const [first, setFirst] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [pw, setPw] = useState('')
  const [agree, setAgree] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  // A SECOND scope („signup-p"), not a second copy of the first: both forms can
  // be mounted under the role switch, and two controls minting the same element
  // id would point `aria-describedby` at the wrong card's message.
  const { fault, fail, props, bad, clearField, reset: clearFault, error } = useFault('signup-p')
  const touch = (field: string) => { if (errMsg) setErrMsg(null); clearField(field) }
  const gap = firstMissing({ first, email, phone, pw, agree })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrMsg(null); clearFault()
    if (!first.trim()) { fail('first', 'შეიყვანე სახელი'); return }
    { const e = emailFormatError(email); if (e) { fail('email', e); return } }
    const phoneMsg = phoneFormatError(phone, { required: true })
    if (phoneMsg) { fail('phone', phoneMsg); return }
    // ⚠️ ONE BOX, ONE JUDGEMENT (2026-09-02). The note here used to say „each
    // box judged on its own, so „ნინო" + „Beridze" complains about the SURNAME
    // rather than about „name and surname"" — which was the right rule for two
    // boxes and is why the split looked defensible. With one box the field the
    // reader is looking at IS the field the message names, which is the same
    // guarantee by a shorter route.
    { const e = georgianNameError('სახელი და გვარი', first); if (e) { fail('first', e); return } }
    { const e = passwordError(pw); if (e) { fail('password', e); return } }
    if (!agree) { setErrMsg('დაეთანხმე წესებს'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: first.trim(), email: email.trim().toLowerCase(), password: pw, phone }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSubmitting(false)
        if (data.error === 'EMAIL_TAKEN') { fail('email', 'ეს ელფოსტა უკვე გამოყენებულია'); return }
        if (data.error === 'INVALID_PHONE') { fail('phone', data.message ?? 'ტელეფონის ნომერი არასწორია'); return }
        // The route judges the JOINED name, so its message names the first box —
        // the one this form asks for first, and the one the reader can act on.
        if (data.error === 'INVALID_TEXT') { fail('first', data.message ?? 'სახელი ქართულად ჩაწერე'); return }
        setErrMsg(
          data.error === 'INVALID' ? 'შეავსე ყველა ველი სწორად' :
          data.error === 'RATE_LIMITED' ? `ბევრი მცდელობა — სცადე ${Math.ceil((data.retryInSec ?? 60)/60)} წუთში` :
          'შეცდომა, სცადე თავიდან'
        )
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
          {/* ⚠️ THE EXPERT SENTENCE WAS THE OTHER BRANCH AND IS GONE. It read
              „ექსპერტიზას, პორტფოლიოსა და ფასს შემდეგ შეავსებ. განაცხადს
              გავამოწმებთ 48 საათში" — three things the one remaining form does
              not ask for, and a review time nobody has measured on this queue.
              This one says what is actually next. */}
          <p className="text-small text-ink-600 mt-1">
            რას აკეთებ და რომელ ქალაქში — <span className="font-display font-semibold text-ink-800">შემდეგ</span> შეავსებ. შემდეგ დაგირეკავთ.
          </p>
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

        <form onSubmit={submit} noValidate className="space-y-4">
          {/* ⚠️ ONE BOX, AND IT WAS TWO (2026-09-02). This half asked „სახელი"
              and „გვარი" side by side while the CLIENT half of the same form,
              one toggle away, asked a single „სახელი" — so the answer to „who
              are you" changed shape depending on which tile you had pressed,
              on one screen. Found by registering both kinds back to back.

              The split was never real. `User.fullName` is ONE column, and the
              submit below immediately did `${first} ${last}` to fill it — two
              controls existing only to be joined. Every OTHER surface in the
              product that asks this question asks it as one box, under this
              exact label: app/settings/_profile, app/join/_provider (which the
              applicant meets seconds after this screen), app/request/
              _stepContact, app/business/LeadForm, app/work/profile/
              _secIdentity. Five to one; the one was here.

              It is also the safer shape for names. A person with one name, a
              double-barrelled surname, or a patronymic in the middle has
              somewhere to put it — and „ბერიძე ანა" typed in the wrong order no
              longer stores a first name in the surname column for ever.

              `georgianNameError` still judges it, once, under the label the
              field carries — so the message names what the reader sees. */}
          <Field label="სახელი და გვარი" required>
            <input type="text" value={first} onChange={e => { setFirst(e.target.value); touch('first') }} placeholder="ანი ბერიძე" {...props('first')} className={`${inputCls} ${bad('first') ? FIELD_ERROR_BORDER : ''}`} />
            {error('first')}
          </Field>

          <Field label="ელფოსტა" required>
            <input type="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={e => { setEmail(e.target.value); touch('email') }} placeholder="anu@gmail.com" autoComplete="email" {...props('email')} className={`${inputCls} ${bad('email') ? FIELD_ERROR_BORDER : ''}`} />
            {error('email')}
          </Field>

          <Field label="ტელეფონი" required>
            <PhoneInput value={phone} onChange={v => { setPhone(v); touch('phone') }} className={`${inputCls} ${bad('phone') ? FIELD_ERROR_BORDER : ''}`} field={props('phone')} />
            {error('phone')}
          </Field>

          <div>
            <label className="block font-display text-micro font-semibold uppercase text-ink-700 mb-2">პაროლი<span className="text-danger-500 ml-0.5" aria-hidden>*</span></label>
            <PwInput value={pw} onChange={(v) => { setPw(v); touch('password') }} field={props('password')} invalid={bad('password')} />
            {error('password')}
            <StrengthBar pw={pw} />
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer select-none pt-2">
            <span className={`mt-0.5 w-4 h-4 rounded border-[1.5px] inline-flex items-center justify-center shrink-0 transition-colors duration-fast ${agree ? 'bg-brand-500 border-brand-500' : 'border-ink-300 bg-white hover:border-ink-400'}`}>
              {agree && <Icon.check className="w-3 h-3 text-white" />}
            </span>
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="sr-only" />
            <span className="text-small text-ink-700">
              {/* „წესებსა და", not „წესებს და" (2026-09-02) — the client half of
                  this same form, one toggle away, has had the correct form all
                  along, and Georgian adds the -ა before „და". One sentence, one
                  spelling; the difference was one character and it was on the
                  line a person legally agrees to. */}
              ვეთანხმები <a href="/terms" target="_blank" rel="noopener noreferrer" className="tap-area text-brand-700 hover:text-brand-800 font-medium underline underline-offset-2 decoration-brand-300">წესებსა</a> და <a href="/privacy" target="_blank" rel="noopener noreferrer" className="tap-area text-brand-700 hover:text-brand-800 font-medium underline underline-offset-2 decoration-brand-300">კონფიდენციალურობის პოლიტიკას</a>.
            </span>
          </label>

          {errMsg && !fault && (
            <div role="alert" className="rounded-field bg-danger-50 border border-danger-200 px-3 py-2 text-small text-danger-700 leading-[1.45] break-words">{errMsg}</div>
          )}

          <button type="submit" disabled={submitting || gap !== null} className="w-full h-12 mt-2 rounded-btn bg-brand-600 hover:bg-brand-700 disabled:bg-ink-100 disabled:text-ink-500 disabled:cursor-not-allowed text-white font-display font-semibold text-body-lg tracking-wide inline-flex items-center justify-center gap-2 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2">
            {submitting ? (
              <>
                <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4 motion-safe:animate-spin" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" /></svg>
                ვქმნით ანგარიშს…
              </>
            ) : (
              <>ანგარიშის შექმნა</>
            )}
          </button>
          {!submitting && gap && (
            <p className="text-meta text-ink-500 text-center">{gap.message}</p>
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
  /* ⚠️ THE GREEN CARD, NOT LOOSE TEXT ON PAPER (2026-08-31). Same change as
     SignInIntro and for the same reason: the redesign gives the site ONE
     material for „this is what we are" — the radial card the home hero, the
     „როგორ მუშაობს" page and the provider's status band share — and the two
     doors were the last marketing surfaces still drawn as bare copy beside a
     white form. NOTHING THIS SAYS CHANGED: every string is still a SiteText
     key, all three role branches are untouched in wording and in order, and the
     „serve" panel is still its own rather than the expert one relabelled. Only
     the ground moved, and the ink with it. */
  <div className="relative w-full min-w-0 max-w-full overflow-hidden rounded-band bg-[radial-gradient(120%_140%_at_12%_8%,#26806E_0%,#1E6656_42%,#123A31_100%)] px-6 py-9 text-white sm:px-9 sm:py-11 lg:sticky lg:top-24 lg:max-w-[520px] lg:px-10 lg:py-12">
    <span
      aria-hidden
      className="pointer-events-none absolute -right-12 -top-16 h-[260px] w-[260px] rounded-full bg-white/[0.06]"
    />
    {/* Status pill */}
    <span className="relative inline-flex h-8 items-center gap-2 rounded-pill bg-white/[0.14] pl-1.5 pr-3.5 mb-7">
      <span className="inline-flex items-center gap-1 h-4 px-1.5 rounded-pill bg-brand-600 text-white font-display text-micro font-bold uppercase">{t('signup.badge')}</span>
      <span className="text-meta font-display font-medium">
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
        <h1 className="font-display text-display lg:text-display-lg font-bold leading-[0.98] tracking-[-0.03em] text-white motion-safe:animate-rise-in">
          {t('signup.serve.title1')}<br />
          <span className="text-brand-200">{t('signup.serve.title2')}</span>
        </h1>
        <p className="text-body-lg sm:text-h3 text-white/[0.82] mt-6 sm:mt-7 max-w-[440px]">
          {t('signup.serve.sub')}
        </p>
        <ol className="mt-10 lg:mt-12 space-y-6">
          {[1, 2, 3].map(n => (
            <li key={n} className="grid grid-cols-[auto_1fr] gap-4 items-start">
              <span className="font-display text-micro font-bold uppercase text-brand-200 tabular-nums mt-1">
                {`0${n}`}
              </span>
              <div className="min-w-0">
                <div className="font-display text-body font-bold text-white">{t(`signup.serve.step${n}.title`)}</div>
                <p className="text-small text-white/[0.7] mt-0.5 leading-relaxed">{t(`signup.serve.step${n}.desc`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </>
    ) : role === 'learn' ? (
      <>
        <h1 className="font-display text-display lg:text-display-lg font-bold leading-[0.98] tracking-[-0.03em] text-white motion-safe:animate-rise-in">
          {t('signup.learn.title1')}<br />
          <span className="text-brand-200">{t('signup.learn.title2')}</span>
        </h1>
        <p className="text-body-lg sm:text-h3 text-white/[0.82] mt-6 sm:mt-7 max-w-[440px]">
          {/* ⚠️ `subRest` IS GONE (2026-08-31) — it read „— დაცული გადახდა
              მალე." and step 02 below is titled „დაცული გადახდა (მალე)". One
              sentence, twice, four lines apart. What is left is the half that
              nothing else says. The key is retired, not deleted. */}
          <span className="font-display font-semibold text-white">{t('signup.learn.subEmphasis')}</span>
        </p>

        <ol className="mt-10 lg:mt-12 space-y-6">
          {[
            { n: '01', t: t('signup.learn.step1.title'), d: t('signup.learn.step1.desc') },
            { n: '02', t: t('signup.learn.step2.title'), d: t('signup.learn.step2.desc') },
            { n: '03', t: t('signup.learn.step3.title'), d: t('signup.learn.step3.desc') },
          ].map(b => (
            <li key={b.n} className="grid grid-cols-[48px_1fr] gap-4 items-baseline">
              <span className="font-display text-h1 font-bold text-brand-200 tabular-nums leading-none">{b.n}</span>
              <div>
                <div className="font-display text-body-lg font-bold text-white tracking-tight">{b.t}</div>
                <p className="text-small text-white/[0.7] mt-1.5 leading-[1.55]">{b.d}</p>
              </div>
            </li>
          ))}
        </ol>

        {/* ⚠️ THE TRUST BLOCK IS GONE (2026-08-31, owner: „გამოვასწოროთ როგორც
            უკეთესია"). It was a bordered strip below the list reading
            „ექსპერტებს ხელით განვიხილავთ / გამოცდილება და რეპუტაცია
            გამოწმებული." — which is step 03 („ხელით განხილული / ყველა
            ექსპერტი — სანამ პლატფორმაზე მოვა.") said a second time, eight
            lines under itself. Nothing was wrong with the sentence; it was
            already on the screen.

            The panel beside it is the measure: `signup.serve.*` renders
            title1 · title2 · sub · three steps and stops. The client panel
            carried one block more than the provider one, and that block was
            the repeat. Both are now the same shape.

            The keys are RETIRED in lib/siteTextDefs, not deleted — a
            production row may hold copy typed under them. */}
      </>
    ) : null}
    {/* ⚠️ THE THIRD PANEL WAS HERE AND IS GONE (2026-08-24) — the CONSULTATION
        applicant's, and it is the reason the collapse was worth doing rather
        than aliasing one role onto another. It led with „15% საკომისიო" as a
        stat tile and a four-step review timeline: numbers that were true of a
        consultation and false of everybody who signs up now, because a lead
        costs a provider nothing today. The first thing a plumber read on this
        screen was a fee we do not charge them.

        Its twenty-three `signup.teach.*` keys stay in lib/siteTextDefs as
        RETIRED — never deleted, because a production row may hold copy the
        owner typed under one of them, and the admin editor hides a retired
        field rather than offering a control over a panel nobody can open. */}
  </div>
  )
}

export const SignUpView = ({ setView }: { setView: (v: View) => void }) => {
  const [role, setRole] = useState<SignupRole>('learn')
  const params = useSearchParams()
  const redirect = params?.get('redirect') || params?.get('next') || ''
  // Arriving from a provider's profile → the visitor is unambiguously a CLIENT.
  // Drop the fork (the only real decision on this form) so the highest-intent
  // signup has zero extra choices to make.
  //
  // ⚠️ IT WAS CALLED `bookingIntent` AND CAME WITH A SENTENCE — „დაასრულე
  // რეგისტრაცია — ჯავშანი გაგრძელდება". There is no booking to continue
  // (2026-08-24), and a promise the site cannot keep is worse than no note at
  // all, so the note went and the FORK stayed: whoever arrives from a profile
  // is still a client and still should not be asked which they are.
  const profileIntent = redirect.includes('/experts/')
  // redirect=/join is the single most unambiguous EXPERT signal on the site —
  // yet this form used to preselect „სტუდენტი" and make the applicant notice
  // and fix a pre-answered question (wrong-role accounts were the real
  // failure). Same fork-drop as bookingIntent, opposite branch.
  // ⚠️ IT USED TO READ `?can=` TO PICK A HALF, and getting that wrong was the
  // wrong-role account this block exists to prevent: both wizards lived under
  // /join, so a plain prefix test read a plumber arriving from the trades pitch
  // as an EXPERT and sent them to the expert form after signup. There is one
  // form now, so the prefix IS the answer and there is nothing left to
  // mis-read.
  const joinIntent = !profileIntent && redirect.startsWith('/join')
  const effectiveRole: SignupRole = profileIntent ? 'learn' : joinIntent ? 'serve' : role
  // Both handoffs show the same „one step left" note: the account is a step
  // inside an application they already started, not a new decision.
  const continuingApplication = joinIntent
  return (
    <Container as="main" id="main" className="relative pt-6 sm:pt-14 lg:pt-20 pb-16 lg:pb-20">
      {/* Form-first on mobile (see SignInView) — the role switch + form come
          before the pitch so signup starts immediately. */}
      <div className="grid gap-12 lg:gap-20 items-start lg:grid-cols-2">
        <div className="order-2 lg:order-1 min-w-0"><SignUpIntro role={effectiveRole} /></div>
        <div className="order-1 lg:order-2 min-w-0">
          {continuingApplication ? (
            <div className="mb-5 rounded-card border border-ink-200 bg-ink-50/60 px-4 py-3">
              <div className="font-display text-small font-bold text-ink-900">ერთი ნაბიჯიღა დარჩა</div>
              <p className="text-meta text-ink-600 mt-0.5">დაასრულე რეგისტრაცია — განაცხადი გაგრძელდება.</p>
            </div>
          ) : profileIntent ? null : (
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
            : <ProviderSignUp setView={setView} />}
        </div>
      </div>
    </Container>
  )
}