'use client'
// The offer form: a price, a number of days, and a sentence.
//
// Validated with `RequestOfferInput` from lib/requests — the SAME zod object
// POST /api/provider/offers parses the body with, so a message that is long
// enough here is long enough there.
//
// ⚠️ IT CAN FAIL FOR A REASON THAT IS NOBODY'S MISTAKE. The place is claimed
// server-side (`offerCount < offerLimit`, atomically), so a provider who was
// looking at „1 ადგილი" when somebody else submitted gets NOT_OPEN. That is a
// correct outcome and the copy says so plainly — the alternative was letting
// four offers land on a request promised three.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Btn } from '@/components/Btn'
import { Card } from '@/components/Card'
import { RequestOfferInput, offerTemplateFor, kindOf } from '@/lib/requests'

type Status = 'idle' | 'sending' | 'error'

const INPUT =
  'w-full h-11 px-3.5 rounded-field border border-ink-200 bg-white text-body text-ink-900 ' +
  'placeholder-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none ' +
  'transition-colors duration-fast'

/** Server codes → Georgian. Never surface a raw code to a reader. */
function errText(code?: string): string {
  switch (code) {
    // The claim lost. One code for „full", „no longer verified" and „gone",
    // because telling a provider WHICH would be a way to enumerate requests
    // they are not allowed to see.
    case 'NOT_OPEN': return 'ადგილი აღარ არის — მოთხოვნა დაიხურა.';
    case 'ALREADY_OFFERED': return 'ამ მოთხოვნაზე უკვე გაქვს შეთავაზება.'
    case 'INVALID': return 'შეავსე ველები სწორად.'
    default: return 'ვერ გაიგზავნა — სცადე თავიდან.'
  }
}

const Label = ({ children, optional }: { children: React.ReactNode; optional?: boolean }) => (
  <span className="block text-small font-display font-semibold text-ink-800 mb-1.5">
    {children}
    {optional && <span className="ml-1 font-normal text-ink-400">არასავალდებულო</span>}
  </span>
)

export function OfferForm({ requestId, kind, budgetMin, budgetMax, unitLabel }: {
  requestId: string
  kind: string
  budgetMin: number
  budgetMax: number | null
  unitLabel: string
}) {
  const router = useRouter()
  const [price, setPrice] = useState('')
  const [days, setDays] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorText, setErrorText] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (status === 'sending') return

    // Number(''), Number('abc') → NaN and 0 respectively, and both would reach
    // the server as a body zod then rejects with a generic INVALID. Parsed here
    // so the person is told before a round-trip.
    const body = {
      requestId,
      priceGel: Number(price),
      daysEstimate: days.trim() === '' ? null : Number(days),
      message,
    }
    const parsed = RequestOfferInput.safeParse(body)
    if (!parsed.success) {
      setStatus('error'); setErrorText(errText('INVALID')); return
    }

    setStatus('sending')
    setErrorText(null)
    try {
      const res = await fetch('/api/provider/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) { setStatus('error'); setErrorText(errText(j?.error)); return }
      // Re-render from the server: the page then shows „უკვე გაქვს გაგზავნილი"
      // instead of an empty form, and the place count is the real one.
      router.refresh()
    } catch {
      setStatus('error'); setErrorText(errText())
    }
  }

  return (
    <Card as="form" onSubmit={submit} noValidate>
      <h2 className="font-display text-h3 font-bold text-ink-900 tracking-tight">შეთავაზება</h2>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="block">
          <Label>ფასი, ₾ <span className="font-normal text-ink-400">{unitLabel}</span></Label>
          <input
            type="number" required min={1} max={1000000} step={1} inputMode="numeric"
            value={price} onChange={e => setPrice(e.target.value)}
            className={INPUT} placeholder={String(budgetMin || 100)}
          />
        </label>
        <label className="block">
          <Label optional>დღე</Label>
          <input
            type="number" min={1} max={365} step={1} inputMode="numeric"
            value={days} onChange={e => setDays(e.target.value)}
            className={INPUT} placeholder="10"
          />
        </label>
      </div>

      <label className="block mt-4">
        <Label>ტექსტი</Label>
        <textarea
          rows={6} required maxLength={4000}
          value={message} onChange={e => setMessage(e.target.value)}
          className="w-full px-3.5 py-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 placeholder-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none resize-y transition-colors duration-fast"
          placeholder="რას გააკეთებ და როგორ"
        />
        <span className="mt-1 flex items-baseline justify-between gap-3">
          <span className="text-meta text-ink-500 tabular-nums">{message.trim().length} / 20</span>
          {/* The same insert-on-tap scaffold the client's description field
              carries, for the same reason: the empty box is where replies get
              slow and vague, and the winning reply's structure is known —
              greeting, proof you read it, what exactly you will do. Offered
              only while empty; inserting must never destroy typed text. */}
          {message === '' && (
            <button
              type="button"
              onClick={() => setMessage(offerTemplateFor(kindOf(kind)))}
              className="text-meta font-display font-semibold text-brand-700 underline underline-offset-2 shrink-0"
            >
              შაბლონით დაწყება
            </button>
          )}
        </span>
      </label>

      {/* ── The budget-fit line — answered WHILE typing ─────────────────
          The client named a band and the provider is quoting against it; the
          comparison is arithmetic the provider would otherwise do in their
          head, wrongly or late. Above-band is a WARNING (gold — a genuine
          caution: the research says out-of-budget quotes mostly lose), never a
          block: an expert who is worth more than the band should still be able
          to say so, with the price making the argument. Below-band is a plain
          fact, not praise — cheap is a strategy, not a virtue. */}
      {(() => {
        const n = Number(price)
        if (!price.trim() || !Number.isFinite(n) || n <= 0) return null
        const fit = budgetMax === null
          ? (n >= budgetMin ? 'in' : 'below')
          : n > budgetMax ? 'above' : n >= budgetMin ? 'in' : 'below'
        return (
          <p className={`mt-3 text-small ${
            fit === 'in' ? 'text-brand-700 font-semibold'
            : fit === 'above' ? 'text-warning-700 font-semibold' : 'text-ink-600'
          }`}>
            {fit === 'in' && 'კლიენტის ბიუჯეტშია ✓'}
            {fit === 'above' && `კლიენტის ბიუჯეტს აღემატება${budgetMax !== null ? ` (მაქს. ${budgetMax}₾)` : ''}`}
            {fit === 'below' && 'კლიენტის ბიუჯეტზე დაბალია'}
          </p>
        )
      })()}

      {status === 'error' && errorText && (
        <div role="alert" className="mt-4 rounded-field border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-body text-danger-700">
          {errorText}
        </div>
      )}

      <div className="mt-5">
        <Btn type="submit" disabled={status === 'sending'} aria-busy={status === 'sending'}>
          {status === 'sending' ? 'იგზავნება…' : 'გაგზავნა'}
        </Btn>
      </div>
    </Card>
  )
}
