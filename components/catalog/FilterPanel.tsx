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
import { Eyebrow } from '@/components/Eyebrow'
import { Icon } from '@/components/Icon'

/** The shared row geometry — 36px line, full-width target, 18px drawn box. */
// ⚠ min-h, NOT h. The masters' trade names are two words and fit; the expert
// categories („ბიზნესი და სტრატეგია“) do not, and a truncated row is a filter
// nobody can read - the one thing a rail must never do. A wrapped label grows
// the row; 36px stays the floor, so the tap target never shrinks.
const ROW = 'group flex items-start gap-2.5 min-h-9 py-1.5 -mx-1.5 px-1.5 rounded-field transition-colors duration-fast'

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
 * ⚠️ h-9 IS THE ROW, NOT THE BOX. The whole 36px line is the target and it
 * spans the panel's full width — which is what makes a narrow rail comfortable
 * on a thumb even though the box itself is 18px.
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
  const tone = empty && !on ? 'text-ink-400' : 'text-ink-800'
  const inner = (
    <>
      <span
        aria-hidden
        className={`w-[18px] h-[18px] rounded-[5px] border inline-flex items-center justify-center shrink-0 transition-colors duration-fast ${
          on
            ? 'border-brand-600 bg-brand-600 text-white'
            : 'border-ink-300 bg-white group-hover:border-ink-400'
        }`}
      >
        {on && <Icon.check className="w-3 h-3" />}
      </span>
      <span className="min-w-0 flex-1 text-small font-display font-medium leading-snug">{label}</span>
      {/* tabular-nums so the counts form a straight right edge down the column
          — the whole reason for a list rather than a cloud. */}
      {typeof count === 'number' && (
        <span className="shrink-0 text-meta text-ink-400 tabular-nums">{count}</span>
      )}
    </>
  )
  return href ? (
    <Link href={href} role="checkbox" aria-checked={on} className={`${ROW} ${tone} hover:bg-ink-50`}>
      {inner}
    </Link>
  ) : (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onClick}
      disabled={disabled}
      className={`${ROW} w-full text-left ${tone} ${disabled ? 'opacity-45 cursor-not-allowed' : 'hover:bg-ink-50'}`}
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
export function FilterGroup({ title, note, defaultOpen = true, active = false, children }: {
  title?: string
  note?: string
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
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="group flex items-center gap-1.5 h-9 -mx-1.5 px-1.5 rounded-field text-left hover:bg-ink-50 transition-colors duration-fast"
      >
        <Eyebrow tone="muted" className="flex-1">{title}</Eyebrow>
        {active && !open && <span aria-hidden className="w-1.5 h-1.5 rounded-pill bg-brand-600 shrink-0" />}
        <Icon.chevD aria-hidden className={`w-3.5 h-3.5 text-ink-400 shrink-0 transition-transform duration-fast ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && note && <p className="text-meta text-ink-400 mb-1 leading-snug">{note}</p>}
      {open && children}
    </div>
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
