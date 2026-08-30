// The thread with US — both sides, one route.
//
//   GET  ?ref=MC-XXXXX      the client's own thread, by reference
//   GET  ?requestId=…       the same thread, as an operator reads it
//   POST { body, ref? | requestId? }   say something
//
// ⚠️ THE SIDE IS DERIVED, NEVER DECLARED — the same rule as /api/request-chat,
// for the same reason: `side: 'STAFF'` in a body is exactly the field a crafted
// request would lie about. Here it falls out of WHICH KEY the caller could
// produce:
//   CLIENT  a `ref` that matches the request. Possession of the reference IS
//           the client's identity; they have no account, by design.
//   STAFF   an ADMIN session. Not the allowlist — an allowlisted provider is a
//           bidder, and this thread is the one place a client says things no
//           bidder may read (see lib/requestThread).
//
// Anything else is 404, never 403 — a 403 confirms the thread is there.
//
// ⚠️ NOTHING HERE MASKS CONTACTS, and that is a decision, not an omission. See
// lib/requestThread: the client is talking to the platform they already handed
// a phone number to, and an operator who cannot type a callback number cannot
// do the job. The masking rule belongs to the OFFER thread and stays there.

import { NextResponse, after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { normalizePublicRef } from '@/lib/requests'
import { requestsViewer } from '@/lib/requestsServer'
import { refBudgetSpent, noteRefMiss } from '@/lib/refGuard'
import { chatMessageView } from '@/lib/requestChat'
import {
  threadIsOpen, threadClosedReason, PRESENCE_TTL_MS,
  type ThreadSide,
} from '@/lib/requestThread'
import { z } from 'zod'
import { notifyMany } from '@/lib/notify'
import { sendMail } from '@/lib/mailer'
import { requestThreadEmail } from '@/lib/emailTemplates'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'

const notFound = () => NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

const Body = z.object({
  // Same ceiling and floor as the offer chat — one chat box, one contract.
  body: z.string().trim().min(1).max(2000),
  ref: z.string().trim().max(16).optional(),
  requestId: z.string().trim().max(40).optional(),
})

type Resolved = {
  side: ThreadSide
  request: { id: string; publicRef: string; status: string; email: string | null }
}

/**
 * Who is asking, and about which request.
 *
 * Returns null for every failure, so „wrong reference" and „no such request"
 * are one answer.
 */
async function resolve(ref: string | null, requestId: string | null): Promise<Resolved | null> {
  const select = { id: true, publicRef: true, status: true, email: true } as const

  // The client first: a reference is cheaper to check than a session, and it is
  // the common case by a wide margin.
  const normalised = normalizePublicRef(ref)
  if (normalised) {
    const request = await prisma.serviceRequest.findFirst({
      where: { publicRef: normalised }, select,
    })
    return request ? { side: 'CLIENT', request } : null
  }

  if (!requestId) return null
  const viewer = await requestsViewer()
  // ⚠️ ADMIN, not `providerAllowed`. providerAllowed is also true for an
  // allowlisted expert, and handing a bidder this thread would hand them the
  // client's private half of the conversation.
  if (viewer.user?.role !== 'ADMIN') return null
  const request = await prisma.serviceRequest.findUnique({ where: { id: requestId }, select })
  return request ? { side: 'STAFF', request } : null
}

/** Is anybody at the desk? One query, and the answer is a heartbeat — see
 *  lib/requestThread for why it is not an opening-hours table. */
async function anyStaffOnline(): Promise<boolean> {
  const since = new Date(Date.now() - PRESENCE_TTL_MS)
  const n = await prisma.user.count({
    where: { role: 'ADMIN', suspendedAt: null, supportSeenAt: { gt: since } },
  })
  return n > 0
}

export async function GET(req: Request) {
  const viewer = await requestsViewer()
  if (!viewer.clientAllowed) return notFound()

  // ⚠️ THE REFERENCE IS THE AUTHORISATION HERE, SO THE MISSES ARE COUNTED
  // (2026-08-21). This route accepts `?ref=` exactly as `./accept` and
  // `./[ref]/open` do — possession of the reference IS the client's identity,
  // said in this file's own header — and it was the ONE client surface that
  // did not call lib/refGuard.
  //
  // WHAT THAT MADE IT. A clean 200/404 discriminator at unlimited rate, i.e.
  // the exact primitive the budget exists to remove. `MC-` + 5 characters is 25
  // bits, which refGuard's header calls „fine against a guess and thin against
  // a sweep"; the whole defence is that a sweep runs out of misses. Measured:
  // 80 wrong references from one IP → 80 × 404, no 429, and the valid one still
  // answering 200 afterwards. Worse, the guard was ALREADY SPENT for that IP —
  // /request/<ref> was correctly 404ing — and this door still opened, so it did
  // not merely lack the budget, it handed it back.
  //
  // A harvested reference opens /request/<ref> (a phone number, after
  // acceptance) and POST ./accept (spends the client's one choice) from any
  // fresh IP. Same two lines as /open, and `resolve()` already collapses „wrong
  // reference" and „no such request" into one null — which is the miss signal.
  if (refBudgetSpent(req)) return notFound()

  await ensureDbReady()
  const url = new URL(req.url)
  const r = await resolve(url.searchParams.get('ref'), url.searchParams.get('requestId'))
  if (!r) { noteRefMiss(req); return notFound() }

  const rows = await prisma.requestMessage.findMany({
    // ⚠️ `offerId: null` IS THE THREAD SELECTOR. Without it this reads every
    // message on the request, including the client's private conversations with
    // each provider — the exact leak the per-offer threads exist to prevent.
    where: { requestId: r.request.id, offerId: null },
    // ⚠️ THE LAST 200, NOT THE FIRST (2026-08-17). This read `asc` + `take: 200`
    // while the comment claimed „the tail is what anybody reads" — so past the
    // cap every NEW message became invisible to both sides, and the read-receipt
    // sweep below (which is not capped) marked them read anyway. Messages
    // vanished and their badge cleared. Taken from the end and re-ordered here,
    // so the cap drops the OLDEST, which is what a chat window does.
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true, fromClient: true, body: true, createdAt: true,
      readByClientAt: true, readByProviderAt: true,
    },
  })

  // Reading IS the receipt — so a reader who clicks nothing still clears the
  // badge. Only the other side's messages; marking your own read is meaningless.
  after(async () => {
    try {
      await prisma.requestMessage.updateMany({
        where: r.side === 'CLIENT'
          ? { requestId: r.request.id, offerId: null, fromClient: false, readByClientAt: null }
          : { requestId: r.request.id, offerId: null, fromClient: true, readByProviderAt: null },
        data: r.side === 'CLIENT'
          ? { readByClientAt: new Date() }
          : { readByProviderAt: new Date() },
      })
    } catch { /* a receipt is never worth failing a read over */ }
  })

  return NextResponse.json({
    ok: true,
    side: r.side,
    open: threadIsOpen(r.request),
    closedReason: threadClosedReason(r.request),
    // Only the client is told — an operator does not need a badge saying they
    // are at their own desk.
    online: r.side === 'CLIENT' ? await anyStaffOnline() : undefined,
    // `chatMessageView` maps a side to `mine`, and STAFF sits where PROVIDER
    // sits: not the client. Reused rather than re-derived so a change to what a
    // bubble carries lands on both threads at once.
    // Re-ordered oldest-first for the reader: the CAP takes from the end, the
    // BUBBLES read from the start.
    messages: [...rows].reverse().map(m => chatMessageView(m, r.side === 'CLIENT' ? 'CLIENT' : 'PROVIDER')),
  })
}

