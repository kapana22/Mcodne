'use client'
// THE ONE FILTER RAIL, FOR BOTH CATALOGUES (2026-08-19).
//
// ⚠️ WHY IT IS SHARED. Owner: „სერვისები და ექპერტები უნდა გაერთიანდეს … ექპერტები
// როგორც არიან იმ ქარდით წამოიღე სერვისებიც." /experts had grown the panel this
// file now is — a vertical list of rows in a 240px column — while /experts still
// refined through a horizontal row of dropdown boxes plus a phone drawer. Two
// filter languages on two halves of one product, and the halves are one tap
// apart. The rail moved here verbatim from the trades catalogue's own
// `_filters.tsx` (app/masters/, since deleted) so that side renders
// byte-identically; the one catalogue at /experts now draws the same rows.
//
// ⚠️ A ROW IS EITHER AN ADDRESS OR A STATE, AND THAT DIFFERENCE IS REAL.
// /experts resolves every refinement on the server: each row is a `<Link>` to
// the same page with one value flipped, so „ელექტრიკოსი თბილისში" is a URL
// somebody can send and a crawler can index (see app/masters/_filters). /experts
// filters an already-loaded roster in the browser and writes the state into the
// URL itself, so its rows are buttons. Rendering them as links would either
// invent addresses that reload the page or, worse, make the rail LOOK
// navigable where it is not. One component, one appearance, two mechanisms —
// which is exactly the split `href` vs `onClick` names.
//
// ⚠️ A VERTICAL LIST OF ROWS, NOT A CLOUD OF CHIPS. Kept from the /experts
// rewrite: pills work in a HORIZONTAL bar; in a 240px column they produce
// gravel — nothing aligned, no column for the eye to run down. A narrow rail
// wants one option per line, with the counts on a single right edge.

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { Card } from '@/components/Card'
import { Icon } from '@/components/Icon'

/** The shared row geometry — 40px line, full-width target, 20px drawn box. */
// ⚠ min-h, NOT h. The trade names are two words and fit; the expert categories
// („ბიზნესი და სტრატეგია“) do not, and a truncated row is a filter nobody can
// read - the one thing a rail must never do. A wrapped label grows the row;
// 40px stays the floor, so the tap target never shrinks.
// ⚠️ 40px AND A FILLED SELECTED ROW (2026-09-01, the owner's screenshots of the
// rail). It was a 36px line with `-mx-1.5` bleed and no fill: what is ticked was
// readable only from an 18px box, at the left edge, in a column of eighteen
// identical boxes. The canvas draws the whole ticked row as a brand-50 plate, so
// „what have I narrowed to" is answerable from across the room — and 40px is the
// tap floor this codebase already holds everything else to.
const ROW = 'group flex items-start gap-2.5 min-h-10 py-2 px-2.5 rounded-field transition-colors duration-fast'

/**
 * One option: a box, a label, and (when there is one) how many results it would
 * show.
 *
 * ⚠️ THE BOX IS DRAWN, NOT AN `<input>`. A real checkbox inside a link is a
 * control inside a control — the browser gives it its own focus stop and its
 * own click target, and clicking it would toggle a box that nothing reads while
 * the link navigates underneath. One target, one focus stop, and `aria-checked`
 * on a `checkbox` role carries the state to a screen reader properly.
 *
 * ⚠️ THE ROW IS THE TARGET, NOT THE BOX. The whole 40px line is tappable and it
 * spans the panel's full width — which is what makes a narrow rail comfortable
 * on a thumb even though the box itself is 20px.
 *
 * ⚠️ `count` IS OPTIONAL, AND AN ABSENT COUNT PRINTS NOTHING. /experts counts
 * its whole roster per row; /experts has a real count for every facet it offers
 * (categories from the API, languages and ratings from the loaded set) but not
 * for a budget slider. A row with no number is honest; a fabricated one is the
 * bug this codebase has documented twice already.
 */
