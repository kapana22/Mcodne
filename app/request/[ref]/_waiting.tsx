// The client's page BEFORE anybody has answered.
//
// ⚠️ REDRAWN FROM THE OWNER'S CANVAS „კლიენტის მოთხოვნის ოთახი" (2026-09-04),
// which supersedes „Request Room v2" for this screen. What it replaced there:
// three pulsing dots, the headline „ვეძებთ შენთვის ექსპერტს", and a card
// repeating what the client had just typed.
//
// WHY THAT SCREEN HAD TO GO. It is the screen that decides whether a client
// comes back, and every element on it was about US: a spinner written in words,
// a promise to search, and their own answers read back to them. It gave a
// person with nothing to do nothing to do. Measured the day this was written:
// 8 requests sat VERIFIED with offers still open.
//
// WHAT REPLACES IT, AND WHY EACH PART IS HONEST:
//
//   · „N ექსპერტს გაეგზავნა" — a COUNTED number, not an estimate.
//     `requestNotifiedCount` (lib/requestLive) counts the Notification rows
//     lib/requestJobs actually wrote, so it can never claim somebody was told
//     who was not. This is deliberately not „17 people viewed your request",
//     which is the number the competitor's screen prints and which nothing here
//     measures.
//   · The people they can write to FIRST. `suggestedProfiles` already existed
//     and already served this list through /api/requests/[ref]/status — nothing
//     drew it. Every headline on it is the provider's own, from the database.
//   · No stars and no review counts anywhere. Measured 2026-09-04: 0 ratings
//     and 0 reviews exist. Owner: „ჯერ რაც არ გვაქვს არ გვინდა." A row of empty
//     stars is a display of what we lack, on the exact screen where a client
//     decides whether to trust somebody.
//
// ⚠️ NO TIME PROMISE. The canvas's own sub-line said a first answer usually
// arrives in a few hours; nothing on this platform measures a
// time-to-first-offer, so it would be a number invented on a drawing —
// CLAUDE.md rule 6, the same rule that took „22 სთ დარჩა" off the band this
// screen's predecessor replaced. What survives is the half that IS a fact: an
// offer landing does mail and text the client (lib/emailTemplates,
// lib/smsTemplates), so „გვერდი ღია არ უნდა გქონდეს" is a promise kept.

import type { ReactNode } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/Icon'
import { Avatar } from '@/components/Avatar'

export type SuggestedExpert = {
  id: string
  href: string
  name: string
  headline: string | null
  verified: boolean
  /** „80₾-დან", or null when they have not priced anything. Never invented. */
  priceFrom: number | null
  avatar: string | null
}

export function WaitingRoom({ notified, note, brief, suggested, children }: {
  /** How many providers were actually told. 0 is a real answer and gets its
   *  own sentence rather than „0 ექსპერტს გაეგზავნა". */
  notified: number
  /** Where the request stands, in the words the loader chose for it. NEW and
   *  VERIFIED look identical on this screen and mean different things. */
  note: string
  /** What the client actually asked for, minus whatever the band above already
   *  says — the budget, the deadline, the clarifying answers. It is the half of
   *  the old „შენი მოთხოვნა" card that carried information rather than
   *  repeating the headline, and losing it in the redraw would have been a
   *  screen that looks better and tells them less. */
  brief: string[]
  suggested: SuggestedExpert[]
  /** The way out — the cancel control, which belongs to the page. */
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <span
          aria-hidden
          className="mx-auto mb-3.5 inline-flex h-14 w-14 items-center justify-center rounded-pill bg-brand-50"
        >
          <Icon.send className="h-6 w-6 text-brand-600" />
        </span>
        <h2 className="font-display text-h2 font-bold tracking-[-0.01em] text-ink-900">
          {notified > 0 ? `გაეგზავნა ${notified} ექსპერტს` : 'მოთხოვნა მიღებულია'}
        </h2>
        <p className="mx-auto mt-2 max-w-[290px] text-body leading-relaxed text-ink-600 text-balance">
          {note} შეტყობინებას გამოგიგზავნით — გვერდი ღია არ უნდა გქონდეს.
        </p>
      </div>

      {brief.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
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

      {/* ── The one thing they can DO while waiting ──────────────────────────
          ⚠️ IT IS NOT A CATALOGUE AND MUST NOT BECOME ONE. Six at most, in the
          client's own sphere, with a way to open a conversation — the point is
          that the wait has an exit, not that the site has a directory. When the
          request carries no category (every service request does not — see
          lib/requestLive) the list is empty and this whole block is absent
          rather than drawn as a hole. */}
      {suggested.length > 0 && (
        <div>
          <div className="border-t border-ink-100 pt-5">
            <h3 className="font-display text-h3 font-bold tracking-[-0.01em] text-ink-900">
              შესაფერისი ექსპერტები
            </h3>
            <p className="mt-1 text-small text-ink-500">
              შეგიძლია თვითონ მისწერო, პასუხს რომ არ დაელოდო.
            </p>
          </div>

          <ul className="mt-3 flex flex-col gap-2">
            {suggested.map(e => (
              <li
                key={e.id}
                className="flex items-center gap-3 rounded-card border border-ink-200 bg-white p-3.5"
              >
                <Avatar src={e.avatar ?? undefined} name={e.name} size={48} />
                <div className="min-w-0 flex-grow">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-display text-body font-bold text-ink-900">{e.name}</span>
                    {/* The one badge that is true for somebody today — 1 of 28
                        profiles carries it. Absence draws nothing and is not a
                        negative. */}
                    {e.verified && <Icon.check aria-hidden className="h-3.5 w-3.5 shrink-0 text-brand-600" />}
                  </div>
                  {e.headline && (
                    <div className="truncate text-meta text-ink-400">{e.headline}</div>
                  )}
                  {e.priceFrom !== null && (
                    <div className="mt-0.5 text-meta font-semibold text-brand-700">{e.priceFrom}₾-დან</div>
                  )}
                </div>
                {/* ⚠️ IT OPENS THE PROFILE, IT DOES NOT START A THREAD FROM
                    HERE. „მიწერა" on this screen would have to mint an INVITED
                    offer, and that is a real row with a real cost to the person
                    on the other end — it belongs behind the profile, where the
                    client can see who they are writing to first. h-11 = 44px. */}
                <Link
                  href={e.href}
                  className="inline-flex h-11 shrink-0 items-center rounded-btn border border-brand-200 bg-brand-50 px-4 font-display text-small font-semibold text-brand-700 transition-colors duration-fast hover:bg-brand-100"
                >
                  ნახვა
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {children && <div className="text-left">{children}</div>}
    </div>
  )
}
