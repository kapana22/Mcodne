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
import { safeHttpUrl } from '@/lib/safeUrl'
import Link from 'next/link'
import { Card } from '@/components/Card'
import { tileHue } from '@/app/_home/data'
import type { ProviderProfileData } from './_providerData'
import { requestHrefFor } from './_providerData'

/**
 * ⚠️ EVERY BLOCK IS A WHITE PANEL NOW (2026-08-31, from the owner's design
 * canvas → Public Profile). They were `border-t` rules on one continuous white
 * sheet, which is the right way to divide a document and the wrong way to
 * divide a PROFILE: „რას აკეთებს", „შესახებ" and „ნამუშევარი" answer three
 * different questions and a hairline says they are three paragraphs of one.
 * The cream ground is what makes the alternative available — each block is now
 * an object with its own edge, and the gap between them does the dividing.
 *
 * `aside` carries the OPTIONAL half-line under the heading („ფასი
 * საორიენტაციოა…"), which the canvas puts there rather than at the foot of the
 * list where it used to sit unread.
 */
const Section = ({ id, title, aside, children }: {
  id: string; title: string; aside?: ReactNode; children: ReactNode
}) => (
  <section id={id} className="scroll-mt-24 rounded-panel border border-ink-100 bg-white p-6 sm:p-7">
    <h2 className="font-display text-h2 font-extrabold tracking-[-0.02em] text-ink-900">{title}</h2>
    {aside && <p className="mt-2 text-body text-ink-500">{aside}</p>}
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
/** How many rows the list shows before folding.
 *
 *  ⚠️ IT WAS FOUR, AND FOUR WAS A RAIL'S NUMBER. The block lived in the 360px
 *  aside until 2026-08-31, where six rows stood taller than the CTA above them
 *  — the „იკარგება" the owner named on 2026-08-20. The canvas moves the list
 *  back into the wide column and the rail keeps only the price and the button,
 *  so the constraint that set this number is gone. Six is the longest list any
 *  provider actually has (measured 2026-08-20), which means the fold is now
 *  dormant for everybody and exists only so a 20-row list cannot bury
 *  „შესახებ". */
const LIST_ROWS = 6

/** One priced service. Extracted because the block draws the list twice (open
 *  and folded) and two copies of a row is how the two halves drift apart.
 *
 *  ⚠️ THE 36px TINTED SQUARE IS THE CANVAS'S, and it is not decoration: this
 *  list is the page's centre and it was five words and a numeral per row, so a
 *  provider with six services rendered as a receipt. The mark gives each row a
 *  left edge to start from. Its hue comes from `TILE_HUES` — the same family
 *  the home page's category tiles use, cycled by position — so the site has one
 *  set of colours rather than a second one invented here. */
const PricedRow = ({ s, p, ordering, i }: { s: { id: string; label: string; price: number }; p: ProviderProfileData; ordering: boolean; i: number }) => (
  <li className="flex items-center gap-4 border-t border-ink-100 py-3.5">
    <span
      aria-hidden
      style={{ backgroundColor: tileHue(i).bg }}
      className="h-9 w-9 shrink-0 rounded-tile"
    />
    <span className="min-w-0 flex-1 font-display text-body font-semibold text-ink-900">{s.label}</span>
    <span className="flex shrink-0 items-center gap-3">
      <span className="font-display text-body-lg font-extrabold leading-none tabular-nums text-ink-900">{s.price}₾</span>
      {/* The row's own label rides along as `?q=` — the wizard's „რა გჭირდება"
          is then already answered. See requestHrefFor. Absent when the intake
          does not exist on this deployment: the PRICE is still the answer to
          „what does this cost", and a button to a 404 is not. */}
      {ordering && (
        <Link
          href={requestHrefFor(p, s.label)}
          aria-label={`${s.label} — დაკვეთა`}
          className="inline-flex h-10 items-center rounded-btn border border-brand-200 bg-brand-50 px-3.5 font-display text-meta font-semibold text-brand-700 transition-colors duration-fast hover:border-brand-600 hover:bg-brand-600 hover:text-white"
        >
          დაკვეთა
        </Link>
      )}
    </span>
  </li>
)

/* ⚠️ `ProfileFactsBlock` STOOD HERE AND IS GONE (2026-08-31). It was a labelled
   `<dl>` in the rail — „ქალაქი: თბილისი", „ენა: ქართული, ინგლისური" — added on
   2026-08-30 because the hero was a bare header with no room for them, and it
   was the right fix for that hero.
   The canvas replaces the hero with a CARD, and puts both facts in its chip row
   beside the professions (./_providerHero). Two rows of a table and two chips
   say the same thing; the chips say it where the reader is already looking, and
   they give the rail back to the price and the button, which is what a rail is
   for. „გამოცდილება — N წელი" left this block one day earlier, on the owner's
   „წაშალე, ყველგან არაა საჭირო", and did not come back. */

export function PricedServicesBlock({ p, ordering = true }: { p: ProviderProfileData; ordering?: boolean }) {
  if (p.priced.length === 0) return null
  const shown = p.priced.slice(0, LIST_ROWS)
  const rest = p.priced.slice(LIST_ROWS)
  return (
    <Section
      id="services"
      title="რას აკეთებს"
      /* ⚠️ THE CAVEAT MOVED TO THE TOP (2026-08-31, the canvas's placement). It
         was the last line of the block, under a fold that most readers never
         opened — so the one sentence that stops „60₾" being read as a quote sat
         where it could not do that job. */
      aside="ფასი საორიენტაციოა — ზუსტს შენს მოთხოვნაზე შემოგთავაზებს."
    >
      <ul>
        {shown.map((s, i) => <PricedRow key={s.id} s={s} p={p} ordering={ordering} i={i} />)}
      </ul>
      {/* ⚠️ A PLAIN <details>, NOT A TOGGLE COMPONENT. This block is server-
          rendered and the rest of the profile has no client bundle; a „show all"
          that needed `useState` would pull one in for a disclosure the browser
          has done natively for years — and it keeps working with JS off. */}
      {rest.length > 0 && (
        <details className="group">
          <summary className="tap-area mt-3 cursor-pointer list-none font-display text-small font-semibold text-brand-700 hover:text-brand-800">
            <span className="group-open:hidden">ყველა სერვისი (<span className="tabular-nums">{p.priced.length}</span>)</span>
            <span className="hidden group-open:inline">დამალვა</span>
          </summary>
          <ul>
            {rest.map((s, i) => <PricedRow key={s.id} s={s} p={p} ordering={ordering} i={LIST_ROWS + i} />)}
          </ul>
        </details>
      )}
    </Section>
  )
}

export function AboutBlock({ p }: { p: ProviderProfileData }) {
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

/**
 * THE TWO LINKS — a website and a LinkedIn, when they gave one.
 *
 * ⚠️ THIS WAS „გამოცდილება და განათლება" AND IT LISTED A CV (2026-08-29). Three
 * tables — certificates, education, experience — hung off the consultation
 * profile and were inherited by the one provider profile when the products
 * merged. Owner, looking at the editor that fills them: „რითი დაგიჯერებს
 * აღარ გვჭირდება, ეს ხომ სერვისებს ყიდის."
 *
 * That is the product argument and it is right: somebody with water on the
 * floor does not read a degree. Measured on the live database the same day,
 * it was not carrying the site either — 4 of 29 providers had a certificate,
 * 8 had an education row, 5 had a job. What sells here is the priced list, the
 * paragraph and the photos of finished work, and all three are already blocks
 * on this page.
 *
 * The LINKS stayed. They are not a CV: a website is where a client checks that
 * a business is real, and 13 of the 29 gave one. The tables are untouched in
 * the database; nothing on the site reads them any more.
 */
export function CredentialsBlock({ p }: { p: ProviderProfileData }) {
  // ⚠️ EVERY ONE OF THESE IS TYPED BY A PROVIDER AND GOES STRAIGHT INTO AN
  // href. React escapes text; it does NOT sanitise this attribute, so
  // `javascript:…` in that box would execute in a reader's authenticated
  // origin on click. `safeHttpUrl` drops anything that is not an ordinary
  // navigable scheme, and a link with nothing left is not rendered at all.
  //
  // The write side already refuses it — `optionalUrl` in lib/serviceProfile and
  // app/api/me/provider demands `^https?://`. This is the second layer, and it
  // is here because the two guards protect against different things: that one
  // is a form rule somebody may loosen for a good reason, this one is about
  // what a browser will do with the string. lib/safeUrl was written for exactly
  // this and, found on 2026-09-03, had no caller at all — the only surface that
  // renders a provider's own URL was not using it (pinned by
  // tests/safe-url.test.ts § „the provider's links are sanitised").
  const links = [
    safeHttpUrl(p.websiteUrl) ? { href: safeHttpUrl(p.websiteUrl)!, label: 'ვებგვერდი' } : null,
    safeHttpUrl(p.linkedinUrl) ? { href: safeHttpUrl(p.linkedinUrl)!, label: 'LinkedIn' } : null,
  ].filter((x): x is { href: string; label: string } => x !== null)
  if (links.length === 0) return null
  return (
    <Section id="links" title="ბმულები">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {links.map(l => (
          <a
            key={l.href}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-1.5 text-small font-display font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-4 decoration-brand-300"
          >
            {l.label}
            <Icon.external aria-hidden className="w-3.5 h-3.5" />
          </a>
        ))}
      </div>
    </Section>
  )
}

/* ⚠️ `VideoBlock` STOOD HERE AND NOBODY EVER FILLED IT (removed 2026-08-29).
 * A YouTube intro embed on the public profile — an artefact of the consultation
 * product, where you watched somebody introduce themselves before booking an
 * hour of their time. Measured on the live database that day: **0 of 29
 * providers had a `videoUrl`**, published or not. Not a low number — zero.
 *
 * Nothing replaces it. What sells a service on this page is already here: the
 * priced list, the paragraph, and the photos of finished work. */

export function WorkBlock({ p }: { p: ProviderProfileData }) {
  const n = p.workPhotoSrcs.length
  if (n === 0) return null
  return (
    <Section id="work" title="ნამუშევარი">
      {/* The count, beside the heading rather than under it — it tells a reader
          whether the grid is worth scrolling before they scroll it. Measured,
          obviously: it is the length of the list right below. */}
      <p className="-mt-8 mb-4 text-right text-meta tabular-nums text-ink-400">{n} ფოტო</p>
      {/* Each <img> is ONE request to the photo route (`?n=`), lazy, in a
          reserved 4:3 box — six of them is six small fetches, never a megabyte
          of data URI in the HTML.
          ⚠️ 4:3, NOT SQUARE (2026-08-31, the canvas's ratio). A finished room, a
          repaired wall and a document are all wider than they are tall; a
          square crop cut the middle out of every one of them. */}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {p.workPhotoSrcs.map((src, i) => (
          <li key={src} className="aspect-[4/3] overflow-hidden rounded-tile bg-ink-100 ring-1 ring-ink-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`${p.name} — ნამუშევარი ${i + 1}`}
              loading="lazy"
              decoding="async"
              width={400}
              height={300}
              className="h-full w-full object-cover"
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

export function ReviewsBlock({ p }: { p: ProviderProfileData }) {
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
