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
// ⚠️ NO NEW ANIMATION TOKENS. `pulse-soft` (the ambient loop), `fade-in-fast`
// and `fade-in` are what the site already has; the canon closed that library
// at eight and says to prefer removing motion to adding it. All motion-safe
// gated, and every animated state also carries a WORD — a station label, a
// count — so the frozen version still reads (canon: a spinner is not a state).
//
// ── LIVE, NOT POLLED (stage 10) ─────────────────────────────────────────────
// Owner: „ფორმა გაიგზავნა → ფანჯარა ღია რჩება → ანიმაცია აჩვენებს რომ
// მუშავდება → პასუხები სათითაოდ მოდის, ჩვეულებრივი ჩატივით." The panel now
// listens to /api/requests/[ref]/events (lib/requestLiveClient — one stream
// per room, shared with the threads) and repaints the moment the request
// moves; the 20-second poll below is the FALLBACK, run only while the stream
// reports itself down. Same payload either way — lib/requestLive builds it
// for both routes.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Btn } from '@/components/Btn'
import { Card } from '@/components/Card'
import { REQUEST_STATIONS, stationsReached } from '@/lib/requests'
import { subscribeRequestLive, type LiveState } from '@/lib/requestLiveClient'

/**
 * THE SEARCH, SAID OUT LOUD.
 *
 * One moving thing (the ring, on the ambient `pulse-soft` the site already
 * owns — the canon closed the animation library at eight) and, beside it, a
 * WORD. With motion removed the sentence still states the state, which is the
 * same rule that forbids a bare spinner anywhere on this site.
 *
 * It says „ვეძებთ", present tense, because that is what is happening: the
 * request is stored and routing is picking the experts to notify. It does NOT
 * say anybody is looking at it — see the note at the top of this file for why
 * that number is zero at this moment and why inventing it would be the one lie
 * the client could catch us in.
 */
const SearchingLine = () => (
  <p className="flex items-center gap-2.5 text-body text-ink-900">
    <span aria-hidden className="relative inline-flex w-2.5 h-2.5 shrink-0">
      <span className="absolute inset-0 rounded-full bg-brand-200 motion-safe:animate-pulse-soft" />
      <span className="relative w-2.5 h-2.5 rounded-full bg-brand-600" />
    </span>
    <span className="font-display font-semibold">ვეძებთ შესაფერის ექსპერტებს…</span>
  </p>
)

/** The same line, holding the card's place until the first status arrives. */
const Searching = () => (
  <Card>
    <SearchingLine />
    {/* The receipt, in the same breath as the search — „it is saved" is the
        half of the message that stops the screen reading as a loss. */}
    <p className="mt-1.5 text-small text-ink-600">მოთხოვნა შენახულია. ამ გვერდს ნუ დახურავ — პასუხები აქვე გამოჩნდება.</p>
  </Card>
)

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
  /** 'OFFERS' | 'SELF' — what this person asked for in the wizard. */
  pickMode: string
  offerCount: number
  offerLimit: number
  notified: number
  expertsInField: number
  experts: Expert[]
  /** Set only while this request belongs to ONE named provider — see
   *  lib/requestLive → DIRECT_WINDOW_MS. */
  addressedTo: { name: string; waitingSince: string; overdue: boolean } | null
}

/** The FALLBACK cadence, when there is no stream. Slow on purpose: a poll is
 *  a request every N seconds to watch a number that moves twice an hour, and
 *  ./status is rate-limited per IP. With the stream up this timer never runs. */
const POLL_MS = 20_000

/**
 * „გავხსნა სხვებისთვის?" — the one control that widens an addressed request.
 *
 * ⚠️ IT EXISTS SO THAT NOTHING AUTOMATIC HAS TO. The alternative was a timer
 * that opens the request itself after 24 hours, and that publishes a private
 * choice to strangers without the client pressing anything — they would find
 * out by receiving quotes they never asked for, most likely by email, which is
 * the only channel this platform has (see the `email` note in lib/requests: no
 * SMS exists anywhere in the codebase). A delay is a smaller harm than a
 * surprise.
 *
 * The wording asks rather than warns, and the confirmation says what actually
 * changes — two more places, not „we gave up on them". The chosen provider
 * keeps their thread and their place through all of it.
 */
