// /experts/[slug] — the PROVIDER profile's breadcrumb and identity card.
//
// ⚠️ REBUILT 2026-08-31 FROM THE OWNER'S DESIGN CANVAS („mcodne.ge პროფილის
// რედიზაინი" → Public Profile). It was a bare header — a photo and a stack of
// text running straight into the page. The canvas makes it a white card on the
// cream ground, the same material as every other block, and that is what lets
// the identity read as ONE object instead of as the top of a document.
//
// What moved INTO it, and why the page is shorter for it:
//   · THE CITY AND THE LANGUAGES. They were `ProfileFactsBlock`, a labelled
//     `<dl>` in the rail (added 2026-08-30 because the hero had no room for
//     them). The card has room, the canvas puts them in the chip row, and the
//     rail is now the price and the action — which is what a rail is for.
//   · Everything the old hero already carried: the name, the ★, the mark, the
//     firm badge, the one line, the professions, the unpriced trades.
//
// ⚠️ THE MARK STILL SAYS „გადამოწმებული", NOT THE CANVAS'S „პირადობა
// შემოწმებულია". `ServiceProfile.verified` means an admin checked the profile;
// it does not mean anybody saw an ID document. The canvas's wording is a
// STRONGER claim than the data supports, and this is the one mark on the page
// whose whole job is to be believed. The word is also the lexicon's
// (tests/lexicon: „ვერიფიცირებული" → „გადამოწმებული").

import { Link } from 'next-view-transitions'
import { Icon } from '@/components/Icon'
import { EntityChip } from '@/components/EntityCard'
import type { ProviderProfileData } from './_providerData'

/** The same trail the catalogue draws, one step deeper. Hidden below sm, kept
 *  in the DOM for crawlers and assistive tech.
 *
 *  ⚠️ TWO STEPS, AND SINCE STAGE 11 THEY ARE TRUE — the trail is literally the
 *  path: /experts → this profile. A breadcrumb that does not match the address
 *  is a hierarchy the site invents; this one no longer does. */
export function ProviderBreadcrumb({ name }: { name: string }) {
  return (
    <nav aria-label="ნავიგაცია" className="hidden sm:flex items-center gap-2 text-meta text-ink-400">
      <Link href="/" className="hover:text-ink-700 transition-colors duration-fast">მთავარი</Link>
      <span aria-hidden>·</span>
      <Link href="/experts" className="hover:text-ink-700 transition-colors duration-fast">ექსპერტები</Link>
      <span aria-hidden>·</span>
      <span className="font-display font-semibold text-ink-600 truncate">{name}</span>
    </nav>
  )
}

export function ProviderHero({ p }: { p: ProviderProfileData }) {
  // Round for a person, rounded-square for a firm — the catalogue card's rule,
  // so the plate somebody just clicked keeps its shape here.
  const shape = p.isCompany ? 'rounded-card' : 'rounded-full'
  // Labels come from the same topic list on both sides (lib/serviceProfile →
  // `serviceLabels` and `pricedServices` both read `Topic.label`), so a string
  // match here is an id match.
  const pricedLabels = new Set(p.priced.map(s => s.label))
  const unpriced = p.services.filter(label => !pricedLabels.has(label))

  return (
    <header className="overflow-hidden rounded-band border border-ink-100 bg-white p-6 sm:p-7 lg:p-8">
      {/* ⚠️ `items-start` UNTIL `sm` (2026-08-31, second pass). Measured live at
          500px: a provider with nine chips makes this row ~380px tall, and
          `items-center` floated the 96px photo in the vertical middle of it —
          level with the chips rather than with the name it belongs to. The
          photo aligns with the h1 on a phone and re-centres from `sm`, where
          the row is short enough for centring to be the better read. */}
      <div className="flex flex-wrap items-start gap-6 sm:items-center sm:gap-7">
        {/* A reserved square either way — never a layout that jumps when the
            photo lands. 136px is the canvas's; it steps down on a phone. */}
        {p.photoSrc ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={p.photoSrc}
            alt={p.name}
            width={136}
            height={136}
            fetchPriority="high"
            className={`h-24 w-24 shrink-0 bg-ink-100 object-cover ring-1 ring-ink-200 sm:h-[136px] sm:w-[136px] ${shape}`}
          />
        ) : (
          <div className={`inline-flex h-24 w-24 shrink-0 items-center justify-center bg-ink-100 text-ink-400 ring-1 ring-ink-200 sm:h-[136px] sm:w-[136px] ${shape}`}>
            {p.isCompany ? <Icon.briefcase className="h-9 w-9" /> : <Icon.user className="h-9 w-9" />}
          </div>
        )}

        <div className="min-w-0 flex-1 basis-[280px]">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="break-words font-display text-h1 font-extrabold leading-[1.06] tracking-[-0.02em] text-ink-900 sm:text-display">
              {p.name}
            </h1>
            {/* ★ only when a review exists — a number from nothing would be
                exactly the trust mark this page must not draw. */}
            {p.reviewCount > 0 && p.ratingAvg !== null && (
              <span className="inline-flex shrink-0 items-center gap-1 text-small tabular-nums text-ink-700">
                <Icon.star aria-hidden className="h-3.5 w-3.5 text-warning-500" />
                <span className="font-display font-semibold text-ink-900">{p.ratingAvg.toFixed(1)}</span>
                <span className="text-ink-500">({p.reviewCount})</span>
              </span>
            )}
            {p.verified && (
              <span className="inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-pill border border-brand-100 bg-brand-50 px-2.5 font-display text-meta font-semibold text-brand-700">
                <Icon.check className="h-3 w-3" />
                გადამოწმებული
              </span>
            )}
            {p.isCompany && (
              <span className="inline-flex h-[26px] shrink-0 items-center rounded-pill border border-ink-200 bg-ink-75 px-2.5 font-display text-meta font-semibold text-ink-700">
                ფირმა
              </span>
            )}
          </div>

          {/* „12 წელია სამართალში ვმუშაობ" — what somebody wrote about
              themselves in one sentence, where a reader looks first. */}
          {p.headline && (
            <p className="mt-3 max-w-[560px] text-body-lg leading-[1.6] text-ink-700">{p.headline}</p>
          )}

          {/* ⚠️ ONE CHIP ROW, FOUR KINDS OF FACT — who they are, what they sell
              that carries no price, where, and in what language. The canvas
              draws exactly this and it is why the rail no longer needs a facts
              table. Each is omitted when empty; nothing is invented to fill the
              row out. */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {p.professions.map(job => <EntityChip key={`j-${job}`}>{job}</EntityChip>)}
            {/* Only the trades the price list does NOT already name — a
                provider may tick six services and price two, and the four with
                no price appear nowhere else on the page. */}
            {unpriced.map(label => <EntityChip key={`s-${label}`}>{label}</EntityChip>)}
            {p.areas.length > 0 && <EntityChip>{p.areas.join(', ')}</EntityChip>}
            {p.langs.length > 0 && <EntityChip>{p.langs.join(', ')}</EntityChip>}
          </div>
        </div>
      </div>
    </header>
  )
}