export function FilterRow({ href, onClick, on, label, count, disabled }: {
  /** /experts: the address this row navigates to. Mutually exclusive with onClick. */
  href?: string
  /** /experts: the state this row flips. Mutually exclusive with href. */
  onClick?: () => void
  on: boolean
  label: ReactNode
  /** How many results this option would show. `0` greys the row. */
  count?: number
  disabled?: boolean
}) {
  const empty = count === 0
  const tone = on ? 'text-ink-900' : empty ? 'text-ink-400' : 'text-ink-800'
  const inner = (
    <>
      <span
        aria-hidden
        className={`w-5 h-5 rounded-[6px] border inline-flex items-center justify-center shrink-0 transition-colors duration-fast ${
          on
            ? 'border-brand-700 bg-brand-700 text-white'
            : 'border-ink-300 bg-white group-hover:border-ink-400'
        }`}
      >
        {on && <Icon.check className="w-3.5 h-3.5" />}
      </span>
      {/* ⚠️ `no-caps` — MKHEDRULI, NOT MTAVRULI (2026-09-01, the owner's
          screenshots). The row is a <button>, and globals.css renders every
          button in Georgian caps: „ᲡᲐᲛᲐᲠᲗᲐᲚᲘ" where the canvas draws
          „სამართალი". Caps are the site's voice for an ACTION („ᲛᲘᲘᲦᲔ
          ᲨᲔᲗᲐᲕᲐᲖᲔᲑᲐ"); a filter row is a NOUN in a list of eighteen, and the
          reading register is the one you can scan. */}
      <span className={`no-caps min-w-0 flex-1 text-body font-display leading-snug ${on ? 'font-bold' : 'font-medium'}`}>{label}</span>
      {/* ⚠️ THE PER-ROW COUNT IS GONE TOO (2026-09-02), and for the same reason
          as the switch above — it is the roster counted a third way. This file
          used to argue for it as honesty („a row that says «(3)» and hands back
          two cards is the failure `passesFilters` exists to stop"), and that
          argument survives the deletion: the row still hands back exactly what
          it promises, it simply no longer promises a NUMBER. What it cost was
          telling somebody that „სამართალი" holds four people before they had
          decided whether they wanted one. */}
    </>
  )
  // The plate under a ticked row. `bg-brand-50` is a tint, not a filled brand
  // surface, so the AA rule about brand-600 does not apply — the text on it is
  // ink-900 and measures 15:1.
  const fill = on ? 'bg-brand-50 hover:bg-brand-100' : 'hover:bg-ink-50'
  return href ? (
    <Link href={href} role="checkbox" aria-checked={on} className={`${ROW} ${tone} ${fill}`}>
      {inner}
    </Link>
  ) : (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onClick}
      disabled={disabled}
      className={`${ROW} w-full text-left ${tone} ${disabled ? 'opacity-45 cursor-not-allowed' : fill}`}
    >
      {inner}
    </button>
  )
}

/**
 * A titled block of rows. `title` is optional — a single standing row (the
 * Super switch) is its own block with no heading to repeat it.
 *
 * ⚠️ `note` IS THE MERGED CATALOGUE'S ONE ADDITION (2026-08-19). Since the two
 * halves became one list (lib/catalogItems), a section can narrow only ONE of
 * them — „ენა" is a question about a consultation and „ქალაქი" is a question
 * about a job — and a rail that offers both without saying so is a rail whose
 * result count looks broken. One muted line under the heading, and only when
 * both halves are on screen: with a single type ticked the whole list is that
 * type and the sentence would be noise.
 */
