// THE REQUESTS SUBSYSTEM'S TWO BADGES, IN ONE FILE.
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
import type { RequestStatusName, OfferStatusName } from '@/lib/requests'

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
