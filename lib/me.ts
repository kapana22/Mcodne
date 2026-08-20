'use client'
// Shared client-side identity source — ONE /api/me per page load.
//
// Before this, AppShell, PublicTopBar and the funnel pages (`/`, `/experts`,
// `/experts/[slug]`, plus the profile's VideoHero) each ran their own
// `fetch('/api/me')` on mount — 3–4 identical round-trips against a ~300ms-RTT
// remote DB on a single public page load.
//
// `fetchMe()` memoizes a single IN-FLIGHT request in a module-scoped `let`, so
// the concurrent mount-time callers of one page share ONE network request. The
// memo self-clears the moment that request settles, so it only ever collapses a
// *burst* of concurrent calls — a later SPA navigation (which remounts the
// funnel subtree) makes a fresh request, exactly as before. That preserves:
//   • AppShell's per-pathname re-check (its `[path]` effect just calls fetchMe
//     again on each navigation — a fresh probe, deduped against any siblings
//     mounting in the same tick),
//   • post-impersonation / post-login freshness: identity swaps trigger a full
//     document reload (AppShell's `mcodne:session-changed` guard), which
//     re-evaluates this module from scratch.
//
// CRITICAL: keep `cache: 'no-store'` — /api/me is `force-dynamic` + no-store so
// the header never shows a stale role after an admin impersonation swap/exit.
//
// STALE-WHILE-REVALIDATE (2026-07-19): the last RESOLVED user is cached at module
// scope (`lastMe`) so a client SPA navigation renders the known identity
// INSTANTLY — no null-flash / header flicker / "info disappears on navigation".
// Every mount STILL re-probes `/api/me` in the background and updates if the role
// changed, and a real identity swap (impersonation/login/logout) triggers a FULL
// document reload (AppShell's `mcodne:session-changed` guard) which re-evaluates
// this module from scratch and clears `lastMe` — so freshness is preserved.
// `lastMe` is only ever WRITTEN inside a fetch `.then()` fired from useEffect
// (client-only), so it never leaks across requests during SSR (it stays null on
// the server), keeping first-paint hydration consistent.

import { useSyncExternalStore } from 'react'

export type Me = {
  id: string
  email?: string
  fullName: string
  avatarUrl?: string | null
  role: 'STUDENT' | 'TUTOR' | 'ADMIN'
  phone?: string | null
  bio?: string | null
  emailVerified?: boolean
  createdAt?: string | null
  /** ⚠️ WHAT THE PERSON CAN DO, which `role` cannot say (2026-08-18). A
   *  tradesperson on the requests allowlist keeps role STUDENT — see lib/hats
   *  for why — so any menu that branches on `role` alone calls them a student
   *  and offers them the expert application. Carried on the identity so a
   *  client component can draw the right doors. */
  hats?: ('ADMIN' | 'EXPERT' | 'MASTER' | 'COMPANY' | 'CLIENT')[]
  /** What the person already offers — see lib/capabilities. */
  capabilities?: ('CONSULT' | 'WORK')[]
} | null

// The single in-flight probe. Null whenever no request is pending.
let inflight: Promise<Me> | null = null

// Last RESOLVED value — survives SPA navigations so remounted headers render the
// known user immediately. Client-only (never written during SSR). See the
// stale-while-revalidate note above.
let lastMe: Me = null
let hasResolved = false

// --- External store backing `useMe` (via useSyncExternalStore) ---------------
// Why a store instead of `useState(lastMe)`: React hydrates the tree
// asynchronously (selective hydration). A useMe consumer high in the page (the
// top bar) can mount, fire its `/api/me` probe, and RESOLVE it — flipping the
// module `hasResolved` to true — BEFORE a lower consumer (e.g. the booking
// card's sign-in-aware CTA) hydrates. That lower consumer's `useState(hasResolved)`
// would then seed `true` on its FIRST client render while the server HTML was
// rendered with `false` → a hydration mismatch (the "დაჯავშნე" ↔ "შესვლა და
// დაჯავშნა" label flip). `useSyncExternalStore` fixes this by design: it renders
// `getServerSnapshot()` for BOTH the server render and the hydration render
// (always the not-ready snapshot), then re-renders with the live client snapshot
// only after hydration commits — so first paint is always consistent, and the
// cached identity still paints instantly on the very next frame (and on SPA
// remounts). `snapshot` is a stable reference that only changes when a probe
// resolves, satisfying useSyncExternalStore's referential-stability contract.
const listeners = new Set<() => void>()
let snapshot: { me: Me; ready: boolean } = { me: null, ready: false }
const SERVER_SNAPSHOT: { me: Me; ready: boolean } = { me: null, ready: false }

// Returns the shared /api/me user object (or null for anon / any failure).
// /api/me answers 200 with `{ user: null }` for guests, so a non-ok response or
// a network error both collapse to `null` — never a throw for callers to catch.
export function fetchMe(): Promise<Me> {
  if (inflight) return inflight
  const p = fetch('/api/me', { credentials: 'include', cache: 'no-store' })
    .then(r => (r.ok ? r.json() : { user: null }))
    // `hats` rides beside `user` in the response rather than inside it — it is
    // derived, not a column — so it is folded in here.
    .then(d => (d?.user ? { ...d.user, hats: d.hats ?? [], capabilities: d.capabilities ?? [] } : null) as Me)
    .catch(() => null)
  inflight = p
  // Cache the resolved value so a later navigation renders it instantly while
  // this fresh probe revalidates in the background, and publish it to the store
  // so every mounted useMe consumer (and direct fetchMe callers like AppShell)
  // updates. New snapshot object → useSyncExternalStore sees the change.
  p.then(m => {
    lastMe = m
    hasResolved = true
    snapshot = { me: m, ready: true }
    listeners.forEach(l => l())
  })
  // Drop the in-flight memo once THIS request settles — the dedup window is one
  // tick, so the next page/navigation re-probes fresh instead of reusing it.
  p.finally(() => {
    if (inflight === p) inflight = null
  })
  return p
}

// Subscribe = register a listener AND kick a background revalidation on mount
// (deduped by `inflight`). Module-scoped so its reference is stable across
// renders (useSyncExternalStore re-subscribes whenever `subscribe` changes).
// Never runs on the server — SSR uses getServerSnapshot instead.
function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  fetchMe() // revalidate; resolves into `snapshot` and notifies listeners
  return () => { listeners.delete(onChange) }
}

// Hook wrapper: `{ me, ready }`. `ready` flips true once the probe resolves so
// call sites can reserve space / avoid an anon-flash before auth is known.
// getServerSnapshot keeps the server render and the hydration render identical
// (always not-ready) — see the store note above — so no auth-dependent markup
// can cause a hydration mismatch; the cached/live identity paints right after.
export function useMe(): { me: Me; ready: boolean } {
  return useSyncExternalStore(subscribe, () => snapshot, () => SERVER_SNAPSHOT)
}
