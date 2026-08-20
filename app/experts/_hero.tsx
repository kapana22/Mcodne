'use client'
// THE CATALOGUE'S HEADER BAND — breadcrumb, title, one line, and the intake CTA.
//
// ⚠️ IT USED TO BE THE FILTER SURFACE (2026-08-19, morning). Owner: „სერვისები
// და ექპერტები უნდა გაერთიანდეს და პატარა გადასართავი ექნება." The band carried
// a row of labeled dropdown boxes (კატეგორია / ფასი / ენა / შეფასება + Super), a
// search field and a scrolling category chip rail — three refinement surfaces
// stacked above the first card, none of which /experts had. They moved into the
// shared rail (app/experts/_filters → TutorFilters) and the results header
// (_results → ResultsBar).
//
// ⚠️ AND THE PILL SWITCH LEFT IT THE SAME EVENING. Owner, twice: „მოვიფიქროთ
// რომ იდენტურია უბრალოდ და ფილტრაციასავით უნდა იყოს." `components/VerticalSwitch`
// sat here as a pair of LINKS that swapped the whole catalogue; the two
// catalogues are one list now, so the control it was became a rail section
// („რა გჭირდება" → კონსულტაცია / სამუშაო). The component itself was deleted in
// stage 10 with /services, the last page that still navigated between halves.
//
// ⚠️ AND THE PRESET LEFT IT IN STAGE 10 (2026-08-19). There were two entrances
// with two breadcrumbs and two h1s — /tutors („იპოვე შენი ექსპერტი") and
// /masters („ხელოსნები", trailing from /services). Owner: „ექსპერტებზე
// გადაიტანე" and „სერვისები საერთოდ ხო ამოსაგდებია". One room now has one door,
// so this band branches on nothing: one trail, one h1, and the intake CTA
// whenever the server page hands it an address. The CTA is no longer the trades
// half's alone — with one list it is the door for anybody the list did not
// answer, which is the job it always did on /masters.

import { Link } from 'next-view-transitions'
import { Icon } from '@/components/Icon'
import { Btn } from '@/components/Btn'
import { Container } from '@/components/Container'
import { PAYMENTS_LIVE } from '@/lib/flags'
import { LiveCat, catNameOf } from './_data'
import { Filters } from './_filters'

export const SearchHero = ({ filters, total, loading, liveCats, requestHref }: {
  filters: Filters
  total: number
  loading: boolean
  liveCats: LiveCat[]
  /** The intake address, or null when FEATURE_REQUESTS is off. The flag is read
   *  ONCE in the server page so this header and the empty state cannot
   *  disagree about whether the door exists. */
  requestHref: string | null
}) => {
  // Live result count as the page heading (DESIGN_FIX_PROMPT 1.9). The label
  // reflects the active refinement: one category → its name; several → the
  // count. While loading show a neutral heading — never a stale or invented one.
  // ⚠️ A TYPED QUERY IS NOT A PAGE TITLE (owner, 2026-08-12: „ძალიან ცუდად
  // ჩანს"). Searching „ტესტ" printed „ტესტ" as a 44px bold h1 — the largest
  // type on the page given to an arbitrary string the visitor had just typed,
  // which is also the one string on screen that is guaranteed not to be
  // designed: two letters, a paste, a misspelling, anything. It told the reader
  // nothing they did not already know, since the words were still sitting in
  // the field right below it.
  //
  // A CATEGORY still becomes the heading, and that is not the same thing: it is
  // a name WE own, from a fixed list, and it genuinely titles the page the
  // visitor is on. The query lives in the results bar as a removable chip —
  // visible, undoable, and the same size as every other refinement.
  const headingLabel =
    filters.cats.length === 1 ? catNameOf(liveCats, filters.cats[0])
    : filters.cats.length > 1 ? `${filters.cats.length} კატეგორია`
    : null
  return (
    <section className="bg-white border-b border-ink-200">
      <Container className="py-7 sm:py-10">
        {/* Hidden below sm — the same rule /experts/[slug] already follows. On a
            phone this line cost a 17px tap target AND a band of vertical space
            on a page someone opened specifically to see results; the header
            logo and the browser's own Back both go home more reliably. It stays
            in the DOM (`hidden`, not unmounted) so crawlers and assistive tech
            keep the trail. ONE trail since stage 10: this page is no longer
            reached through a trades door, so „მთავარი › ექსპერტები" is the
            whole truth about where the reader stands. */}
        <nav aria-label="ნავიგაცია" className="hidden sm:flex items-center gap-1.5 text-meta text-ink-500 mb-4">
          <Link href="/" className="hover:text-ink-800 transition-colors duration-fast">მთავარი</Link>
          <Icon.chevR className="w-3 h-3 text-ink-300" />
          <span className="font-display font-semibold text-ink-800">ექსპერტები</span>
        </nav>

        {/* ⚠️ NO SWITCH HERE ANY MORE (2026-08-19, evening). It was a pair of
            links above this h1 that swapped the whole catalogue; the two
            catalogues are ONE list now and the choice is a rail section, which
            is what the owner asked for twice. `components/VerticalSwitch` was
            deleted with /services in stage 10 — nothing navigates between
            halves any more, because there are no longer two places to be. */}

        {/* THE COUNT IS NOT IN THE HEADING (2026-07-31). „10 ექსპერტი შენთვის"
            put the smallest true thing about the marketplace in its largest
            type — a number that reads as a boast at 1000 and as an apology at
            10, and that changes under the visitor every time they touch a
            filter. The heading says what the page IS; the refinement, when
            there is one, is the subject.

            The count itself is not hidden — it still reaches screen readers
            through the live region below (which is what `aria-live` on the h1
            was actually for) and every card is on screen to be counted. */}
        {/* ⚠ `text-h1 sm:text-display` SINCE THE MERGE (2026-08-19), down from
            36-52px: this page has a filter rail and a layout switch, so it is a
            working list, not a front door, and a 52px title costs the first row
            of results on a laptop. */}
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
          <div className="min-w-0">
            <h1 className="font-display text-h1 sm:text-display font-bold text-ink-900 tracking-tight">
              {!loading && headingLabel ? headingLabel : 'იპოვე შენი ექსპერტი'}
            </h1>
            <span aria-live="polite" className="sr-only">
              {loading ? 'იტვირთება' : `ნაპოვნია ${total}`}
            </span>

            {/* Honest by flag: only claim escrow once the payment gateway is
                live. */}
            <p className="text-body text-ink-500 mt-2">ხელით შერჩეული · გამჭვირვალე ფასი · {PAYMENTS_LIVE ? 'დაცული გადახდა' : 'დაჯავშნა უფასოა'}</p>
          </div>

          {/* ⚠️ THE CTA IS GATED, THE PAGE IS NOT. FEATURE_REQUESTS is a kill
              switch flipped from a dashboard at three in the morning
              (lib/requests), and this URL is in the sitemap. A submitted URL
              that 404s teaches the crawler to distrust the file; a catalogue
              whose button is simply absent is honest, and the people listed are
              still worth reading. The flag is read in the server page and
              arrives here as an address or null. */}
          {requestHref && (
            <div className="shrink-0">
              <Btn href={requestHref} variant="hero" size="lg">აღწერე, რა გჭირდება</Btn>
              {/* The terms at the decision point, in the owner's own words —
                  the same action, so the same sentence. */}
              <p className="mt-3 text-small text-ink-500 max-w-[40ch]">
                უფასოა, და ნომერს მხოლოდ იმას ვაძლევთ, ვისაც შენ აირჩევ.
              </p>
            </div>
          )}
        </div>
      </Container>
    </section>
  )
}
