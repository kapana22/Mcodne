// Cross-tab session-change signal. Any client flow that swaps who is logged in
// — sign-out, admin impersonation start, impersonation exit — calls this right
// before its own hard navigation. Writing a changing value fires a `storage`
// event in every OTHER open tab; AppShell listens and hard-reloads them so no
// tab can keep rendering a page for the previous identity. The tab that writes
// the key does NOT receive its own `storage` event (per spec), and it navigates
// itself, so there's no double reload.
//
// Client-only (guards `window`); safe to import from any 'use client' module.
export function broadcastSessionChange() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem('mcodne:session-changed', String(Date.now()))
  } catch {
    /* storage may be unavailable (private mode) — the initiating tab still
       navigates; only cross-tab sync is lost, which is a best-effort guard. */
  }
}
