// /experts/[slug] — the PROVIDER profile's breadcrumb and identity block (was
// app/services/[slug]/_hero until stage 11, 2026-08-19).
//
// The master card's slots, at profile size: plate · name (+ „ფირმა") · the
// trade chips the price list does NOT already name (2026-08-21 — see the block
// itself; the full set used to live here) · the areas line · the price line in
// the card footer's own words. What the card
// does not have, this does not invent — no response time, no „verified" mark:
// `ServiceProfile` carries no such field, and a trust mark with nothing behind
// it is the one thing a profile must not draw. The ONE exception is the ★
// beside the name (stage 7): drawn only when a review exists, from the reviews
// the page lists — a number from nothing would be exactly that trust mark.

import { Link } from 'next-view-transitions'
import { Icon } from '@/components/Icon'
import { EntityChip } from '@/components/EntityCard'
import type { ProviderProfileData } from './_providerData'

/** The same trail the catalogue draws (app/experts/_hero), one step deeper.
 *  Hidden below sm for the same reason, kept in the DOM for crawlers and
 *  assistive tech.
 *
 *  ⚠️ TWO STEPS, AND SINCE STAGE 11 THEY ARE TRUE. It read „მთავარი › სერვისები ›
 *  ხელოსნები › <name>" until stage 10: the first was a door that no longer
 *  exists and the second was the trades catalogue, which is the SAME list as
 *  the expert one. It was cut to two then — but the page still answered under
 *  /services, so „ექსპერტები › <name>" named a parent this URL did not have.
 *  With one namespace the trail is now literally the path: /experts → this
 *  profile. A breadcrumb that does not match the address is a hierarchy the
 *  site invents; this one no longer does. */
export function ProviderBreadcrumb({ name }: { name: string }) {
  return (
    <nav aria-label="ნავიგაცია" className="hidden sm:flex items-center gap-1.5 text-meta text-ink-500">
      <Link href="/" className="hover:text-ink-800 transition-colors duration-fast">მთავარი</Link>
      <Icon.chevR className="w-3 h-3 text-ink-300" />
      <Link href="/experts" className="hover:text-ink-800 transition-colors duration-fast">ექსპერტები</Link>
      <Icon.chevR className="w-3 h-3 text-ink-300" />
      <span className="font-display font-semibold text-ink-800 truncate">{name}</span>
    </nav>
  )
}

