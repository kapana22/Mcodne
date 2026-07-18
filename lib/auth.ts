import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { randomBytes, createHash } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import { homeForRole } from './roleHome'
import type { Role } from '@prisma/client'

// Re-exported so existing `import { homeForRole } from '@/lib/auth'` server
// call sites keep working; the implementation lives in the client-safe
// lib/roleHome so client components share the exact same map.
export { homeForRole }

const COOKIE = 'mcodne_session'
const MAX_AGE = 60 * 60 * 24 * 30
// When "remember me" is unchecked at signin, cap the cookie lifetime to 12h.
// Server-side session row still uses this same expiry so a stale cookie can't
// outlive the DB record.
const SHORT_MAX_AGE = 60 * 60 * 12

export function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10)
}

export function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash)
}

function newToken() {
  return randomBytes(32).toString('hex')
}

function tokenHash(t: string) {
  return createHash('sha256').update(t).digest('hex')
}

export async function createSession(
  userId: string,
  opts?: { rememberMe?: boolean; impersonatorId?: string | null },
) {
  // Default is "remember me" (30d). Explicit `rememberMe: false` shortens both
  // the DB row's expiresAt AND the cookie's maxAge to 12h.
  const rememberMe = opts?.rememberMe !== false
  const ttl = rememberMe ? MAX_AGE : SHORT_MAX_AGE
  const raw = newToken()
  const token = tokenHash(raw)
  const expiresAt = new Date(Date.now() + ttl * 1000)
  // impersonatorId is set only when an admin impersonates this user; it binds
  // the "exit impersonation" restore to a server-side value, never a client cookie.
  await prisma.session.create({
    data: { userId, token, expiresAt, impersonatorId: opts?.impersonatorId ?? null },
  })
  const jar = await cookies()
  jar.set(COOKIE, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ttl,
  })
}

export async function destroySession() {
  const jar = await cookies()
  const raw = jar.get(COOKIE)?.value
  if (raw) {
    await prisma.session.deleteMany({ where: { token: tokenHash(raw) } }).catch(() => {})
  }
  jar.delete(COOKIE)
}

// Atomically swap the current session for a fresh one for `userId` (used by
// admin impersonation start + exit). This deletes the OLD session's DB row by
// its cookie token but DOES NOT call jar.delete() — createSession's jar.set()
// overwrites the cookie in a single Set-Cookie. Chaining destroySession()
// (which delete()s the cookie) with createSession() (which set()s it) emits BOTH
// a deletion and a set for the same cookie name in one response; browsers/proxies
// can apply those out of order, intermittently leaving the session cookie empty
// or stale — the root of "impersonate sometimes lands on the wrong role". One
// write only avoids that race entirely.
export async function replaceSession(
  userId: string,
  opts?: { rememberMe?: boolean; impersonatorId?: string | null },
) {
  const jar = await cookies()
  const oldRaw = jar.get(COOKIE)?.value
  if (oldRaw) {
    await prisma.session.deleteMany({ where: { token: tokenHash(oldRaw) } }).catch(() => {})
  }
  await createSession(userId, opts)
}

export async function currentSessionTokenHash(): Promise<string | null> {
  const jar = await cookies()
  const raw = jar.get(COOKIE)?.value
  return raw ? tokenHash(raw) : null
}

// Revokes every session for the user EXCEPT the currently-authenticated one.
// Use after password change so the actor stays signed in but other devices are logged out.
export async function revokeOtherSessions(userId: string) {
  const keep = await currentSessionTokenHash()
  await prisma.session.deleteMany({
    where: {
      userId,
      ...(keep ? { NOT: { token: keep } } : {}),
    },
  })
}

export async function getCurrentUser() {
  const jar = await cookies()
  const raw = jar.get(COOKIE)?.value
  if (!raw) return null
  const session = await prisma.session.findUnique({
    where: { token: tokenHash(raw) },
    include: { user: true },
  })
  if (!session || session.expiresAt < new Date()) return null
  return session.user
}

// Returns the original-admin id if the CURRENT session was minted via admin
// impersonation, else null. Read from the server-side session row (never a
// client cookie) so it cannot be forged to escalate privileges.
export async function getImpersonatorId(): Promise<string | null> {
  const jar = await cookies()
  const raw = jar.get(COOKIE)?.value
  if (!raw) return null
  const session = await prisma.session.findUnique({
    where: { token: tokenHash(raw) },
    select: { impersonatorId: true, expiresAt: true },
  })
  if (!session || session.expiresAt < new Date()) return null
  return session.impersonatorId ?? null
}

// Post-auth landing for a freshly signed-in user. Same as homeForRole, except
// a STUDENT with an open expert application (DRAFT/SUBMITTED) is routed back
// to /apply — applicants keep role STUDENT until an admin approves, so without
// this they'd sign in and silently land on the student dashboard with no cue
// that their application exists or where it stands. APPROVED means the role is
// already TUTOR; REJECTED applicants get the normal student home (the /apply
// status step still shows the outcome if they visit it themselves).
export async function postAuthHome(user: { id: string; role: Role }): Promise<string> {
  if (user.role === 'STUDENT') {
    const app = await prisma.tutorApplication.findUnique({
      where: { userId: user.id },
      select: { status: true },
    })
    if (app && (app.status === 'DRAFT' || app.status === 'SUBMITTED')) return '/apply'
  }
  return homeForRole(user.role)
}

async function currentPath(): Promise<string | null> {
  try {
    const { headers } = await import('next/headers')
    const h = await headers()
    // Set by our own middleware — see middleware.ts. Falls back to referer if unset.
    const p = h.get('x-current-path')
    if (p && p.startsWith('/')) return p
    const ref = h.get('referer')
    if (ref) {
      try {
        const u = new URL(ref)
        return u.pathname + u.search
      } catch { return null }
    }
    return null
  } catch { return null }
}

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) {
    const from = await currentPath()
    const dest = from && from !== '/signin' && !from.startsWith('/signin?')
      ? `/signin?redirect=${encodeURIComponent(from)}`
      : '/signin'
    redirect(dest)
  }
  return user
}

export async function requireRole(role: Role | Role[]) {
  const user = await requireUser()
  const roles = Array.isArray(role) ? role : [role]
  // Wrong role — send them to their own home instead of the marketing landing,
  // so a tutor accidentally hitting /student lands on /tutor (not `/`).
  if (!roles.includes(user.role)) redirect(homeForRole(user.role))
  return user
}
