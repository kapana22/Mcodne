// /experts/[slug] — the PROVIDER profile's breadcrumb and identity block (was
// app/services/[slug]/_hero until stage 11, 2026-08-19).
//
// The master card's slots, at profile size: plate · name (+ „ფირმა") · every
// trade chip (the card shows two, this is where the full set belongs) · the
// areas line · the price line in the card footer's own words. What the card
// does not have, this does not invent — no response time, no „verified" mark:
// `ServiceProfile` carries no such field, and a trust mark with nothing behind
// it is the one thing a profile must not draw. The ONE exception is the ★
// beside the name (stage 7): drawn only when a review exists, from the reviews
// the page lists — a number from nothing would be exactly that trust mark.

import { Link } from 'next-view-transitions'
import { Icon } from '@/components/Icon'
import { EntityChip } from '@/components/EntityCard'
import type { MasterProfile } from './_providerData'

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

export function ProviderHero({ p }: { p: MasterProfile }) {
  // Round for a person, rounded-square for a firm — the card's rule, so the
  // plate somebody just clicked keeps its shape here.
  const shape = p.isCompany ? 'rounded-card' : 'rounded-full'
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
          {/* Hairline badge, no pastel fill — exactly the card's. */}
          {p.isCompany && (
            <span className="shrink-0 inline-flex items-center h-[22px] px-2 rounded-pill bg-ink-75 text-ink-700 border border-ink-200 font-display text-meta font-semibold">
              ფირმა
            </span>
          )}
        </div>

        {p.services.length > 0 && (
          <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
            {p.services.map(label => <EntityChip key={label}>{label}</EntityChip>)}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-small">
          {p.areas.length > 0 && (
            <div className="inline-flex items-center gap-1.5 text-ink-700">
              <Icon.globe className="w-3.5 h-3.5 text-ink-500 shrink-0" />
              <span>{p.areas.join(', ')}</span>
            </div>
          )}
          {/* ⚠️ NO PRICE HERE (2026-08-19). A service is quoted after somebody
              looks at the job — „22₾-დან" was a number the offer would
              overwrite anyway, and a figure nobody stands behind is worse than
              none. Owner: „არ იცის კლიენტმა რამდენი ღირს სერვისი." The CTA
              beside this says what actually happens instead. */}
        </div>

        {/* One person, two profiles: a provider who also sells consultations.
            A plain link, not a second card — the other page carries its own.
            Both addresses are /experts/<slug> now; they are still two rows in
            two tables (CLAUDE.md → THE PRODUCT MODEL: merging them is the
            eventual migration, and the trigger has not happened yet). */}
        {p.expertHref && (
          <Link
            href={p.expertHref}
            className="mt-3 inline-flex items-center gap-1.5 text-small font-display font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-4 decoration-brand-300 transition-colors duration-fast"
          >
            ექსპერტის პროფილი
            <Icon.chevR aria-hidden className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>
    </header>
  )
}
