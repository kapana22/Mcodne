'use client'
// /signin — the password reset view (request → code → new password).

import React, { useState, useEffect } from 'react'
import { homeForRole, safeInternalPath } from '@/lib/roleHome'
import { Icon } from '@/components/Icon'
import { Container } from '@/components/Container'
import { Eyebrow } from '@/components/Eyebrow'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'
import { FIELD_ERROR_BORDER, useFault } from '@/components/FieldError'
import { emailFormatError } from '@/lib/emailRule'
import { PWD_MIN, passwordError } from '@/lib/passwordPolicy'
import { PwInput, StrengthBar } from './_fields'
import { View } from './_model'

/* ═══════════════════════════════════════════════════════════════════ */
/* PASSWORD RESET VIEW                                                  */
/* ═══════════════════════════════════════════════════════════════════ */

type ResetStep = 'request' | 'check' | 'reset' | 'done'
const RESET_STEPS: { id: ResetStep; l: string }[] = [
  { id: 'request', l: 'ელფოსტა' },
  { id: 'check',   l: 'შეამოწმე' },
  { id: 'reset',   l: 'ახალი პაროლი' },
  { id: 'done',    l: 'მზადაა' },
]

export const ResetView = ({ setView }: { setView: (v: View) => void }) => {
  const [step, setStep] = useState<ResetStep>('request')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [sending, setSending] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [resendIn, setResendIn] = useState(0)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [resetToken, setResetToken] = useState<string | null>(null)
  const { fault, fail, props, bad, clearField, reset: clearFault, error } = useFault('reset')
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
  useEffect(() => { setErrMsg(null); clearFault() }, [step, clearFault])

  useEffect(() => {
    if (resendIn <= 0) return
    const id = setTimeout(() => setResendIn(r => r - 1), 1000)
    return () => clearTimeout(id)
  }, [resendIn])

  const mismatch = confirm.length > 0 && pw !== confirm
  const ok = passwordError(pw) === null && !mismatch && confirm.length > 0

  /* ⚠️ IT SAID „ბმული გამოგიგზავნეთ" AFTER A REFUSED REQUEST (fixed
   * 2026-08-31). The route parses `{ email: z.string().email() }` and answers
   * 400 INVALID on anything else — and this function tested only for
   * RATE_LIMITED, then advanced to the „check your inbox" step regardless. So
   * somebody who typed „ana@gmail" was shown their own typo under a headline
   * promising a link that was never sent, waited, and came back to it later.
   *
   * The address is judged here first (lib/emailRule — the route's own
   * `.email()`), and a 400 from the route no longer advances the step.
   *
   * ⚠️ AN UNKNOWN ADDRESS STILL ADVANCES, and that is not the same thing. The
   * route deliberately answers ok for an email with no account („ბმული მოვა,
   * თუ ანგარიში არსებობს — უსაფრთხოებისთვის", said on this very screen), so
   * this must never distinguish the two. Only a MALFORMED address is refused —
   * which leaks nothing, because it could not belong to anybody. */
  const submitRequest = async () => {
    if (sending) return
    setErrMsg(null); clearFault()
    // The „ხელახლა გაგზავნა" button on the CHECK step calls this too, and that
    // step has no email box to mark — so a fault there would be set and never
    // drawn. On that step the card's own banner is the only place to say it.
    const sayEmail = (m: string) => { if (step === 'request') fail('email', m); else setErrMsg(m) }
    const emailMsg = emailFormatError(email)
    if (emailMsg) { sayEmail(emailMsg); return }
    setSending(true)
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
      if (!res.ok || data?.ok === false) {
        sayEmail('ელფოსტა არასწორია')
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
    if (submitting) return
    setErrMsg(null); clearFault()
    // The route's own bound (`min(8).max(120)`), asked on the field. The button
    // is still gated on `ok`, so this fires only on the paths that reach here
    // some other way — Enter in the box, a restored draft.
    const pwMsg = passwordError(pw)
    if (pwMsg) { fail('pw', pwMsg); return }
    if (!ok) return
    if (!resetToken) {
      setErrMsg('ბმული ვადაგადასულია ან არასწორია. ითხოვე ახალი.')
      return
    }
    setSubmitting(true)
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
                <span className={`w-5 h-5 rounded-full inline-flex items-center justify-center font-display text-meta font-bold tabular-nums ${
                  done ? 'bg-success-500 text-white' :
                  active ? 'bg-brand-600 text-white' :
                  'bg-ink-100 text-ink-500'
                }`}>{done ? <Icon.check className="w-3 h-3" /> : i + 1}</span>
                <span className={`font-display text-meta font-semibold tracking-wide ${active ? 'text-ink-900' : 'text-ink-500'}`}>{s.l}</span>
              </li>
              {i < RESET_STEPS.length - 1 && <span className={`w-4 h-px ${done ? 'bg-brand-300' : 'bg-ink-200'}`} />}
            </React.Fragment>
          )
        })}
      </ol>

      {/* Same card, same fix as _signin.tsx — see the note there. */}
      <div className="bg-white rounded-card border border-ink-200 shadow-card p-7 lg:p-10 motion-safe:animate-fade-in">

        {/* What has no field: a rate limit, a dead network, a spent link.
            Anything with a field is on the field. */}
        {errMsg && !fault && (
          <div role="alert" className="mb-4 rounded-btn border border-danger-200 bg-danger-50 text-danger-800 px-3 py-2 text-small font-medium">
            {errMsg}
          </div>
        )}

        {step === 'request' && (
          <form noValidate onSubmit={e => { e.preventDefault(); submitRequest() }}>
            <Eyebrow className="mb-2">პაროლის აღდგენა</Eyebrow>
            <h1 className="font-display text-h1 lg:text-display font-bold text-ink-900 tracking-tight leading-[1.1]">
              მიუთითე ელფოსტა —<br /> ბმულს გამოგიგზავნით.
            </h1>
            <p className="mt-3 text-body text-ink-600 max-w-[440px]">
              ერთჯერად ბმულს გამოგიგზავნით. ვადა — 1 საათი.
            </p>
            {/* ⚠️ <div> + <label htmlFor> (2026-08-31). The wrapping <label> held
                the error message too, so the box was named „ელფოსტა" plus
                whatever had just gone wrong. An `aria-label` was the first
                patch; this is the real one — the visible label and the
                accessible name are now the same node, and cannot drift. */}
            <div className="block mt-7">
              <label htmlFor="reset-email" className="font-display text-micro font-semibold uppercase text-ink-700">ელფოსტა</label>
              <input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={e => { setEmail(e.target.value); if (errMsg) setErrMsg(null); clearField('email') }} id="reset-email" placeholder="anu@gmail.com" {...props('email')} className={`w-full mt-2 h-12 px-3.5 rounded-field bg-white border ${bad('email') ? FIELD_ERROR_BORDER : 'border-ink-200 focus:border-brand-500 focus:ring-brand-100'} focus:ring-2 focus:outline-none text-body-lg text-ink-900 placeholder:text-ink-400 transition-colors duration-fast`} />
              {error('email')}
            </div>
            <button type="submit" disabled={!email || sending} className="mt-6 w-full h-12 rounded-btn bg-brand-600 hover:bg-brand-700 disabled:bg-ink-100 disabled:text-ink-500 text-white font-display font-semibold text-body-lg tracking-wide inline-flex items-center justify-center gap-2 transition-colors duration-fast">
              {sending ? (
                <>
                  <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4 motion-safe:animate-spin" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" /></svg>
                  ვუგზავნით…
                </>
              ) : (
                <>ბმულის გაგზავნა</>
              )}
            </button>
            {!email && <p className="mt-2 text-center text-meta text-ink-500">ჯერ შეიყვანე ელფოსტის მისამართი.</p>}
            <div className="mt-5 grid grid-cols-[auto_1fr] gap-2.5 items-start p-3.5 rounded-card bg-ink-50/60 border border-ink-200">
              <Icon.shieldCheck className="w-4 h-4 text-ink-500 mt-0.5" />
              <p className="text-meta text-ink-600 leading-[1.5]">
                ბმული მოვა, თუ ანგარიში არსებობს — უსაფრთხოებისთვის. ნახე spam ან მოგვწერე <a href={`mailto:${SUPPORT_EMAIL}`} className="tap-area text-brand-700 hover:text-brand-800 font-medium underline underline-offset-2 decoration-brand-300">{SUPPORT_EMAIL}</a>.
              </p>
            </div>
          </form>
        )}

        {step === 'check' && (
          <div>
            <Eyebrow className="mb-2">შეამოწმე ელფოსტა</Eyebrow>
            <h1 className="font-display text-h1 lg:text-display font-bold text-ink-900 tracking-tight leading-[1.1]">
              ბმული გამოგიგზავნეთ —<br /><span className="text-ink-500 break-all">{email || 'შენს ელფოსტაზე'}</span>
            </h1>
            <p className="mt-3 text-body text-ink-600">
              ეძებე „მცოდნე · პაროლის აღდგენა“ — შემოსულში ან spam-ში. ვადა — 1 საათი.
            </p>

            <div className="mt-7 rounded-card border border-ink-200 bg-white p-5 flex items-start gap-3.5">
              <span className="w-10 h-10 rounded-card bg-brand-50 text-brand-700 inline-flex items-center justify-center shrink-0">
                <Icon.mail className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <div className="font-display text-body font-bold text-ink-900">შეამოწმე ფოსტა</div>
                <p className="text-small text-ink-600 mt-1">
                  ბმული გამოგიგზავნეთ <span className="font-display font-semibold text-ink-800 break-all">{email || 'შენს ელფოსტაზე'}</span>-ზე. მიჰყევი მას.
                </p>
              </div>
            </div>

            <div className="mt-7 pt-6 border-t border-ink-100 flex flex-wrap items-center gap-3 text-small">
              <span className="text-ink-600">არ მოვიდა?</span>
              <button type="button" onClick={submitRequest} disabled={resendIn > 0 || sending} className="font-display font-semibold text-brand-700 hover:text-brand-800 disabled:text-ink-500 inline-flex items-center gap-1.5 transition-colors duration-fast">
                <Icon.refresh className="w-3.5 h-3.5" />
                {resendIn > 0 ? `ხელახლა გაგზავნა · ${resendIn}წმ` : 'ხელახლა გაგზავნა'}
              </button>
              <span className="text-ink-300">·</span>
              <button type="button" onClick={() => setStep('request')} className="font-display font-semibold text-ink-700 hover:text-ink-900">სხვა ელფოსტა</button>
            </div>
          </div>
        )}

        {step === 'reset' && (
          <form noValidate onSubmit={e => { e.preventDefault(); submitReset() }}>
            <Eyebrow className="mb-2">ახალი პაროლი</Eyebrow>
            <h1 className="font-display text-h1 lg:text-display font-bold text-ink-900 tracking-tight leading-[1.1]">
              აირჩიე პაროლი — <br /><span className="text-ink-500">უნიკალური და ძლიერი.</span>
            </h1>
            <p className="mt-3 text-body text-ink-600 max-w-[440px]">
              შეცვლის შემდეგ ყველა სხვა მოწყობილობა გაითიშება.
            </p>
            <div className="mt-7 space-y-4">
              <div>
                <label className="block font-display text-micro font-semibold uppercase text-ink-700 mb-2">ახალი პაროლი</label>
                <PwInput value={pw} onChange={(v) => { setPw(v); if (errMsg) setErrMsg(null); clearField('pw') }} field={props('pw')} invalid={bad('pw')} label="ახალი პაროლი" />
                {error('pw')}
                <StrengthBar pw={pw} />
              </div>
              <div>
                <label className="block font-display text-micro font-semibold uppercase text-ink-700 mb-2">გაიმეორე</label>
                <PwInput
                  value={confirm}
                  onChange={(v) => { setConfirm(v); if (errMsg) setErrMsg(null) }}
                  placeholder="იგივე პაროლი"
                  invalid={mismatch}
                  label="გაიმეორე პაროლი"
                />
                {/* Live, not on submit: the answer is knowable while typing and
                    the button is already gated on it. `role="alert"` so it is
                    announced rather than only seen. */}
                {mismatch && (
                  <p role="alert" className="mt-1.5 text-meta text-danger-700 inline-flex items-center gap-1.5">
                    <Icon.warn className="w-3 h-3" /> პაროლი არ ემთხვევა
                  </p>
                )}
              </div>
              <ul className="mt-2 space-y-1.5 text-meta">
                {[
                  // ⚠️ ONLY THE FIRST OF THESE FOUR IS ENFORCED, anywhere. The
                  // other three are guidance the server has never asked for, so
                  // they must stay a checklist and never become a gate — a
                  // client rule the server does not have is a refusal the
                  // server would have accepted. `PWD_MIN` is the one that is
                  // real, read from the constant the route's schema uses.
                  { l: 'მინიმუმ 8 სიმბოლო', ok: pw.length >= PWD_MIN },
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
            <button type="submit" disabled={!ok || submitting} className="mt-7 w-full h-12 rounded-btn bg-brand-600 hover:bg-brand-700 disabled:bg-ink-100 disabled:text-ink-500 text-white font-display font-semibold text-body-lg tracking-wide inline-flex items-center justify-center gap-2 transition-colors duration-fast">
              {submitting ? (
                <>
                  <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4 motion-safe:animate-spin" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" /></svg>
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
            <div className="font-display text-micro font-semibold uppercase text-success-700 mb-2">პაროლი შეიცვალა</div>
            <h1 className="font-display text-h1 lg:text-display font-bold text-ink-900 tracking-tight leading-[1.1]">
              {doneDest ? <>მზადაა. ამ მოწყობილობაზე<br />უკვე შესული ხარ.</> : <>მზადაა. შესვლისთვის<br />ახალი პაროლი გამოიყენე.</>}
            </h1>
            <p className="mt-3 text-body text-ink-600 max-w-[440px]">
              სხვა მოწყობილობები გავთიშეთ — იქ ახალი პაროლით შედი.
            </p>
            <button
              type="button"
              // Session already live on this device → continue into the
              // workspace; only fall back to the signin form if the confirm
              // response somehow lacked a destination.
              onClick={() => { if (doneDest) window.location.href = doneDest; else setView('signin') }}
              className="mt-7 w-full h-12 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body-lg tracking-wide inline-flex items-center justify-center gap-2 transition-colors duration-fast"
            >
              {doneDest ? 'გაგრძელება' : 'შესვლა ახალი პაროლით'}
            </button>
          </div>
        )}
      </div>

      <p className="mt-5 text-center text-meta text-ink-500">
        დახმარება გჭირდება?{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="tap-area font-display font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-2 decoration-brand-300">{SUPPORT_EMAIL}</a>
      </p>
    </Container>
  )
}