function OpenToOthers({ publicRef }: { publicRef: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'failed'>('idle')
  if (state === 'done') {
    return <p className="mt-3 text-small text-ink-600">გახსნილია — სხვებსაც შეუძლიათ შემოგთავაზონ.</p>
  }
  return (
    <div className="mt-3">
      <Btn
        size="sm"
        variant="secondary"
        disabled={state === 'sending'}
        onClick={async () => {
          setState('sending')
          try {
            const r = await fetch(`/api/requests/${publicRef}/open`, { method: 'POST' })
            setState(r.ok ? 'done' : 'failed')
          } catch { setState('failed') }
        }}
      >
        {state === 'sending' ? 'იხსნება…' : 'გავხსნა სხვებისთვის?'}
      </Btn>
      {state === 'failed' && (
        <p className="mt-2 text-small text-danger-700">ვერ მოხერხდა — სცადე ხელახლა.</p>
      )}
    </div>
  )
}

export function LiveStatus({ publicRef }: { publicRef: string }) {
  const [d, setD] = useState<Live | null>(null)
  /** 'open' = events are flowing; 'down' = poll. See lib/requestLiveClient. */
  const [live, setLive] = useState<LiveState>('down')
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
   * would lose it the moment the panel repaints on the next event.
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

  // The stream: the payload arrives as an event, the same shape ./status
  // answers with. Subscribed for the life of the panel.
  useEffect(() => subscribeRequestLive(publicRef, {
    onStatus: p => {
      const j = p as (Live & { ok?: boolean }) | null
      if (j && j.ok) setD(j)
    },
    onState: setLive,
  }), [publicRef])

  // The fallback: only while the stream is down. Loads at once — a pane must
  // not sit empty for a whole interval because the socket did not open — and
  // then on the slow timer, visible tabs only.
  useEffect(() => {
    if (live === 'open') return
    load()
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [live, load])

  // ⚠️ THE FIRST SECONDS USED TO BE A BLANK (2026-08-19). This returned null
  // until the first status answered, so the screen right after „გაგზავნა" —
  // the one moment the person most needs to know their words survived — showed
  // nothing at all where the track was about to appear. Owner: „განცდა არ უნდა
  // შევუქმნათ რომ დაიკარგა მისი მონაწერი." A blank is not neutral there; it
  // reads as the thing went nowhere.
  //
  // What is drawn instead is not a skeleton and not a spinner standing in for
  // data. It is a claim that is TRUE at that instant: the row is written, and
  // routing is choosing who to tell (app/api/requests → auto-VERIFIED when
  // nothing is flagged, then lib/requestRouting fans it out). „ვეძებთ" is the
  // literal description of what the server is doing while this paints.
  if (!d) return <Searching />

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
            <li
              key={label}
              className="flex items-center flex-1 last:flex-none min-w-0"
              aria-current={current ? 'step' : undefined}
            >
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
                  {/* Keyed on WHICH state the dot is in, so the moment a
                      station lights (current → done, or upcoming → current)
                      the dot re-enters once with `fade-in` — the arrival is
                      the news, and it is drawn as one. Nothing re-enters on a
                      repaint that changed nothing. */}
                  <span
                    key={done ? 'done' : current ? 'current' : 'next'}
                    className={`relative w-7 h-7 rounded-full border-2 inline-flex items-center justify-center text-meta font-bold ${
                      done
                        ? 'bg-brand-600 border-brand-600 text-white motion-safe:animate-fade-in'
                        : current
                          ? 'border-brand-600 text-brand-700 bg-white motion-safe:animate-fade-in'
                          : 'border-ink-200 text-ink-400 bg-white'
                    }`}
                  >
                    {done ? '✓' : i + 1}
                  </span>
                </span>
                {/* The WORD is the state. With motion removed the pulse is
                    gone and this line still says which station is live —
                    the same rule that pairs every spinner with a label. */}
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
        ) : d.addressedTo ? (
          /* ⚠️ THIS REQUEST BELONGS TO ONE PERSON (2026-08-20), so it may not
             wear the tender's copy. „დაელოდე შეთავაზებებს" and „N ექსპერტს
             ვაცნობეთ" describe a room of bidders; this client read one
             profile, saw one price and pressed „დაკვეთა". Owner: „თუ
             მცოდნესთან აგზავნის, მხოლოდ მცოდნესთან უნდა მივიდეს."
             The state is said plainly, and NOTHING here happens on its own —
             see OpenToOthers below. */
          <>
            <p className="text-body text-ink-900">
              გაგზავნილია <span className="font-display font-bold">{d.addressedTo.name}</span>-სთან.
            </p>
            <p className="mt-1.5 text-small text-ink-600">
              {d.addressedTo.overdue
                ? 'ჯერ არ გიპასუხა.'
                : 'პასუხს ელოდება. მხოლოდ ის ხედავს ამ მოთხოვნას.'}
            </p>
            {/* The way out, offered only after the provider has had their day —
                and it is an OFFER: the request stays theirs until this is
                pressed. Nothing expires, nothing opens by itself, and the
                person who was chosen keeps their thread and their place either
                way; this adds two places, it does not take one away. */}
            {d.addressedTo.overdue && <OpenToOthers publicRef={publicRef} />}
          </>
        ) : (
          <>
            {/* NOBODY TOLD YET → the search is the state, and it is drawn as
                one. Once `notified` moves the sentence below becomes the news
                and this line steps aside — the animation must never outlive
                the thing it animates. */}
            {d.notified === 0 && <SearchingLine />}
            <p className="text-body text-ink-900">დაელოდე შეთავაზებებს.</p>
            <p className="mt-1.5 text-small text-ink-600">
              {/* ⚠️ THE CALL IS PROMISED ONLY WHERE A CALL IS COMING (2026-08-19).
                  Every branch here used to end „ჯერ გადავამოწმებთ და
                  დაგირეკავთ", written when a human verified every row. Since
                  auto-verification (app/api/requests → autoVerified when no
                  triage flag fires) the ordinary request is VERIFIED the
                  instant it is written and nobody phones before the experts
                  hear about it. Promising a call to those people made the wait
                  longer than it is and the promise one we would break. NEW now
                  means exactly what it always meant — a flag fired, an operator
                  is the next step — and only NEW says so. */}
              {d.notified > 0
                // Past tense, because it happened. This appears the moment
                // routing runs and not one second earlier.
                ? `${d.notified} ექსპერტს ვაცნობეთ.`
                : d.status === 'NEW'
                  ? 'ჯერ გადავამოწმებთ და დაგირეკავთ.'
                  : d.expertsInField > 0
                    // True from the instant the row is written — and deliberately
                    // NOT phrased as anybody looking at anything.
                    ? `ამ კატეგორიაში ${d.expertsInField} ექსპერტია.`
                    : ''}
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
      {/* ⚠️ IT WAS GATED ON `pickMode === 'SELF'` AND THE GATE IS GONE
          (2026-08-29), because the QUESTION behind it is gone.

          The 2026-08-18 rule was right for its own world: the list appeared on
          its own whenever no offer had arrived, which handed a decision to
          somebody who had just said „შეთავაზებები მომივიდეს" and meant it.
          Owner then: „მხოლოდ ამ შემთხვევაში უნდა ჰქონდეს ღილაკი."

          Nobody says that any more — the wizard stopped asking (owner,
          2026-08-29: „მაქსიმალურად მარტივად… ორივეს მხარეს"), so there is no
          stated preference left to override. What is left is a person waiting
          with nothing to do, and a list of people who could help them. Both
          modes always reached the same providers; this was only ever a list.

          The condition that MATTERS survives untouched: `!hasOffers`. Once an
          offer has arrived the offers ARE the answer, and a row of other people
          beside them is a second decision nobody asked for. */}
      {!hasOffers && d.experts.length > 0 && (
        <div className="mt-5 pt-4 border-t border-ink-100">
          <p className="text-small text-ink-600">ამ მიმართულების ექსპერტები — მისწერე პირდაპირ:</p>
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
                    {e.verified && <span aria-label="გადამოწმებული" className="text-brand-700 shrink-0">✓</span>}
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
