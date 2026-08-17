// Shared unread-MESSAGE count — one poller per space, for the whole app.
//
// Sibling of lib/notifications, and deliberately a different number. The bell
// counts NOTIFICATIONS (bookings, reviews, applications… and, yes, MESSAGE_NEW);
// this counts UNREAD THREADS. They are not interchangeable: reading a
// notification does not read the message, and a thread opened in another tab
// clears here while the bell may still hold a booking notice.
//
// SPACE-SCOPED, never merged. A dual-role user (a STUDENT promoted to TUTOR)
// holds two inboxes — client-side inquiries they started, and expert-side
// threads on their profile. `/api/messages?space=…` is what separates them, and
// the count has to inherit that separation or an expert would see their client
// unread on the expert badge. One store per space, so the two never share a
// snapshot.
//
// THE SOURCE IS THE ENDPOINT THAT ALREADY OWNS THE NUMBER. It would be cheaper
// to count unread Message rows directly, but the inbox's own `unreadCount` is
// computed AFTER pre-booking threads are folded into their booking hosts
// (app/api/messages/route.ts) — a hand-rolled count would drift from the
// sidebar's, and two different numbers for one thing is worse than one
// expensive one. What this file buys back instead is duplication: refcounted
// subscribe + single-flight fetch, so the sidebar pill and the header badge on
// the same screen are ONE request, not two.
import { useSyncExternalStore } from 'react'

export type MessagesSpace = 'student' | 'tutor'

type Store = {
  subscribe: (onChange: () => void) => () => void
  get: () => number
}

const stores = new Map<MessagesSpace, Store>()

function makeStore(space: MessagesSpace): Store {
  const listeners = new Set<() => void>()
  // A number is its own stable snapshot — no object identity to preserve.
  let count = 0
  let inflight: Promise<void> | null = null
  let intervalId: ReturnType<typeof setInterval> | null = null
  let subscriberCount = 0

  // Single-flight + visibility-gated, same contract as lib/notifications: a
  // backgrounded tab must not poll.
  const refresh = (): Promise<void> => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return Promise.resolve()
    }
    if (inflight) return inflight
    const p = fetch(`/api/messages?space=${space}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d?.ok || typeof d.unreadCount !== 'number') return
        if (d.unreadCount === count) return
        count = d.unreadCount
        listeners.forEach(l => l())
      })
      .catch(() => {})
      .finally(() => { if (inflight === p) inflight = null })
    inflight = p
    return p
  }

  const onVisibility = () => { if (document.visibilityState === 'visible') refresh() }
  const onStorage = (e: StorageEvent) => { if (e.key === 'mcodne:notif-check') refresh() }
  // Fired by the chat pane after send/receive — this is what makes the badge
  // clear the moment a thread is opened, instead of up to 90s later.
  const onThreads = () => { refresh() }

  return {
    subscribe(onChange) {
      listeners.add(onChange)
      subscriberCount++
      if (subscriberCount === 1) {
        refresh()
        intervalId = setInterval(refresh, 90_000)
        document.addEventListener('visibilitychange', onVisibility)
        window.addEventListener('storage', onStorage)
        window.addEventListener('mcodne:threads-refresh', onThreads)
      }
      return () => {
        listeners.delete(onChange)
        subscriberCount--
        if (subscriberCount === 0) {
          if (intervalId) clearInterval(intervalId)
          intervalId = null
          document.removeEventListener('visibilitychange', onVisibility)
          window.removeEventListener('storage', onStorage)
          window.removeEventListener('mcodne:threads-refresh', onThreads)
        }
      }
    },
    get: () => count,
  }
}

function storeFor(space: MessagesSpace): Store {
  let s = stores.get(space)
  if (!s) { s = makeStore(space); stores.set(space, s) }
  return s
}

const noopSubscribe = () => () => {}
const zero = () => 0

/**
 * Unread messages in one space, or 0 when there is no space to poll.
 *
 * @param space `null` for a guest or an ADMIN — those have no inbox, and a hook
 * cannot be called conditionally. Passing null subscribes to nothing: no poll,
 * no listeners, no request that 401s every 90 seconds (the exact waste the
 * `enabled` flag on useNotifications exists to prevent).
 */
export function useMessagesUnread(space: MessagesSpace | null): number {
  const store = space ? storeFor(space) : null
  return useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    store ? store.get : zero,
    zero,
  )
}
