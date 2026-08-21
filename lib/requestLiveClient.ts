// THE ROOM'S ONE STREAM — the browser half of /api/requests/[ref]/events.
//
// Several panes on the same screen want to know when the request moves: the
// station track (app/request/_live), the thread with us and every offer
// thread (components/RequestChat), the offers page (app/request/[ref] →
// _liveRefresh). One request, one connection — this module opens a single
// `EventSource` per reference, refcounted, and fans its events out; the last
// pane to leave closes it.
//
// ⚠️ THE STREAM IS THE FAST PATH, NOT THE ONLY PATH. Every subscriber keeps the
// poll it always had and runs it whenever this reports 'down' — no
// `EventSource` in the browser, a 404/429 from the route (which EventSource
// treats as final and never retries), or a connection the proxy will not hold.
// A dropped socket is 'down' only until the browser's own reconnect lands
// (EventSource does that itself, with the `retry:` the route sends), at which
// point the route re-sends the truth and the poll goes quiet again.
//
// Nothing here is a source of data: it relays what the route says and tells
// each pane WHEN to look — the pane then reads through the endpoint that owns
// its rules (masking, contact, side).

export type LiveState = 'open' | 'down'

type LiveListener = {
  /** The full ./status payload — every number counted, see lib/requestLive. */
  onStatus?: (payload: unknown) => void
  /** Something in the threads moved: a message, a receipt, the desk. */
  onMessages?: () => void
  /** 'open' when events are flowing; 'down' when the pane must poll. */
  onState?: (state: LiveState) => void
}

type Room = {
  es: EventSource
  state: LiveState
  listeners: Set<LiveListener>
}

const rooms = new Map<string, Room>()

/** Is a stream even possible here? Decided once per subscribe, never assumed. */
function streamsAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.EventSource === 'function'
}

function open(ref: string): Room {
  const url = `/api/requests/${encodeURIComponent(ref)}/events`
  const es = new EventSource(url)
  const room: Room = { es, state: 'down', listeners: new Set() }
  const setState = (s: LiveState) => {
    if (room.state === s) return
    room.state = s
    room.listeners.forEach(l => l.onState?.(s))
  }
  es.onopen = () => setState('open')
  // Two errors look alike and mean opposite things. CONNECTING = the browser is
  // reconnecting on its own (a dropped socket, the route's 30-minute close):
  // poll meanwhile, and 'open' will come back. CLOSED = the browser has given
  // up for good (a 404, a 429, a non-stream answer): poll from here on.
  es.onerror = () => setState('down')
  es.addEventListener('status', (e: MessageEvent) => {
    let data: unknown = null
    try { data = JSON.parse(e.data) } catch { return }
    room.listeners.forEach(l => l.onStatus?.(data))
  })
  es.addEventListener('messages', () => {
    room.listeners.forEach(l => l.onMessages?.())
  })
  rooms.set(ref, room)
  return room
}

/**
 * Subscribe a pane to a request's stream. Returns the unsubscribe.
 *
 * The listener hears the current state immediately, so a pane that mounts
 * into an already-open room does not sit polling until the next event.
 */
export function subscribeRequestLive(ref: string, listener: LiveListener): () => void {
  if (!streamsAvailable()) {
    listener.onState?.('down')
    return () => {}
  }
  const room = rooms.get(ref) ?? open(ref)
  room.listeners.add(listener)
  listener.onState?.(room.state)
  return () => {
    room.listeners.delete(listener)
    if (room.listeners.size === 0) {
      room.es.close()
      rooms.delete(ref)
    }
  }
}
