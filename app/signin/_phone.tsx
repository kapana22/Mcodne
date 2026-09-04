'use client'
// /signin · /signup — REGISTRATION AND SIGN-IN BY PHONE (2026-09-04).
//
// Owner: „მე მინდა დავამატოთ მობილურით რეგისტრაცია."
//
// ⚠️ ONE COMPONENT FOR BOTH DOORS, BECAUSE IT IS ONE FLOW. „Register" and
// „sign in" cannot be separate screens here without the first one announcing
// whether a number already has an account — type nine digits, learn a fact
// about a stranger. So the number and the code are asked identically either
// way, and the third step (the name) simply does not appear for somebody who
// turns out to be a member. lib/phoneAuth carries the server half of the same
// argument.
//
// ⚠️ THE THREE STEPS ARE ONE CARD, NOT THREE ROUTES. On a phone the whole point
// of this door is that it is shorter than the form beside it; a navigation
// between each field would give back everything it saves, and a back button
// would land on a step whose code has already been spent.

import React, { useState, useRef, useEffect } from 'react'
import { Icon } from '@/components/Icon'
import { CodeInput, Field, inputCls } from './_fields'
import { redirectAfterSignin } from './_model'

type Step = 'phone' | 'code' | 'name'

/** How long before „ხელახლა გაგზავნა" wakes up. Matches nothing on the server
 *  — the server's limit is 5 per 15 minutes — it just stops the reflex double
 *  tap that spends one of those five on a message already in flight. */
const RESEND_AFTER_SEC = 45

/* ⚠️ EVERY MESSAGE THE SERVER CAN SEND, TRANSLATED IN ONE PLACE. A `switch`
   scattered through three handlers is how one of these ends up as a raw
   „SMS_FAILED" on a Georgian screen. */
function say(error: string | undefined, retryInSec?: number): string {
  switch (error) {
    case 'NOT_GEORGIAN_MOBILE':
      return 'შეიყვანე ქართული მობილურის ნომერი'
    case 'RATE_LIMITED':
      return `ბევრი მცდელობა — სცადე ${Math.ceil((retryInSec ?? 60) / 60)} წუთში`
    case 'SMS_FAILED':
      return 'SMS ვერ გაიგზავნა. სცადე თავიდან ან შედი ელფოსტით'
    case 'BAD_CODE':
      return 'კოდი არასწორია ან ვადა გაუვიდა'
    case 'SUSPENDED':
      return 'ანგარიში დაბლოკილია'
    /* ⚠️ TWO ACCOUNTS SHARE THIS NUMBER AND NEITHER PROVED IT. Two such pairs
       exist in production (measured 2026-09-04) — numbers typed into a profile
       field back when a phone was contact information. The screen does not
       pretend it is the person's fault and it names the door that does work. */
    case 'PHONE_AMBIGUOUS':
      return 'ამ ნომერზე ერთზე მეტი ანგარიშია. შედი ელფოსტით ან მოგვწერე.'
    case 'PHONE_TAKEN':
      return 'ეს ნომერი უკვე დარეგისტრირდა — დაიწყე თავიდან'
    case 'TICKET_EXPIRED':
      return 'დრო გავიდა — მოითხოვე ახალი კოდი'
    case 'INVALID_TEXT':
      return '' // the server's own sentence is shown instead
    default:
      return 'შეცდომა, სცადე თავიდან'
  }
}

/** „599 12 34 56" → „599123456". The `+995` is drawn beside the box, never
 *  typed into it, and a pasted full number is accepted rather than refused. */
function localDigits(raw: string): string {
  const d = raw.replace(/\D/g, '')
  return (d.startsWith('995') ? d.slice(3) : d).slice(0, 9)
}

