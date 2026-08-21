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
// ⚠️ THE ORDER IS RULE 4 (CLAUDE.md §1): „wherever both appear, the SERVICE
// comes first". It is expressed as an order, not as a hope — see `homeItems`.

import { primaryPriceLabel, offerPriceLabel, SERVICE_SUFFIX } from '@/components/booking/slots'
import type { CatalogueCardItem } from '@/components/home/CatalogueGrid'
import type { MasterRow } from '@/app/experts/_masterData'

/** Six cards: 3×2 on desktop. Kept here because the ORDER rule below is
 *  meaningless without the size it is dividing up. */
const HOME_ITEMS = 6
/**
 * How many of the six the SERVICE half leads with when it has that many.
 *
 * ⚠️ IT IS A LEAD, NOT A QUOTA, and the difference is the whole design. „Service
 * first" as a plain sort would show six providers the day a seventh signs up
 * and quietly drop the consulting half off the home page — the „two catalogues"
 * failure arriving from the opposite direction. Leading with up to three, then
 * filling from the other half, then topping up from whichever still has rows,
 * means the service always ARRIVES first and neither half can ever be absent
 * while it has somebody to show.
 */
const SERVICE_LEAD = 3

/** The tutor rows this needs — a structural subset of `TutorListRow`, written
 *  out so this file never imports the query (which imports prisma). */
type HomeTutorRow = {
  id: string
  slug?: string | null
  headline?: string | null
  bio?: string | null
  price?: number | null
  consultationDurationMin?: number | null
  professions?: string[] | null
  verified?: boolean | null
  user?: { fullName?: string | null; avatarUrl?: string | null } | null
  category?: { name?: string | null } | null
  consultations?: { minutes: number; price: number; tier?: string | null; bookable?: boolean | null }[] | null
}

/** One expert → one card. The flagship price and its suffix come off the SAME
 *  tier (`primaryPriceLabel`), which is the entire reason that helper exists:
 *  reading the price from the profile's flat rate and the clock from a tier is
 *  how a card ends up advertising an hour at a third of its price. */
function fromExpert(t: HomeTutorRow): CatalogueCardItem {
  // `bookable` is nullable on the row and `undefined`-able in `OfferShape` —
  // and the difference is load-bearing rather than cosmetic: `bookable === false`
  // is what marks a tier a SERVICE (no clock, no calendar), so collapsing null
  // to `false` here would advertise every consultation as one. Null means „not
  // stated", which is exactly what `undefined` means to the resolver.
  const tiers = (t.consultations ?? []).map(c => ({
    minutes: c.minutes,
    price: c.price,
    bookable: c.bookable ?? undefined,
  }))
  const offer = primaryPriceLabel(tiers, t.price ?? 80, t.consultationDurationMin ?? 60)
  return {
    id: t.id,
    slug: t.slug ?? null,
    name: t.user?.fullName ?? 'ექსპერტი',
    // WHAT THEY CALL THEMSELVES first, the sphere only as a fallback. Two
    // experts in „ბიზნესი და სტრატეგია" are told apart by „ბიზნეს-კონსულტანტი"
    // vs „ბრენდ-სტრატეგი", never by the sphere they share. Never `specialty`
    // free text — an unvalidated string must not wear a platform-issued badge.
    badge: t.professions?.[0] ?? t.category?.name ?? '',
    blurb: (t.headline || t.bio || '').trim(),
    priceLabel: offerPriceLabel(offer),
    priceSuffix: offer.suffix,
    photo: t.user?.avatarUrl ?? null,
    verified: !!t.verified,
  }
}

/** One provider → one card. */
function fromProvider(m: MasterRow): CatalogueCardItem {
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
    verified: false,
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
export function homeItems(tutors: HomeTutorRow[], masters: MasterRow[]): CatalogueCardItem[] {
  const services = masters.filter(m => !!m.slug).map(fromProvider)
  const experts = tutors.map(fromExpert)

  const out = [
    ...services.slice(0, SERVICE_LEAD),
    ...experts.slice(0, HOME_ITEMS - Math.min(services.length, SERVICE_LEAD)),
  ]
  // Top up from whichever half still has rows — only reachable when the other
  // one ran out, which is exactly the „the site is young" case this guards.
  if (out.length < HOME_ITEMS) out.push(...services.slice(SERVICE_LEAD))
  return out.slice(0, HOME_ITEMS)
}
