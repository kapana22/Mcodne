import { NextResponse } from 'next/server'
import { destroySession } from '@/lib/auth'

// Auth cookie name — mirrors COOKIE in lib/auth.ts (not exported there, so it is
// duplicated here). Kept in sync manually; both must clear the same cookie.
const COOKIE = 'mcodne_session'

// POST only — a GET signout endpoint can be CSRF-triggered from a third-party
// site via `<img src="/api/auth/signout">`, silently logging users out.
//
// Returns a NON-redirect 200 (never a 3xx). The old 303 redirect was followed
// transparently by the client's `fetch()` (default `redirect:'follow'`) instead
// of navigating, and — because the redirect target was composed from SITE_URL —
// could point cross-origin (apex vs www / Railway host), where CSP
// `connect-src 'self'` blocks the followed request, so `await fetch` stalled and
// the button hung on "გამოდის…". Navigation is now the caller's job; this
// endpoint only tears down the session and returns a plain result.
export async function POST() {
  // Destroy the server-side session row + clear the request-scoped cookie.
  // Wrapped so a DB/cookie failure can never block logout — we still return a
  // success response that expires the cookie below, so the client always ends
  // up signed out and never hangs.
  try {
    await destroySession()
  } catch {
    /* swallow — cookie expiry below still logs the user out client-side */
  }

  const res = NextResponse.json({ ok: true }, { status: 200 })
  // Explicitly expire the auth cookie on THIS response so it is removed
  // client-side regardless of destroySession's outcome.
  res.cookies.set(COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  })
  return res
}
