'use client'
// Shared client-side identity source — ONE /api/me per page load.
//
// Before this, AppShell, PublicTopBar and the funnel pages (`/`, `/tutors`,
// `/tutors/[id]`, plus the profile's VideoHero) each ran their own
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
// Do NOT add any caching that survives a navigation.

import { useEffect, useState } from 'react'

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
} | null

// The single in-flight probe. Null whenever no request is pending.
let inflight: Promise<Me> | null = null

// Returns the shared /api/me user object (or null for anon / any failure).
// /api/me answers 200 with `{ user: null }` for guests, so a non-ok response or
// a network error both collapse to `null` — never a throw for callers to catch.
export function fetchMe(): Promise<Me> {
  if (inflight) return inflight
  const p = fetch('/api/me', { credentials: 'include', cache: 'no-store' })
    .then(r => (r.ok ? r.json() : { user: null }))
    .then(d => (d?.user ?? null) as Me)
    .catch(() => null)
  inflight = p
  // Drop the memo once THIS request settles — the dedup window is one tick, so
  // the next page/navigation re-probes fresh instead of reusing a stale role.
  p.finally(() => {
    if (inflight === p) inflight = null
  })
  return p
}

// Hook wrapper: `{ me, ready }`. `ready` flips true once the probe resolves so
// call sites can reserve space / avoid an anon-flash before auth is known.
export function useMe(): { me: Me; ready: boolean } {
  const [me, setMe] = useState<Me>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetchMe().then(m => {
      if (cancelled) return
      setMe(m)
      setReady(true)
    })
    return () => { cancelled = true }
  }, [])
  return { me, ready }
}
