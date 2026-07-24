import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { newMeetingUrl, isStaleMeetingUrl } from '@/lib/meeting'
import { rateLimit } from '@/lib/rateLimit'

// Instant "let's meet now" call from the chat. Posts a call-invite MESSAGE into
// the booking thread; the chat renders it as a join card. Message has no `type`
// column, so the invite is marked by `fileName === CALL_SENTINEL` with the room
// URL in `fileUrl` (matches the sentinel the chat checks for).
const CALL_SENTINEL = '__call__'

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await ctx.params

  // IDOR guard — only a party of the booking can start a call on it.
  const booking = await prisma.booking.findFirst({
    where: { id, OR: [{ studentId: user.id }, { tutor: { userId: user.id } }] },
    include: { tutor: { select: { userId: true } } },
  })
  if (!booking) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

  // No calls on a finished/dead booking.
  if (booking.status === 'COMPLETED' || booking.status === 'CANCELED' || booking.status === 'NO_SHOW') {
    return NextResponse.json({ ok: false, error: 'BAD_STATE' }, { status: 400 })
  }

  // Anti-spam: at most one call invite per 30s per user+booking.
  const rl = rateLimit(`call:${user.id}:${id}`, 1, 30)
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: 'RATE_LIMIT', retryInSec: rl.retryInSec }, { status: 429 })
  }

  // Reuse the booking's room if it's a current-provider one; otherwise mint +
  // persist a fresh room (also migrates legacy meet.jit.si rooms). Both parties
  // then land in the same room.
  let room = booking.meetingUrl
  if (isStaleMeetingUrl(room)) {
    room = await newMeetingUrl()
    await prisma.booking.update({ where: { id }, data: { meetingUrl: room } })
  }

  const otherId = booking.studentId === user.id ? booking.tutor.userId : booking.studentId
  const otherIsStudent = otherId === booking.studentId

  const message = await prisma.message.create({
    data: {
      bookingId: id,
      fromId: user.id,
      toId: otherId,
      body: 'ვიდეოზარზე მოწვევა',
      fileUrl: room,
      fileName: CALL_SENTINEL,
    },
    select: { id: true, fromId: true, body: true, fileUrl: true, fileName: true, createdAt: true },
  })

  await notify(otherId, {
    type: 'MESSAGE_NEW',
    title: 'ვიდეოზარზე გიწვევენ',
    body: `${user.fullName} — ${booking.topic}`,
    href: `${otherIsStudent ? '/student' : '/tutor'}/messages/${id}`,
  })

  return NextResponse.json({ ok: true, message })
}
