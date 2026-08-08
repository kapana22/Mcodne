// Shared notifications store — ONE poller for the whole app.
//
// NotifBell, UserMenu and BottomNav each used to run their own `/api/notifications`
// fetch + 90s interval, so a page rendering two or three of them (e.g. a mobile
// student screen with the top-bar bell AND the bottom nav) hit the endpoint 2–3×
// every 90s. This backs all of them with a single refcounted interval and a
// single-flight fetch, mirroring the useSyncExternalStore pattern in lib/me.
//
// Cross-tab + optimistic reads stay identical to the old per-component logic:
// marking anything read bumps the `mcodne:notif-check` localStorage key so other
// tabs revalidate; the poll is visibility-gated so hidden tabs don't hammer the DB.
import { useSyncExternalStore } from 'react'

export type NotifItem = {
  id: string
  title: string
  body: string | null
  href: string | null
  readAt: string | null
  createdAt: string
}

export type NotifSnapshot = { items: NotifItem[]; unreadCount: number; ready: boolean }

const listeners = new Set<() => void>()
// Snapshot is a STABLE reference that only changes when data changes, satisfying
// useSyncExternalStore's referential-stability contract (see lib/me).
let snapshot: NotifSnapshot = { items: [], unreadCount: 0, ready: false }
const SERVER_SNAPSHOT: NotifSnapshot = { items: [], unreadCount: 0, ready: false }

let inflight: Promise<void> | null = null
let intervalId: ReturnType<typeof setInterval> | null = null
let subscriberCount = 0

function publish(next: Partial<NotifSnapshot>) {
  snapshot = { ...snapshot, ...next }
  listeners.forEach(l => l())
}

// Single-flight fetch. Visibility-gated: a backgrounded tab shouldn't poll.
function refreshNotifications(): Promise<void> {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return Promise.resolve()
  }
  if (inflight) return inflight
  const p = fetch('/api/notifications')
    .then(r => (r.ok ? r.json() : null))
    .then(d => {
      if (d) publish({ items: d.items ?? [], unreadCount: d.unreadCount ?? 0, ready: true })
    })
    .catch(() => {})
    .finally(() => { if (inflight === p) inflight = null })
  inflight = p
  return p
}

function onVisibility() {
  if (document.visibilityState === 'visible') refreshNotifications()
}
function onStorage(e: StorageEvent) {
  if (e.key === 'mcodne:notif-check') refreshNotifications()
}

// Refcounted subscribe: the FIRST subscriber starts the shared 90s poll (+ an
// immediate load) and attaches the window listeners; the LAST one tears it all
// down. Module-scoped so the reference is stable across renders.
function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  subscriberCount++
  if (subscriberCount === 1) {
    refreshNotifications()
    intervalId = setInterval(refreshNotifications, 90_000)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('storage', onStorage)
  }
  return () => {
    listeners.delete(onChange)
    subscriberCount--
    if (subscriberCount === 0) {
      if (intervalId) clearInterval(intervalId)
      intervalId = null
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('storage', onStorage)
    }
  }
}

/**
 * @param enabled pass `false` when there is no signed-in user.
 *
 * WHY THE FLAG: `BottomNav` calls this before it decides whether to render
 * (it returns null for anonymous visitors), and a hook cannot be called
 * conditionally. The subscription therefore started for EVERY guest on EVERY
 * page — one `/api/notifications` request that 401s immediately, then another
 * every 90 seconds for as long as the tab stayed open. Nothing broke (the
 * fetch swallows non-ok responses) but it was pure waste and it filled the
 * console with auth errors that mask real ones.
 *
 * Disabled just returns the empty server snapshot and never subscribes, so no
 * poll, no listeners, no request. Re-enabling (after sign-in) resubscribes
 * normally and fires an immediate refresh — the refcounted `subscribe` already
 * handles that.
 */
export function useNotifications(enabled = true): NotifSnapshot {
  return useSyncExternalStore(
    enabled ? subscribe : noopSubscribe,
    () => (enabled ? snapshot : SERVER_SNAPSHOT),
    () => SERVER_SNAPSHOT,
  )
}

/** No-op subscribe for the disabled case — never registers a listener. */
const noopSubscribe = () => () => {}

// Bump the cross-tab key so other tabs' stores revalidate after a read here.
function pingCrossTab() {
  try { localStorage.setItem('mcodne:notif-check', String(Date.now())) } catch {}
}

export async function markAllNotificationsRead(): Promise<void> {
  if (snapshot.unreadCount === 0) return
  const now = new Date().toISOString()
  publish({
    items: snapshot.items.map(n => (n.readAt ? n : { ...n, readAt: now })),
    unreadCount: 0,
  })
  pingCrossTab()
  try {
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    })
  } catch {}
}

export async function markNotificationRead(id: string): Promise<void> {
  const n = snapshot.items.find(x => x.id === id)
  if (!n || n.readAt) return
  const now = new Date().toISOString()
  publish({
    items: snapshot.items.map(x => (x.id === id ? { ...x, readAt: now } : x)),
    unreadCount: Math.max(0, snapshot.unreadCount - 1),
  })
  pingCrossTab()
  try {
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    })
  } catch {}
}
