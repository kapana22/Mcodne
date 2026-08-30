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
import {
  RequestOfferInput, offerTemplateFor, kindOf,
  OFFER_PRICE_KINDS, OFFER_PRICE_KIND_LABEL, type OfferPriceKind,
} from '@/lib/requests'
import { OFFER_FREE_NOTE } from '@/lib/credits'

type Status = 'idle' | 'sending' | 'error'

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

export function OfferForm({ requestId, kind, budgetMin, budgetMax, unitLabel }: {
  requestId: string
  kind: string
  budgetMin: number
  budgetMax: number | null
  unitLabel: string
}) {
  const router = useRouter()
  const [price, setPrice] = useState('')
  /** ⚠️ WHAT THE NUMBER MEANS. A single integer made honest tradespeople either
   *  invent a figure or not bid at all — see lib/requests → OFFER_PRICE_KINDS. */
  const [priceKind, setPriceKind] = useState<OfferPriceKind>('FIXED')
  const [days, setDays] = useState('')
  const [daysOpen, setDaysOpen] = useState(false)
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
      priceKind,
      // ON_SITE with an empty box means „the visit is free", which is a real
      // offer and a selling point. Every other kind needs a number.
      priceGel: price.trim() === '' && priceKind === 'ON_SITE' ? 0 : Number(price),
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
      {/* ⚠️ NOT A FORM HEADING (2026-08-18). Owner, looking at this screen:
          „ეს რა არის — უბრალოდ ჩათი უნდა იხსნებოდეს." The request above is a
          message; the reply was a form with a title, four labels, a character
          counter and a submit button. Two languages for one exchange, which is
          the exact defect the request card was rebuilt to remove — I fixed the
          top of this page and left the bottom.
          The price row and the box below are one composer now. */}
      <span className="text-small text-ink-500">შენი პასუხი</span>

      {/* ── What kind of price is this ────────────────────────────────────
          Three chips rather than a select: the choice changes the field below
          it, and a control whose effect is visible has to be visible itself.
          „ადგილზე შევაფასებ" is the one that did not exist — and its absence is
          why a plumber either invented a number or walked away. */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {OFFER_PRICE_KINDS.map(k => (
          <button
            key={k}
            type="button"
            aria-pressed={priceKind === k}
            onClick={() => setPriceKind(k)}
            className={`h-9 px-3.5 rounded-pill border font-display text-small font-semibold transition-[background-color,border-color,transform] duration-fast motion-safe:active:scale-[0.97] ${
              priceKind === k
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-ink-200 text-ink-700 hover:border-ink-300 hover:bg-ink-50'
            }`}
          >
            {OFFER_PRICE_KIND_LABEL[k]}
          </button>
        ))}

        {/* ⚠️ THE AMOUNT SITS ON THE SAME LINE AS THE KIND, not under a label
            of its own. „ფასი, ₾ ერთ გამოძახებაზე" over a 30 was four words
            explaining a box that needs none once the chip beside it says what
            kind of price this is. */}
        <span className="inline-flex items-center gap-1.5">
          <input
            type="number" required={priceKind !== 'ON_SITE'} min={0} max={1000000} step={1} inputMode="numeric"
            value={price} onChange={e => setPrice(e.target.value)}
            aria-label={priceKind === 'ON_SITE' ? 'გამოძახების ფასი' : 'ფასი'}
            className="w-24 h-9 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 tabular-nums placeholder-ink-400 focus:border-brand-500 outline-none transition-colors duration-fast"
            placeholder={priceKind === 'ON_SITE' ? '0' : String(budgetMin || 100)}
          />
          <span className="text-small text-ink-600">
            ₾{priceKind !== 'ON_SITE' && ` ${unitLabel}`}
          </span>
        </span>
      </div>

      {/* Folded away: a deadline is a real answer and most replies do not carry
          one. A field nobody fills is a field everybody reads past. */}
      {daysOpen || days !== '' ? (
        <label className="mt-3 flex items-center gap-2">
          <span className="text-small text-ink-600">ვადა</span>
          <input
            type="number" min={1} max={365} step={1} inputMode="numeric"
            value={days} onChange={e => setDays(e.target.value)}
            className="w-20 h-9 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 tabular-nums placeholder-ink-400 focus:border-brand-500 outline-none transition-colors duration-fast"
            placeholder="10"
          />
          <span className="text-small text-ink-600">დღე</span>
        </label>
      ) : (
        <button
          type="button"
          onClick={() => setDaysOpen(true)}
          className="mt-3 text-small font-display font-semibold text-brand-700 underline underline-offset-2"
        >
          ვადის მითითება
        </button>
      )}

      {/* ⚠️ NO LABEL AND NO RUNNING COUNTER (2026-08-18). „ტექსტი" over a box
          you are already typing in is a word for the form's benefit, and a
          „0 / 20" ticking under it turns a sentence into a quota. The floor is
          still 20 — a price with no sentence beside it is a guess — but it is
          said ONCE, when it is actually short, and not counted at anybody. */}
      <label className="block mt-3">
        <textarea
          rows={4} required maxLength={4000}
          value={message} onChange={e => setMessage(e.target.value)}
          className="w-full px-3.5 py-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 placeholder-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none resize-y transition-colors duration-fast"
          placeholder="დაწერე, რას გააკეთებ და როდის მოხვალ"
        />
        <span className="mt-1 flex items-baseline justify-between gap-3">
          <span className="text-meta text-danger-700">
            {message.trim().length > 0 && message.trim().length < 20 ? 'ცოტა უფრო დაწერე' : ''}
          </span>
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
        // Nothing to compare on an on-site estimate: the number in the box is a
        // call-out fee, and holding it against the job's budget would tell the
        // provider their visit is „under budget", which means nothing.
        if (priceKind === 'ON_SITE') return null
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
          {status === 'sending' ? 'იგზავნება…' : 'პასუხის გაგზავნა'}
        </Btn>
        {/* ⚠️ SAYING THAT IT IS FREE IS NOT NOTHING (2026-08-21). This line
            said „შეთავაზების გაგზავნა — 5₾ ბალანსიდან" for one day, because
            sending an offer cost 5₾. The owner moved the price onto the
            client's CONTACT and made the answer free, and a provider who was
            told a price once will assume it still applies unless told
            otherwise — so the line stays and its content flips. The place a
            balance is spent is now the contact button above, not this one. */}
        <p className="mt-2 text-meta text-ink-500 leading-snug">{OFFER_FREE_NOTE}</p>
      </div>
    </Card>
  )
}
