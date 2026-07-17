import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'node:crypto'
import { oauthOrigin } from '@/lib/googleOauth'
import { safeInternalPath } from '@/lib/roleHome'

// GET /api/auth/google — kick off the Google OAuth consent flow so a client can
// sign in / sign up with one click.
export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const origin = oauthOrigin(req)
  if (!clientId) {
    // Not configured yet (GOOGLE_CLIENT_ID unset) — fail soft back to signin.
    return NextResponse.redirect(new URL('/signin?error=google_not_configured', origin))
  }

  // CSRF state — random, stored httpOnly, verified in the callback.
  const state = crypto.randomBytes(16).toString('hex')
  const jar = await cookies()
  jar.set('g_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })

  // Carry a ?redirect= deep-link across the OAuth round-trip (Google's
  // redirect_uri must stay fixed, so the destination rides in a short-lived
  // cookie, not the URL). Internal-path-validated here AND re-validated in the
  // callback; a stale cookie from an earlier attempt is cleared so it can't
  // hijack this signin's destination.
  const next = safeInternalPath(new URL(req.url).searchParams.get('redirect'))
  if (next) {
    jar.set('g_oauth_next', next, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    })
  } else {
    jar.delete('g_oauth_next')
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  })
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
}
