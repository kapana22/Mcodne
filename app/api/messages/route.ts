import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rateLimit'
import { notify } from '@/lib/notify'
import { markRelatedRead } from '@/lib/notifClear'
import { safeStoredFileUrl } from '@/lib/safeUrl'
import { preThreadInitiators } from '@/lib/preThreadInitiators'

// New-message email is NOT sent inline here anymore. Emailing the instant a
// message arrives pings people who are actively reading in-app. Instead, the
// */15 cleanup cron runs lib/messageReminders → a message that's still unread
// after ~30 min gets ONE reminder email. See lib/messageReminders.

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
  // Attachments come from /api/uploads already downscaled (1600px jpeg) — a
  // resized data:image is well under this ceiling. The cap stops a client from
  // POSTing a raw multi-MB base64 blob straight into a message row (which would
  // then re-download in full on every thread fetch).
  fileUrl: z.string().url().max(3_000_000).optional(),
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
  const t0 = performance.now()
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  const tAuth = performance.now()

  const params = new URL(req.url).searchParams
  const bookingId = params.get('bookingId')
  const withUser = params.get('withUser')
  // Threads-mode space filter. A dual-role user (STUDENT promoted to TUTOR) has
  // BOTH a client identity (bookings where they're the studentId, pre-booking
  // inquiries they started) and an expert identity (bookings on their
  // TutorProfile, inquiries a client started with them). ?space=student|tutor
  // scopes the inbox to one hat so the two spaces don't show the same merged
  // list. Absent → legacy union (kept for any un-scoped caller).
  const spaceParam = params.get('space')
  const space = spaceParam === 'student' || spaceParam === 'tutor' ? spaceParam : null
  // Incremental polling: with ?since=<ISO> the thread endpoints return ONLY
  // messages newer than that timestamp and skip re-sending the participant
  // header the client already holds — so a 20s poll with nothing new is a few
  // bytes instead of the whole thread.
  const sinceParam = params.get('since')
  const sinceDate = sinceParam ? new Date(sinceParam) : null
  const sinceValid = !!sinceDate && !isNaN(sinceDate.getTime())
  const sinceFilter = sinceValid ? { createdAt: { gt: sinceDate! } } : {}

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
    // A pre-booking consultation thread needs an EXPERT to consult, so at least
    // one party must be a TUTOR (the same trust boundary the POST guard
    // enforces). STUDENT↔TUTOR and TUTOR↔TUTOR (a dual-role expert asking
    // another expert as a client) are both valid; STUDENT↔STUDENT (no expert)
    // and anything involving an ADMIN are not.
    const roles = new Set([(user as any).role, other.role])
    if (!roles.has('TUTOR') || roles.has('ADMIN')) {
      return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    // PII gate: the `pair.otherUser` header (name + avatar) is returned below. A
    // TUTOR is public (anyone may open a fresh inquiry to one), but a STUDENT's
    // identity must NOT be resolvable by id alone — so if the counterparty is not
    // a TUTOR, require a real message relationship first. Without this, any
    // expert could enumerate arbitrary students' names/avatars via ?withUser.
    if (other.role !== 'TUTOR') {
      const rel = await prisma.message.findFirst({
        where: { bookingId: null, OR: [{ fromId: user.id, toId: withUser }, { fromId: withUser, toId: user.id }] },
        select: { id: true },
      })
      if (!rel) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const messages = await prisma.message.findMany({
      where: {
        bookingId: null,
        ...sinceFilter,
        OR: [
          { fromId: user.id, toId: withUser },
          { fromId: withUser, toId: user.id },
        ],
      },
      orderBy: { createdAt: 'asc' },
      // Avatars are NOT embedded per message — the client renders each sender's
      // avatar from the 2 thread participants (returned once). This stopped a
      // repeated avatar from multiplying the payload per message.
      include: { from: { select: { id: true, fullName: true } } },
    })
    // Read receipts + notif cleanup are UX side-effects the payload doesn't need
    // — defer them past the response so these WRITES never sit in the request's
    // critical path (they were a dominant source of chat latency + connection-
    // pool pressure on every 20s poll). Skip entirely when nothing is unread.
    if (messages.some(m => m.toId === user.id && m.readAt === null)) {
      after(async () => {
        await Promise.all([
          prisma.message.updateMany({
            where: { bookingId: null, fromId: withUser, toId: user.id, readAt: null },
            data: { readAt: new Date() },
          }),
          markRelatedRead(user.id, `messages/u/${withUser}`, 'MESSAGE_NEW'),
        ]).catch(() => {})
      })
    }
    return NextResponse.json({
      ok: true,
      messages,
      // Header only on the initial (non-incremental) load; the client keeps it.
      ...(sinceValid ? {} : { pair: { otherUser: other } }),
    })
  }

  if (bookingId) {
    // Fetch the thread in PARALLEL with the membership/header query — both are
    // independent reads, so this is one round-trip instead of two. Messages are
    // only RETURNED once membership passes, so a foreign bookingId leaks nothing
    // (same pattern as /api/bookings/[id]).
    const messagesPromise = prisma.message.findMany({
      where: { bookingId, ...sinceFilter },
      orderBy: { createdAt: 'asc' },
      // Avatars are NOT embedded per message — rendered client-side from the 2
      // participants in the header below (returned once, on the initial load).
      include: { from: { select: { id: true, fullName: true } } },
    })
    // The widened select doubles as the thread's booking-context header at zero
    // extra queries.
    const b = await prisma.booking.findFirst({
      where: { id: bookingId, OR: [{ studentId: user.id }, { tutor: { userId: user.id } }] },
      select: {
        id: true, ref: true, topic: true, status: true, startAt: true, durationMin: true,
        student: { select: { id: true, fullName: true, avatarUrl: true } },
        tutor: { select: { user: { select: { id: true, fullName: true, avatarUrl: true } } } },
      },
    })
    const tBooking = performance.now()
    if (!b) {
      messagesPromise.catch(() => {}) // don't leak an unhandled rejection
      return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })
    }
    const messages = await messagesPromise
    const tMsgs = performance.now()

    // Read receipts + notif cleanup were the chat's dominant latency: two WRITES
    // in the request's critical path, fired on EVERY 20s poll from BOTH parties,
    // holding a connection each time and exhausting the pool on the slow DB.
    // They're pure UX side-effects the payload doesn't need — defer past the
    // response, and skip entirely when nothing is actually unread (most polls).
    if (messages.some(m => m.toId === user.id && m.readAt === null)) {
      after(async () => {
        await Promise.all([
          prisma.message.updateMany({
            where: { bookingId, toId: user.id, readAt: null },
            data: { readAt: new Date() },
          }),
          markRelatedRead(user.id, bookingId, 'MESSAGE_NEW'),
        ]).catch(() => {})
      })
    }
    const res = NextResponse.json({
      ok: true,
      messages,
      // Header only on the initial (non-incremental) load; the client keeps it.
      ...(sinceValid ? {} : {
        booking: {
          id: b.id, ref: b.ref, topic: b.topic, status: b.status,
          startAt: b.startAt, durationMin: b.durationMin,
          student: b.student, tutorUser: b.tutor.user,
        },
      }),
    })
    res.headers.set('Server-Timing', `auth;dur=${(tAuth - t0).toFixed(0)}, booking;dur=${(tBooking - tAuth).toFixed(0)}, msgs;dur=${(tMsgs - tBooking).toFixed(0)}`)
    return res
  }

  const bookings = await prisma.booking.findMany({
    where: {
      OR: [{ studentId: user.id }, { tutor: { userId: user.id } }],
      messages: { some: {} },
    },
    take: 40,
    include: {
      // Only the counterparty's name+avatar is used below — `select` the nested
      // user instead of `include`-ing the whole (blob-carrying) TutorProfile.
      tutor: { select: { user: { select: { id: true, fullName: true, avatarUrl: true } } } },
      student: { select: { id: true, fullName: true, avatarUrl: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { body: true, fromId: true, fileName: true, createdAt: true } },
      _count: { select: { messages: { where: { toId: user.id, readAt: null } } } },
    },
  })

  const bookingThreads = bookings
    // In a booking I'm EITHER the client (studentId) or the expert (tutor) —
    // never both (self-booking is refused). Scope to the active space.
    .filter(b => {
      const iAmStudent = b.studentId === user.id
      if (space === 'student') return iAmStudent
      if (space === 'tutor') return !iAmStudent
      return true
    })
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
        lastHasFile: !!last?.fileName,
        at: (last?.createdAt ?? new Date(0)),
        unread: b._count.messages > 0,
        unreadCount: b._count.messages,
        // Both sides open in their two-pane messages center now (the student
        // side used to deep-link to the booking-page #chat anchor).
        href: iAmStudent ? `/student/messages/${b.id}` : `/tutor/messages/${b.id}`,
      }
    })

  // ── Pre-booking PAIR threads ─────────────────────────────────────────────
  // Messages with bookingId:null involving me, grouped by the OTHER participant.
  // Ordered desc so the first row seen per partner is the latest message.
  // Recent messages (for previews/unread/sort) + the AUTHORITATIVE initiator per
  // partner in parallel. The initiator (= client) decides which space a thread
  // belongs to; resolving it from the true first message (not the 200-row window)
  // keeps the bucket correct for high-volume users and consistent with the POST
  // path. See lib/preThreadInitiators.
  const [preMsgs, preInitiators] = await Promise.all([
    prisma.message.findMany({
      where: { bookingId: null, OR: [{ fromId: user.id }, { toId: user.id }] },
      orderBy: { createdAt: 'desc' },
      take: 200,
      // `select` (not `include`) so the base64 `fileUrl` attachment is NOT pulled
      // for 200 rows — the inbox only needs a preview + a "has attachment" flag,
      // which the tiny `fileName` provides.
      select: {
        id: true, body: true, fromId: true, toId: true, readAt: true, createdAt: true, fileName: true,
        from: { select: { id: true, fullName: true, avatarUrl: true } },
        to: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    }),
    preThreadInitiators(user.id),
  ])
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
  const preThreads = [...preByPartner.values()]
    // I'm the client in threads I opened, the expert in threads opened with me.
    // The initiator comes from the authoritative map (same source+filter as
    // preMsgs, so the partner is always present); if it were ever absent, an
    // undefined initiator is !== me → the thread files under the expert space.
    .filter(g => {
      const iAmClient = preInitiators.get(g.other.id) === user.id
      if (space === 'student') return iAmClient
      if (space === 'tutor') return !iAmClient
      return true
    })
    .map(g => {
      // Deep-link into the space that matches my hat in THIS thread, not my
      // global role (a dual-role expert's client inquiries must open in /student).
      const area = preInitiators.get(g.other.id) === user.id ? 'student' : 'tutor'
      return {
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
        lastHasFile: !!g.last.fileName,
        at: g.last.createdAt,
        unread: g.unread > 0,
        unreadCount: g.unread,
        href: `/${area}/messages/u/${g.other.id}`,
      }
    })

  const allThreads = [...bookingThreads, ...preThreads]
    .sort((a, z) => new Date(z.at).getTime() - new Date(a.at).getTime())
  // unreadCount is the sidebar/badge number, so sum it over EVERY thread — an
  // unread conversation older than the 20 most-recent must still be counted. The
  // returned `threads` list itself is capped at 20 for payload size.
  const unreadCount = allThreads.reduce((n, t) => n + t.unreadCount, 0)
  const threads = allThreads.slice(0, 20)

  return NextResponse.json({
    ok: true,
    threads,
    unreadCount,
  })
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

  // Email verification is intentionally NOT required to chat (removed
  // 2026-07-20) — it was friction with no payoff at this stage.

  const rl = rateLimit(`msg:${user.id}`, 40, 60)
  if (!rl.ok) return NextResponse.json({ ok: false, error: 'RATE_LIMITED', retryInSec: rl.retryInSec }, { status: 429 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
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

    // A pre-booking inquiry needs an expert to consult — at least one party must
    // be a TUTOR, and never an ADMIN. STUDENT→TUTOR and TUTOR→TUTOR (a dual-role
    // expert asking another expert as a client) are both valid.
    const roles = new Set([(user as any).role, other.role])
    if (!roles.has('TUTOR') || roles.has('ADMIN')) {
      return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    // The thread's INITIATOR is the client; the responder is the expert. Look up
    // the earliest message in the pair so each side's hat is roles-agnostic (it
    // stays correct even when both parties are dual-role experts).
    const firstMsg = await prisma.message.findFirst({
      where: { bookingId: null, OR: [{ fromId: user.id, toId: toUserId }, { fromId: toUserId, toId: user.id }] },
      orderBy: { createdAt: 'asc' },
      select: { fromId: true },
    })
    const isNewThread = !firstMsg
    const iInitiated = isNewThread || firstMsg!.fromId === user.id

    // Opening a NEW thread is a CLIENT action — I must be messaging an expert.
    // This stops an expert cold-opening to a client (the old "reply-only" rule);
    // once a client has opened the thread, either side may continue freely.
    if (isNewThread && other.role !== 'TUTOR') {
      return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    // Tighter limiter on brand-new inquiries (protect experts from a spray across
    // many profiles). Only bites when I'm opening a NEW pair thread.
    if (isNewThread) {
      const rlInit = rateLimit(`msginit:${user.id}`, 10, 3600)
      if (!rlInit.ok) return NextResponse.json({ ok: false, error: 'RATE_LIMITED', retryInSec: rlInit.retryInSec }, { status: 429 })
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
    // Recipient opens the thread in the space matching THEIR hat: if I opened it
    // I'm the client and they're the expert (tutor space); if they opened it
    // they're the client (student space). Keyed by the OTHER user — from their
    // view that is me (the sender).
    const recipientArea = iInitiated ? 'tutor' : 'student'
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
      href: isFromStudent ? `/tutor/messages/${b.id}` : `/student/messages/${b.id}`,
    })
    // Sender is actively in the thread — clear any outstanding MESSAGE_NEW
    // notifs on their side for this booking. Matched on the bare booking id
    // so legacy (/…/bookings/{id}#chat) and new (/tutor/messages/{id}) hrefs
    // both clear.
    await markRelatedRead(user.id, b.id, 'MESSAGE_NEW')
  })

  return NextResponse.json({ ok: true, message: msg })
}
