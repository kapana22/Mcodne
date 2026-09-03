'use client'
// THE CATALOGUE'S HEADER BAND — the title, the measured count, and the search.
//
// ⚠️ REBUILT 2026-08-31 FROM THE OWNER'S DESIGN CANVAS („mcodne.ge პროფილის
// რედიზაინი" → Catalogue). It was a white band with a breadcrumb, an h1, a
// three-claim line and a big green button; the canvas makes it a green card on
// the cream ground with the SEARCH FIELD inside it.
//
// ⚠️ THE FIELD MOVED UP FROM THE RESULTS BAR, and that is the substantive
// change rather than a restyle. It sat in `ResultsBar` above the grid, beside
// the sort select and the view toggle — a refinement among refinements. On a
// catalogue whose front door is „what do you need", search is not a refinement,
// it is the first thing the reader does; and the home page's hero now hands a
// typed query straight to this page, so the field the query lands in has to be
// the one at the top. What stayed behind: the sort, the count, the active
// filter chips and the layout switch, which ARE refinements.
//
// ⚠️ THE INTAKE BUTTON LEFT THIS BAND. It was „აღწერე, რა გჭირდება" beside the
// h1, and the canvas moves it into the filter rail as „ვერ იპოვე?" — which is
// where it belongs: the intake is what you do when the list did NOT answer, and
// the top of the page is before anybody has looked. The door is not closed;
// `requestHref` is still resolved once in the server page and is now handed to
// the rail (app/experts/_filters → NotFoundCard).
//
// ⚠️ ONE TRAIL, ONE h1, NO SWITCH. Both were settled in stage 10 (2026-08-19):
// there is one catalogue, so there is nothing to navigate between and nothing
// to preset. The breadcrumb stays in the DOM for crawlers and assistive tech
// and is hidden below sm — on a phone it cost a 17px tap target and a band of
// space on a page somebody opened to see results.

import { Link } from 'next-view-transitions'
import { Icon } from '@/components/Icon'
import { Container } from '@/components/Container'
import { LiveCat } from './_cats'
import { Filters } from './_filters'
import { registerSearchInput } from '@/lib/searchFocus'

/** Where we actually work, read off the taxonomy rather than typed here. */

