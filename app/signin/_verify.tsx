'use client'
// /signin — the email verification view (one-time code).

import { useState, useEffect } from 'react'
import { homeForRole, safeInternalPath } from '@/lib/roleHome'
import { Icon } from '@/components/Icon'
import { Container } from '@/components/Container'
import { Eyebrow } from '@/components/Eyebrow'
import { Illustration } from '@/components/Illustration'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'
import { CodeInput } from './_fields'
import { View } from './_model'

/* ═══════════════════════════════════════════════════════════════════ */
/* VERIFY EMAIL VIEW                                                    */
/* ═══════════════════════════════════════════════════════════════════ */

export const VerifyView = ({ setView }: { setView: (v: View) => void }) => {
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
        <span className="font-display text-micro font-semibold uppercase text-ink-500">ანგარიშის დადასტურება</span>
      </div>

      {verified ? (
        <div className="text-center">
          {/* The illustration REPLACES the green check disc — a solid plate
              behind a transparent drawing is exactly the „separate background"
              the illustration rules forbid, and the eyebrow („დადასტურდი") plus
              a check plus a headline was three ways of saying the same thing. */}
          <div className="flex justify-center mb-4 motion-safe:animate-scale-in">
            <Illustration name="registration" alt="" />
          </div>
          <h1 className="font-display text-display lg:text-display-lg font-bold text-ink-900 tracking-tight leading-[1.1]">
            ანგარიში მზადაა
          </h1>
          <p className="mt-4 text-body text-ink-600 leading-[1.6]">ახლა შეგიძლია აღწერო რა გჭირდება და შეთავაზებები მიიღო.</p>
          <button type="button" onClick={() => setView('onboarding')} className="mt-7 h-12 px-6 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body-lg inline-flex items-center gap-2 transition-colors duration-fast">
            გავაგრძელოთ
          </button>
        </div>
      ) : (
        <>
          <div className="w-16 h-16 rounded-full bg-brand-50 text-brand-700 inline-flex items-center justify-center mb-6">
            <Icon.mail className="w-7 h-7" />
          </div>
          <Eyebrow className="mb-2">ელფოსტის დადასტურება</Eyebrow>
          <h1 className="font-display text-display lg:text-display-lg font-bold text-ink-900 tracking-tight leading-[1.1]">
            6-ციფრიანი კოდი —<br />
            <span className="text-ink-500 break-all">{email || 'შენს ელფოსტაზე'}</span>
          </h1>
          <p className="mt-4 text-body text-ink-600 leading-[1.6] max-w-[400px]">
            შეამოწმე ელფოსტა და spam. გამგზავნი — <span className="font-display font-semibold text-ink-700">noreply@mcodne.ge</span>
          </p>

          <div className="mt-8 flex items-center justify-center">
            <CodeInput value={code} onChange={setCode} />
          </div>

          {verifying && (
            <div className="mt-5 inline-flex items-center justify-center w-full gap-2 font-display text-small font-semibold text-brand-700">
              <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4 motion-safe:animate-spin" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" /></svg>
              ვამოწმებთ კოდს…
            </div>
          )}

          {errMsg && (
            <div role="alert" className="mt-4 rounded-btn border border-danger-200 bg-danger-50 text-danger-800 px-3 py-2 text-small font-medium">
              {errMsg}
            </div>
          )}

          <div className="mt-8 pt-7 border-t border-ink-100 flex flex-wrap items-center gap-3 text-small">
            <span className="text-ink-600">არ მოვიდა?</span>
            <button type="button" onClick={resend} disabled={resendIn > 0 || !email} className="font-display font-semibold text-brand-700 hover:text-brand-800 disabled:text-ink-500 inline-flex items-center gap-1.5 transition-colors duration-fast">
              <Icon.refresh className="w-3.5 h-3.5" />
              {resendIn > 0 ? `ხელახლა გაგზავნა · ${resendIn}წმ` : 'ხელახლა გაგზავნა'}
            </button>
            <span className="text-ink-300">·</span>
            <button type="button" onClick={() => setView('signup')} className="font-display font-semibold text-ink-700 hover:text-ink-900">სხვა ელფოსტა</button>
          </div>
          <div className="mt-6 rounded-field bg-ink-50 border border-ink-200 px-3 py-2.5 text-meta text-ink-600 leading-[1.5]">
            შეამოწმე Spam / Promotions. თუ არა — მოგვწერე <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-brand-700 hover:text-brand-800 underline underline-offset-2">{SUPPORT_EMAIL}</a>-ზე.
          </div>
        </>
      )}
    </Container>
  )
}