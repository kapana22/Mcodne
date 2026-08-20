'use client'
// The offers on a client's request, and the one button that matters.
//
// A client component only because accepting is a mutation — the page itself is
// server-rendered and hands this the ALREADY SHAPED offers. It receives no row
// and does no query, so there is nothing here that could widen what a client
// sees; `providerPhone` and `providerEmail` arrive null unless that offer is
// the accepted one, decided by clientOfferView in lib/requests.

import { useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Btn } from '@/components/Btn'
import { Card } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { RequestChat } from '@/components/RequestChat'
import { gel, offerPriceLabel, OFFER_STATUS_LABEL, type OfferStatusName } from '@/lib/requests'
import { REVIEW_BODY_MAX } from '@/lib/offerLifecycle'

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
  /** After the choice (stage 7): QUOTE offers can be marked done and reviewed. */
  kind: string
  doneAt: string | null
  review: { rating: number; body: string } | null
}

/** Server codes → Georgian. Never surface a raw code to a reader. */
function errText(code?: string): string {
  switch (code) {
    // The conditional-claim answer: somebody already decided this request, in
    // another tab or on another device. Said as a fact rather than as an error,
    // because nothing went wrong — the page is simply out of date.
    case 'ALREADY_DECIDED': return 'ეს მოთხოვნა უკვე დახურულია — გვერდი განაახლე.'
    // The done/review claims: the page is out of date, not broken.
    case 'ALREADY_DONE':
    case 'ALREADY_REVIEWED': return 'უკვე შესრულებულია — გვერდი განაახლე.'
    default: return 'ვერ შესრულდა — სცადე თავიდან.'
  }
}

export function OfferList({ publicRef, offers, matched, canReview, empty }: {
  publicRef: string
  offers: Offer[]
  matched: boolean
  /** The request has an account user to sign a review as (lib/offerLifecycle
   *  → reviewGate). Without one the picker is not drawn — a form that can only
   *  answer NO_ACCOUNT is not a form. */
  canReview: boolean
  /** What to draw while there is nothing — the page's own words, passed in so
   *  this list stays mounted across „nothing" → „one", see below. */
  empty: ReactNode
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ── Which offers ARRIVED while you were looking (stage 10) ────────────────
  // The page is re-rendered by the room's stream (../_liveRefresh) the moment
  // an offer is written; React keeps the cards already on screen and mounts
  // the new one. Only THAT one enters (`slide-in-b`, motion-safe) — the ids
  // present at first render are remembered and never animate, so a reload
  // does not play four entrances over a list the reader has already seen.
  // Owner: „პასუხები სათითაოდ მოდის, ჩვეულებრივი ჩატივით." A card that
  // arrived keeps its class; an animation runs once, on the node's mount, and
  // a re-render does not restart it.
  const seenAtMount = useRef<Set<string> | null>(null)
  if (seenAtMount.current === null) seenAtMount.current = new Set(offers.map(o => o.id))
  const arrived = (id: string) => !seenAtMount.current!.has(id)

  // „დასრულდა" — the same POST-then-refresh shape as accept: the server owns
  // the claim (once, 409 on a second tap) and the page re-reads the result.
  const done = async (id: string) => {
    if (busyId) return
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/requests/${publicRef}/offers/${id}/done`, { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) { setError(errText(j?.error)); return }
      router.refresh()
    } catch {
      setError(errText())
    } finally {
      setBusyId(null)
    }
  }

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

  if (offers.length === 0) return <div className="mt-4">{empty}</div>

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
          <Card
            key={o.id}
            className={[
              accepted ? 'border-brand-300' : '',
              arrived(o.id) ? 'motion-safe:animate-slide-in-b' : '',
            ].filter(Boolean).join(' ') || undefined}
          >
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

            {/* ── After the choice (stage 7) ──────────────────────────────
                On the ACCEPTED offer, in order: „დასრულდა" while nobody has
                said so; the ★ picker once somebody has and the request has an
                account to sign as; the stars, read-only, once it is reviewed.
                QUOTE only — a BOOKING offer's completion is the booking's. */}
            {accepted && o.kind === 'QUOTE' && !o.doneAt && (
              <div className="mt-4">
                <Btn
                  variant="secondary"
                  onClick={() => done(o.id)}
                  disabled={busyId !== null}
                  aria-busy={busyId === o.id}
                >
                  {busyId === o.id ? 'ინახება…' : 'დასრულდა'}
                </Btn>
              </div>
            )}
            {accepted && o.doneAt && !o.review && canReview && (
              <ReviewForm publicRef={publicRef} offerId={o.id} onSaved={() => router.refresh()} />
            )}
            {accepted && o.review && (
              <div className="mt-4 pt-4 border-t border-ink-100">
                <Stars n={o.review.rating} />
                {o.review.body && (
                  <p className="mt-2 text-body text-ink-800 whitespace-pre-wrap">{o.review.body}</p>
                )}
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}

/* ── ★ read-only ──────────────────────────────────────────────────────────
   The expert profile's Stars (app/experts/[slug]/_bits), at the same size. */
function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${n} 5-დან`}>
      {[1, 2, 3, 4, 5].map(i => (
        <Icon.star key={i} aria-hidden className={`w-3.5 h-3.5 ${i <= n ? 'text-warning-500' : 'text-ink-200'}`} />
      ))}
    </span>
  )
}

/* ── ★ picker + one sentence ──────────────────────────────────────────────
   The lesson review's star row (app/me/bookings/[id]/_review), without the
   four sub-ratings — a job has one question. Submit is the same claim as
   everything else here: the server refuses a second one (409), the page
   re-reads. */
function ReviewForm({ publicRef, offerId, onSaved }: { publicRef: string; offerId: string; onSaved: () => void }) {
  const [rating, setRating] = useState(0)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (busy || rating === 0) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/requests/${publicRef}/offers/${offerId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, body: body.trim() }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) { setError(errText(j?.error)); return }
      onSaved()
    } catch {
      setError(errText())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-ink-100">
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            aria-label={`${n} ვარსკვლავი`}
            aria-pressed={rating === n}
            className={`w-10 h-10 rounded-btn inline-flex items-center justify-center transition-colors duration-fast ${rating >= n ? 'text-warning-500' : 'text-ink-300 hover:text-ink-400'}`}
          >
            <Icon.star aria-hidden className="w-7 h-7" />
          </button>
        ))}
      </div>
      <textarea
        value={body}
        onChange={e => setBody(e.target.value.slice(0, REVIEW_BODY_MAX))}
        rows={2}
        maxLength={REVIEW_BODY_MAX}
        placeholder="ერთი წინადადება"
        aria-label="შეფასება"
        className="mt-3 w-full px-3.5 py-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 placeholder-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none resize-y transition-colors duration-fast"
      />
      {error && (
        <p role="alert" className="mt-2 text-small text-danger-700">{error}</p>
      )}
      <div className="mt-3">
        <Btn onClick={submit} disabled={busy || rating === 0} aria-busy={busy}>
          {busy ? 'ინახება…' : 'შეფასების გაგზავნა'}
        </Btn>
      </div>
    </div>
  )
}
