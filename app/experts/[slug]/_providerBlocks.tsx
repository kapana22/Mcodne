// /experts/[slug] — the PROVIDER profile's blocks under the hero: „შესახებ",
// „ნამუშევრები", „შეფასებები" (was app/services/[slug]/_blocks until stage 11,
// 2026-08-19).
//
// Each one is drawn only when there is something to draw — a heading over a
// blank is a page apologising for the master. The one exception is reviews: the
// block always exists — the list when finished jobs were rated (stage 7,
// `_data` joins Review → RequestOffer), the honest empty state before — and a
// profile without the word „შეფასება" on it would read as a site that has never
// heard of one.

import type { ReactNode } from 'react'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { fmtDateTime, TBILISI } from '@/lib/tz'
import type { MasterProfile } from './_providerData'

const Section = ({ id, title, children }: { id: string; title: string; children: ReactNode }) => (
  <section id={id} className="mt-10 lg:mt-12 pt-8 border-t border-ink-100 scroll-mt-24">
    <h2 className="font-display text-h2 font-bold text-ink-900 tracking-tight">{title}</h2>
    <div className="mt-4">{children}</div>
  </section>
)

/**
 * WHAT THEY SELL, WITH THE PRICE BESIDE IT.
 *
 * ⚠️ THIS IS THE PAGE'S CENTRE, AND UNTIL 2026-08-20 IT DID NOT EXIST. The
 * provider profile drew a name, a chip, a city, a paragraph and two empty
 * boxes — nothing on it said what the person actually does for money. The
 * competing trades sites in this market list their services as a bulleted
 * column with no prices at all; listing them WITH prices is the one thing this
 * catalogue can do that they cannot, and it comes for free from the model:
 * a provider prices the services they ticked (ServiceProfile.priceList).
 *
 * Drawn FIRST among the blocks, above „შესახებ", because a paragraph about
 * somebody is context and this is the offer.
 *
 * Renders nothing when nothing is priced — „ask" is an honest way to work, and
 * an empty „ფასები" heading over a blank box is worse than no section at all.
 */
export function PricedServicesBlock({ p }: { p: MasterProfile }) {
  if (p.priced.length === 0) return null
  return (
    <Section id="services" title="სერვისები და ფასები">
      <ul className="divide-y divide-ink-100 border-t border-ink-100 max-w-[640px]">
        {p.priced.map(s => (
          <li key={s.id} className="flex items-baseline justify-between gap-4 py-3">
            <span className="min-w-0 text-body text-ink-900">{s.label}</span>
            <span className="shrink-0 font-display text-h3 font-bold text-ink-900 tabular-nums leading-none">{s.price}₾</span>
          </li>
        ))}
      </ul>
      {/* Said once, under the list, rather than „-დან" beside every number:
          a column of „60₾-დან · 40₾-დან" reads as hedging. */}
      <p className="mt-3 text-meta text-ink-500 max-w-[640px]">საორიენტაციო ფასია — ზუსტს შენს მოთხოვნაზე შემოგთავაზებს.</p>
    </Section>
  )
}

export function AboutBlock({ p }: { p: MasterProfile }) {
  if (!p.about) return null
  const paragraphs = p.about.split(/\n\n+/).filter(t => t.trim())
  return (
    <Section id="about" title="შესახებ">
      <div className="space-y-4 text-body-lg text-ink-700 leading-[1.65] max-w-[640px] whitespace-pre-wrap break-words">
        {paragraphs.map((t, i) => <p key={i}>{t}</p>)}
      </div>
    </Section>
  )
}

export function WorkBlock({ p }: { p: MasterProfile }) {
  if (p.workPhotoSrcs.length === 0) return null
  return (
    <Section id="work" title="ნამუშევრები">
      {/* Each <img> is ONE request to the photo route (`?n=`), lazy, in a
          reserved square — six of them is six small fetches, never a megabyte
          of data URI in the HTML. */}
      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {p.workPhotoSrcs.map((src, i) => (
          <li key={src} className="aspect-square rounded-card overflow-hidden ring-1 ring-ink-200 bg-ink-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`${p.name} — ნამუშევარი ${i + 1}`}
              loading="lazy"
              decoding="async"
              width={400}
              height={400}
              className="w-full h-full object-cover"
            />
          </li>
        ))}
      </ul>
    </Section>
  )
}

/** ★★★★☆ at meta size — the same glyph the expert profile's Stars draws
 *  (./_bits → Stars). Named apart because both now sit in ONE folder: two
 *  exports called `Stars` in one directory is the kind of collision that gets
 *  „fixed" by deleting the wrong one. */
export function ProviderStars({ n, className = 'w-3.5 h-3.5' }: { n: number; className?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${n} 5-დან`}>
      {[1, 2, 3, 4, 5].map(i => (
        <Icon.star key={i} aria-hidden className={`${className} ${i <= n ? 'text-warning-500' : 'text-ink-200'}`} />
      ))}
    </span>
  )
}

export function ReviewsBlock({ p }: { p: MasterProfile }) {
  // ⚠️ NOTHING RATHER THAN „ჯერ არ არის შეფასება" (2026-08-20). Measured that
  // day: 0 reviews on the whole site. So every profile drew a heading, a
  // bordered box and an icon to announce an absence — three elements saying
  // „unfinished" on a page whose only job is to make somebody trustworthy. An
  // empty state earns its place when the reader could FILL it (a filter that
  // matched nobody, an inbox they can write in); nobody can review a provider
  // they have not hired, so this one only apologises.
  // The section returns the moment there is one, and the anchor below survives
  // for the profile's own section nav.
  if (p.reviews.length === 0) return null
  return (
    <Section id="reviews" title="შეფასებები">
        <ul className="divide-y divide-ink-100">
          {p.reviews.map(r => (
            <li key={r.id} className="py-4 first:pt-0">
              <div className="flex items-center gap-3">
                <ProviderStars n={r.rating} />
                {/* Server-rendered: Tbilisi wall-clock, never the machine's. */}
                <time dateTime={r.at} className="text-meta text-ink-500 tabular-nums">
                  {fmtDateTime(r.at, { day: 'numeric', month: 'long', year: 'numeric' }, TBILISI).local}
                </time>
              </div>
              {r.body && (
                <p className="mt-2 text-body text-ink-800 whitespace-pre-wrap break-words max-w-[640px]">{r.body}</p>
              )}
            </li>
          ))}
        </ul>
    </Section>
  )
}
