// GET /api/requests/<ref>/events — the live room's stream.
//
// Server-Sent Events, one connection per open room. The client (app/request/
// _live, components/RequestChat via lib/requestLiveClient) opens it with
// `EventSource`; when it cannot — no EventSource, a 4xx, a proxy that will not
// hold a connection — the SAME screens fall back to the polls they always had
// (./status every 20 s, the thread every 15 s). This route is the fast path,
// never the only path.
//
// WHAT IT SENDS, AND WHEN. Every few seconds it asks lib/requestLive for the
// two fingerprints („did the row move", „did a message move") — one findUnique
// and two counts — and only when one CHANGES does it send:
//
//   event: status     the full ./status payload (recomputed at that moment —
//                     the four reads run on change, never per tick)
//   event: messages   a nudge with the fingerprint; the pane refetches its own
//                     thread through the endpoint that owns the masking rules
//
// plus a comment heartbeat every 25 s so an idle proxy keeps the socket. The
// first tick always sends both, so a reconnect is also a catch-up. It ends
// after 30 minutes (EventSource reconnects on its own — see the client) or the
// moment the browser goes away (`req.signal`).
//
// ⚠️ AUTHORISED EXACTLY LIKE ./status: possession of the reference, the
// `requestsViewer` gate, 404 and never 403, the reference normalised before it
// reaches a query. A stream is a longer-lived answer to the same question and
// must not be a wider door. It is also the same existence oracle, so it is
// throttled the same way — separately keyed, because a room reconnecting must
// not spend the poll's budget.
//
// ⚠️ NEVER SIMULATED. Nothing here invents a tick, a count or a „somebody is
// looking" — see lib/requestLive for the argument in full.

import { NextResponse } from 'next/server'
import { ensureDbReady } from '@/lib/dbBoot'
import { normalizePublicRef } from '@/lib/requests'
import { requestLiveMark, requestLiveStatus, type RequestLiveMark } from '@/lib/requestLive'
import { requestsViewer, requestsNotFound } from '@/lib/requestsServer'
import { rateLimit, clientIp } from '@/lib/rateLimit'

/** A stream must not be cached, buffered or pre-rendered by anything. */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** How often the room asks „did anything move?" — cheap by construction
 *  (lib/requestLive → requestLiveMark), and 4 s is well inside the „within ~5
 *  seconds" an offer or a reply should take to appear. */
const TICK_MS = 4_000
/** A comment line, so an idle proxy does not decide the socket is dead. */
const HEARTBEAT_MS = 25_000
/** One connection lives this long at most; the browser opens a fresh one. */
const MAX_AGE_MS = 30 * 60_000

const enc = new TextEncoder()
const sse = (event: string, data: unknown) => enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

export async function GET(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const viewer = await requestsViewer()
  if (!viewer.clientAllowed) return requestsNotFound()

  const ref = normalizePublicRef((await params).ref)
  if (!ref) return requestsNotFound()

  // The same oracle ./status is (a 200 for a live reference, a 404 for a dead
  // one), so the same budget — keyed apart, because a room that reconnects
  // every 30 minutes must not eat the poll's allowance, and the poll IS the
  // fallback for when this answers 429.
  const rl = rateLimit(`request-events:${clientIp(req)}`, 60, 60 * 60)
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: 'RATE_LIMITED', retryInSec: rl.retryInSec },
      { status: 429 },
    )
  }

  await ensureDbReady()
  // Existence is decided BEFORE the stream opens, with a real status code —
  // an EventSource that gets a 404 stops for good (which is what lets the
  // client fall back), where a 200 that then closes would make it retry a
  // reference that does not exist, forever.
  const first = await requestLiveMark(ref)
  if (!first) return requestsNotFound()

  const openedAt = Date.now()
  let timer: ReturnType<typeof setTimeout> | null = null
  let beat: ReturnType<typeof setInterval> | null = null
  let closed = false

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const stop = () => {
        if (closed) return
        closed = true
        if (timer) clearTimeout(timer)
        if (beat) clearInterval(beat)
        try { controller.close() } catch { /* already gone */ }
      }
      // The browser left — the tab closed, the page navigated. Nothing to
      // send to, so nothing to compute.
      req.signal.addEventListener('abort', stop)

      const send = (event: string, data: unknown) => {
        if (closed) return
        try { controller.enqueue(sse(event, data)) } catch { stop() }
      }

      // The first tick is a catch-up, always: both events, so a reconnecting
      // room repaints from the truth rather than from what it last saw.
      let last: RequestLiveMark = { status: '', messages: '' }
      const tick = async () => {
        if (closed) return
        if (Date.now() - openedAt > MAX_AGE_MS) { stop(); return }
        try {
          const mark = await requestLiveMark(ref)
          // The row was deleted under an open room — end, and let the client's
          // reconnect get the 404 that tells it to stop.
          if (!mark) { stop(); return }
          if (mark.status !== last.status) {
            const live = await requestLiveStatus(ref)
            if (live) send('status', { ok: true, ...live })
          }
          if (mark.messages !== last.messages) send('messages', { ok: true, mark: mark.messages })
          last = mark
        } catch { /* a failed tick is a tick that tries again */ }
        if (!closed) timer = setTimeout(tick, TICK_MS)
      }
      // A comment line is the SSE-level heartbeat: not an event, so nothing on
      // the client fires — it exists only to keep the connection warm.
      beat = setInterval(() => {
        if (closed) return
        try { controller.enqueue(enc.encode(': ping\n\n')) } catch { stop() }
      }, HEARTBEAT_MS)
      // Tell EventSource how long to wait before it reconnects on its own —
      // after the 30-minute close, or a dropped socket.
      try { controller.enqueue(enc.encode(`retry: ${TICK_MS}\n\n`)) } catch { stop() }
      // Not awaited: the first chunk must reach the browser now, and the timer
      // chain inside tick keeps itself alive from here.
      void tick()
    },
    cancel() {
      closed = true
      if (timer) clearTimeout(timer)
      if (beat) clearInterval(beat)
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      // Reverse proxies (nginx and friends) buffer by default; a buffered
      // stream is a poll with extra steps.
      'X-Accel-Buffering': 'no',
    },
  })
}