export function PhoneAuth({ onCancel, dest }: {
  onCancel: () => void
  /** Where this particular FORM wants the person to land — /join for the
   *  provider half of /signup. It is local state on that form and never
   *  reaches the URL, so a door that ignores it silently discards the role
   *  they chose; see the note on `redirectAfterSignin`. A live `?redirect=`
   *  still wins over it. */
  dest?: string
}) {
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [ticket, setTicket] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [left, setLeft] = useState(0)
  const codeBox = useRef<HTMLDivElement | null>(null)

  // The resend countdown. One interval, cleared on unmount — a timer left
  // running after the card is swapped away keeps calling setState on a dead
  // component for as long as the tab is open.
  useEffect(() => {
    if (left <= 0) return
    const t = setInterval(() => setLeft(s => (s <= 1 ? 0 : s - 1)), 1000)
    return () => clearInterval(t)
  }, [left])

  // Focus the first code box when it appears. Without this the person has just
  // been told to type a code and the caret is still in the number above it.
  useEffect(() => {
    if (step === 'code') codeBox.current?.querySelector('input')?.focus()
  }, [step])

  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { res, data: await res.json().catch(() => ({})) as Record<string, unknown> }
  }

  const sendCode = async () => {
    if (phone.length !== 9) { setMsg('ნომერი 9 ციფრისგან შედგება'); return }
    setBusy(true); setMsg(null)
    try {
      const { res, data } = await post('/api/auth/phone/start', { phone: `+995${phone}` })
      if (!res.ok) { setMsg(say(data.error as string, data.retryInSec as number)); setBusy(false); return }
      setCode('')
      setStep('code')
      setLeft(RESEND_AFTER_SEC)
    } catch { setMsg('ქსელის შეცდომა') }
    setBusy(false)
  }

  const submitCode = async (value: string) => {
    setBusy(true); setMsg(null)
    try {
      const { res, data } = await post('/api/auth/phone/verify', { phone: `+995${phone}`, code: value })
      if (!res.ok) {
        setMsg(say(data.error as string, data.retryInSec as number))
        setCode('')
        setBusy(false)
        return
      }
      if (data.needsName) { setTicket(String(data.ticket)); setStep('name'); setBusy(false); return }
      // A member — straight to their own room. `redirectAfterSignin` honours an
      // in-flight ?redirect= first, exactly as the password path does.
      redirectAfterSignin(String(data.role), data.home as string, dest)
    } catch { setMsg('ქსელის შეცდომა'); setBusy(false) }
  }

  // ⚠️ SUBMITTED BY THE SIXTH DIGIT, NOT BY A BUTTON. The code is the only
  // thing on the screen and there is exactly one thing to do with it; asking
  // for a second tap on a phone, one-handed, with the SMS banner still covering
  // the top of the screen, is the tap that loses people.
  const onCode = (v: string) => {
    setCode(v)
    if (msg) setMsg(null)
    if (v.length === 6 && !busy) void submitCode(v)
  }

  const finish = async () => {
    setBusy(true); setMsg(null)
    try {
      const { res, data } = await post('/api/auth/phone/register', { fullName: name.trim(), ticket })
      if (!res.ok) {
        setMsg((data.message as string) || say(data.error as string, data.retryInSec as number))
        // The proof is spent or the number is gone — there is nothing to retry
        // on this step, so send them back to the number rather than leaving
        // them on a form whose submit can only fail.
        if (data.error === 'TICKET_EXPIRED' || data.error === 'PHONE_TAKEN') { setStep('phone'); setCode('') }
        setBusy(false)
        return
      }
      redirectAfterSignin(String(data.role), data.home as string, dest)
    } catch { setMsg('ქსელის შეცდომა'); setBusy(false) }
  }

  const alert = msg && (
    <div role="alert" className="rounded-field bg-danger-50 border border-danger-200 px-3 py-2.5 text-small text-danger-700 leading-[1.45] break-words">
      {msg}
    </div>
  )

  const btn = 'w-full h-12 rounded-btn bg-gradient-cta hover:brightness-105 disabled:bg-none disabled:bg-ink-100 disabled:text-ink-500 disabled:cursor-not-allowed text-white font-display font-semibold text-body-lg tracking-wide inline-flex items-center justify-center gap-2 transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2'
  const spinner = <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4 motion-safe:animate-spin" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" /></svg>

  /* ── the number ──────────────────────────────────────────────────────── */
  if (step === 'phone') return (
    <div className="space-y-4">
      <Field label="ტელეფონის ნომერი">
        <div className="flex items-stretch gap-2">
          {/* The country code is a fact, not a field: there is one carrier
              region this can reach (sender.ge dials Georgian mobiles only), so
              it is shown and cannot be got wrong. */}
          <span className="inline-flex h-12 shrink-0 items-center rounded-field border border-ink-200 bg-ink-50 px-3 font-display text-body-lg text-ink-600 tabular-nums">+995</span>
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={phone}
            onChange={e => { setPhone(localDigits(e.target.value)); if (msg) setMsg(null) }}
            onKeyDown={e => { if (e.key === 'Enter' && phone.length === 9 && !busy) { e.preventDefault(); void sendCode() } }}
            placeholder="599 12 34 56"
            aria-label="ტელეფონის ნომერი"
            className={`${inputCls} tabular-nums`}
          />
        </div>
      </Field>
      {alert}
      <button type="button" onClick={sendCode} disabled={busy || phone.length !== 9} className={btn}>
        {busy ? <>{spinner}იგზავნება…</> : <>კოდის მიღება</>}
      </button>
      <p className="text-meta text-ink-500 text-center">
        {phone.length !== 9 ? 'შეიყვანე 9 ციფრი' : 'გამოგიგზავნით ერთჯერად კოდს'}
      </p>
      <button type="button" onClick={onCancel} className="tap-area w-full text-center text-small text-ink-600 hover:text-ink-900">
        სხვა გზით შესვლა
      </button>
    </div>
  )

  /* ── the code ────────────────────────────────────────────────────────── */
  if (step === 'code') return (
    <div className="space-y-4">
      <div>
        <div className="font-display text-body font-semibold text-ink-900">კოდი გამოგზავნილია</div>
        <p className="text-small text-ink-500 mt-0.5 tabular-nums">+995 {phone.slice(0, 3)} {phone.slice(3, 6)} {phone.slice(6)}</p>
      </div>
      <div ref={codeBox}>
        <CodeInput value={code} onChange={onCode} />
      </div>
      {alert}
      {busy && <p className="text-meta text-ink-500 inline-flex items-center gap-2">{spinner}ვამოწმებთ…</p>}
      <div className="flex items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={() => { setStep('phone'); setCode(''); setMsg(null) }}
          className="tap-area text-small text-ink-600 hover:text-ink-900"
        >
          სხვა ნომერი
        </button>
        <button
          type="button"
          onClick={sendCode}
          disabled={busy || left > 0}
          className="tap-area text-small font-medium text-brand-700 hover:text-brand-800 disabled:text-ink-400 tabular-nums"
        >
          {left > 0 ? `ხელახლა ${left} წმ-ში` : 'ხელახლა გაგზავნა'}
        </button>
      </div>
    </div>
  )

  /* ── the name — new accounts only ────────────────────────────────────── */
  return (
    <div className="space-y-4">
      <div>
        <div className="font-display text-body font-semibold text-ink-900">ნომერი დადასტურდა</div>
        {/* ⚠️ THE ONE REMAINING QUESTION, AND IT SAYS WHY IT IS ASKED. This is
            the step where somebody learns they are registering rather than
            signing in, and a bare „სახელი" box after a code would read as a
            form that will not end. */}
        <p className="text-small text-ink-500 mt-0.5">დარჩა სახელი — ექსპერტი ამ სახელს დაინახავს.</p>
      </div>
      <Field label="სახელი და გვარი">
        <input
          type="text"
          value={name}
          onChange={e => { setName(e.target.value); if (msg) setMsg(null) }}
          onKeyDown={e => { if (e.key === 'Enter' && name.trim().length >= 2 && !busy) { e.preventDefault(); void finish() } }}
          placeholder="ანა ბერიძე"
          autoComplete="name"
          autoFocus
          className={inputCls}
        />
      </Field>
      {alert}
      <button type="button" onClick={finish} disabled={busy || name.trim().length < 2} className={btn}>
        {busy ? <>{spinner}ვქმნით…</> : <>დასრულება <Icon.arrow aria-hidden className="w-4 h-4" /></>}
      </button>
    </div>
  )
}
