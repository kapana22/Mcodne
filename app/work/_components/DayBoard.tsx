// THE PROVIDER'S DAY, IN FOUR QUESTIONS.
//
// ⚠️ WHAT THIS REPLACED, AND WHY (2026-08-20). `/work` was a SESSION dashboard:
// today's lesson, the month's calendar, how many free minutes had been
// published. It was the right screen for the tutoring site this one started as,
// and by the day it was replaced the numbers had left it behind — 0 active
// bookings, 6050 published slots, and the request flow opened almost twice as
// often as the booking flow (366 vs 198). A home screen measuring the half that
// is not happening tells its owner their business is empty.
//
// Worse, a WORK-only provider had no home at all: `/work` sat inside the
// (expert) route group, so they were redirected straight into the queue.
//
// The four questions are the provider's actual day, in the order they are
// asked: what came in · what am I waiting on · what is in my hands · who is
// writing to me. A consultation holder gets their sessions as a FIFTH block
// below, not as the frame around everything else.
import Link from 'next/link'
import { Card } from '@/components/Card'
import { Icon } from '@/components/Icon'

export type BoardCell = {
  href: string
  label: string
  n: number
  /** Said under the number when there is nothing — „ok" reads better than „0". */
  quiet: string
  icon: keyof typeof ICONS
  /** Draws the count in brand rather than ink: something is waiting for them. */
  urgent?: boolean
}

const ICONS = {
  list: Icon.list,
  send: Icon.send,
  calendar: Icon.calendar,
  chat: Icon.chat,
} as const

export function DayBoard({ cells }: { cells: BoardCell[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cells.map(c => {
        const I = ICONS[c.icon]
        return (
          <Card key={c.href} as={Link} href={c.href} interactive className="block hover-lift">
            <span className="flex items-center gap-2 text-meta text-ink-500">
              <I className="w-4 h-4 text-ink-400 shrink-0" />
              {c.label}
            </span>
            {/* The number is the whole cell. A zero is not a failure and is not
                drawn as one — it takes the muted weight and says what it means
                in words underneath, because „0" alone reads as broken. */}
            <span className={`mt-2 block font-display text-display font-bold tabular-nums leading-none ${
              c.n === 0 ? 'text-ink-300' : c.urgent ? 'text-brand-700' : 'text-ink-900'
            }`}>
              {c.n}
            </span>
            <span className="mt-1 block text-meta text-ink-500">{c.n === 0 ? c.quiet : ' '}</span>
          </Card>
        )
      })}
    </div>
  )
}
