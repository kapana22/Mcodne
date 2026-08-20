// ONE MASTER, AS A CARD — the job half of the one catalogue, and the card
// /experts/<trade> draws too. (It was app/masters/_card.tsx until stage 10,
// 2026-08-19; it moved with its model when that folder went. The trade landing
// moved from /services/<trade> to /experts/<trade> in stage 11, the same day —
// one namespace, and this card did not have to change to follow it.)
//
// ⚠️ IT IS THE EXPERT CARD, ELEMENT FOR ELEMENT (finished 2026-08-19).
//
// I first built this as a full-width ROW — plate left, facts in a fixed right
// column — arguing that the trades side is scanned rather than browsed. That
// argument was my own judgement with nothing measured behind it. The owner
// asked three times for the two catalogues to sit inside one design system
// („ექსპერტის ქარდისგან დიდად არ უნდა განსხვავდებოდეს", then „სერვისები და
// ექპერტები უნდა გაერთიანდეს … ექპერტები როგორც არიან იმ ქარდით წამოიღე
// სერვისებიც"). Step one was the shared SHELL (components/EntityCard); it
// still ran on `layout="plate"`, a 64px avatar, so the two halves shared their
// classes and not their shape — side by side they still read as two products.
// This is step two: the same `layout="portrait"` the expert uses.
//
// So the geometry is app/experts/_card.tsx's:
//   the 112 / 144px photo · name (+ badge) · taxonomy chips · one meta line ·
//   the two-line bio clamp
//   ── hairline ──
//   the price, and the action
// What differs is only what the DATA differs by — a master has no rating, no
// session length, no intro video and no bookable calendar. Nothing is invented
// to fill those gaps: there is no rating, review count or response time here
// because there is no such data, and a catalogue that prints one invented
// number makes every real one unreadable. The closest competitor titles its
// trades page „რეიტინგები და ფასები" and shows neither.
//
// ⚠️ THE PHOTO IS A ROUTE, NEVER THE COLUMN. `m.photoSrc` is already
// /api/masters/[id]/photo — see app/experts/_masterData.ts for why selecting the
// base64 column into a list is a twelve-megabyte page. Growing the plate from
// 64 to 144px changes nothing about that: the route serves one image with a
// year-long cache. Do not "optimise" this into a data URI.
//
// ⚠️ A LINK SINCE STAGE 5 (2026-08-19), and only when the row HAS a slug. The
// public profile is /experts/<slug> (app/experts/[slug], step 4 of that file's
// resolver — it was /services/<slug> until stage 11); the whole card opens
// it through EntityCard's overlay slot — the same mechanism the expert card uses,
// a sibling of the content and never a parent, so nothing is nested inside an
// <a>. A row born before slugs (the lazy backfill in _data fills them) is drawn
// exactly as before: not a link, because a card that looks clickable and is not
// costs a tap and returns nothing.

import { Link } from 'next-view-transitions'
import { Icon } from '@/components/Icon'
import { Btn } from '@/components/Btn'
import { EntityCard, EntityKinds, EntityPrice, CHIP_CAP, type EntityView } from '@/components/EntityCard'
import type { MasterRow } from './_masterData'

/** The one address, so the overlay and the button agree. Null = not a link.
 *  ONE namespace since stage 11 (2026-08-19): the same /experts/<slug> prefix
 *  the expert card builds — two cards in one list can no longer send a reader
 *  into two different address spaces. */
export const masterHref = (m: Pick<MasterRow, 'slug'>) => (m.slug ? `/experts/${m.slug}` : null)

// The SHAPE lives in components/EntityCard (extracted 2026-08-19, shared with
// app/experts/_card.tsx). This file supplies only what a master puts in each
// slot. `view` is the reader's grid/list choice, passed down by the catalogue
// shell; it defaults to `grid`, which is the card as it ships today.

