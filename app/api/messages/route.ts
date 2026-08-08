import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rateLimit'
import { notify } from '@/lib/notify'
import { markRelatedRead } from '@/lib/notifClear'
import { safeStoredFileUrl } from '@/lib/safeUrl'
import { preThreadInitiators } from '@/lib/preThreadInitiators'
import { recomputeResponseTime } from '@/lib/responseTimeStore'
import { avatarSrc } from '@/lib/avatarSrc'

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
  // with `safeStoredFileUrl` below (only http(s)/data:image/* and base64
  // data:application/pdf pass — the exact forms /api/uploads emits); the render
  // side runs the same guard as defense in depth.
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
  // ?probe=1 — MEMBERSHIP CHECK ONLY, no message rows, no read-receipt writes.
  // The four thread pages need a synchronous "am I allowed in here?" answer so a
  // foreign/deleted thread renders „მიმოწერა ვერ მოიძებნა" instead of an eternal
  // skeleton. They used to get it by re-issuing the EXACT thread GET the chat
  // hook already fires on mount (up to 200 messages, base64 attachments and all)
  // purely to read its status code — every thread open fetched the whole
  // conversation twice. The probe runs the identical guards and returns `{ ok }`,
  // so the 403/404 semantics are unchanged and the payload is a few bytes.
  const probe = params.get('probe') === '1'
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
      select: {
        id: true, fullName: true, avatarUrl: true, role: true, suspendedAt: true,
        // Expert profile id + flat consultation price — surfaced on the pair
        // header so the student can see the price they saw on the profile and
        // book straight from the chat. Null for a non-expert peer. No email/phone.
        tutor: { select: { id: true, price: true } },
      },
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
    // LIVE TUTOR is public (anyone may open a fresh inquiry to one), but a
    // STUDENT's identity must NOT be resolvable by id alone — so if the
    // counterparty is not a TUTOR, require a real message relationship first.
    // Without this, any expert could enumerate arbitrary students' names/avatars
    // via ?withUser. A SUSPENDED expert goes through the same gate: they are
    // off-platform everywhere else (public profile 404s them, browse filters
    // them, booking POST refuses them), so a cold ?withUser probe must not
    // resolve them either — while an EXISTING thread still passes (the check is
    // "do we already talk?"), so history never breaks under a suspension.
    if (other.role !== 'TUTOR' || other.suspendedAt) {
      const rel = await prisma.message.findFirst({
        where: { bookingId: null, OR: [{ fromId: user.id, toId: withUser }, { fromId: withUser, toId: user.id }] },
        select: { id: true },
      })
      if (!rel) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    // Every gate above has passed — that IS the probe's answer. Stop before the
    // thread read so the page's membership check costs nothing.
    if (probe) return NextResponse.json({ ok: true })

    // Initial load (no ?since) is capped to the most-recent 200 messages so a
    // long thread's full base64 attachment history isn't re-downloaded on every
    // open; the incremental ?since poll fetches only the (small) delta ascending.
    const initialLoad = !sinceValid
    const rowsPair = await prisma.message.findMany({
      where: {
        bookingId: null,
        ...sinceFilter,
        OR: [
          { fromId: user.id, toId: withUser },
          { fromId: withUser, toId: user.id },
        ],
      },
      orderBy: { createdAt: initialLoad ? 'desc' : 'asc' },
      // take applies UNCONDITIONALLY: `?since=1970-…` used to disable the cap,
      // turning one GET into the entire thread with its base64 attachments.
      take: 200,
      // Avatars are NOT embedded per message — the client renders each sender's
      // avatar from the 2 thread participants (returned once). This stopped a
      // repeated avatar from multiplying the payload per message.
      include: { from: { select: { id: true, fullName: true } } },
    })
    const messages = initialLoad ? rowsPair.reverse() : rowsPair
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
      ...(sinceValid ? {} : {
        pair: {
          otherUser: {
            id: other.id, fullName: other.fullName, avatarUrl: avatarSrc(other.id, other.avatarUrl), role: other.role,
            tutorProfileId: other.tutor?.id ?? null,
            price: other.tutor?.price ?? null,
          },
        },
      }),
    })
  }

  if (bookingId) {
    // Probe: the SAME membership predicate the full branch uses, and nothing
    // else — no messages, no header, no read-receipt writes. Same 403 on a
    // foreign/missing booking.
    if (probe) {
      const member = await prisma.booking.findFirst({
        where: { id: bookingId, OR: [{ studentId: user.id }, { tutor: { userId: user.id } }] },
        select: { id: true },
      })
      if (!member) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })
      return NextResponse.json({ ok: true })
    }

    // Fetch the thread in PARALLEL with the membership/header query — both are
    // independent reads, so this is one round-trip instead of two. Messages are
    // only RETURNED once membership passes, so a foreign bookingId leaks nothing
    // (same pattern as /api/bookings/[id]).
    // Same cap as the pair thread: recent-200 on the initial load, full delta
    // ascending on the ?since poll — bounds the base64-attachment payload.
    const initialLoadB = !sinceValid
    const messagesPromise = prisma.message.findMany({
      where: { bookingId, ...sinceFilter },
      orderBy: { createdAt: initialLoadB ? 'desc' : 'asc' },
      ...(initialLoadB ? { take: 200 } : {}),
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
    const iAmStudent = b.student.id === user.id
    const otherId = iAmStudent ? b.tutor.user.id : b.student.id
    // The EARLIEST pre-booking („შეკითხვა ჯავშნამდე") message with this same
    // partner — one indexed read, initial load only, fanned out alongside the
    // thread fetch so it adds no latency. It answers two things at once:
    //   • does a pre-booking conversation exist at all (it is SUPPRESSED from the
    //     inbox once a booking exists, so without a link from here its history is
    //     reachable only by typing /…/messages/u/<id> by hand); and
    //   • who opened it — the initiator is the client, which is the same rule the
    //     inbox files pre threads by. Surface/clear it only when that hat matches
    //     the one I wear in THIS booking, so a dual-role user's client-side
    //     inquiry is never exposed (or marked read) from an expert-side booking.
    const preFirstPromise = initialLoadB
      ? prisma.message.findFirst({
          where: { bookingId: null, OR: [{ fromId: user.id, toId: otherId }, { fromId: otherId, toId: user.id }] },
          orderBy: { createdAt: 'asc' },
          select: { fromId: true },
        }).catch(() => null)
      : Promise.resolve(null)
    const [messagesRaw, preFirst] = await Promise.all([messagesPromise, preFirstPromise])
    const messages = initialLoadB ? messagesRaw.reverse() : messagesRaw
    const tMsgs = performance.now()
    const preThread = preFirst && (preFirst.fromId === user.id) === iAmStudent
      ? { userId: otherId, href: `/${iAmStudent ? 'student' : 'tutor'}/messages/u/${otherId}` }
      : null

    // Read receipts + notif cleanup were the chat's dominant latency: two WRITES
    // in the request's critical path, fired on EVERY 20s poll from BOTH parties,
    // holding a connection each time and exhausting the pool on the slow DB.
    // They're pure UX side-effects the payload doesn't need — defer past the
    // response, and skip entirely when nothing is actually unread (most polls).
    //
    // The initial open ALSO clears this partner's pre-booking („წინასწარი
    // შეკითხვა") messages: the inbox folds that thread into this one once a
    // booking exists (see the threads mode below), so it is no longer openable
    // on its own and its unread would otherwise stick in the badge forever.
    // Only on a real open (never on a ?since poll), and only when the pre thread
    // sits in the SAME space as this booking — a dual-role user's client-side
    // inquiry must not be marked read by opening a booking where they're the
    // expert (the inbox still lists that inquiry in the other space).
    const hasUnreadHere = messages.some(m => m.toId === user.id && m.readAt === null)
    if (hasUnreadHere || preThread) {
      after(async () => {
        const tasks: Promise<unknown>[] = []
        if (hasUnreadHere) {
          tasks.push(
            prisma.message.updateMany({
              where: { bookingId, toId: user.id, readAt: null },
              data: { readAt: new Date() },
            }),
            markRelatedRead(user.id, bookingId, 'MESSAGE_NEW'),
          )
        }
        // `preThread` already encodes both conditions this used to re-query for (a pre
        // thread exists AND its initiator puts it in the same space as this
        // booking), so the two deferred lookups that stood here are gone. The
        // updateMany is a no-op when nothing is actually unread.
        if (preThread) {
          tasks.push(
            prisma.message.updateMany({
              where: { bookingId: null, fromId: otherId, toId: user.id, readAt: null },
              data: { readAt: new Date() },
            }),
            markRelatedRead(user.id, `messages/u/${otherId}`, 'MESSAGE_NEW'),
          )
        }
        await Promise.all(tasks).catch(() => {})
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
        // `{ userId, href }` when an earlier pre-booking conversation with this
        // same partner exists in this space, else null. The inbox suppresses that
        // thread (no-duplicate-conversation rule) — this is how the UI offers a
        // way back into its history. Non-null only on the initial load.
        preThread,
      }),
    })
    res.headers.set('Server-Timing', `auth;dur=${(tAuth - t0).toFixed(0)}, booking;dur=${(tBooking - tAuth).toFixed(0)}, msgs;dur=${(tMsgs - tBooking).toFixed(0)}`)
    return res
  }

  // Candidate bookings = the 100 whose LAST MESSAGE is most recent. The window
  // used to be `orderBy: booking.updatedAt` — but updatedAt is NOT bumped by
  // messages (the same fact that made the in-memory re-sort necessary), so for a
  // heavy user an actively-chatting thread whose booking row hadn't been touched
  // in months fell outside the 100 and vanished from the inbox AND from the
  // unreadCount badge. Ranking the candidates by real conversation activity is
  // the only ordering that can't drop a live thread. Still bounded (no unbounded
  // query on this route), and the aggregate reads only createdAt — no message
  // bodies, no `fileUrl`.
  const activeBookings = await prisma.message.groupBy({
    by: ['bookingId'],
    where: {
      bookingId: { not: null },
      OR: [{ fromId: user.id }, { toId: user.id }],
    },
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: 'desc' } },
    take: 100,
  })
  const activeBookingIds = activeBookings
    .map(g => g.bookingId)
    .filter((id): id is string => !!id)

  const bookings = await prisma.booking.findMany({
    // Membership stays on the query (load-bearing): every id above already comes
    // from a message I'm a party to, but the predicate is the auth boundary and
    // must not be inferred away.
    where: {
      id: { in: activeBookingIds },
      OR: [{ studentId: user.id }, { tutor: { userId: user.id } }],
    },
    // The final list is re-sorted in memory by last-message time; `activeBookingIds`
    // already bounds this to ≤100 rows, so no separate take is needed.
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
        otherId: other.id,
        name: other.fullName,
        // `/api/avatars/<id>?v=` rather than the stored base64 — one cacheable
        // URL per counterparty instead of ~32 KB inlined per thread row.
        avatarUrl: avatarSrc(other.id, other.avatarUrl),
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

  // Dedup the inbox: once a partner has a booking thread, their pre-booking
  // („წინასწარი შეკითხვა") thread is suppressed below — the conversation now
  // lives in the booking thread, so the same person never appears twice.
  // Suppressed ≠ dropped: the pre thread's unread is FOLDED into the surviving
  // booking thread (see the fold loop below) and opening that booking stamps
  // those pre-booking messages read too (see the ?bookingId branch). Dropping
  // the count outright left the sidebar badge stuck at N with no thread the
  // user could open to clear it.
  const bookingPartnerIds = new Set(bookingThreads.map(t => t.otherId))

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
      //
      // `avatarUrl` is left out for the SAME reason, and it is worth naming: it
      // is a base64 `data:` webp too, and selecting it on BOTH `from` and `to`
      // pulled up to 400 blobs (~12 MB) out of Postgres to build a list that
      // shows one avatar per PARTNER — a couple of dozen at most. The surviving
      // partners' photos are fetched in one small query after the dedup below.
      select: {
        id: true, body: true, fromId: true, toId: true, readAt: true, createdAt: true, fileName: true,
        from: { select: { id: true, fullName: true } },
        to: { select: { id: true, fullName: true } },
      },
    }),
    preThreadInitiators(user.id),
  ])
  const preByPartner = new Map<string, { last: (typeof preMsgs)[number]; unread: number; other: { id: string; fullName: string } }>()
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
  const preSurviving = [...preByPartner.values()]
    // I'm the client in threads I opened, the expert in threads opened with me.
    // The initiator comes from the authoritative map (same source+filter as
    // preMsgs, so the partner is always present); if it were ever absent, an
    // undefined initiator is !== me → the thread files under the expert space.
    .filter(g => {
      // Space FIRST: a pre thread belongs to the space its initiator gives me,
      // independent of any booking with the same partner. (Order matters — a
      // dual-role user can be the client here and the expert in the booking;
      // suppressing before the space check would fold a client-side inquiry
      // into an expert-side booking thread and count it in the wrong space.)
      const iAmClient = preInitiators.get(g.other.id) === user.id
      if (space === 'student' && !iAmClient) return false
      if (space === 'tutor' && iAmClient) return false
      // Then suppress: a booking thread with this same person already exists,
      // so the conversation shows there — folded, not dropped (below).
      return !bookingPartnerIds.has(g.other.id)
    })

  // Partner photos, resolved AFTER the filter — only the threads that actually
  // render cost anything, and it is one bounded query instead of 400 blobs
  // riding along on the message scan above.
  const preAvatarById = new Map<string, string | null>()
  if (preSurviving.length) {
    const rows = await prisma.user.findMany({
      where: { id: { in: preSurviving.map(g => g.other.id) } },
      select: { id: true, avatarUrl: true },
    })
    for (const r of rows) preAvatarById.set(r.id, r.avatarUrl)
  }

  const preThreads = preSurviving
    .map(g => {
      // Deep-link into the space that matches my hat in THIS thread, not my
      // global role (a dual-role expert's client inquiries must open in /student).
      const area = preInitiators.get(g.other.id) === user.id ? 'student' : 'tutor'
      return {
        key: `u-${g.other.id}`,
        bookingId: undefined as string | undefined,
        pre: true,
        name: g.other.fullName,
        avatarUrl: avatarSrc(g.other.id, preAvatarById.get(g.other.id) ?? null),
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

  // Fold each SUPPRESSED pre thread's unread into the booking thread that
  // replaced it (the most recent one when a partner has several bookings with
  // me) — same space rule as the filter above, so a count is never moved into
  // the other hat. Without this the unread simply vanished from the inbox while
  // the sidebar badge kept counting it: a badge pointing at nothing.
  for (const g of preByPartner.values()) {
    if (!g.unread) continue
    const iAmClient = preInitiators.get(g.other.id) === user.id
    if (space === 'student' && !iAmClient) continue
    if (space === 'tutor' && iAmClient) continue
    const host = bookingThreads
      .filter(t => t.otherId === g.other.id)
      .sort((a, z) => new Date(z.at).getTime() - new Date(a.at).getTime())[0]
    if (!host) continue
    host.unreadCount += g.unread
    host.unread = true
  }

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
  // (javascript:, data:text/html, …). Only http(s) links, inline data:image/*
  // previews and base64 data:application/pdf files (both of which /api/uploads
  // accepts) are allowed. Absent fileUrl is fine (text-only msg).
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
      select: { id: true, fullName: true, role: true, suspendedAt: true },
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

    // Opening a NEW thread is a CLIENT action — I must be messaging an expert,
    // and a LIVE one: a suspended expert is unreachable everywhere else (public
    // profile 404s them, browse filters them, booking POST refuses them), so a
    // fresh inquiry must not slip through here either.
    // This stops an expert cold-opening to a client (the old "reply-only" rule);
    // once a client has opened the thread, either side may continue freely —
    // an already-open conversation keeps working even if the expert is suspended.
    if (isNewThread && (other.role !== 'TUTOR' || other.suspendedAt)) {
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
      // An expert just replied → their MEASURED median may have moved. Never
      // throws, no-ops without a TutorProfile, self-throttled to once per
      // 10 min per process (lib/responseTimeStore). Only for a TUTOR sender —
      // the role is already loaded on `user`, so the guard is free.
      if ((user as any).role === 'TUTOR') await recomputeResponseTime(user.id)
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
    // Only the tutor's userId is needed to route the message — never pull the
    // full TutorProfile (professionData JSON + legacy base64 videoUrl) for it.
    select: { id: true, studentId: true, tutor: { select: { userId: true } } },
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
    // Same as the pre-booking branch: recompute the sender's measured response
    // time when the sender is the EXPERT on this booking. `isFromStudent`
    // already answers that with no extra query.
    if (!isFromStudent) await recomputeResponseTime(user.id)
  })

  return NextResponse.json({ ok: true, message: msg })
}
