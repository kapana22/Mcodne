import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rateLimit'
import { notify } from '@/lib/notify'
import { markRelatedRead } from '@/lib/notifClear'
import { safeStoredFileUrl } from '@/lib/safeUrl'

const Body = z.object({
  bookingId: z.string(),
  body: z.string().min(1).max(2000),
  // NOTE: zod's `.url()` accepts `javascript:` and `data:text/html` — both are
  // valid URLs per WHATWG — so it does NOT stop a stored-XSS payload from being
  // saved and later rendered as a clickable <a href>. The scheme is re-checked
  // with `safeStoredFileUrl` below (only http(s)/data:image/* pass); the render
  // side also guards with `safeHttpUrl` as defense in depth.
  fileUrl: z.string().url().optional(),
  fileName: z.string().max(200).optional(),
})

// GET /api/messages — two modes:
//
// 1. ?bookingId=<id> — the live thread for one booking (chat-pane polling).
//    Marks every message addressed to the caller in that booking as READ —
//    the caller is literally looking at the thread, so the side effect is the
//    read receipt working as users expect. This is the ONLY place readAt is
//    ever set; before it existed threads stayed "unread" forever.
// 2. no param — recent conversation threads for the signed-in user, ordered by
//    LAST MESSAGE time (booking.updatedAt is NOT bumped by messages, so it
//    mis-sorted threads), with per-thread unread counts.
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

  const bookingId = new URL(req.url).searchParams.get('bookingId')

  if (bookingId) {
    // Membership check first — never leak another pair's thread.
    const b = await prisma.booking.findFirst({
      where: { id: bookingId, OR: [{ studentId: user.id }, { tutor: { userId: user.id } }] },
      select: { id: true },
    })
    if (!b) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })

    const [messages] = await Promise.all([
      prisma.message.findMany({
        where: { bookingId },
        orderBy: { createdAt: 'asc' },
        include: { from: { select: { id: true, fullName: true, avatarUrl: true } } },
      }),
      prisma.message.updateMany({
        where: { bookingId, toId: user.id, readAt: null },
        data: { readAt: new Date() },
      }),
    ])
    return NextResponse.json({ ok: true, messages })
  }

  const bookings = await prisma.booking.findMany({
    where: {
      OR: [{ studentId: user.id }, { tutor: { userId: user.id } }],
      messages: { some: {} },
    },
    take: 40,
    include: {
      tutor: { include: { user: { select: { id: true, fullName: true, avatarUrl: true } } } },
      student: { select: { id: true, fullName: true, avatarUrl: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      _count: { select: { messages: { where: { toId: user.id, readAt: null } } } },
    },
  })

  const threads = bookings
    .map(b => {
      const last = b.messages[0]
      const iAmStudent = b.studentId === user.id
      const other = iAmStudent ? b.tutor.user : b.student
      return {
        bookingId: b.id,
        name: other.fullName,
        avatarUrl: other.avatarUrl,
        preview: last?.body ?? '',
        at: (last?.createdAt ?? new Date(0)),
        unread: b._count.messages > 0,
        unreadCount: b._count.messages,
        href: iAmStudent ? `/student/bookings/${b.id}#chat` : `/tutor/bookings/${b.id}#chat`,
      }
    })
    .sort((a, z) => new Date(z.at).getTime() - new Date(a.at).getTime())
    .slice(0, 20)

  return NextResponse.json({
    ok: true,
    threads,
    unreadCount: threads.reduce((n, t) => n + t.unreadCount, 0),
  })
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

  // Verified-email gate — chat participation carries the same trust bar as
  // bookings. Cleaner to hard-block than to fan out "unverified sender" flags.
  if (!(user as any).emailVerified) {
    return NextResponse.json({ ok: false, error: 'EMAIL_NOT_VERIFIED' }, { status: 403 })
  }

  const rl = rateLimit(`msg:${user.id}`, 40, 60)
  if (!rl.ok) return NextResponse.json({ ok: false, error: 'RATE_LIMITED', retryInSec: rl.retryInSec }, { status: 429 })

  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  // Reject attachment URLs whose scheme could execute on the recipient's click
  // (javascript:, data:text/html, …). Only http(s) links and inline
  // data:image/* previews are allowed. Absent fileUrl is fine (text-only msg).
  let safeFileUrl: string | undefined
  if (parsed.data.fileUrl) {
    const cleaned = safeStoredFileUrl(parsed.data.fileUrl)
    if (!cleaned) return NextResponse.json({ ok: false, error: 'UNSAFE_FILE_URL' }, { status: 400 })
    safeFileUrl = cleaned
  }

  const b = await prisma.booking.findFirst({
    where: {
      id: parsed.data.bookingId,
      OR: [{ studentId: user.id }, { tutor: { userId: user.id } }],
    },
    include: { tutor: true },
  })
  if (!b) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })
  const toId = user.id === b.studentId ? b.tutor.userId : b.studentId

  const msg = await prisma.message.create({
    data: {
      bookingId: b.id,
      fromId: user.id,
      toId,
      body: parsed.data.body.trim(),
      fileUrl: safeFileUrl,
      fileName: parsed.data.fileName,
    },
    include: { from: { select: { id: true, fullName: true, avatarUrl: true } } },
  })

  // Notify the recipient — booking-scoped chat surfaces are per-role, so
  // link to the party's own booking-detail page (chat anchor).
  const isFromStudent = user.id === b.studentId
  const preview = msg.body.length > 80 ? msg.body.slice(0, 77) + '…' : msg.body
  await notify(toId, {
    type: 'MESSAGE_NEW',
    title: `ახალი შეტყობინება — ${msg.from.fullName}`,
    body: preview,
    href: isFromStudent ? `/tutor/bookings/${b.id}#chat` : `/student/bookings/${b.id}#chat`,
  })

  // Sender is actively in the thread — clear any outstanding MESSAGE_NEW
  // notifs on their side for this booking. The path stem matches both the
  // student and tutor chat hrefs.
  await markRelatedRead(user.id, `/bookings/${b.id}`, 'MESSAGE_NEW')

  return NextResponse.json({ ok: true, message: msg })
}
