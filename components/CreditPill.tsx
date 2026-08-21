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
      className={`h-10 px-3 rounded-btn bg-brand-50 text-brand-800 hover:bg-brand-100 inline-flex items-center gap-1.5 font-display text-small font-semibold tabular-nums transition-colors duration-fast ${className}`}
    >
      {/* The word, on the sizes that have room for it. Without it the number is
          a mystery on first sight; with it the pill is self-explanatory and
          still narrower than the avatar beside it. */}
      <span className="hidden xl:inline font-normal text-ink-600">ბალანსი</span>
      {label}
    </Link>
  )
}