export const SearchHero = ({ filters, total, liveCats, search, setSearch, onSearch, loading }: {
  filters: Filters
  total: number
  liveCats: LiveCat[]
  search: string
  setSearch: (v: string) => void
  onSearch: () => void
  loading?: boolean
}) => {
  // The active refinement titles the page: one category → its name; several →
  // the count; none → the catalogue's own name.
  //
  // ⚠️ A TYPED QUERY IS NOT A PAGE TITLE (owner, 2026-08-12: „ძალიან ცუდად
  // ჩანს"). Searching „ტესტ" printed „ტესტ" as a 44px bold h1 — the largest
  // type on the page given to an arbitrary string the visitor had just typed,
  // telling them nothing they did not know, since the words were still in the
  // field right below it. A CATEGORY is different: it is a name WE own, from a
  // fixed list, and it genuinely titles the page the visitor is on.
  //
  // ⚠️ THE NAME MUST BE FOUND, NOT ASSUMED (2026-09-01). This read
  // `catNameOf(...)`, which falls back to the SLUG when the list does not hold
  // it — and that broke the rule the paragraph above states, in two ways.
  //   · `/experts?category=<anything>` printed that anything as a 44px h1. A
  //     mistyped or rotted link put a raw string in the largest type on the
  //     page, and a crawler read it as the page's subject.
  //   · On a perfectly good link it flashed: `liveCats` arrives after the first
  //     paint, so „law" was drawn for a beat and then became „სამართალი".
  // A real name or the catalogue's own — never a slug.
  const namedCat = filters.cats.length === 1
    ? liveCats.find(c => c.slug === filters.cats[0])?.name ?? null
    : null
  const headingLabel =
    filters.cats.length === 1 ? namedCat
    : filters.cats.length > 1 ? `${filters.cats.length} კატეგორია`
    : null

  return (
    <section className="pt-5 sm:pt-7">
      <Container size="wide">
        <nav aria-label="ნავიგაცია" className="mb-4 hidden items-center gap-2 text-meta text-ink-400 sm:flex">
          <Link href="/" className="transition-colors duration-fast hover:text-ink-700">მთავარი</Link>
          <span aria-hidden>·</span>
          <span className="font-display font-semibold text-ink-600">ექსპერტები</span>
        </nav>

        {/* ⚠️ THE GRADIENT RUNS brand-700 → brand-600, NOT → brand-500. The
            canvas ends it at #2F9C86 and white text on that measures 3.38:1,
            under AA — `tests/designTokens` computes exactly that, and CLAUDE.md
            rule 2 is one of the six that protect a person rather than a
            preference. brand-600 is 4.78:1 and is the same picture, legible. */}
        <div className="flex flex-wrap items-center gap-6 rounded-panel bg-gradient-to-br from-brand-700 to-brand-600 px-6 py-7 text-white sm:px-8">
          <div className="min-w-[220px] flex-1">
            <h1 className="font-display text-h1 font-extrabold tracking-[-0.02em]">
              {headingLabel ?? 'იპოვე შენი ექსპერტი'}
            </h1>
            {/* ⚠️ THE ROSTER SIZE IS NOT SAID OUT LOUD ANY MORE (2026-09-02).
                Owner: „არასად არ ეწეროს ეგ ინფო, არასაჭიროა." The band read
                „23 ექსპერტი · ფასი თავიდანვე ჩანს" while the home page's
                catalogue tile said „25 ექსპერტი" — and neither number was
                answering a question the visitor had. „ფასი თავიდანვე ჩანს"
                stays: it is a promise about the CARDS, and the grid keeps it.

                ⚠️ THE `aria-live` LINE BELOW IS DELIBERATELY KEPT, and it is
                not the same thing. It is invisible, it is announced only to a
                screen reader, and it exists because this list REFILTERS under
                the person using it — without it, someone who cannot see the
                grid changes has no way to know their filter did anything. That
                is feedback on their own action, not a claim about the platform.
                If it should go too, this is the line to delete. */}
            <p className="mt-1.5 text-meta text-white/[0.78]">
              {loading ? 'იტვირთება…' : 'ფასი თავიდანვე ჩანს'}
            </p>
            <span aria-live="polite" className="sr-only">{`ნაპოვნია ${total}`}</span>
          </div>

          {/* ⚠️ ONE FIELD. NO CITY. The canvas drew a second text input holding
              „თბილისი"; this was a STATEMENT rather than an input, because a
              field you can type into promises the answer changes something and
              with `CITIES` at one entry it cannot. The owner removed the
              statement too on 2026-09-01 — „ეს თბილისი საერთოდ წაშალე" — so the
              search box is one field and a button, here and on the home page.
              The city is not named on this screen at all now; it is named where
              a result is, which is where it costs a reader nothing to learn. */}
          <form
            role="search"
            onSubmit={e => { e.preventDefault(); onSearch() }}
            /* ⚠️ ONE ROW AT EVERY WIDTH (2026-09-02, owner, from a phone:
               „ესეც ცუდად არის, შეალამაზე").
               It was `flex-col rounded-panel` below `sm` and a row above it, so
               on a phone the control became a white PANEL containing a field
               and, under it, a full-width `rounded-pill` slab in `ink-900` —
               the darkest surface on the site, on a brand-green hero. Three
               things wrong in one control: a pill nested inside a panel (two
               radii, the „ზოგი მრგვალია ზოგი მეტად" complaint), ~120px of hero
               spent on one field, and a stacked layout that is a desktop row
               that ran out of width rather than a design for a phone.
               A search bar is one control. It stays one: the field flexes, the
               button shrinks to its word. Measured at 320px — the narrowest
               viewport this project designs for — 18px icon + gap + input +
               a `px-4` button fits with the input still typeable. */
            /* ⚠️ `min-w-[320px]` IS LOad-BEARING AND WAS BRIEFLY REMOVED
               (2026-09-02). The parent is `flex-wrap`: the heading block claims
               `min-w-[220px] flex-1` and this claims the rest, so the minimum
               is what forces the two onto SEPARATE LINES once 220 + gap + 320
               no longer fits — which is every phone. Dropped, they shared one
               row and this form measured 223px at a 563px viewport, with 78px
               of typing space. Measured, not guessed. */
            className="flex min-w-[320px] flex-[2] flex-row items-center gap-1 rounded-pill bg-white p-1.5 shadow-[0_16px_40px_rgba(9,32,27,0.2)]
                       transition-shadow duration-mid ease-out-quart focus-within:ring-4 focus-within:ring-white/40
                       sm:gap-2 sm:p-2"
          >
            <label className="flex h-[52px] min-w-0 flex-1 items-center gap-2 px-3 sm:gap-2.5 sm:px-3.5">
              <span className="sr-only">ძებნა</span>
              <Icon.search aria-hidden className="h-[18px] w-[18px] shrink-0 text-ink-400" />
              {/* Registers itself so the site-wide `/` and ⌘K land HERE — see
                  lib/searchFocus for why it is a registry and not a selector.
                  Escape clears and steps back out, so a mistyped query costs
                  one key rather than a select-all. */}
              <input
                ref={registerSearchInput}
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    if (search) setSearch('')
                    else e.currentTarget.blur()
                  }
                }}
                /* „ძებნა სახელით ან თემით…" was the field's own wording and it
                   is true of one merged list; the canvas's „სერვისი ან ექსპერტი"
                   says the same thing shorter and in the reader's terms. */
                placeholder="სერვისი ან ექსპერტი"
                aria-label="ძებნა"
                className="min-w-0 flex-1 bg-transparent text-body text-ink-900 outline-none placeholder:text-ink-400 focus:!shadow-none
                           [&::-webkit-search-cancel-button]:appearance-none"
              />
            </label>

            <button
              type="submit"
              /* `px-4` on a phone, the canvas's `px-6` from `sm`: the word is
                 kept at every width because „ძებნა" is clearer than a second
                 magnifier next to the one already in the field. */
              className="h-[52px] shrink-0 rounded-pill bg-ink-900 px-4 font-display text-body font-bold text-white sm:px-6
                         transition-[background-color,transform] duration-fast ease-out-quart
                         hover:bg-ink-800 motion-safe:active:scale-[0.97]
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-700"
            >
              ძებნა
            </button>
          </form>
        </div>
      </Container>
    </section>
  )
}
