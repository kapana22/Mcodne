'use client'
// Home — the four steps, ON THE HERO CARD. Composed by `app/_home/hero.tsx`,
// not by HomeClient: it is the bottom half of one green surface, so it cannot
// be a section of its own without drawing a seam across it.
//
// ⚠️ REBUILT 2026-08-31 FROM THE OWNER'S REFERENCE, AND THERE ARE FOUR OF THEM
// NOW. What it replaces was three numbered paragraphs on a white plate further
// down the page. The owner sent one picture of the whole green card — headline,
// field, then 01 → 02 → 03 → 04 with a drawing under each — plus the strip of
// art itself; this is that picture. The step that was added is „შეადარე და
// აირჩიე", and it is the one the product actually turns on: offers arriving is
// not the moment anything happens, choosing between them is.
//
// ⚠️ THE KEYS ARE REUSED — `home.flow.*`, with an s4 added — AND THAT IS ONLY
// SAFE BECAUSE THEY ARE ONE DAY OLD. A SiteText row is keyed by the key string,
// so reusing a key for different words normally prints the OLD hand-typed
// sentence under the new heading with nothing reporting it; that is why
// `home.steps.*` and `home.how.*` are both retired in lib/siteTextDefs rather
// than recycled. This family was created on 2026-08-31 and no row exists under
// it yet, so the defaults there ARE what the page prints.
//
// ⚠️ THE ARROWS ARE CSS, NOT ART. The owner's strip draws dotted arrows between
// the four drawings. They are cut out of the PNGs (see components/Illustration)
// because an arrow baked into an image cannot stop pointing sideways when the
// row stacks into a column on a phone — these vanish below `lg`, which is
// exactly where the four columns stop being a row.
//
// ⚠️ NO RULE ABOVE THE ROW, AND THAT IS THE OWNER'S CALL (2026-08-31): „ეს
// წაშალე და ხაზი" — the examples row and the hairline that separated it from
// the steps, both gone. The steps are not a second section politely divided off
// from the field; they are the same paragraph, and the gap alone says so.
//
// ⚠️ `id="how"` LIVES HERE. The footer links to `/#how` („როგორ მუშაობს") and
// has since long before this rebuild; the anchor moved into the hero card with
// the steps, so the link still lands on the thing it names.

import { SiteText } from '@/components/SiteTextProvider'
import { Illustration, type IllustrationName } from '@/components/Illustration'

const STEPS: { n: string; art: IllustrationName; tk: string; dk: string }[] = [
  { n: '01', art: 'flowDescribe', tk: 'home.flow.s1.title', dk: 'home.flow.s1.desc' },
  { n: '02', art: 'flowOffers',   tk: 'home.flow.s2.title', dk: 'home.flow.s2.desc' },
  { n: '03', art: 'flowCompare',  tk: 'home.flow.s3.title', dk: 'home.flow.s3.desc' },
  { n: '04', art: 'flowStart',    tk: 'home.flow.s4.title', dk: 'home.flow.s4.desc' },
]

/** The dotted connector, drawn in the numeral's own row so it reads as „01 then
 *  02" rather than as a line under the drawings. Decoration: `aria-hidden`, and
 *  absent entirely on the last step and below `lg`, where the row is a column
 *  and a rightward arrow would be a lie. */
const Connector = () => (
  <span aria-hidden className="hidden flex-1 items-center gap-1.5 pl-4 lg:flex">
    <span className="h-0 flex-1 border-t-2 border-dashed border-white/25" />
    <svg viewBox="0 0 9 9" className="h-2.5 w-2.5 shrink-0 fill-white/35">
      <path d="M0 0l9 4.5L0 9z" />
    </svg>
  </span>
)

