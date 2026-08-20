import type { ReactNode } from 'react'
import { Card } from '@/components/Card'
import { Icon } from '@/components/Icon'

/* The one catalogue-card SHELL — the expert card (app/experts/_card.tsx) and the
   master card (app/experts/_masterCard.tsx) render through it. It owns the SHAPE and
   nothing else:

     <article>                        Card as="article", padding none, group/relative
       {overlay}                      absolute siblings (overlay link, favourite)
       <body p-4 flex-1>
         <top row>  {plate}  <column> {title} · chips + „+N" · meta · [about] </column>
         [about]                      (plate layout — see below)
         {extra}
       </body>
       <footer strip>  {footer}  </footer strip>   drawn only when given
     </article>

   Each caller supplies its CONTENT: the plate (a 112–144px portrait with view
   transitions and hover video, or a 64px plate), its own title row (h2 vs h3,
   verified/Super/rating vs „ფირმა"), the chip labels, the meta text, the clamp
   text, and what goes in the footer. The chip, „+N", meta-row, clamp-paragraph
   and footer-strip classes live HERE and nowhere else — change one, both
   catalogues follow, which is the whole point.

   ⚠️ ONE GEOMETRY SINCE 2026-08-19 (the catalogue merge). `layout` used to
   switch between the expert's `portrait` and the master's 64px `plate`, because
   the shell was extracted from two files that were already in production and
   reproduced each exactly rather than averaging them. The owner then asked for
   the two catalogues to read as ONE product with one card, so the master moved
   onto `portrait` — same photo box, same title row, same chips, same meta, same
   clamp, same footer strip. `plate` is kept as the second geometry (three
   classes) and has NO caller today: it is what a compact 64px-avatar list would
   use, and deleting it is a decision for whoever proves nothing will ever want
   it. Do not move a catalogue back onto it without the owner.

   ⚠️ TWO VIEWS, AND THE VISITOR PICKS (2026-08-19). `view` is the reader's
   choice, not the card's — the catalogue shell renders the toggle and passes it
   down; the parent owns the container (`grid gap-4 sm:grid-cols-2` for grid,
   `flex flex-col gap-3` for list) and the card owns its own inside:
     grid  the card as it has always shipped — pixel-identical, and it is the
           DEFAULT so every existing call site is untouched
     list  one full-width ROW from `sm` up: photo left (the caller passes a
           smaller plate), identity column in the middle with ONE line of bio,
           and the footer strip stood up as a right-hand rail, vertically
           centred. BELOW `sm` a row would be four squashed columns on a
           390px phone, so it collapses back to the grid card's stacking —
           the only difference the reader keeps there is the bio clamp. */

export const CHIP_CAP = 2

/** The reader's layout choice. `grid` is what has always shipped. */
export type EntityView = 'grid' | 'list'

const LAYOUT = {
  portrait: { row: 'flex items-start gap-3.5 min-w-0', column: 'min-w-0 flex-1 flex flex-col' },
  plate:    { row: 'flex items-start gap-3 min-w-0',   column: 'min-w-0 flex-1' },
} as const

/** The footer price — `text-h2`, tabular, on the tinted strip. Both cards. */
export const EntityPrice = ({ children }: { children: ReactNode }) => (
  <span className="font-display text-h2 font-bold text-ink-900 tabular-nums tracking-tight leading-none">{children}</span>
)

/** The taxonomy chip — professions on an expert, trades on a master. Two, then
 *  a count: the card gives this row one line, and the profile is where the
 *  full set belongs. */
export const EntityChip = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex items-center h-[22px] px-2 rounded-pill bg-ink-75 text-ink-700 border border-ink-200 font-display text-meta font-semibold tracking-tight max-w-full truncate">{children}</span>
)

/**
 * WHAT THIS PERSON OFFERS, ON THE TITLE ROW — „კონსულტაცია" / „სამუშაო".
 *
 * ⚠️ IT EXISTS BECAUSE THERE IS ONE LIST NOW (2026-08-19). Owner: „ექსპერტები
 * და სერვისები ხო ერთია — ექსპერტს აქვს სერვისი რეალურად და პარალელურად აკეთებს
 * კონსულტაციასაც." A mixed list where the only difference between two cards is
 * their footer makes the reader work out the kind from the button; and a person
 * who offers BOTH is one card that has to say so, since neither footer alone
 * would.
 *
 * ⚠️ DRAWN ONLY WHEN IT DISTINGUISHES — the shells pass it when both halves are
 * on screen, or when this person holds both. A label that sits on every card in
 * a single-type list distinguishes nobody, which is the exact argument that
 * removed the „ახალი" pill from the expert card on 2026-07-31.
 *
 * The box is the „ფირმა" badge's, class for class: hairline border, no pastel
 * fill (the canon), and the same h-[22px] the EntityChip row uses, so it sits
 * on the title row exactly as the taxonomy chips sit on the row below it.
 */