export function FilterGroup({ title, note, action, collapsible = true, defaultOpen = true, active = false, children }: {
  title?: string
  note?: string
  /** ⚠️ THE RIGHT HALF OF THE HEADING (2026-09-01, the owner's screenshots).
   *  „გასუფთავება" over the budget, „1 არჩეული" over the list: the one fact
   *  about a section you want without opening it, on the line that names it.
   *  It was a 6px green dot — a mark that says „something", never what. */
  action?: ReactNode
  /** ⚠️ THE TWO SECTIONS THE CANVAS DRAWS OPEN HAVE NO CHEVRON AT ALL. A
   *  disclosure control on a section that is always open is a control that
   *  cannot do anything; the rail keeps one for the tail sections (ენა,
   *  რეიტინგი, ქალაქი), which really do fold. */
  collapsible?: boolean
  /** ⚠️ COLLAPSED BY DEFAULT for the sections most people never touch. Six
   *  sections open at once made the rail 1230px — you scrolled the filters as
   *  far as the results, which is the opposite of comfortable. A section that
   *  already has something ticked always opens, so a refinement can never hide. */
  defaultOpen?: boolean
  active?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen || active)
  if (!title) return <div className="flex flex-col gap-1">{children}</div>
  const shown = collapsible ? open : true
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 min-h-8">
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            className="group flex flex-1 items-center gap-1.5 -mx-1.5 min-h-8 px-1.5 rounded-field text-left hover:bg-ink-50 transition-colors duration-fast"
          >
            <FilterLabel className="flex-1">{title}</FilterLabel>
            <Icon.chevD aria-hidden className={`w-3.5 h-3.5 text-ink-400 shrink-0 transition-transform duration-fast ${open ? 'rotate-180' : ''}`} />
          </button>
        ) : (
          <FilterLabel className="flex-1">{title}</FilterLabel>
        )}
        {action && <div className="shrink-0 text-meta text-ink-500">{action}</div>}
      </div>
      {shown && note && <p className="text-meta text-ink-400 mb-1 leading-snug">{note}</p>}
      {shown && children}
    </div>
  )
}

/**
 * A SECTION'S NAME — and it is NOT an `Eyebrow` any more (2026-09-01).
 *
 * The rail's headings were `uppercase`, which in Georgian is MTAVRULI: the live
 * rail read „ᲤᲐᲡᲘ" and „ᲔᲜᲐ". The owner's screenshots draw them in ordinary
 * mkhedruli, bold and grey — and mtavruli is a display alphabet Georgians do
 * not read in running interface text, so eleven-pixel tracked caps was the
 * least legible spelling of the least important word on the row. Same colour,
 * same weight, two pixels larger, in the alphabet the rest of the page uses.
 */
function FilterLabel({ className = '', children }: { className?: string; children: ReactNode }) {
  // `no-caps` because a collapsible section wraps this in a <button>, and the
  // two spellings would then disagree section by section — „ᲤᲐᲡᲘ" over the
  // budget, „სერვისი" over the list.
  return <span className={`no-caps font-display text-small font-bold text-ink-500 ${className}`}>{children}</span>
}

/**
 * THE TWO SIDES OF THE SITE, AS ONE CONTROL.
 *
 * Owner, 2026-09-01: „ჩვენ ხო გვაქვს ორი მთავარი კატეგორია — ვინც ადგილზე
 * მიდის და ვინც პროფესიოლია — და ეს მინდა იყოს გადამრთველი, რომ არევა არ
 * მოხდეს ამათი და კომფორტულად იყოს."
 *
 * ⚠️ IT IS NOT A FILTER, AND THAT IS WHY IT IS NOT A `FilterGroup`. The rail's
 * other sections narrow a list; this one says WHICH LIST. It was two stacked
 * blocks („პროფესიული სერვისები" over „ყოველდღიური სერვისები") and stacking is
 * what mixed them: both vocabularies on screen at once, counted by two
 * different queries, with a plumber and an accountant one scroll apart. One of
 * two is always chosen — there is no „ყველა", because „ყველა" is the state the
 * owner asked to end.
 *
 * ⚠️ AND IT IS OUTSIDE THE PANEL, so it survives `MobileCollapse`. The rail
 * folds behind a „ფილტრი" button below `lg`; the axis of the whole catalogue
 * cannot be a thing you have to open the filters to find.
 *
 * ⚠️ EVERY SEGMENT CARRIES ITS COUNT, including a zero. The everyday side has
 * nobody on it yet (measured 2026-09-01: 0 of 23) and the honest thing is to
 * say so on the control rather than behind it — a switch that hides an empty
 * side is a switch that lies about what the site has.
 */