export const FlowSteps = () => (
  <div
    id="how"
    className="relative mt-8 scroll-mt-28 sm:mt-9"
  >
    {/* ⚠️ ONE COLUMN ON A PHONE, THE DRAWING BESIDE THE WORDS AND NO SENTENCE
        (2026-09-03). Two up was the answer on 2026-09-01 and the art that
        replaced the strip broke it: at 390px a cell's text column is 139px,
        „თანამშრომლობა" is wider than that, so the browser split the word in
        half — under a five-line sentence, in a cell 295px tall. The owner saw
        exactly that: „მიჭუჭყნულია".

        BESIDE THE WORDS, THE DRAWING COSTS NO HEIGHT OF ITS OWN. A row is as
        tall as the taller of its two halves, so the 112px drawing and the two
        lines of title share one 112px row instead of stacking into 295. The
        title column goes 139px → 161–178px, which is where the mid-word break
        stops.

        THE SENTENCE IS GONE FROM THE PHONE, and that is the owner's call
        („პატარა ტექსტები ხომ არ მოვაშოროთ ტელეზე"): the four titles are the
        sequence — აღწერე → მიიღე → შეადარე → დაიწყე — and the sentence under
        each was most of the height. Measured at 390px: the block is 508px,
        down from 623.

        A CAROUSEL WAS ASKED FOR ON 2026-09-01 AND THE ANSWER IS STILL NO. It
        is the shortest shape (~290px) and the one that costs this section its
        argument: these are not offers to browse, they are a SEQUENCE, and the
        reassurance is being able to count it. A carousel replaces „four steps"
        with three dots, and whoever does not swipe reads a quarter of the
        explanation. The list keeps all four on screen at once and costs 508.

        Two up survives from `sm` to `lg`, sentence included; four across from
        `lg`. */}
    <div className="flex flex-col gap-5 sm:grid sm:grid-cols-2 sm:gap-x-8 sm:gap-y-9 lg:grid-cols-4">
      {STEPS.map((s, i) => (
        <div
          key={s.n}
          className="flex items-center gap-3 sm:flex-col sm:items-stretch sm:gap-0"
        >
          {/* The drawing sits BESIDE the words on a phone and BETWEEN the title
              and the sentence above `sm`, as the owner drew it. `alt=""` — the
              two lines around it already say what it says, and a screen reader
              that hears „a laptop with a message" after „აღწერე მოთხოვნა" is
              being told the same thing twice.

              ⚠️ THE NEGATIVE MARGINS ARE NOT NUDGES, and they are `sm:` only.
              The PNG is a 512 square carrying a ~350-tall drawing, so it ships
              ~24px of transparent canvas above and below at that width; a
              normal `mt-4` stacks on top of that and the column reads as three
              things that fell apart. Beside the words there is nothing to pull
              back vertically — only the left edge, hence the single `-ml-2`. */}
          {/* ⚠️ `priority` ON ALL FOUR, AND IT IS MEASURED, NOT cargo-culted.
              Next reported the first drawing as the Largest Contentful Paint
              element on a phone once the sentence went; marking only that one
              moved the warning to the second, which is the honest signal —
              they are ALL in the first screen. At 1280×800 the row sits at
              y≈500–767 with the card ending at 767, and at 390×844 the four
              rows run y≈390–898. Lazy-loading an above-the-fold image is the
              one case the flag exists for, and the cost is small: each is
              ~15KB of webp at these widths. */}
          <Illustration
            name={s.art}
            alt=""
            size="flow"
            priority
            className="order-1 -ml-2 shrink-0 sm:order-3 sm:-ml-3 sm:-mb-3 sm:-mt-2"
          />

          {/* ⚠️ `sm:contents` IS THE WHOLE TRICK. On a phone this is one flex
              child — the words to the right of the drawing. From `sm` up it
              stops being a box at all, so its three children become flex items
              of the column above and `order` can slot the drawing back between
              the title and the sentence. One tree, two layouts; the
              alternative was rendering the step twice and hiding one. */}
          <div className="order-2 min-w-0 sm:contents">
            <div className="flex items-center sm:order-1">
              <span className="font-display text-h3 font-extrabold tabular-nums leading-none tracking-[-0.02em] text-brand-200/45 sm:text-h2 lg:text-h1">
                {s.n}
              </span>
              {i < STEPS.length - 1 && <Connector />}
            </div>

            <h3 className="mt-1.5 font-display text-body-lg font-bold tracking-[-0.01em] text-white sm:order-2 sm:mt-3">
              <SiteText k={s.tk} />
            </h3>

            {/* ⚠️ THE SENTENCE IS NOT ON THE PHONE (owner, 2026-09-03: „პატარა
                ტექსტები ხომ არ მოვაშოროთ ტელეზე"). It stays in the markup — it
                is the same DOM at every width, only hidden — because the four
                titles carry the sequence on their own („აღწერე" → „მიიღე" →
                „შეადარე" → „დაიწყე") and the sentence under each was the whole
                reason the block was 635px and the words were wrapping to five
                lines in a 139px column. */}
            <p className="mt-1 hidden max-w-[16rem] text-body leading-[1.6] text-white/[0.72] text-pretty sm:order-4 sm:mt-0 sm:block">
              <SiteText k={s.dk} />
            </p>
          </div>
        </div>
      ))}
    </div>
  </div>
)
