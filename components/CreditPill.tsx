'use client'
// THE BALANCE, IN THE BAR.
//
// ⚠️ WHY IT LEFT THE HOME SCREEN (2026-08-21). The balance shipped as one card
// on /work and nowhere else, on the argument that „a balance beside the work is
// a reason to finish the profile" (app/work/_components/CreditStrip). The
// argument was right about WHERE it is spent and wrong about where it is SEEN:
// /work is one screen out of forty, and a provider spends most of their session
// on the catalogue, their own public page and the queue. Owner, looking at the
// signed-in cluster: „აქ უნდა ჩანდეს ლამაზად."
//
// The strip stays — it is the thing that explains the number and carries the
// next task. This is the READOUT: small, always there, and a way back to the
// screen that explains it.
//
// ⚠️ IT IS A STATUS, NOT A CONTROL, and that decides every choice below. It is
// 40px tall so it lines up with the icon buttons beside it, quiet rather than
// filled (`bg-brand-50 / text-brand-800` — the exact pair this bar already uses
// for an active nav item), and it never carries a badge or a dot: nothing about
// a balance is urgent, and a red count on money reads as a debt.
//
// ⚠️ AND IT MAY NEVER READ AS CASH. „ბალანსი", never „ანაზღაურება", never „შენი
// ფული" — the wording rules at the top of lib/credits, which exist because this
// balance buys exactly one thing and cannot be withdrawn.
import Link from 'next/link'
import { gelLabel } from '@/lib/credits'

export function CreditPill({ tetri, className = '' }: {
  /** The balance in tetri. Render nothing when it is unknown — a provider whose
   *  identity has not loaded yet must not flash „0₾" and then correct itself. */
  tetri: number | null | undefined
  className?: string
}) {
  if (tetri == null) return null
  const label = gelLabel(tetri)
  return (
    <Link
      href="/work"
      // The full sentence for a screen reader; the pill itself is two glyphs and
      // „80₾" alone says nothing about what it is.
      aria-label={`ბალანსი — ${label}`}
      title="ბალანსი"
      // ⚠️ ONE COLOUR FAMILY, AND THAT IS THE WHOLE FIX (2026-08-21). Owner:
      // „ეს უფრო ლამაზად რომ იყოს შეიძლება." The pill was a mint fill carrying
      // a WARM GREY word (`text-ink-600`) — cool tint under warm neutral, two
      // families inside one 40px chip, which is what read as muddy rather than
      // as hierarchy. The label is now brand-toned like everything else in it,
      // so the chip is one object and the contrast between its halves comes
      // from WEIGHT, which is what hierarchy is supposed to come from.
      //
      // ⚠️ `rounded-pill`, NOT `rounded-btn`. The note above says this is a
      // status and not a control, and then it was shaped exactly like the icon
      // buttons beside it (`w-10 h-10 rounded-btn`, PublicTopBar). A capsule is
      // the shape the whole system already uses for a badge; it tells the eye
      // „read this" in the one cluster where everything else is pressed.
      //
      // ⚠️ `ring-inset`, NOT `border` — DELIBERATELY, and it is the 390px row.
      // PublicTopBar measures that cluster to the pixel („four 40px controls +
      // three 8px gaps"); a border would widen this by 2px and `px-3.5` by 4
      // more, which is real money in a budget with ~110px left for the logo. An
      // inset ring draws the same hairline and occupies no width at all.
      className={`h-10 px-3 rounded-pill bg-brand-50 ring-1 ring-inset ring-brand-100 text-brand-900 hover:bg-brand-100 hover:ring-brand-200 inline-flex items-center gap-1.5 font-display text-small font-semibold tabular-nums transition-colors duration-fast ${className}`}
    >
      {/* The word, on the sizes that have room for it. Without it the number is
          a mystery on first sight; with it the pill is self-explanatory and
          still narrower than the avatar beside it.
          ⚠️ brand-700 IS THE FLOOR HERE, not a preference. Measured on the
          brand-50 fill this sits on: brand-700 (#1E6656) is 6.20:1 and passes,
          brand-600 (#26806E) is 4.36:1 and FAILS the 4.5:1 body-text rule — so
          the obvious „one step lighter for a quieter label" is the one step
          that cannot be taken. Quiet comes from `font-normal` instead. */}
      <span className="hidden xl:inline font-normal text-brand-700">ბალანსი</span>
      {label}
    </Link>
  )
}
