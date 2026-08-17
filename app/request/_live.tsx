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
import Link from 'next/link'
import { Btn } from '@/components/Btn'
import { Card } from '@/components/Card'
import { REQUEST_STATIONS, stationsReached } from '@/lib/requests'

type Expert = {
  id: string
  href: string
  name: string
  headline: string | null
  verified: boolean
  rating: number | null
  avatar: string | null
}

type Live = {
  status: string
  offerCount: number
  offerLimit: number
  notified: number
  expertsInField: number
  experts: Expert[]
}

/** Slow: the things this reports change on a human's timescale — an operator
 *  picking up a phone, a provider writing an offer. A tighter loop would be a
 *  request every few seconds to watch a number that moves twice an hour. */
const POLL_MS = 20_000

export function LiveStatus({ publicRef }: { publicRef: string }) {
  const [d, setD] = useState<Live | null>(null)
  /** Which expert's thread is being opened right now — the id, so only that
   *  one row shows it happening. */
  const [writing, setWriting] = useState<string | null>(null)
  const [writeError, setWriteError] = useState<string | null>(null)

  /**
   * Start a conversation with an expert who has not answered.
   *
   * ⚠️ IT RELOADS THE PAGE RATHER THAN OPENING A PANE HERE. The thread belongs
   * beside the other conversations on this request — a chat floating inside the
   * waiting panel would be a second place to look for messages, and the client
   * would lose it the moment the panel re-renders on its 20-second poll.
   */
  const write = async (expertUserId: string) => {
    if (writing) return
    setWriting(expertUserId)
    setWriteError(null)
    try {
      const r = await fetch(`/api/requests/${encodeURIComponent(publicRef)}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expertUserId }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) {
        setWriteError(j?.error === 'RATE_LIMITED'
          ? 'ძალიან ბევრი მიმოწერა — სცადე ცოტა ხანში.'
          : 'ვერ გაიხსნა — სცადე თავიდან.')
        return
      }
      // The server render is what lists the threads, so it has to run again.
      window.location.reload()
    } catch {
      setWriteError('ვერ გაიხსნა — სცადე თავიდან.')
    } finally {
      setWriting(null)
    }
  }

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

      {/* ── The second route, as faces ────────────────────────────────────
          Owner, 2026-08-17: „ექსპერტების ქარდებიც უნდა ჩანდეს — ექსპერტიც
          უნდა ნახოს." Waiting for offers is one way to be helped; the other is
          going and picking somebody, and until now that was a LINK to a
          filtered list. A link is a decision to make later; a name and a face
          is one you can make now.

          Only while there is still something to wait for: once an offer has
          arrived, the offers ARE the answer and a row of other people beside
          them is a second decision nobody asked for. */}
      {!hasOffers && d.experts.length > 0 && (
        <div className="mt-5 pt-4 border-t border-ink-100">
          <p className="text-small text-ink-600">ან თავად აირჩიე — ამ სფეროს ექსპერტები:</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {d.experts.map(e => (
              // ⚠️ TWO ACTIONS ON ONE ROW, and they are different decisions.
              // The row itself opens the PROFILE — a name and one line is not
              // enough to decide anything on, so reading comes first. „მიმოწერა"
              // starts a conversation without reading, for the person who
              // already knows what they want (2026-08-18).
              //
              // The button is a SIBLING of the link and not nested inside it: a
              // <button> inside an <a> is invalid HTML, and the browsers that
              // tolerate it fire both on one tap.
              <div key={e.id} className="flex items-stretch gap-2">
              <Link
                href={e.href}
                // ⚠️ NO `bg-white` HERE, and it is not an oversight. These rows
                // sit inside the surrounding <Card>, which already paints
                // white, so the class was a no-op that read to
                // tests/primitiveAdoption as a 202nd hand-built card shell —
                // the ratchet that may only ever fall. The row is a compact
                // list item, not a card, and none of <Card>'s padding tiers is
                // this tight (p-4 is the smallest; this is px-3 py-2.5).
                className="group flex-1 min-w-0 flex items-center gap-3 rounded-card border border-ink-200 px-3 py-2.5 hover:border-ink-300 hover:bg-ink-50 motion-safe:active:scale-[0.99] transition-[background-color,border-color,transform] duration-fast"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- the
                    src is /api/avatars/<id>, already the cached indirection
                    lib/avatarSrc exists to produce; next/image would add a
                    second optimiser hop over an image that is 40px wide. */}
                {e.avatar ? (
                  <img src={e.avatar} alt="" width={40} height={40} className="w-10 h-10 rounded-full object-cover shrink-0" />
                ) : (
                  <span aria-hidden className="w-10 h-10 rounded-full bg-ink-100 text-ink-500 inline-flex items-center justify-center font-display text-body font-bold shrink-0">
                    {e.name.trim().charAt(0)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="font-display text-small font-semibold text-ink-900 truncate">{e.name}</span>
                    {e.verified && <span aria-label="დადასტურებული" className="text-brand-700 shrink-0">✓</span>}
                  </span>
                  {e.headline && <span className="block text-meta text-ink-500 truncate">{e.headline}</span>}
                </span>
                {e.rating ? (
                  <span className="text-meta text-ink-600 tabular-nums shrink-0">{e.rating.toFixed(1)}</span>
                ) : null}
              </Link>

              <button
                type="button"
                disabled={writing !== null}
                aria-busy={writing === e.id}
                onClick={() => write(e.id)}
                className="shrink-0 px-3 rounded-card border border-brand-600 text-brand-700 font-display text-small font-semibold hover:bg-brand-50 disabled:opacity-50 motion-safe:active:scale-[0.97] transition-[background-color,transform] duration-fast"
              >
                {writing === e.id ? '…' : 'მიმოწერა'}
              </button>
              </div>
            ))}
          </div>
          {writeError && (
            <p role="alert" className="mt-2 text-small text-danger-700">{writeError}</p>
          )}
        </div>
      )}
    </Card>
  )
}