export function FilterSwitch<T extends string>({ value, onChange, options, label }: {
  value: T
  onChange: (v: T) => void
  options: { id: T; label: string; count: number }[]
  /** What the group of buttons is, for a screen reader. */
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
      {options.map(o => {
        const on = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            className={`h-[52px] flex flex-col items-center justify-center gap-0.5 rounded-field border px-2 transition-[background-color,border-color] duration-fast ${
              on ? 'border-brand-700 bg-brand-50 text-brand-900'
                : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-ink-75'
            }`}
          >
            {/* ⚠️ THE COUNT UNDER THE WORD IS GONE (2026-09-02). Owner, holding a
                screenshot of this exact control: „ციფრები წავშალოთ ყველგან, ხო
                ვთქვით." It is the same claim the site stopped making that
                morning — the roster's size — and it was making it in the loudest
                place left: „პროფესიული 23 · ყოველდღიური 2" over the catalogue,
                where 2 is the first thing a visitor learns about half the site.

                The word stays MKHEDRULI and the plate stays 52px: the rail is
                264px, a segment 128px, its content 112px, and „ყოველდღიური" is
                99px at 13px bold mkhedruli against 108px in the mtavruli every
                button gets from globals.css. Caps plus one line truncates the
                longer name, and the one thing this control must never do is
                fail to say which side you are on. */}
            <span className="no-caps max-w-full truncate font-display text-small font-bold leading-none">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * THE FIELD OVER A LONG LIST.
 *
 * ⚠️ IT IS NOT THE PAGE'S SEARCH, and the difference matters enough to say on
 * the placeholder: the band at the top of /experts searches PEOPLE, this
 * narrows the OPTIONS in one section. Twenty professional categories is a list
 * you scan; it is not a list you read.
 */
export function FilterSearch({ value, onChange, placeholder }: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="relative">
      <Icon.search aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full h-10 pl-9 pr-3 rounded-field border border-ink-200 bg-ink-50 text-small text-ink-900
                   placeholder-ink-400 focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100
                   outline-none transition-colors duration-fast"
      />
    </div>
  )
}

/**
 * „კიდევ 5 სერვისი" — the rest of a capped list.
 *
 * ⚠️ IT SAYS HOW MANY, NEVER „მეტი". The list is capped so the rail does not
 * become the page; the reader is owed the size of what the cap is hiding, and a
 * number is also the only honest way to say „nothing is hidden" — the control
 * simply is not drawn.
 */
export function FilterMore({ n, more, onClick }: { n: number; more: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="no-caps mt-1 h-11 w-full rounded-field border border-ink-200 bg-white font-display text-small font-bold
                 text-ink-800 hover:border-ink-300 hover:bg-ink-50 transition-colors duration-fast"
    >
      {more ? `კიდევ ${n} სერვისი` : 'ნაკლები'}
    </button>
  )
}

/** The indent under a ticked parent row (/experts' topics). */
export function FilterNest({ children }: { children: ReactNode }) {
  return <div className="pl-6 flex flex-col gap-1">{children}</div>
}

/**
 * The panel itself: header, body, and the one way out.
 *
 * `reset` is only passed when there is something to clear — a permanently
 * visible „clear" on an unfiltered page is a control that does nothing, which
 * is how a rail teaches people to ignore it. It sits in the panel's own footer
 * strip, mirroring the header, so it reads as the panel's action rather than as
 * a stray link under the last row. Link on /experts (clearing is an address
 * there too), button on /experts.
 */
export function FilterPanel({ children, reset }: {
  children: ReactNode
  reset?: { href?: string; onClick?: () => void }
}) {
  const resetCls = 'text-small font-display font-semibold text-ink-600 hover:text-ink-900 underline underline-offset-2 transition-colors duration-fast'
  return (
    <Card as="nav" aria-label="ფილტრი" padding="none" className="overflow-hidden lg:sticky lg:top-24">
      <div className="px-4 py-3 border-b border-ink-100 bg-ink-50/40 flex items-center gap-2">
        <Icon.sliders aria-hidden className="w-4 h-4 text-brand-600 shrink-0" />
        <span className="font-display text-body font-bold text-ink-900">ფილტრი</span>
      </div>

      <div className="p-4 flex flex-col gap-5">{children}</div>

      {reset && (
        <div className="px-4 py-3 border-t border-ink-100 bg-ink-50/40">
          {reset.href
            ? <Link href={reset.href} className={resetCls}>ფილტრის მოხსნა</Link>
            : <button type="button" onClick={reset.onClick} className={resetCls}>ფილტრის მოხსნა</button>}
        </div>
      )}
    </Card>
  )
}
