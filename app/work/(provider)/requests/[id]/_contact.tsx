'use client'
// THE ACT THE BALANCE EXISTS FOR: opening one client's contact.
//
// ⚠️ IT SITS AFTER THE CLIENT HAS CHOSEN, NOT BEFORE (2026-09-01, the owner's
// design canvas → „Expert Jobs" screen 4), REVERSING THE 2026-08-21 ORDER. The
// provider reads the job free, answers free, and pays only once somebody has
// picked them. The endpoint enforces exactly that — it requires an ACCEPTED
// offer belonging to the caller — and this card is only rendered in that state.
//
// ⚠️ THE NAME IS ALREADY OPEN HERE AND THE NUMBER IS NOT, which is why the
// canvas draws a named person with two grey bars under them. That is not a
// teaser: `clientIdentityOpen` (lib/requests) has released the NAME on
// acceptance since 2026-08-21, and the phone and email are what this button
// buys. Drawing the masked rows is the honest picture of what is and is not
// held — a card that hid the name too would be pretending to sell something it
// had already given away.
//
// ⚠️ THE PRICE IS ON THE CARD, BEFORE THE CLICK. lib/credits owns every string
// here — a hard-coded „3₾" in this file is how a re-price and a copy change
// stop agreeing, and the owner has said the number will move.
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
import { Icon } from '@/components/Icon'
import {
  CONTACT_BUTTON_LABEL, contactChargeNote, contactRefundNote,
  noBalanceNote, contactLimitNote,
} from '@/lib/credits'
import type { ClientContact } from '@/lib/requests'

type Status = 'idle' | 'sending' | 'error'

/** Server codes → Georgian. Never surface a raw code to a reader. */
function errText(code: string | undefined, offerLimit: number, feeTetri: number): string {
  switch (code) {
    // Two different problems with two different answers: one is fixed by a
    // balance, the other can never be fixed at all — so they must not share a
    // sentence. „ბალანსი არ არის საკმარისი" shown to somebody who is not the
    // chosen provider is a lie they would top up to fix.
    case 'NO_BALANCE': return noBalanceNote(feeTetri)
    case 'CONTACT_LIMIT': return contactLimitNote(offerLimit)
    case 'COMPANY_UNSUPPORTED': return 'კომპანიის ანგარიშით კონტაქტის გახსნა ჯერ არ მუშაობს.'
    case 'NOT_FOUND': return 'ეს მოთხოვნა აღარ არის ხელმისაწვდომი.'
    default: return 'ვერ გაიხსნა — სცადე თავიდან.'
  }
}

