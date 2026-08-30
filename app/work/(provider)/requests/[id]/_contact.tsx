'use client'
// THE ACT THE BALANCE EXISTS FOR: opening one client's contact.
//
// ⚠️ IT SITS BEFORE THE OFFER FORM AND NOT AFTER IT (owner, 2026-08-21). The
// provider reads the job — free — decides it is worth a call, pays 1₾, and may
// then phone, or bid, or do nothing. The order on the screen is the order of
// the decision, and putting the price after the form would describe a different
// product: one where you must answer before you may call.
//
// ⚠️ THE PRICE IS ON THE BUTTON, BEFORE THE CLICK. lib/credits owns every
// string here — a hard-coded „1₾" in this file is how a re-price and a copy
// change stop agreeing, and the owner has said the number is „ჯერ", i.e. it
// will move.
//
// ⚠️ AND IT MAY NEVER READ AS CASH. „ბალანსი", never „ანაზღაურება" or „შენი
// ფული" — the wording rules at the top of lib/credits, pinned by tests/credits.
//
// The contact itself is rendered by the SERVER when it has already been paid
// for (page.tsx fetches the columns inside an `if`); this component holds it
// only for the moment between the successful POST and the refresh, so a
// provider who just paid does not stare at an unchanged screen.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Btn } from '@/components/Btn'
import { Card } from '@/components/Card'
import {
  CONTACT_BUTTON_LABEL, CONTACT_COST_NOTE, CONTACT_REFUND_NOTE, NO_BALANCE_NOTE, contactLimitNote,
} from '@/lib/credits'
import type { ClientContact } from '@/lib/requests'

type Status = 'idle' | 'sending' | 'error'

/** Server codes → Georgian. Never surface a raw code to a reader. */
function errText(code: string | undefined, offerLimit: number): string {
  switch (code) {
    // Two different problems with two different answers: one is fixed by a
    // balance, the other can never be fixed at all — so they must not share a
    // sentence. „ბალანსი არ არის საკმარისი" shown to the fourth caller is a lie
    // they would try to top up to fix.
    case 'NO_BALANCE': return NO_BALANCE_NOTE
    case 'CONTACT_LIMIT': return contactLimitNote(offerLimit)
    case 'COMPANY_UNSUPPORTED': return 'კომპანიის ანგარიშით კონტაქტის გახსნა ჯერ არ მუშაობს.'
    case 'NOT_FOUND': return 'ეს მოთხოვნა აღარ არის ხელმისაწვდომი.'
    default: return 'ვერ გაიხსნა — სცადე თავიდან.'
  }
}

export function ContactCard({ requestId, offerLimit, taken, initial }: {
  requestId: string
  /** The request's own ceiling on how many providers may reach this client — 3
   *  on an ordinary request, 1 on one addressed to a named expert. */
  offerLimit: number
  /** How many have already opened it. Display only; the real guard is inside
   *  the INSERT (lib/creditsServer → chargeForContact), because a count read
   *  before a write loses to a second tab. */
  taken: number
  /** Set by the server when this provider has ALREADY paid — then this
   *  component never charges anything and is just the readout. */
  initial: ClientContact | null
}) {
  const router = useRouter()
  const [contact, setContact] = useState<ClientContact | null>(initial)
  const [status, setStatus] = useState<Status>('idle')
  const [errorText, setErrorText] = useState<string | null>(null)

  const open = async () => {
    if (status === 'sending') return
    setStatus('sending')
    setErrorText(null)
    try {
      const res = await fetch(`/api/provider/requests/${requestId}/contact`, { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) {
        setStatus('error')
        setErrorText(errText(j?.error, j?.offerLimit ?? offerLimit))
        return
      }
      setContact(j.contact as ClientContact)
      setStatus('idle')
      // Re-render from the server so the balance in the top bar and the „N
      // ადგილიდან" line are the real ones — this component knows what it just
      // bought and nothing else on the page does.
      router.refresh()
    } catch {
      setStatus('error')
      setErrorText(errText(undefined, offerLimit))
    }
  }

  if (contact) {
    return (
      <Card className="border-brand-300">
        <h2 className="font-display text-h3 font-bold text-ink-900 tracking-tight">კლიენტის კონტაქტი</h2>
        <dl className="mt-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <dt className="text-meta text-ink-500 w-20 shrink-0">სახელი</dt>
            <dd className="text-body text-ink-900">{contact.name}</dd>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <dt className="text-meta text-ink-500 w-20 shrink-0">ტელეფონი</dt>
            {/* A number on a phone screen that cannot be tapped is a number
                somebody copies by hand and mistypes. `tel:` is the whole
                reason this page is worth opening on a phone. */}
            <dd className="text-body text-ink-900 tabular-nums">
              <a href={`tel:${contact.phone}`} className="font-display font-semibold text-brand-700 underline underline-offset-2">
                {contact.phone}
              </a>
            </dd>
          </div>
          {contact.email && (
            <div className="flex flex-wrap items-baseline gap-x-3">
              <dt className="text-meta text-ink-500 w-20 shrink-0">ელფოსტა</dt>
              <dd className="text-body text-ink-900 break-all">{contact.email}</dd>
            </div>
          )}
        </dl>
      </Card>
    )
  }

  const left = Math.max(0, offerLimit - taken)
  return (
    <Card>
      <h2 className="font-display text-h3 font-bold text-ink-900 tracking-tight">კლიენტის კონტაქტი</h2>
      {/* The facts and nothing else: what it costs, that it is paid once, and
          what happens if the lead turns out to be dead. No benefit, no
          reassurance — the provider is deciding whether this job is worth a
          phone call and the copy must inform that, never argue with it.
          The refund line is a TERM OF THE SALE, not comfort: it is the
          difference between „1₾" and „1₾ unless nobody answers", and a
          provider who reads it after paying was sold the wrong thing. */}
      <p className="mt-2 text-body text-ink-600 leading-snug">{CONTACT_COST_NOTE}</p>
      <p className="mt-1 text-body text-ink-500 leading-snug">{CONTACT_REFUND_NOTE}</p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Btn onClick={open} disabled={status === 'sending' || left === 0} aria-busy={status === 'sending'}>
          {status === 'sending' ? 'იხსნება…' : CONTACT_BUTTON_LABEL}
        </Btn>
        {/* ⚠️ THE SAME „N ადგილი" GRAMMAR THE REQUEST HEADER ALREADY USES, and
            deliberately a SECOND budget: this counts who may CALL, the header
            counts who may BID. lib/credits → CONTACT_LIMIT_REASON says why they
            are not one number. */}
        <span className="text-meta text-ink-500 tabular-nums">
          {left > 0 ? `${left} ადგილი ${offerLimit}-დან` : contactLimitNote(offerLimit)}
        </span>
      </div>

      {status === 'error' && errorText && (
        <div role="alert" className="mt-4 rounded-field border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-body text-danger-700">
          {errorText}
        </div>
      )}
    </Card>
  )
}
