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
import Link from 'next/link'
import { Card } from '@/components/Card'
import type { MasterProfile } from './_providerData'
import { requestHrefFor } from './_providerData'

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
/**
 * ⚠️ EVERY ROW IS BUYABLE SINCE 2026-08-20, and until today none of them was.
 *
 * This list is documented above as „the centre of this page" — the named
 * service with its price beside it, the one thing this catalogue has that the
 * trades sites do not. It was also completely inert: six services, six prices,
 * and nothing to press. The only action on the page sat in the rail and said
 * „describe your job", which is the opposite of what a priced list invites —
 * the client has already found the thing they want and read what it costs.
 *
 * The EXPERT profile has never had this problem: `_sections.tsx` puts a
 * „დაკვეთა" button on every job row. Identical content — a named service at a
 * fixed price — was orderable on one profile and dead on the other, purely
 * because the two are stored in different tables. That is exactly the split
 * THE PRODUCT MODEL says must not be visible to anybody.
 *
 * The button carries the SAME href the rail does (`requestHrefFor`, `?to=<slug>`)
 * — one door, aimed at this person. It does not pre-fill the service, because
 * the wizard has no parameter for it; the row's job here is to say „this one",
 * and the client repeats it in the description. If that ever feels like a
 * retype, the fix is a `?service=` the wizard reads, not a second door.
 */
/** How many rows the rail shows before folding. FOUR is the measured line: the
 *  provider with the longest list has six, and at six the block is taller than
 *  the CTA it sits under — which is the „იკარგება" the owner named. */
const RAIL_ROWS = 4

/** One priced service. Extracted because the block draws the list twice (open
 *  and folded) and two copies of a row is how the two halves drift apart. */
const PricedRow = ({ s, p, ordering }: { s: { id: string; label: string; price: number }; p: MasterProfile; ordering: boolean }) => (
  <li className="flex items-center justify-between gap-3 py-2.5">
    <span className="min-w-0 text-small text-ink-900">{s.label}</span>
    <span className="shrink-0 flex items-center gap-2.5">
      <span className="font-display text-body-lg font-bold text-ink-900 tabular-nums leading-none">{s.price}₾</span>
      {/* The row's own label rides along as `?q=` — the wizard's „რა გჭირდება"
          is then already answered. See requestHrefFor. Absent when the intake
          does not exist on this deployment: the PRICE is still the answer to
          „what does this cost", and a button to a 404 is not. */}
      {ordering && (
        <Link
          href={requestHrefFor(p, s.label)}
          aria-label={`${s.label} — დაკვეთა`}
          className="h-9 px-3 rounded-btn bg-brand-50 hover:bg-brand-600 hover:text-white border border-brand-200 hover:border-brand-600 text-brand-700 font-display font-semibold text-meta tracking-wide inline-flex items-center transition-colors duration-fast"
        >
          დაკვეთა
        </Link>
      )}
    </span>
  </li>
)

export function PricedServicesBlock({ p, ordering = true }: { p: MasterProfile; ordering?: boolean }) {
  if (p.priced.length === 0) return null
  const shown = p.priced.slice(0, RAIL_ROWS)
  const rest = p.priced.slice(RAIL_ROWS)
  return (
    <Card as="section" id="services" className="mt-3 scroll-mt-24">
      <h2 className="font-display text-h3 font-bold text-ink-900 tracking-tight">სერვისები და ფასები</h2>
      <ul className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
        {shown.map(s => <PricedRow key={s.id} s={s} p={p} ordering={ordering} />)}
      </ul>
      {/* ⚠️ A PLAIN <details>, NOT A TOGGLE COMPONENT. This block is server-
          rendered and the rest of the profile has no client bundle; a „show all"
          that needed `useState` would pull one in for a disclosure the browser
          has done natively for years — and it keeps working with JS off, which
          a rail full of prices should. */}
      {rest.length > 0 && (
        <details className="group">
          <summary className="mt-3 list-none cursor-pointer text-small font-display font-semibold text-brand-700 hover:text-brand-800 tap-area">
            <span className="group-open:hidden">ყველა სერვისი (<span className="tabular-nums">{p.priced.length}</span>)</span>
            <span className="hidden group-open:inline">დამალვა</span>
          </summary>
          <ul className="divide-y divide-ink-100 border-t border-ink-100">
            {rest.map(s => <PricedRow key={s.id} s={s} p={p} ordering={ordering} />)}
          </ul>
        </details>
      )}
      <p className="mt-3 text-meta text-ink-500">საორიენტაციო ფასია — ზუსტს შენს მოთხოვნაზე შემოგთავაზებს.</p>
    </Card>
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