export function ContactCard({ requestId, offerLimit, clientName, priceLabel, feeTetri, initial }: {
  requestId: string
  /** The request's own ceiling, for the refusal copy. With the unlock gated on
   *  acceptance only one provider can ever reach it, so this no longer binds —
   *  it is kept because the ENDPOINT still claims against it and a screen that
   *  cannot word its own server's refusal is a screen that prints a raw code. */
  offerLimit: number
  /** Open since acceptance — see the head of this file. */
  clientName: string
  /** „90₾" / „90₾/სთ" — this provider's own accepted offer, through
   *  `offerPriceLabel` so the card and the client's list read the same. */
  priceLabel: string
  /** ⚠️ WHAT THIS CONTACT COSTS ON THIS JOB (2026-09-03) — 1–10₾ by the
   *  client's budget, `lib/credits → contactCostTetri`, resolved on the server
   *  from the row the page already holds. Three sentences on this card name a
   *  figure and all three take it from here, so the fee the button spends and
   *  the fee the card promises cannot come apart. */
  feeTetri: number
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
        setErrorText(errText(j?.error, j?.offerLimit ?? offerLimit, feeTetri))
        return
      }
      setContact(j.contact as ClientContact)
      setStatus('idle')
      // Re-render from the server so the balance in the top bar is the real one
      // — this component knows what it just bought and nothing else on the page
      // does.
      router.refresh()
    } catch {
      setStatus('error')
      setErrorText(errText(undefined, offerLimit, feeTetri))
    }
  }

  /* THE HEAD OF THE CARD — the person, and what you offered them. Identical in
     both states, so paying does not redraw the thing you were looking at; only
     the panel underneath changes from bars to values. */
  const head = (
    <div className="flex flex-wrap items-center gap-4 px-6 py-5 sm:px-7">
      <span
        aria-hidden
        className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-ink-100 text-ink-500 shadow-[inset_0_0_0_1px_theme(colors.ink.200)]"
      >
        <Icon.user className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-body-lg font-bold text-ink-900">{clientName}</span>
        <span className="mt-0.5 block text-meta text-ink-600">კლიენტი</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-meta text-ink-500">შენი შეთავაზება</span>
        <span className="block font-display text-h3 font-bold text-ink-900 tabular-nums">{priceLabel}</span>
      </span>
    </div>
  )

  if (contact) {
    return (
      <div className="overflow-hidden rounded-card border border-brand-200 bg-white">
        {head}
        <dl className="flex flex-col gap-3 border-t border-ink-100 bg-ink-50 px-6 py-5 sm:px-7">
          <div className="flex items-center gap-3">
            <dt className="shrink-0 text-ink-500" title="ტელეფონი"><Icon.phone className="h-5 w-5" /><span className="sr-only">ტელეფონი</span></dt>
            {/* A number on a phone screen that cannot be tapped is a number
                somebody copies by hand and mistypes. `tel:` is the whole reason
                this page is worth opening on a phone. */}
            <dd className="min-w-0 text-body text-ink-900 tabular-nums">
              <a href={`tel:${contact.phone}`} className="font-display font-semibold text-brand-700 underline underline-offset-2">
                {contact.phone}
              </a>
            </dd>
          </div>
          {contact.email && (
            <div className="flex items-center gap-3">
              <dt className="shrink-0 text-ink-500" title="ელფოსტა"><Icon.mail className="h-5 w-5" /><span className="sr-only">ელფოსტა</span></dt>
              <dd className="min-w-0 break-all text-body text-ink-900">{contact.email}</dd>
            </div>
          )}
        </dl>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-card border border-brand-200 bg-white">
        {head}

        {/* ── What is still behind the button ────────────────────────────────
            ⚠️ BARS, NOT BLURRED REAL VALUES. A masked-but-present number is one
            CSS rule away from being readable, and this is the one thing on the
            site somebody pays for. Nothing here is fetched — the page does not
            select `phone` or `email` until the ledger says they are paid for
            (lib/requests → CLIENT_CONTACT_SELECT). The widths are fixed and
            meaningless on purpose: a bar as long as the real number would leak
            its length. */}
        <div className="flex flex-col gap-2.5 border-t border-ink-100 bg-ink-50 px-6 py-5 sm:px-7" aria-hidden>
          <div className="flex items-center gap-3">
            <span className="shrink-0 text-ink-400"><Icon.phone className="h-5 w-5" /></span>
            <span className="h-3.5 w-[150px] max-w-full rounded-pill bg-ink-200" />
          </div>
          <div className="flex items-center gap-3">
            <span className="shrink-0 text-ink-400"><Icon.mail className="h-5 w-5" /></span>
            <span className="h-3.5 w-[200px] max-w-full rounded-pill bg-ink-200" />
          </div>
        </div>
        <p className="sr-only">კლიენტის ტელეფონი და ელფოსტა ჯერ დახურულია.</p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-ink-100 px-6 py-4 sm:px-7">
          <span className="min-w-0 flex-1 text-small text-ink-600">{contactChargeNote(feeTetri)}</span>
          <Btn onClick={open} size="lg" disabled={status === 'sending'} aria-busy={status === 'sending'} className="shrink-0">
            {status === 'sending' ? 'იხსნება…' : CONTACT_BUTTON_LABEL}
          </Btn>
        </div>

        {status === 'error' && errorText && (
          <div role="alert" className="border-t border-danger-200 bg-danger-50 px-6 py-3 text-body text-danger-700 sm:px-7">
            {errorText}
          </div>
        )}
      </div>

      {/* ⚠️ A TERM OF THE SALE, NOT COMFORT, AND IT IS OUTSIDE THE CARD (the
          canvas). It is the difference between „3₾" and „3₾ unless they never
          pick up", and a provider who reads it after paying was sold the wrong
          thing. The window is `CONTACT_REFUND_HOURS` and the sweep that
          enforces it reads the same constant — see lib/requestJobs →
          sweepSilentContacts. */}
      <p className="px-1 text-meta leading-relaxed text-ink-500">{contactRefundNote(feeTetri)}</p>
    </div>
  )
}
