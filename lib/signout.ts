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
  if (typeof window !== 'undefined') window.location.replace(dest)
}
