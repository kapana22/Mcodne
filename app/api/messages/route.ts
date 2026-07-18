import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rateLimit'
import { notify } from '@/lib/notify'
import { markRelatedRead } from '@/lib/notifClear'
import { safeStoredFileUrl } from '@/lib/safeUrl'

// POST accepts EITHER a booking-scoped message ({ bookingId }) OR a pre-booking
// pair message ({ toUserId }) — exactly one. A pre-booking thread is just
// messages with bookingId:null between a (student, expert-user) pair; the DB
// shape is unchanged (Message.bookingId is nullable). See the guard rules in
// POST below for who may open/reply to a pair thread.
const Body = z.object({
  bookingId: z.string().optional(),
  toUserId: z.string().optional(),
  body: z.string().min(1).max(2000),
  // NOTE: zod's `.url()` accepts `javascript:` and `data:text/html` — both are
  // valid URLs per WHATWG — so it does NOT stop a stored-XSS payload from being
  // saved and later rendered as a clickable <a href>. The scheme is re-checked
  // with `safeStoredFileUrl` below (only http(s)/data:image/* pass); the render
  // side also guards with `safeHttpUrl` as defense in depth.
  fileUrl: z.string().url().optional(),
  fileName: z.string().max(200).optional(),
}).refine(
  d => (!!d.bookingId) !== (!!d.toUserId),
  { message: 'Exactly one of bookingId / toUserId is required' },
)

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

  const params = new URL(req.url).searchParams
  const bookingId = params.get('bookingId')
  const withUser = params.get('withUser')

  // ── Pre-booking PAIR thread: ?withUser=<userId> ──────────────────────────
  // Messages with bookingId:null between me and <userId>. The membership check
  // is inherent: the query only ever returns rows where I am from/to, so a
  // client can never read another pair's thread by passing a foreign id.
  if (withUser) {
    if (withUser === user.id) {
      return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })
    }
    const other = await prisma.user.findUnique({
      where: { id: withUser },
      select: { id: true, fullName: true, avatarUrl: true, role: true },
    })
    if (!other) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
    // The pair must be exactly one STUDENT and one TUTOR — the same trust
    // boundary the POST guard enforces. Two students / two tutors / an admin
    // never form a pre-booking consultation thread.
    const roles = new Set([(user as any).role, other.role])
    if (!(roles.has('STUDENT') && roles.has('TUTOR'))) {
      return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const [messages] = await Promise.all([
      prisma.message.findMany({
        where: {
          bookingId: null,
          OR: [
            { fromId: user.id, toId: withUser },
            { fromId: withUser, toId: user.id },
          ],
        },
        orderBy: { createdAt: 'asc' },
        include: { from: { select: { id: true, fullName: true, avatarUrl: true } } },
      }),
      // Read receipts — viewer is looking at the thread, so their inbound
      // messages from this partner are now read.
      prisma.message.updateMany({
        where: { bookingId: null, fromId: withUser, toId: user.id, readAt: null },
        data: { readAt: new Date() },
      }),
      // Clear the viewer's MESSAGE_NEW notifs pointing at this pair thread.
      markRelatedRead(user.id, `messages/u/${withUser}`, 'MESSAGE_NEW'),
    ])
    return NextResponse.json({
      ok: true,
      messages,
      pair: { otherUser: other },
    })
  }

  if (bookingId) {
    // Membership check first — never leak another pair's thread. The widened
    // select doubles as the thread's booking-context header (messages center)
    // at zero extra queries.
    const b = await prisma.booking.findFirst({
      where: { id: bookingId, OR: [{ studentId: user.id }, { tutor: { userId: user.id } }] },
      select: {
        id: true, ref: true, topic: true, status: true, startAt: true, durationMin: true,
        student: { select: { id: true, fullName: true, avatarUrl: true } },
        tutor: { select: { user: { select: { id: true, fullName: true, avatarUrl: true } } } },
      },
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
      // Viewer is looking at the thread — clear their MESSAGE_NEW notifs for
      // this booking so the bell badge agrees with the chat's read state.
      // Matched on the bare bookingId: legacy hrefs are /…/bookings/{id}#chat,
      // new tutor hrefs are /tutor/messages/{id} — the id appears in both.
      markRelatedRead(user.id, bookingId, 'MESSAGE_NEW'),
    ])
    return NextResponse.json({
      ok: true,
      messages,
      booking: {
        id: b.id, ref: b.ref, topic: b.topic, status: b.status,
        startAt: b.startAt, durationMin: b.durationMin,
        student: b.student, tutorUser: b.tutor.user,
      },
    })
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

  const iAmTutor = (user as any).role === 'TUTOR'
  const bookingThreads = bookings
    .map(b => {
      const last = b.messages[0]
      const iAmStudent = b.studentId === user.id
      const other = iAmStudent ? b.tutor.user : b.student
      return {
        key: `b-${b.id}`,
        bookingId: b.id,
        pre: false,
        name: other.fullName,
        avatarUrl: other.avatarUrl,
        topic: b.topic,
        status: b.status,
        preview: last?.body ?? '',
        lastFromMe: last?.fromId === user.id,
        lastHasFile: !!last?.fileUrl,
        at: (last?.createdAt ?? new Date(0)),
        unread: b._count.messages > 0,
        unreadCount: b._count.messages,
        // Tutor threads open in the messages center; student side keeps the
        // booking-page chat anchor.
        href: iAmStudent ? `/student/bookings/${b.id}#chat` : `/tutor/messages/${b.id}`,
      }
    })

  // ── Pre-booking PAIR threads ─────────────────────────────────────────────
  // Messages with bookingId:null involving me, grouped by the OTHER participant.
  // Ordered desc so the first row seen per partner is the latest message.
  const preMsgs = await prisma.message.findMany({
    where: { bookingId: null, OR: [{ fromId: user.id }, { toId: user.id }] },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      from: { select: { id: true, fullName: true, avatarUrl: true } },
      to: { select: { id: true, fullName: true, avatarUrl: true } },
    },
  })
  const preByPartner = new Map<string, { last: (typeof preMsgs)[number]; unread: number; other: { id: string; fullName: string; avatarUrl: string | null } }>()
  for (const m of preMsgs) {
    const iAmSender = m.fromId === user.id
    const other = iAmSender ? m.to : m.from
    if (!other) continue
    let g = preByPartner.get(other.id)
    if (!g) {
      // preMsgs is desc — the first message seen for a partner is the latest.
      g = { last: m, unread: 0, other }
      preByPartner.set(other.id, g)
    }
    if (m.toId === user.id && m.readAt === null) g.unread++
  }
  const area = iAmTutor ? 'tutor' : 'student'
  const preThreads = [...preByPartner.values()].map(g => ({
    key: `u-${g.other.id}`,
    bookingId: undefined as string | undefined,
    pre: true,
    name: g.other.fullName,
    avatarUrl: g.other.avatarUrl,
    // No booking → no topic; the inbox shows a subtle pre-inquiry label.
    topic: 'წინასწარი შეკითხვა',
    status: 'PRE',
    preview: g.last.body ?? '',
    lastFromMe: g.last.fromId === user.id,
    lastHasFile: !!g.last.fileUrl,
    at: g.last.createdAt,
    unread: g.unread > 0,
    unreadCount: g.unread,
    href: `/${area}/messages/u/${g.other.id}`,
  }))

  const threads = [...bookingThreads, ...preThreads]
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

  // ── Pre-booking PAIR message ({ toUserId }) ──────────────────────────────
  if (parsed.data.toUserId) {
    const toUserId = parsed.data.toUserId
    if (toUserId === user.id) {
      return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })
    }
    const other = await prisma.user.findUnique({
      where: { id: toUserId },
      select: { id: true, fullName: true, role: true },
    })
    if (!other) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })

    const myRole = (user as any).role
    let allowed = false
    if (myRole === 'STUDENT' && other.role === 'TUTOR') {
      // Student initiates to any expert — the objection-handler CTA.
      allowed = true
    } else if (myRole === 'TUTOR' && other.role === 'STUDENT') {
      // Tutor may only REPLY: a prior pre-booking message from that student to
      // me must already exist. Stops a random expert cold-messaging students.
      const prior = await prisma.message.findFirst({
        where: { bookingId: null, fromId: toUserId, toId: user.id },
        select: { id: true },
      })
      allowed = !!prior
    }
    if (!allowed) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })

    // Tighter limiter on brand-new student initiations (protect experts from a
    // spray across many profiles). Only bites when this is a NEW pair thread.
    if (myRole === 'STUDENT') {
      const existing = await prisma.message.findFirst({
        where: { bookingId: null, OR: [{ fromId: user.id, toId: toUserId }, { fromId: toUserId, toId: user.id }] },
        select: { id: true },
      })
      if (!existing) {
        const rlInit = rateLimit(`msginit:${user.id}`, 10, 3600)
        if (!rlInit.ok) return NextResponse.json({ ok: false, error: 'RATE_LIMITED', retryInSec: rlInit.retryInSec }, { status: 429 })
      }
    }

    const msg = await prisma.message.create({
      data: {
        bookingId: null,
        fromId: user.id,
        toId: toUserId,
        body: parsed.data.body.trim(),
        fileUrl: safeFileUrl,
        fileName: parsed.data.fileName,
      },
      include: { from: { select: { id: true, fullName: true, avatarUrl: true } } },
    })

    const preview = msg.body.length > 80 ? msg.body.slice(0, 77) + '…' : msg.body
    // Recipient opens the pair thread keyed by the OTHER user — from their view
    // that is me (the sender). Tutors land in their messages center, students
    // on their full-screen pair thread.
    const recipientArea = other.role === 'TUTOR' ? 'tutor' : 'student'
    after(async () => {
      await notify(toUserId, {
        type: 'MESSAGE_NEW',
        title: `ახალი შეტყობინება — ${msg.from.fullName}`,
        body: preview,
        href: `/${recipientArea}/messages/u/${user.id}`,
      })
      await markRelatedRead(user.id, `messages/u/${toUserId}`, 'MESSAGE_NEW')
    })

    return NextResponse.json({ ok: true, message: msg })
  }

  // Guard: `id: undefined` in a Prisma where would match ANY of my bookings —
  // the refine above guarantees bookingId is present here, but assert it so a
  // future refactor can't open that hole.
  const bookingId = parsed.data.bookingId
  if (!bookingId) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  const b = await prisma.booking.findFirst({
    where: {
      id: bookingId,
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

  // Notification + notif-cleanup run AFTER the response — they cost 3 more
  // remote round-trips and the sender shouldn't wait on them to see their own
  // bubble appear.
  const isFromStudent = user.id === b.studentId
  const preview = msg.body.length > 80 ? msg.body.slice(0, 77) + '…' : msg.body
  after(async () => {
    // Notify the recipient — tutors land in the messages center thread,
    // students on their booking page's chat anchor.
    await notify(toId, {
      type: 'MESSAGE_NEW',
      title: `ახალი შეტყობინება — ${msg.from.fullName}`,
      body: preview,
      href: isFromStudent ? `/tutor/messages/${b.id}` : `/student/bookings/${b.id}#chat`,
    })
    // Sender is actively in the thread — clear any outstanding MESSAGE_NEW
    // notifs on their side for this booking. Matched on the bare booking id
    // so legacy (/…/bookings/{id}#chat) and new (/tutor/messages/{id}) hrefs
    // both clear.
    await markRelatedRead(user.id, b.id, 'MESSAGE_NEW')
  })

  return NextResponse.json({ ok: true, message: msg })
}
