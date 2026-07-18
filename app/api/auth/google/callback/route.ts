import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { createSession, hashPassword, postAuthHome } from '@/lib/auth'
import { oauthOrigin } from '@/lib/googleOauth'
import { safeInternalPath } from '@/lib/roleHome'

// GET /api/auth/google/callback — Google redirects here with ?code&state.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const origin = oauthOrigin(req)
  const fail = (e: string) => NextResponse.redirect(new URL(`/signin?error=${e}`, origin))

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const jar = await cookies()
  const savedState = jar.get('g_oauth_state')?.value
  jar.delete('g_oauth_state')
  // Deep-link destination persisted by the start route; single-use.
  // Re-validated below even though the start route already checked it —
  // the cookie is client-writable in principle.
  const savedNext = jar.get('g_oauth_next')?.value
  jar.delete('g_oauth_next')

  if (url.searchParams.get('error')) return fail('google_denied')
  if (!code || !state || !savedState || state !== savedState) return fail('google_state')

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return fail('google_not_configured')
  const redirectUri = `${origin}/api/auth/google/callback`

  // Exchange the authorization code for an access token.
  let accessToken: string
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    if (!tokenRes.ok) return fail('google_token')
    const tok = await tokenRes.json()
    accessToken = tok.access_token
    if (!accessToken) return fail('google_token')
  } catch {
    return fail('google_token')
  }

  // Fetch the verified profile (email, name, picture).
  let gu: { email?: string; name?: string; picture?: string }
  try {
    const uRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!uRes.ok) return fail('google_userinfo')
    gu = await uRes.json()
  } catch {
    return fail('google_userinfo')
  }
  if (!gu.email) return fail('google_noemail')
  const email = gu.email.toLowerCase().trim()

  // Find or create the account. Existing password-signup users are simply logged
  // in (Google is an additional way in, not a duplicate account).
  let user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        fullName: gu.name?.trim() || email.split('@')[0],
        avatarUrl: gu.picture || null,
        // OAuth accounts have no usable password — store a random unusable hash
        // (schema requires the column). They sign in only via Google.
        passwordHash: await hashPassword(crypto.randomBytes(24).toString('hex')),
        role: 'STUDENT',
        emailVerified: true, // Google-verified email → skip our OTP step.
      },
    })
  } else if (!user.emailVerified) {
    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } })
  }

  // A suspended account must not obtain a session via Google sign-in either.
  if ((user as any).suspendedAt) {
    return NextResponse.redirect(new URL('/signin?e=suspended', origin))
  }
  await createSession(user.id)
  // Explicit deep-link wins (matches password signin); otherwise the
  // server-decided landing (role home, or /apply for pending applicants).
  const dest = safeInternalPath(savedNext) ?? (await postAuthHome(user))
  return NextResponse.redirect(new URL(dest, origin))
}
