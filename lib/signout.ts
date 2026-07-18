// Shared client-side sign-out.
//
// `/api/auth/signout` is POST-only and returns a NON-redirect 200 JSON (see the
// route for why). That means a native `<form method="post">` submit navigates
// the browser to the endpoint and renders the raw `{"ok":true}` body as a page
// — the exact bug this helper replaces. Callers must POST via fetch and then
// navigate themselves. Every logout surface (UserMenu, tutor home, student
// mobile menu, student/profile) funnels through here so behavior and the
// post-logout destination are identical everywhere.

/**
 * Tear down the session server-side, then hard-navigate to `dest` (default the
 * public landing `/`). Uses `window.location.replace` (not client router push)
 * so all in-memory auth/user state is dropped with the page AND the signed-in
 * page is removed from history (back button can't return to it). Never throws —
 * the cookie is expired on the response regardless of the fetch outcome, so the
 * user always ends up signed out.
 */
export async function signOut(dest: string = '/'): Promise<void> {
  try {
    await fetch('/api/auth/signout', { method: 'POST', credentials: 'include' })
  } catch {
    /* swallow — the endpoint expires the cookie on its response; navigate anyway */
  }
  if (typeof window !== 'undefined') {
    // Drop localStorage entries that aren't keyed by user id — browsing
    // history and half-filled form drafts would otherwise surface to the NEXT
    // person signing in on a shared device. Device-level prefs (cookie
    // consent) and user-scoped keys (`…:${userId}`) deliberately survive.
    try {
      for (const k of [
        'mcodne:recent-tutors',   // recently-viewed experts strip
        'mcodne:apply-draft',     // expert-application form draft
        'mcodne:signup-draft',    // signup form draft (name + email)
        'mtsodne:onboarding',     // onboarding wizard answers
      ]) {
        window.localStorage.removeItem(k)
      }
    } catch {
      /* storage may be unavailable (private mode) — cookie teardown already happened */
    }
    // Tell other open tabs to reload — they must not keep showing a signed-in
    // shell after this tab logs out.
    try { window.localStorage.setItem('mcodne:session-changed', String(Date.now())) } catch {}
    window.location.replace(dest)
  }
}