export function ProviderHero({ p }: { p: ProviderProfileData }) {
  // Round for a person, rounded-square for a firm — the card's rule, so the
  // plate somebody just clicked keeps its shape here.
  const shape = p.isCompany ? 'rounded-card' : 'rounded-full'
  // Labels come from the same topic list on both sides (lib/serviceProfile →
  // `serviceLabels` and `pricedServices` both read `Topic.label`), so a string
  // match here is an id match.
  const pricedLabels = new Set(p.priced.map(s => s.label))
  const unpriced = p.services.filter(label => !pricedLabels.has(label))
  return (
    <header className="flex items-start gap-4 sm:gap-6">
      {/* A reserved square either way — the card's plate at profile size. */}
      {p.photoSrc ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={p.photoSrc}
          alt={p.name}
          width={128}
          height={128}
          fetchPriority="high"
          className={`w-24 h-24 sm:w-32 sm:h-32 object-cover ring-1 ring-ink-200 shrink-0 bg-ink-100 ${shape}`}
        />
      ) : (
        <div className={`w-24 h-24 sm:w-32 sm:h-32 bg-ink-100 ring-1 ring-ink-200 shrink-0 inline-flex items-center justify-center text-ink-400 ${shape}`}>
          {p.isCompany ? <Icon.briefcase className="w-8 h-8" /> : <Icon.user className="w-8 h-8" />}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="font-display text-h1 sm:text-display font-bold text-ink-900 tracking-tight leading-[1.05] break-words">
            {p.name}
          </h1>
          {p.reviewCount > 0 && p.ratingAvg !== null && (
            <span className="shrink-0 inline-flex items-center gap-1 text-small text-ink-700 tabular-nums">
              <Icon.star aria-hidden className="w-3.5 h-3.5 text-warning-500" />
              <span className="font-display font-semibold text-ink-900">{p.ratingAvg.toFixed(1)}</span>
              <span className="text-ink-500">({p.reviewCount})</span>
            </span>
          )}
          {/* ⚠️ „გადამოწმებული", NEVER „ვერიფიცირებული" — the lexicon's rule.
              Drawn only when an admin actually ticked it: this is the one mark
              on the page that says somebody checked, and a mark with nothing
              behind it is the single thing a profile must not draw. */}
          {p.verified && (
            <span className="shrink-0 inline-flex items-center gap-1 h-[22px] px-2 rounded-pill bg-brand-50 text-brand-700 border border-brand-100 font-display text-meta font-semibold">
              <Icon.check className="w-3 h-3" />
              გადამოწმებული
            </span>
          )}
          {/* Hairline badge, no pastel fill — exactly the card's. */}
          {p.isCompany && (
            <span className="shrink-0 inline-flex items-center h-[22px] px-2 rounded-pill bg-ink-75 text-ink-700 border border-ink-200 font-display text-meta font-semibold">
              ფირმა
            </span>
          )}
        </div>

        {/* ⚠️ THE ONE LINE, ABOVE THE CHIPS (2026-08-24). It arrived with the
            professional half: „12 წელია სამართალში ვმუშაობ" is what somebody
            wrote about themselves in one sentence, and it belongs where a
            reader looks first. Absent on a trades profile, which never had one. */}
        {p.headline && (
          <p className="mt-2 text-body-lg text-ink-700 leading-snug max-w-[52ch]">{p.headline}</p>
        )}

        {/* The professions they claim — „ადვოკატი", „ბუღალტერი". A different
            question from the services below: who they are, not what they sell. */}
        {p.professions.length > 0 && (
          <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
            {p.professions.map(job => <EntityChip key={job}>{job}</EntityChip>)}
          </div>
        )}

        {/* ⚠️ ONLY WHAT THE PRICE LIST DOES NOT ALREADY SAY (2026-08-21).
            This drew EVERY trade chip — documented above as „the full set
            belongs here", which was true when the hero was the only place a
            visitor learned what somebody sells. Since 2026-08-20 it is not:
            „სერვისები და ფასები" names the same services with the price
            beside each one. Owner: „ტელეფონზე ესე ჩამოწერილი სერვისები
            ძან უშნოდ არის… და ფასებზე ჩანს ისედაც სერვისები რაც აქვს." At six
            services that pile was four wrapped rows at 390px, pushing the city
            and the actions off the first screen to repeat a list one scroll
            below.
            THE LEFTOVERS STILL SHOW. A provider may tick six services and price
            two; the four with no price appear nowhere else, so the hero names
            exactly those — and when nothing is priced at all (`PricedServicesBlock`
            renders null) that is the whole set, which is the old behaviour. */}
        {unpriced.length > 0 && (
          <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
            {unpriced.map(label => <EntityChip key={label}>{label}</EntityChip>)}
          </div>
        )}

        {/* ⚠️ CITY · YEARS · LANGUAGES MOVED TO THE RAIL (2026-08-30). They were
            one `text-small` row here, three facts five words apart with nothing
            naming any of them, and they were the last thing on a profile whose
            rail held one button — so the page ran out under the reader exactly
            where „who is this" gets answered. `ProfileFactsBlock` gives each one
            a label and a row (_providerBlocks.tsx).
            NO PRICE HERE EITHER (2026-08-19, and still true). A service is
            quoted after somebody looks at the job — „22₾-დან" was a number the
            offer would overwrite anyway, and a figure nobody stands behind is
            worse than none. Owner: „არ იცის კლიენტმა რამდენი ღირს სერვისი." */}

      </div>
    </header>
  )
}
