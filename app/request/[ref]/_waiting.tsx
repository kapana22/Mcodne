// The client's page BEFORE anybody has answered — „ლოდინი".
//
// ⚠️ FROM THE OWNER'S DESIGN CANVAS (2026-09-01, „Request Room v2" → artboard
// 1). It replaces four stacked elements that used to open this page: the green
// summary band, the four-station status track, the „რა დაწერე" definition list
// and an EmptyState card reading „ჯერ არაფერია".
//
// WHY THAT IS A BETTER SCREEN AND NOT JUST A DIFFERENT ONE. A person waiting
// has exactly one question — „is anything happening" — and the old screen
// answered it four times in four grammars: a band whose h1 said „ჯერ
// შეთავაზება არ არის", a track whose second dot was ringed, a card of their own
// answers, and an empty state repeating the first line. The canvas answers it
// once, with the only element on the page that MOVES, and then shows them the
// one thing they might still want to check: what they actually asked for.
//
// ⚠️ THE CANVAS'S OWN SUB-LINE OPENS „პირველი პასუხი ჩვეულებრივ 3 საათში მოდის"
// AND THAT CLAUSE IS NOT HERE. Nothing on this platform measures a
// time-to-first-offer, so it would be a number invented on a drawing — CLAUDE.md
// „never invent a number", the rule that also took „22 სთ დარჩა" off the band
// this screen replaces. What survives is the half of the sentence that is a
// fact: we DO mail the client the moment an offer lands
// (lib/emailTemplates → offerArrivedClientEmail), so „გვერდი ღია არ უნდა
// გქონდეს" is a promise the system keeps.

import type { ReactNode } from 'react'
import { Card } from '@/components/Card'
import { Eyebrow } from '@/components/Eyebrow'

/** The three dots, staggered. `motion-safe:` because a vestibular reader gets
 *  a static cluster and loses nothing — the words carry the same fact. The
 *  delay is inline because Tailwind has no animation-delay utility and the
 *  motion scale is deliberately locked (tailwind.config.js); the ANIMATION
 *  still carries the variant, which is what the contract is about. */
const DOT_DELAYS = ['0ms', '200ms', '400ms']

export function WaitingRoom({
  statusWord, publicRef, description, brief, note, children,
}: {
  /** „აქტიური მოთხოვნა" — the client's word for the state, from the page. */
  statusWord: string
  /** MC-XXXXX. Kept on screen (small, `tabular-nums`) because it is how an
   *  operator finds this row when the client reads it down a phone; the canvas
   *  prints it the same way on its provider artboard. */
  publicRef: string
  description: string | null
  /** The brief as chips — the same answers the definition list used to spell
   *  out with their labels. A label per value is what made that list four rows
   *  of „ბიუჯეტი: 200–500₾"; the values alone read in one pass. */
  brief: string[]
  /** Where the request actually stands, in the words this page already used
   *  for it. It is the half of the old status track worth keeping: NEW and
   *  VERIFIED look identical on this screen and mean different things. */
  note: string
  /** The thread with us, and the way out. Both are the page's, not this
   *  component's — see app/request/[ref]/page.tsx. */
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <span
        aria-hidden
        className="inline-flex h-[88px] w-[88px] items-center justify-center gap-1.5 rounded-pill border border-brand-100 bg-brand-50"
      >
        {DOT_DELAYS.map(d => (
          <span
            key={d}
            style={{ animationDelay: d }}
            className="h-[9px] w-[9px] rounded-pill bg-brand-700 motion-safe:animate-pulse-soft"
          />
        ))}
      </span>

      <div>
        <h1 className="font-display text-h1 font-extrabold leading-tight tracking-[-0.025em] text-balance sm:text-display">
          ვეძებთ შენთვის ექსპერტს
        </h1>
        <p className="mt-3.5 text-body-lg leading-relaxed text-ink-600">
          {note} შეტყობინებას გამოგიგზავნით — გვერდი ღია არ უნდა გქონდეს.
        </p>
      </div>

      <Card edge="hairline" className="w-full text-left">
        <div className="flex items-center justify-between gap-3">
          <Eyebrow tone="muted">შენი მოთხოვნა</Eyebrow>
          <span className="text-meta tabular-nums text-ink-400">{statusWord} · {publicRef}</span>
        </div>
        {description && (
          <p className="mt-2.5 whitespace-pre-wrap text-body-lg leading-relaxed text-ink-700">{description}</p>
        )}
        {brief.length > 0 && (
          <div className="mt-3.5 flex flex-wrap gap-2">
            {brief.map(b => (
              <span
                key={b}
                className="inline-flex h-[30px] items-center whitespace-nowrap rounded-pill border border-ink-200 bg-ink-75 px-3 text-small text-ink-600"
              >
                {b}
              </span>
            ))}
          </div>
        )}
      </Card>

      <div className="w-full text-left">{children}</div>
    </div>
  )
}