export function MasterCard({ m, view = 'grid', kinds }: { m: MasterRow; view?: EntityView; /** What this person offers, when saying so distinguishes them — see components/EntityCard → EntityKinds. */ kinds?: string[] }) {
  const href = masterHref(m)
  const row = view === 'list'

  /* ⚠️ A RESERVED SQUARE EITHER WAY, and the same size in both states — a card
     that collapses without a photo makes the grid ragged, and the master
     without a face reads as broken rather than as new.

     ROUND FOR A PERSON, ROUNDED-SQUARE FOR A FIRM. Round reads as a face and
     square reads as a logo — the same distinction the „ფირმა" badge makes in
     words, and a client is entitled to know which they are dealing with.
     (Today approval never sets `companyId`; see /api/master-applications/[id]
     for why, and the admin is warned.) That distinction is the ONE thing this
     plate keeps that the expert's does not: an expert is always a person.

     The sizes are the expert card's, for the reasons measured there — 112 at
     the base, 144 from `lg` (the bump is keyed to `lg`, NOT `sm`, because the
     grid goes 2-up at `sm` and the identity column is narrowest between 640 and
     1023), and a flat 80 in the list row. */
  const shape = m.isCompany ? 'rounded-card' : 'rounded-full'
  const box = `shrink-0 ring-1 ring-ink-200 ${shape} ${row ? 'w-20 h-20' : 'w-28 h-28 lg:w-36 lg:h-36'}`
  const plate = m.photoSrc ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={m.photoSrc}
      alt=""
      /* Intrinsic hint only — kept at the largest rendered size so the aspect
         ratio it reserves is square and the circle never gets a pre-layout
         oval. Same note as ExpertPhoto's. */
      width={144}
      height={144}
      loading="lazy"
      decoding="async"
      /* `object-center`: a centred square crop of a portrait keeps the face. */
      className={`${box} object-cover object-center`}
    />
  ) : (
    <div className={`${box} bg-ink-100 inline-flex items-center justify-center text-ink-400`}>
      {m.isCompany
        ? <Icon.briefcase className={row ? 'w-7 h-7' : 'w-9 h-9'} />
        : <Icon.user className={row ? 'w-7 h-7' : 'w-9 h-9'} />}
    </div>
  )

  return (
    <EntityCard
      layout="portrait"
      view={view}
      overlay={href ? (
        /* The WHOLE card opens the profile — see the header. `z-[1]` keeps it
           under anything that opts out with `relative z-10`; the „პროფილი"
           button in the footer is the one thing that does.
           `tabIndex={-1}` + `aria-hidden`: this is the MOUSE affordance, and
           the footer button is the same destination for everyone else. Leaving
           both focusable put two tab stops on one address in every row. */
        <Link href={href} aria-hidden tabIndex={-1} className="absolute inset-0 z-[1]" />
      ) : undefined}
      plate={plate}
      title={
        /* The expert card's title row, class for class — same wrap, same gaps,
           same two-line clamp on the name (one marketing line typed into a name
           field once took four lines and set the height of the card beside it).
           `h3` and not `h2`: this card also renders inside a section on
           /experts/<trade>, under a real h2, so an h2 here would break that
           outline. The token is the design, the tag is the
           outline — and the token is the expert's. */
        <div className="flex items-center gap-x-1.5 gap-y-1 min-w-0 flex-wrap">
          <h3 className="font-display text-body-lg sm:text-h3 font-bold text-ink-900 tracking-tight leading-[1.2] min-w-0 break-words line-clamp-2">
            {m.name}
          </h3>
          {/* Hairline badge, no pastel fill — the canon's rule. Only the
              company case is labelled: „ინდივიდუალური" on everybody else
              would be two labels saying one thing.
              Unchanged by the merge, deliberately: it is the EntityChip's own
              box (h-[22px], same ground, same hairline), so it sits on the
              title row exactly as the trade chips sit on the row below it. */}
          <EntityKinds kinds={kinds} />
          {m.isCompany && (
            <span className="shrink-0 inline-flex items-center h-[22px] px-2 rounded-pill bg-ink-75 text-ink-700 border border-ink-200 font-display text-meta font-semibold">
              ფირმა
            </span>
          )}
        </div>
      }
      /* The trades, in the expert card's taxonomy-chip row — same geometry,
         same `+N` (two, then a count — the rule the expert card applies to
         professions). This is what a master is filed under, so it sits exactly
         where the expert's professions sit. */
      chips={m.services}
      chipCap={CHIP_CAP}
      /* The one meta line — where they travel. Same slot the expert card
         gives languages, same globe, same muted weight. */
      meta={m.areas || undefined}
      /* Cities, not languages — see Icon.pin for why the globe could not stay. */
      metaIcon={<Icon.pin className="w-3.5 h-3.5 text-ink-400 shrink-0" />}
      /* Clamped like the expert bio: one person writing six paragraphs must not
         make their card three times as tall. */
      about={m.about}
      /* ⚠️ THE FOOTER STRIP IS THE EXPERT CARD'S, and it is the element that
         makes the two catalogues read as one product: hairline divider, tinted
         ground, the price on the left in `text-h2`, the action on the right.

         Drawn when there is a price OR an address to go to. A master who quotes
         per job is working normally, not leaving a blank — „—" would read as a
         missing answer rather than a different way of working — so the price
         simply does not render, and the button carries the strip on its own.

         ⚠️ NO SECOND DESTINATION HERE, EVER. The expert's two buttons exist
         because an expert can be messaged and booked; a master today can only
         be read. In particular this card must never link to /request: the
         intake is reached from the page's own CTA, and every entry point to it
         is inventoried by tests/requests.test.ts.

         Price left, action right — until the strip becomes the list rail, where
         240px is not enough for both side by side and they stack, the price
         over a button that fills the rail. `sm:` only, so below the breakpoint
         the list card's footer IS the grid card's footer. */
      /* ⚠️ NO PRICE ON A SERVICE (2026-08-19). The footer used to print
         „გამოძახება 20₾ · სამუშაო 22₾-დან" — a number nobody could stand
         behind: a job is quoted after somebody looks at it, and the offer
         overwrites whatever the card promised. Owner: „ფასიც ამოსაგდებია — არ
         იცის კლიენტმა რამდენი ღირს სერვისი." A consultation keeps its price
         (60 წუთი, 80₾ IS the price); a service says what happens next instead.
         `m.price` stays on the row for the profile, which explains itself. */
      footer={href ? (
        <div className={`flex items-center justify-between gap-3${row ? ' sm:flex-col sm:items-stretch sm:gap-2' : ''}`}>
          {/* ⚠️ THE PRICE CAME BACK AS A FLOOR (2026-08-20), and the research
              is the reason. It was removed outright on „არ იცის კლიენტმა
              რამდენი ღირს სერვისი", which is true of an EXACT number and not
              of a floor: every marketplace that lists people shows one, and
              shows it as a floor — Fiverr „From $45", Airtasker „From $150",
              Base44 „From $500", Semrush „Starting from $1,000". A browsing
              client needs an order of magnitude to decide whether to open the
              card at all, and „from" promises nothing.
              And when there is no floor to state, the slot says what happens
              instead — the Square pattern, where one card in the same grid
              reads „From $50 per month" and its neighbour „Contact us for a
              quote". Same position, same weight, different sentence: that is
              what makes the two halves of this catalogue read as one product,
              where a blank on one of them would not. */}
          {m.priceValue !== null ? (
            <EntityPrice>{m.priceValue}₾-დან</EntityPrice>
          ) : (
            <span className="text-small text-ink-500">ფასს შემოგთავაზებს</span>
          )}
          {href && (
            /* ⚠️ A REAL LINK, NOT A DECORATED SPAN, and it is a SIBLING of the
               overlay rather than a child of it — EntityCard renders `overlay`
               before the body, so nothing here is nested inside an <a>. It
               opts out of the overlay with `relative z-10`, the same way the
               expert card's own CTAs do.
               The alternative (a span the overlay covers) would look identical
               and be unreachable by keyboard, so it is not the accessible
               choice. The cost of this one would be a second tab stop to the
               same address; the OVERLAY gives that up instead (see above), so
               this button is the row's one focusable target. Its aria-label
               names the master and starts with the visible word, which is what
               WCAG 2.5.3 „Label in Name" requires. */
            <Btn href={href} variant="secondary" size="sm" aria-label={`პროფილი — ${m.name}`} className="relative z-10 shrink-0">
              პროფილი
            </Btn>
          )}
        </div>
      ) : undefined}
    />
  )
}