export function EntityKinds({ kinds }: { kinds?: string[] }) {
  if (!kinds || kinds.length === 0) return null
  return (
    <>
      {kinds.map(k => (
        <span
          key={k}
          className="shrink-0 inline-flex items-center h-[22px] px-2 rounded-pill bg-ink-75 text-ink-700 border border-ink-200 font-display text-meta font-semibold"
        >
          {k}
        </span>
      ))}
    </>
  )
}

export function EntityCard({
  layout = 'portrait',
  view = 'grid',
  lift = false,
  overlay,
  plate,
  title,
  chips = [],
  chipCap = CHIP_CAP,
  meta,
  metaIcon,
  about,
  extra,
  footer,
}: {
  layout?: keyof typeof LAYOUT
  /** The reader's choice — see the header. `grid` is the shipped card. */
  view?: EntityView
  /** `.hover-lift` on the whole card (the expert card; the master card has none). */
  lift?: boolean
  /** Absolute-positioned siblings rendered BEFORE the body — the card-wide
   *  overlay link and the favourite button. Anything in the body that must stay
   *  clickable opts out with `relative z-10`. */
  overlay?: ReactNode
  /** The photo / avatar slot — first child of the top row, sized by the caller. */
  plate: ReactNode
  /** The whole title row (heading + badges) — its flex classes are the caller's. */
  title: ReactNode
  /** Chip labels; the shell renders `chipCap` of them and „+N" for the rest. */
  chips?: string[]
  chipCap?: number
  /** One muted meta line under the chips (languages / areas). */
  meta?: ReactNode
  /** ⚠️ THE MARK IN FRONT OF `meta`, and it is the caller's because the FACT is.
   *  Both cards used the globe; on a consultation the line is languages and on
   *  a service it is cities, so one mark stood for two different things on one
   *  screen. Defaults to the globe, which is what languages always meant. */
  metaIcon?: ReactNode
  /** The two-line clamp (bio / about). */
  about?: string | null
  /** Below the top row, inside the body (the expert's signals / session count). */
  extra?: ReactNode
  /** Footer-strip content; the strip is drawn only when this is given. */
  footer?: ReactNode
}) {
  const L = LAYOUT[layout]
  const row = view === 'list'
  const shown = chips.slice(0, chipCap)
  const rest = chips.length - shown.length
  const aboutNode = about
    ? (
      /* Two lines in the grid card. In a row the bio is the one block that can
         make every row a different height, and a row already shows the name,
         the chips and the meta line — so it drops to one. `sm:` only: below the
         breakpoint the row IS the grid card, and clamping to one line there
         would silently shorten a bio the reader never asked to shorten. */
      <p className={`mt-2 text-small text-ink-600 leading-[1.45] break-words ${row ? 'line-clamp-2 sm:line-clamp-1' : 'line-clamp-2'}`}>{about}</p>
    )
    : null

  return (
    <Card as="article" padding="none" className={`group relative overflow-hidden flex flex-col h-full hover:border-ink-300${lift ? ' hover-lift' : ''}${row ? ' sm:flex-row sm:items-stretch' : ''}`}>
      {overlay}

      {/* flex-1 so every card in a row ends its footer on the same line even
          when one clamp text is shorter. */}
      <div className="flex-1 min-w-0 flex flex-col p-4">
        <div className={L.row}>
          {plate}

          <div className={L.column}>
            {title}

            {shown.length > 0 && (
              <div className="mt-1.5 pr-2 flex items-center gap-1.5 flex-wrap min-w-0">
                {shown.map(label => <EntityChip key={label}>{label}</EntityChip>)}
                {rest > 0 && <span className="text-meta text-ink-400 tabular-nums">+{rest}</span>}
              </div>
            )}

            {meta && (
              <div className="mt-1.5 inline-flex items-center gap-1.5 text-meta text-ink-500 max-w-full">
                {metaIcon ?? <Icon.globe className="w-3.5 h-3.5 text-ink-400 shrink-0" />}
                <span className="truncate">{meta}</span>
              </div>
            )}

            {layout === 'portrait' && aboutNode}
          </div>
        </div>

        {layout === 'plate' && aboutNode}

        {extra}
      </div>

      {footer != null && footer !== false && (
        /* THE SAME STRIP, STOOD UP. In a row the price and the actions move to
           the right and the divider turns with them — `border-t` becomes
           `border-l`, the tint stays, and `justify-center` puts the block on the
           photo's optical centre. Fixed 240px so every row's actions line up in
           one column; the caller keeps the strip's own contents (the expert
           stacks its two buttons there, see app/experts/_card.tsx).
           ⚠️ 240 IS MEASURED FROM IN TWO PLACES. The expert card pins its
           favourite button to the BODY's right edge in this view
           (`sm:right-[248px]` = this width + 8) because the rail's contents are
           vertically centred and fill it, so a button left in the card's own
           corner sits on top of the price. Change this number, change that one. */
        <div className={`px-4 py-3 border-t border-ink-100 bg-ink-50/40${row ? ' sm:border-t-0 sm:border-l sm:shrink-0 sm:w-[240px] sm:py-4 sm:flex sm:flex-col sm:justify-center' : ''}`}>
          {footer}
        </div>
      )}
    </Card>
  )
}
