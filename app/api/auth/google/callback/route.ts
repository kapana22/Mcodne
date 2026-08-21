import { NextResponse, after } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { createSession, hashPassword, postAuthHome } from '@/lib/auth'
import { oauthOrigin } from '@/lib/googleOauth'
import { resolveGoogleLink } from '@/lib/googleLink'
import { safeInternalPath } from '@/lib/roleHome'
import { sendMail } from '@/lib/mailer'
import { welcomeEmail, googleLinkedEmail } from '@/lib/emailTemplates'
import { ROLE } from '@/lib/roles'

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
  // „დამიმახსოვრე 30 დღით", unticked on the signin form and persisted by the
  // start route. Absent = remember (the long-standing default), so nothing a
  // client can do here extends a session — only shortens it to 12h.
  const shortSession = jar.get('g_oauth_short')?.value === '1'
  jar.delete('g_oauth_short')

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
  let gu: { email?: string; verified_email?: boolean; name?: string; picture?: string }
  try {
    const uRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!uRes.ok) return fail('google_userinfo')
    gu = await uRes.json()
  } catch {
    return fail('google_userinfo')
  }
  if (!gu.email) return fail('google_noemail')
  // Google accounts can exist with an UNVERIFIED email (e.g. "use my current
  // email instead"). Matching an existing mcodne account purely by address would
  // let someone claim victim@x.com at Google (unverified) and be logged into the
  // victim's account. Require Google to have verified the address.
  if (gu.verified_email !== true) return fail('google_unverified')
  const email = gu.email.toLowerCase().trim()

  // Find or create the account. Existing password-signup users are logged in
  // (Google is an additional way in, not a duplicate account) — but see the
  // link decision below: an account whose email was never verified may be one
  // an attacker registered in this person's name, so its password does not
  // survive the link.
  const existing = await prisma.user.findUnique({ where: { email } })
  const isNewUser = !existing
  // Decided HERE, before the patch below flips emailVerified to true — reading
  // it afterwards would always say „verified" and silently disarm the fix.
  let link = resolveGoogleLink(existing)
  let user = existing
  if (!user) {
    try {
      user = await prisma.user.create({
        data: {
          email,
          fullName: gu.name?.trim() || email.split('@')[0],
          avatarUrl: gu.picture || null,
          // OAuth accounts have no usable password — store a random unusable hash
          // (schema requires the column). They sign in only via Google.
          passwordHash: await hashPassword(crypto.randomBytes(24).toString('hex')),
          role: ROLE.USER,
          emailVerified: true, // Google-verified email → skip our OTP step.
        },
      })
    } catch {
      // Concurrent create with the same email (double-tap / race) → the unique
      // constraint fired; the row now exists, so just log that user in.
      user = await prisma.user.findUnique({ where: { email } })
      if (!user) return fail('google_userinfo')
      // …and re-decide against the row that actually landed. `link` was
      // resolved from a null `existing`, i.e. „nothing to revoke" — but what
      // won the race may have been a PASSWORD signup for this address, which is
      // precisely the row the revocation exists for. Narrow, but it is the one
      // path where skipping it would be silent.
      link = resolveGoogleLink(user)
      if (link.revokePassword) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { emailVerified: true, passwordHash: await hashPassword(crypto.randomBytes(24).toString('hex')) },
        })
      }
    }
  } else {
    // Existing account signing in via Google: mark verified, and backfill the
    // avatar from the Google photo IF they don't already have one (never
    // overwrite a user-set avatar). Otherwise a pre-existing account that logs
    // in with Google would keep a blank photo forever.
    const patch: { emailVerified?: boolean; avatarUrl?: string; passwordHash?: string } = {}
    if (!user.emailVerified) patch.emailVerified = true
    if (!user.avatarUrl && gu.picture) patch.avatarUrl = gu.picture
    // The unproven password is replaced, not blanked: `passwordHash` is NOT
    // NULL in the schema, and a random hash is also what a Google-created
    // account carries — so signin's bcrypt compare simply never matches and
    // needs no special case. „დაგავიწყდა?" sets a real one whenever they want.
    if (link.revokePassword) patch.passwordHash = await hashPassword(crypto.randomBytes(24).toString('hex'))
    if (Object.keys(patch).length > 0) {
      user = await prisma.user.update({ where: { id: user.id }, data: patch })
    }
  }

  // A suspended account must not obtain a session via Google sign-in either.
  // `?error=` (not the old `?e=`): every failure on this route uses ONE param
  // so the signin page has one thing to read — see lib/authErrors.ts.
  if (user.suspendedAt) return fail('suspended')

  // Every session the discarded password may have opened dies here — revoking
  // the credential while leaving its live sessions running would revoke
  // nothing. Deliberately BEFORE createSession (it would delete the new one)
  // and deliberately NOT wrapped in a catch: if we cannot revoke, we must not
  // sign in and report success. `revokeOtherSessions` is the wrong tool — there
  // is no session of ours to keep at this point, and all of them must go.
  if (link.revokeSessions) {
    await prisma.session.deleteMany({ where: { userId: user.id } })
  }

  await createSession(user.id, { rememberMe: !shortSession })

  // Fire-and-forget, one mail at most. The revocation notice OUTRANKS the
  // welcome: in the create-race branch both conditions can hold at once, and
  // „we just deleted your password" is the one a person needs to receive.
  // An ordinary Google sign-in to an already-verified account still sends
  // nothing at all.
  {
    const u = user
    const build = link.notify ? googleLinkedEmail : isNewUser ? welcomeEmail : null
    if (build) {
      after(async () => {
        const { subject, html } = build(u.fullName)
        await sendMail({ to: u.email, subject, html }).catch(() => {})
      })
    }
  }

  // Explicit deep-link wins (matches password signin); otherwise the
  // server-decided landing (role home, or /apply for pending applicants).
  const dest = safeInternalPath(savedNext) ?? (await postAuthHome(user))
  return NextResponse.redirect(new URL(dest, origin))
}
