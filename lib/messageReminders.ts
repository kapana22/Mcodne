import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/mailer'
import { newMessageEmail } from '@/lib/emailTemplates'
import { ensureDbReady } from '@/lib/dbBoot'

// Delayed "you missed a message" reminder. Instead of emailing the instant a
// message arrives (which pings people who are actively reading in-app), we wait
// ~30 min and email ONLY if the message is still unread — a genuine miss.
//
// Rides the */15 cleanup cron. Deduped by the dbBoot column
// `Message.reminderEmailSentAt`, which Prisma can't select, so the read/stamp
// go through raw SQL (same pattern as sessionReminders).
//
// "Once per unread burst": a thread is eligible only if NONE of its currently
// unread messages has been stamped yet. After we send, we stamp every unread
// message in that thread — so later messages in the same streak won't re-remind.
// When the recipient finally opens the thread, readAt is set and those rows drop
// out of the unread set entirely; a fresh message then starts a new streak.

const DELAY_MINUTES = 30

type Row = {
  id: string
  toId: string
  fromId: string
  bookingId: string | null
  body: string | null
  createdAt: Date
  reminderEmailSentAt: Date | null
}

type Group = { key: string; toId: string; fromId: string; bookingId: string | null; msgs: Row[] }

export async function sendMessageReminders(): Promise<{ threads: number; emails: number }> {
  await ensureDbReady()

  // All outstanding unread messages, oldest first. LIMIT bounds a backlog after
  // downtime; grouping + the per-thread guards happen in JS below.
  // Bound the scan to a 30-day recency window (KEEPING stamped-but-unread rows,
  // which the per-thread dedup below relies on) so perpetually-unread ancient
  // messages can't permanently fill the LIMIT window and starve fresh ones. A
  // 30-min reminder is meaningless a month later anyway.
  const rows = await prisma.$queryRawUnsafe<Row[]>(`
    SELECT m.id, m."toId", m."fromId", m."bookingId", m.body,
           m."createdAt", m."reminderEmailSentAt"
    FROM "Message" m
    WHERE m."readAt" IS NULL
      AND m."createdAt" > NOW() - interval '30 days'
    ORDER BY m."createdAt" ASC
    LIMIT 2000
  `)

  // Group by thread: a booking thread is keyed by bookingId; a pre-booking pair
  // thread by the sender (all unread-to-recipient in a 2-person thread share one
  // fromId).
  const groups = new Map<string, Group>()
  for (const r of rows) {
    const key = `${r.toId}::${r.bookingId ?? `u:${r.fromId}`}`
    let g = groups.get(key)
    if (!g) { g = { key, toId: r.toId, fromId: r.fromId, bookingId: r.bookingId, msgs: [] }; groups.set(key, g) }
    g.msgs.push(r)
  }

  const cutoff = Date.now() - DELAY_MINUTES * 60_000
  const eligible: Group[] = []
  for (const g of groups.values()) {
    // Already reminded during this unread streak → skip until the recipient
    // reads and a new streak begins.
    if (g.msgs.some(m => m.reminderEmailSentAt !== null)) continue
    // Oldest unread must have sat unread for the full delay.
    if (new Date(g.msgs[0].createdAt).getTime() > cutoff) continue
    eligible.push(g)
  }

  let emails = 0
  const stampedIds: string[] = []
  for (const g of eligible) {
    const latest = g.msgs[g.msgs.length - 1]
    // Stamp every unread message in the thread regardless of send outcome — a
    // failed/absent-email thread must not be reprocessed every 15 min.
    stampedIds.push(...g.msgs.map(m => m.id))

    const [recipient, sender] = await Promise.all([
      prisma.user.findUnique({ where: { id: g.toId }, select: { email: true, fullName: true } }),
      prisma.user.findUnique({ where: { id: latest.fromId }, select: { fullName: true } }),
    ])
    if (!recipient?.email) continue

    const href = await threadHref(g)
    const body = latest.body ?? ''
    const preview = body.length > 80 ? body.slice(0, 77) + '…' : (body || 'ფაილი')
    const { subject, html } = newMessageEmail({
      name: recipient.fullName,
      fromName: sender?.fullName || 'მომხმარებელი',
      preview,
      href,
    })
    await sendMail({ to: recipient.email, subject, html }).then(() => { emails++ }).catch(() => {})
  }

  if (stampedIds.length) {
    await prisma.$executeRawUnsafe(
      `UPDATE "Message" SET "reminderEmailSentAt" = NOW() WHERE id = ANY($1::text[])`,
      stampedIds,
    )
  }

  return { threads: eligible.length, emails }
}

// Deep-link the reminder to the recipient's side of the thread — the same hrefs
// the inbox/notification layer uses, so the CTA lands on the right space.
async function threadHref(g: Group): Promise<string> {
  if (g.bookingId) {
    const b = await prisma.booking.findUnique({ where: { id: g.bookingId }, select: { studentId: true } })
    const area = b && g.toId === b.studentId ? 'student' : 'tutor'
    return `/${area}/messages/${g.bookingId}`
  }
  // Pre-booking pair: the thread INITIATOR (earliest message sender) is the
  // client. The recipient sees it in /student if they initiated, else /tutor.
  const first = await prisma.message.findFirst({
    where: { bookingId: null, OR: [{ fromId: g.toId, toId: g.fromId }, { fromId: g.fromId, toId: g.toId }] },
    orderBy: { createdAt: 'asc' },
    select: { fromId: true },
  })
  const area = first && first.fromId === g.toId ? 'student' : 'tutor'
  return `/${area}/messages/u/${g.fromId}`
}
