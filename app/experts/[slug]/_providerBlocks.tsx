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
  return (
    <Section id="reviews" title="შეფასებები">
      {p.reviews.length === 0 ? (
        <EmptyState icon={<Icon.quote className="w-6 h-6" />} title="ჯერ არ არის შეფასება" />
      ) : (
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
      )}
    </Section>
  )
}
