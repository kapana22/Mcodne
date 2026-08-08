'use client'
// /signin — the password reset view (request → code → new password).

import React, { useState, useEffect } from 'react'
import { homeForRole, safeInternalPath } from '@/lib/roleHome'
import { Icon } from '@/components/Icon'
import { Container } from '@/components/Container'
import { Eyebrow } from '@/components/Eyebrow'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'
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

      <div className="bg-white rounded-card border border-ink-200 shadow-card p-7 lg:p-10 motion-safe:animate-scale-in">

        {errMsg && (
          <div role="alert" className="mb-4 rounded-btn border border-danger-200 bg-danger-50 text-danger-800 px-3 py-2 text-small font-medium">
            {errMsg}
          </div>
        )}

        {step === 'request' && (
          <form onSubmit={e => { e.preventDefault(); submitRequest() }}>
            <Eyebrow className="mb-2">პაროლის აღდგენა</Eyebrow>
            <h1 className="font-display text-h1 lg:text-display font-bold text-ink-900 tracking-tight leading-[1.1]">
              მიუთითე ელფოსტა —<br /> ბმულს გამოგიგზავნით.
            </h1>
            <p className="mt-3 text-body text-ink-600 max-w-[440px]">
              ერთჯერად ბმულს გამოგიგზავნით. ვადა — 1 საათი.
            </p>
            <label className="block mt-7">
              <span className="font-display text-micro font-semibold uppercase text-ink-700">ელფოსტა</span>
              <input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={e => { setEmail(e.target.value); if (errMsg) setErrMsg(null) }} placeholder="anu@gmail.com" className="w-full mt-2 h-12 px-3.5 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-body-lg text-ink-900 placeholder:text-ink-400 transition-colors duration-fast" />
            </label>
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
          <form onSubmit={e => { e.preventDefault(); submitReset() }}>
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
                <PwInput value={pw} onChange={(v) => { setPw(v); if (errMsg) setErrMsg(null) }} />
                <StrengthBar pw={pw} />
              </div>
              <div>
                <label className="block font-display text-micro font-semibold uppercase text-ink-700 mb-2">გაიმეორე</label>
                <PwInput
                  value={confirm}
                  onChange={(v) => { setConfirm(v); if (errMsg) setErrMsg(null) }}
                  placeholder="იგივე პაროლი"
                />
                {mismatch && (
                  <p className="mt-1.5 text-meta text-danger-700 inline-flex items-center gap-1.5">
                    <Icon.warn className="w-3 h-3" /> პაროლი არ ემთხვევა
                  </p>
                )}
              </div>
              <ul className="mt-2 space-y-1.5 text-meta">
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