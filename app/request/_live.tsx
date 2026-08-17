'use client'
// THE SCREEN AFTER SEND — alive, and true.
//
// ⚠️ THE REQUEST THIS ANSWERS, AND THE ONE THING IT DOES NOT DO. Owner,
// 2026-08-17: „როცა რექვესთი გავაგზავნეთ უკვე უნდა ჩანდეს რომ ვიღაცები
// ნახულობენ, ანიმაცია უნდა იყოს და დაელოდეთ შეთავაზებებს."
//
// Everything in that sentence is built here except the literal reading of
// „ვიღაცები ნახულობენ", and the reason is arithmetic rather than taste: at the
// moment somebody presses send, the request is NEW. No provider has been told
// it exists. None will be until an operator phones the client and marks it
// verified — that call is the platform's quality gate and the whole reason its
// leads are worth answering. So the number of people looking at it is exactly
// ZERO, and a screen that animates „3 ექსპერტი ათვალიერებს" over that zero is
// the „3 people are viewing this room" pattern. It is worse here than on a
// hotel site: this person is being asked to WAIT on the strength of it, and
// what they are waiting for is a phone call we would have just lied about. The
// first thing they learn about us would be something they can catch us in.
//
// What replaced it is not a consolation prize — it is a better screen, because
// every line on it survives being checked:
//   · the request MOVES, visibly, through the four stations it really has, and
//     the live one pulses — so „something is happening" is the truth being
//     animated rather than a decoration over a still frame
//   · „ამ სფეროში N ექსპერტია" is a count from the catalogue and is true the
//     instant the row is written, which is what makes it worth showing on the
//     screen where nothing has happened yet
//   · „N ექსპერტს ვაცნობეთ" appears only once we actually have, and then it is
//     the real audience
//   · an offer arriving changes the number under the reader's eyes
// See app/api/requests/[ref]/status for the counting.
//
// ⚠️ NO NEW ANIMATION TOKENS. `pulse-soft` (the ambient loop) and `fade-in-fast`
// are what the site already has; the canon closed that library at eight and
// says to prefer removing motion to adding it. Both are motion-safe gated.

import { useCallback, useEffect, useState } from 'react'
import { Btn } from '@/components/Btn'
import { Card } from '@/components/Card'
import { REQUEST_STATIONS, stationsReached } from '@/lib/requests'

type Live = {
  status: string
  offerCount: number
  offerLimit: number
  notified: number
  expertsInField: number
}

/** Slow: the things this reports change on a human's timescale — an operator
 *  picking up a phone, a provider writing an offer. A tighter loop would be a
 *  request every few seconds to watch a number that moves twice an hour. */
const POLL_MS = 20_000

export function LiveStatus({ publicRef }: { publicRef: string }) {
  const [d, setD] = useState<Live | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/requests/${encodeURIComponent(publicRef)}/status`, { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (r.ok && j.ok) setD(j)
    } catch { /* a failed poll is a poll that tries again */ }
  }, [publicRef])

  useEffect(() => {
    load()
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [load])

  // Until the first answer arrives there is nothing true to draw. A skeleton
  // here would be motion standing in for information we do not have yet.
  if (!d) return null

  // Exits, not stations — a track would draw progress going nowhere.
  if (d.status === 'REJECTED' || d.status === 'CLOSED') return null

  const reached = stationsReached(d.status)
  const hasOffers = d.offerCount > 0

  return (
    // The primitive, not a hand-rolled shell — tests/primitiveAdoption ratchets
    // the count of those downwards and caught this one on the way in.
    <Card>
      <ol className="flex items-center gap-0" aria-label="სტატუსი">
        {REQUEST_STATIONS.map((label, i) => {
          const done = i < reached - 1
          const current = i === reached - 1
          return (
            <li key={label} className="flex items-center flex-1 last:flex-none min-w-0">
              <span className="flex flex-col items-center gap-1.5 shrink-0">
                <span className="relative inline-flex">
                  {/* ⚠️ THE PULSE IS ON THE STATION THAT IS HAPPENING, and it is
                      the only moving thing on the screen. It animates a fact —
                      „this step is in progress" — rather than decorating a
                      still one. A ring behind the dot, so nothing reflows. */}
                  {current && (
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-full bg-brand-200 motion-safe:animate-pulse-soft"
                    />
                  )}
                  <span
                    className={`relative w-7 h-7 rounded-full border-2 inline-flex items-center justify-center text-meta font-bold ${
                      done
                        ? 'bg-brand-600 border-brand-600 text-white'
                        : current
                          ? 'border-brand-600 text-brand-700 bg-white'
                          : 'border-ink-200 text-ink-400 bg-white'
                    }`}
                  >
                    {done ? '✓' : i + 1}
                  </span>
                </span>
                <span className={`text-meta text-center ${current ? 'text-ink-900 font-semibold' : 'text-ink-500'}`}>
                  {label}
                </span>
              </span>
              {i < REQUEST_STATIONS.length - 1 && (
                <span className={`h-0.5 flex-1 mx-1.5 -mt-5 rounded-pill ${done ? 'bg-brand-600' : 'bg-ink-200'}`} />
              )}
            </li>
          )
        })}
      </ol>

      <div className="mt-5 pt-4 border-t border-ink-100">
        {hasOffers ? (
          // The number that changed while they were looking at it. Keyed so it
          // re-enters when it moves — the one place a count appearing IS news.
          <div key={d.offerCount} className="motion-safe:animate-fade-in-fast">
            <p className="text-body text-ink-900">
              <span className="font-display font-bold">{d.offerCount}</span> შეთავაზება მოვიდა.
            </p>
            <div className="mt-3">
              <Btn href={`/request/${publicRef}`} size="sm">შეთავაზებების ნახვა</Btn>
            </div>
          </div>
        ) : (
          <>
            {/* The line the owner asked for, and the only promise on the screen
                — it is what the platform actually does next. */}
            <p className="text-body text-ink-900">დაელოდე შეთავაზებებს.</p>
            <p className="mt-1.5 text-small text-ink-600">
              {d.notified > 0
                // Past tense, because it happened. This appears the moment
                // routing runs and not one second earlier.
                ? `${d.notified} ექსპერტს ვაცნობეთ.`
                : d.expertsInField > 0
                  // True from the instant the row is written — and deliberately
                  // NOT phrased as anybody looking at anything.
                  ? `ამ სფეროში ${d.expertsInField} ექსპერტია. ჯერ გადავამოწმებთ და დაგირეკავთ.`
                  : 'ჯერ გადავამოწმებთ და დაგირეკავთ.'}
            </p>
          </>
        )}
      </div>
    </Card>
  )
}
