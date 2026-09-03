import { PrismaClient } from '@prisma/client'
import { randomBytes, createHash } from 'node:crypto'
import type { BrowserContext } from '@playwright/test'

/**
 * SIGNING A TEST IN, WITHOUT A LOGIN FORM.
 *
 * ⚠️ WHY NOT TYPE THE PASSWORD. Driving the sign-in screen would test the sign-in
 * screen — which has its own coverage — and would pay for it on every run of a
 * test about something else. Worse, it makes the walk fail for two unrelated
 * reasons, and a test that can fail two ways is a test people stop reading.
 * Minting the session row directly is what the app itself does after a correct
 * password (lib/auth → createSession): a random token, stored as its SHA-256,
 * handed to the browser as `mcodne_session`.
 *
 * ⚠️ IT MUST MIRROR lib/auth EXACTLY. The cookie holds the RAW token and the
 * row holds its hash — get that backwards and every request is anonymous, which
 * shows up as a 404 on /work and reads like a broken guard.
 */
const COOKIE = 'mcodne_session'

const db = () => {
  const url = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? ''
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    throw new Error('e2e fixtures refuse a non-local DATABASE_URL — see prisma/seed-e2e.ts')
  }
  return new PrismaClient({ datasources: { db: { url } } })
}

/** Give `context` a signed-in session for `email`. Returns the user's id. */
export async function signIn(context: BrowserContext, email: string, baseURL: string): Promise<string> {
  const prisma = db()
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } })
    const raw = randomBytes(32).toString('hex')
    await prisma.session.create({
      data: {
        userId: user.id,
        token: createHash('sha256').update(raw).digest('hex'),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    })
    const { hostname } = new URL(baseURL)
    await context.addCookies([{
      name: COOKIE, value: raw, domain: hostname, path: '/',
      httpOnly: true, secure: false, sameSite: 'Lax',
    }])
    return user.id
  } finally {
    await prisma.$disconnect()
  }
}

/** Read something back out of the database — for assertions the UI cannot make,
 *  like „was the balance actually charged". */
export async function withDb<T>(fn: (p: PrismaClient) => Promise<T>): Promise<T> {
  const prisma = db()
  try { return await fn(prisma) } finally { await prisma.$disconnect() }
}

/** Sum of the ledger, in tetri — the only honest way to ask what a balance is
 *  (lib/credits: „the balance is their sum, there is no counter to edit"). */
export async function balanceOf(email: string): Promise<number> {
  return withDb(async p => {
    const r = await p.creditEntry.aggregate({
      _sum: { amountTetri: true },
      where: { user: { email } },
    })
    return r._sum.amountTetri ?? 0
  })
}