export async function POST(req: Request) {
  const viewer = await requestsViewer()
  if (!viewer.clientAllowed) return notFound()

  // The same budget as GET, and it matters more here: an unguarded POST let an
  // anonymous caller WRITE into the client↔staff thread on a reference they had
  // merely guessed. Verified before the fix: 200 {"ok":true,"id":…}, read back
  // by the client on their next open.
  if (refBudgetSpent(req)) return notFound()

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  await ensureDbReady()
  const r = await resolve(parsed.data.ref ?? null, parsed.data.requestId ?? null)
  if (!r) { noteRefMiss(req); return notFound() }

  if (!threadIsOpen(r.request)) {
    return NextResponse.json({ ok: false, error: 'CLOSED' }, { status: 409 })
  }

  const body = parsed.data.body.trim()
  const created = await prisma.requestMessage.create({
    data: {
      // NULL — this is the platform thread. The whole discriminator.
      offerId: null,
      requestId: r.request.id,
      fromClient: r.side === 'CLIENT',
      fromUserId: r.side === 'CLIENT' ? null : (viewer.user?.id ?? null),
      body,
    },
    select: { id: true, createdAt: true },
  })

  // ── Telling the other side, after the response has flushed ───────────────
  after(async () => {
    try {
      if (r.side === 'CLIENT') {
        // ⚠️ THE MAIL IS THE POINT WHEN NOBODY IS ONLINE. The badge says „ახლა
        // ოფლაინ ვართ" and the hint promises the message reaches us anyway —
        // this is the line that makes that true. Same inbox as the request
        // notification and the contact form: one address, one place to look.
        const mail = requestThreadEmail({ toStaff: true, publicRef: r.request.publicRef, preview: body })
        try {
          await sendMail({ to: process.env.CONTACT_INBOX || SUPPORT_EMAIL, ...mail })
        } catch { /* best-effort */ }
        const admins = await prisma.user.findMany({
          where: { role: 'ADMIN', suspendedAt: null }, select: { id: true },
        })
        await notifyMany(admins.map(a => a.id), {
          type: 'GENERIC',
          title: 'კლიენტი წერს მოთხოვნაზე',
          body: r.request.publicRef,
          href: '/admin?tab=requests',
        })
      } else if (r.request.email) {
        const mail = requestThreadEmail({ toStaff: false, publicRef: r.request.publicRef, preview: body })
        try { await sendMail({ to: r.request.email, ...mail }) } catch { /* … */ }
      }
    } catch { /* notification is best-effort; the message is written */ }
  })

  return NextResponse.json({ ok: true, id: created.id })
}
