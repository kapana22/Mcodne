// THE REQUESTS SUBSYSTEM'S BADGES, IN ONE FILE.
//
// ⚠️ WHY THEY LIVE TOGETHER (2026-08-19). `RequestStatusPill` was born inside
// app/me/requests/_pill.tsx — the client's half — and the provider's half never
// found it, so an offer's status shipped as plain `text-meta` in a row of
// dot-separated facts where SENT, DECLINED and WITHDRAWN looked identical. The
// two halves of one subsystem drifting apart is the exact failure this file
// exists to stop; a shared component is the only version of „use the same
// grammar" that cannot be forgotten.
//
// The grammar itself is the site's, not this subsystem's: a hairline border and
// coloured text, never a pastel fill (CLAUDE.md — badges). Height h-6, micro
// type, uppercase. Nothing here is new; it is the existing pill, twice.
//
// …and, since 2026-08-31, a THIRD badge that deliberately breaks that grammar —
// see ClientRequestPill at the bottom, where the exception is argued.
import type { RequestStatusName, OfferStatusName } from '@/lib/requests'
import type { ClientRequestTone } from '@/lib/myRequests'
import { tileHue, type TileHue } from '@/app/_home/data'

/** The one shell both pills render — so a tone change cannot land on one half. */
function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center h-6 px-2 rounded-pill border text-micro font-display font-semibold uppercase shrink-0 ${tone}`}>
      {children}
    </span>
  )
}

const REQUEST_TONE: Record<RequestStatusName, string> = {
  NEW: 'border-ink-200 text-ink-700',
  VERIFIED: 'border-brand-200 text-brand-700',
  MATCHED: 'border-brand-200 text-brand-700',
  CLOSED: 'border-ink-200 text-ink-500',
  REJECTED: 'border-ink-200 text-ink-500',
}

export function RequestStatusPill({ status, label }: { status: RequestStatusName; label: string }) {
  return <Pill tone={REQUEST_TONE[status] ?? REQUEST_TONE.NEW}>{label}</Pill>
}

// THREE WEIGHTS, NOT FIVE COLOURS. The provider opens this page to answer one
// question — did I win? — so ACCEPTED is the only state that gets the brand,
// SENT is the neutral „still waiting", and the two dead ends recede. INVITED
// is a conversation rather than an offer (see OFFER_STATUS_LABEL) and reads as
// live, because it is: somebody wrote to them and is waiting.
const OFFER_TONE: Record<OfferStatusName, string> = {
  ACCEPTED: 'border-brand-200 text-brand-700',
  INVITED: 'border-brand-200 text-brand-700',
  SENT: 'border-ink-200 text-ink-700',
  DECLINED: 'border-ink-200 text-ink-500',
  WITHDRAWN: 'border-ink-200 text-ink-500',
}

export function OfferStatusPill({ status, label }: { status: OfferStatusName; label: string }) {
  return <Pill tone={OFFER_TONE[status] ?? OFFER_TONE.SENT}>{label}</Pill>
}

/* ── The CLIENT's own row, and the one place the fill rule bends ────────────
 *
 * ⚠️ IT IS A FILLED PILL, AND THAT IS THE OWNER'S DESIGN CANVAS („Client
 * Space", 2026-08-31) OVERRIDING THE BADGE GRAMMAR ABOVE. The canvas draws this
 * one as a pastel plate — `oklch(0.94 0.045 150)` on a `oklch(0.88 0.055 150)`
 * hairline — and those are not new colours: they are `TILE_HUES` entries 0, 1
 * and 7, the palette the same canvas gave the home page's category tiles. So
 * the exception is one designed family, not a one-off.
 *
 * WHY THE EXCEPTION IS DEFENSIBLE HERE and nowhere else on the two pills above:
 * this badge is the ONLY thing on a wide, otherwise plain row — no price, no
 * avatar, no second colour — and it is the thing the reader scans the list FOR
 * („has anybody answered?"). A hairline pill at that size disappears into the
 * meta line beneath it. The provider's and the admin's screens keep the
 * hairline, because there the pill sits in a card that already has a hierarchy.
 *
 * 🔒 CONTRAST IS NOT AT RISK. Every hue is L 0.94 with the ink taken from the
 * same TILE_HUES row (#1E6656 = brand-700, #7A5A18, #5A5347), which is the
 * pairing tests/designTokens' „ink is for the glyph" note already covers — a
 * dark, desaturated relative of its own plate, never white on a mid-tone.
 *
 * The STATE itself is derived in lib/myRequests → clientRequestState, not here:
 * a badge that decides what it means is a badge two screens will decide
 * differently. */
const CLIENT_TONE: Record<ClientRequestTone, TileHue> = {
  offers: tileHue(0),  // green — something arrived
  waiting: tileHue(1), // amber — nothing yet
  done: tileHue(7),    // the neutral entry, on purpose the last one
}

export function ClientRequestPill({ tone, label }: { tone: ClientRequestTone; label: string }) {
  const hue = CLIENT_TONE[tone]
  return (
    <span
      className="inline-flex h-[30px] shrink-0 items-center whitespace-nowrap rounded-pill border px-3 font-display text-meta font-bold"
      style={{ backgroundColor: hue.bg, borderColor: hue.border, color: hue.ink }}
    >
      {label}
    </span>
  )
}
