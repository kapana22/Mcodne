// The home page's „ახლა ხელმისაწვდომია" row, resolved from the ONE catalogue.
//
// ⚠️ PURE. No prisma, no react, no environment — the two row types arrive as
// TYPE imports only (erased at compile time), so `app/page.tsx` can call this
// on the server with rows it has already loaded, and a test can execute it
// without a database. Same discipline as lib/catalogItems, and for the same
// reason: the rule below is a product rule and product rules must be checkable.
//
// ⚠️ WHY IT IS NOT `toCatalogItems` (lib/catalogItems). That function answers
// the CATALOGUE's question — „who is this person, across both halves, so the
// browser can filter and sort them as one row". This answers the HOME's much
// smaller one — „what six things are on sale, and what do they cost". Feeding
// the whole merged model into six compact cards would drag the filter
// vocabulary, the sort keys and both raw row types onto a marketing page.
//
// ⚠️ THE „SERVICE FIRST" ORDER IS GONE BECAUSE THE SPLIT IS (2026-08-24). This
// file used to interleave two row types — consultation experts and trades
// providers — and lead with up to three of the second, so that the service half
// always ARRIVED first without the consulting half ever being absent. There is
// one kind of row now; every card is a service, and the order is simply the
// roster's.

import type { CatalogueCardItem } from '@/components/home/CatalogueGrid'
import type { ProviderRow } from '@/app/experts/_providers'

/** Six cards: 3×2 on desktop. */
const HOME_ITEMS = 6

/** What the price on a card is FOR. One suffix, because there is one kind of
 *  row: „-დან" already says it is a floor, and this says what it is a floor on.
 *  It used to live in components/booking/slots beside the session-length
 *  labels — the file went with the booking product on 2026-08-24. */
export const SERVICE_SUFFIX = 'სერვისზე'

/** One provider → one card. */
function fromProvider(m: ProviderRow): CatalogueCardItem {
  return {
    id: m.id,
    slug: m.slug,
    name: m.name,
    // The first trade they list, in the catalogue's own order — resolved to a
    // label by the query, so this file never sees a topic id.
    badge: m.services[0] ?? '',
    blurb: (m.about ?? '').trim() || m.services.slice(1, 3).join(' · '),
    // 🔒 NEVER INVENT A NUMBER. `priceValue` is null for somebody who quotes per
    // job (lib/serviceProfile → priceHint) — that is a way of working, not a
    // missing field, and the card says so in words rather than printing ₾0.
    priceLabel: m.priceValue !== null ? `₾${m.priceValue}-დან` : null,
    priceSuffix: SERVICE_SUFFIX,
    photo: m.photoSrc,
    verified: m.verified,
  }
}

/**
 * The six cards, service first.
 *
 * ⚠️ A ROW WITHOUT A PUBLIC ADDRESS IS DROPPED, not rendered as a dead card.
 * The whole card is a link (components/home/CatalogueGrid); a provider whose
 * page does not exist yet (`slug: null`) would be a card that goes nowhere, and
 * a card that does nothing is worse on a home page than one fewer card.
 */
export function homeItems(providers: ProviderRow[]): CatalogueCardItem[] {
  return providers.filter(m => !!m.slug).slice(0, HOME_ITEMS).map(fromProvider)
}
