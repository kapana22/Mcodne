'use client'
// The offers on a client's request, and the one button that matters.
//
// A client component only because accepting is a mutation — the page itself is
// server-rendered and hands this the ALREADY SHAPED offers. It receives no row
// and does no query, so there is nothing here that could widen what a client
// sees; `providerPhone` and `providerEmail` arrive null unless that offer is
// the accepted one, decided by clientOfferView in lib/requests.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Btn } from '@/components/Btn'
import { Card } from '@/components/Card'
import { RequestChat } from '@/components/RequestChat'
import { gel, offerPriceLabel, OFFER_STATUS_LABEL, type OfferStatusName } from '@/lib/requests'

type Offer = {
  id: string
  priceGel: number
  priceKind: string
  daysEstimate: number | null
  message: string
  status: string
  providerName: string
  providerProfileHref: string | null
  providerVerified: boolean
  providerRating: number | null
  providerReviews: number
  providerPhone: string | null
  providerEmail: string | null
  unread: number
}

/** Server codes → Georgian. Never surface a raw code to a reader. */
function errText(code?: string): string {
  switch (code) {
    // The conditional-claim answer: somebody already decided this request, in
    // another tab or on another device. Said as a fact rather than as an error,
    // because nothing went wrong — the page is simply out of date.
    case 'ALREADY_DECIDED': return 'ეს მოთხოვნა უკვე დახურულია — გვერდი განაახლე.'
    default: return 'ვერ შესრულდა — სცადე თავიდან.'
  }
}

export function OfferList({ publicRef, offers, matched }: {
  publicRef: string
  offers: Offer[]
  matched: boolean
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const accept = async (id: string) => {
    if (busyId) return
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/requests/${publicRef}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerId: id }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) { setError(errText(j?.error)); return }
      // Re-render from the server rather than patching state: the accept
      // declines every other offer too, and the contact details appear. Both
      // are decided server-side, so reading them back is the only way this
      // screen and the database agree.
      router.refresh()
    } catch {
      setError(errText())
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mt-4 space-y-3">
      {error && (
        <div role="alert" className="rounded-field border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-body text-danger-700">
          {error}
        </div>
      )}

      {offers.map(o => {
        const accepted = o.status === 'ACCEPTED'
        return (
          <Card key={o.id} className={accepted ? 'border-brand-300' : undefined}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              {/* The name IS the door to the public profile — the client's
                  decision runs on reviews and verification, not the name alone,
                  and hiding a public page from the one screen where the choice
                  happens degrades the choice. New tab: reading a profile must
                  not lose this page. */}
              {o.providerProfileHref ? (
                <a
                  href={o.providerProfileHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-display text-h3 font-bold text-ink-900 underline decoration-ink-200 underline-offset-4 hover:decoration-brand-500 transition-colors duration-fast"
                >
                  {o.providerName}
                </a>
              ) : (
                <span className="font-display text-h3 font-bold text-ink-900">{o.providerName}</span>
              )}
              {/* Read through the ONE function that knows what the number means —
                  „80₾-დან" and „ვიზიტი 20₾ · სამუშაო ადგილზე" are the same
                  column with a different kind beside it. */}
              <span className="font-display text-h2 font-bold text-ink-900 tabular-nums">{offerPriceLabel(o.priceGel, o.priceKind)}</span>
            </div>
            <p className="mt-0.5 text-meta text-ink-500">
              {/* Verified = the green check the whole site uses; rating shown
                  only when reviews exist — a number from nothing is noise. */}
              {o.providerVerified && <span className="text-brand-700 font-semibold">✓ გადამოწმებული · </span>}
              {o.providerRating !== null && (
                <span className="text-ink-700 tabular-nums">★ {o.providerRating.toFixed(1)} ({o.providerReviews}) · </span>
              )}
              {o.daysEstimate ? `${o.daysEstimate} დღე` : 'ვადა შეთანხმებით'}
              {o.status !== 'SENT' && ` · ${OFFER_STATUS_LABEL[o.status as OfferStatusName]}`}
            </p>

            <p className="mt-3 text-body text-ink-800 whitespace-pre-wrap leading-relaxed">{o.message}</p>

            {/* ⚠️ THE CONTACT. Present on exactly one offer, and only after the
                client chose it. This is the product — see lib/requests. */}
            {accepted && (o.providerPhone || o.providerEmail) && (
              <div className="mt-4 pt-4 border-t border-ink-100">
                {o.providerPhone && (
                  <p className="text-body text-ink-900">
                    <span className="text-ink-500">ტელეფონის ნომერი: </span>
                    <a href={`tel:${o.providerPhone}`} className="font-semibold underline underline-offset-2">{o.providerPhone}</a>
                  </p>
                )}
                {o.providerEmail && (
                  <p className="mt-1 text-body text-ink-900">
                    <span className="text-ink-500">ელფოსტა: </span>
                    <a href={`mailto:${o.providerEmail}`} className="font-semibold underline underline-offset-2">{o.providerEmail}</a>
                  </p>
                )}
              </div>
            )}

            {/* ── Ask before choosing ──────────────────────────────────
                Open from the moment the offer exists, which is the whole point:
                without it the client picks blind from a price and a paragraph,
                or hands out their number early to ask one question. The seal is
                unchanged — phone and email still wait for the choice, and the
                endpoint masks anything shaped like a contact until then. */}
            {(o.status === 'SENT' || o.status === 'ACCEPTED') && (
              <RequestChat
                thread={{ kind: 'OFFER', offerId: o.id, refCode: publicRef }}
                unread={o.unread}
                peerName={o.providerName}
              />
            )}

            {/* The button exists only while there is a choice to make. Once the
                request is matched, every other offer is DECLINED and showing a
                dead „ავირჩევ" beside it would be offering something that cannot
                happen. */}
            {!matched && o.status === 'SENT' && (
              <div className="mt-4">
                <Btn
                  onClick={() => accept(o.id)}
                  disabled={busyId !== null}
                  aria-busy={busyId === o.id}
                >
                  {busyId === o.id ? 'ინახება…' : 'ავირჩევ'}
                </Btn>
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
