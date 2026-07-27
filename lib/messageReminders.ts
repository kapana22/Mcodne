import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/mailer'
import { newMessageEmail } from '@/lib/emailTemplates'
import { normalizePrefs } from '@/lib/notify'
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

// One thread = one recipient + (a booking, or the other party in a pre-booking
// pair). Shared by both scans below so the dedup key is derived identically.
const threadKey = (toId: string, bookingId: string | null, fromId: string) =>
  `${toId}::${bookingId ?? `u:${fromId}`}`

export async function sendMessageReminders(): Promise<{ threads: number; emails: number }> {
  await ensureDbReady()

  // Two-step selection. The single "oldest-first, all unread rows" scan this
  // replaced could STARVE fresh threads: the 30-day window deliberately retains
  // stamped-but-unread rows (the per-thread dedup reads them), so on a busy
  // month the oldest 2000 rows — most of them already-reminded — filled the
  // LIMIT and a conversation from this morning never appeared at all.
  //
  // Step 1: the thread keys that ALREADY carry a reminder stamp in their current
  // unread streak. This is the dedup signal the scan used to derive from the
  // stamped rows themselves; lifting it out lets step 2 skip those rows entirely.
  const stampedRows = await prisma.$queryRawUnsafe<{ toId: string; fromId: string; bookingId: string | null }[]>(`
    SELECT DISTINCT m."toId", m."fromId", m."bookingId"
    FROM "Message" m
    WHERE m."readAt" IS NULL
      AND m."reminderEmailSentAt" IS NOT NULL
      AND m."createdAt" > NOW() - interval '30 days'
    LIMIT 5000
  `)
  const remindedKeys = new Set(stampedRows.map(r => threadKey(r.toId, r.bookingId, r.fromId)))

  // Step 2: only UNSTAMPED unread rows, NEWEST first. Both halves matter — the
  // window now holds nothing but reminder candidates, and the newest ones are
  // the ones that fit, so a fresh thread can never be crowded out by an old one.
  // (A month-old „you missed a message" is meaningless anyway; the 30-day bound
  // stays.) A thread truncated by the LIMIT simply waits for the next */15 tick.
  const rows = await prisma.$queryRawUnsafe<Row[]>(`
    SELECT m.id, m."toId", m."fromId", m."bookingId", m.body,
           m."createdAt", m."reminderEmailSentAt"
    FROM "Message" m
    WHERE m."readAt" IS NULL
      AND m."reminderEmailSentAt" IS NULL
      AND m."createdAt" > NOW() - interval '30 days'
    ORDER BY m."createdAt" DESC
    LIMIT 2000
  `)

  // Group by thread: a booking thread is keyed by bookingId; a pre-booking pair
  // thread by the sender (all unread-to-recipient in a 2-person thread share one
  // fromId). Rows arrive NEWEST-first, so msgs[0] is the latest in the thread and
  // the last element is the oldest still-unread one.
  const groups = new Map<string, Group>()
  for (const r of rows) {
    const key = threadKey(r.toId, r.bookingId, r.fromId)
    let g = groups.get(key)
    if (!g) { g = { key, toId: r.toId, fromId: r.fromId, bookingId: r.bookingId, msgs: [] }; groups.set(key, g) }
    g.msgs.push(r)
  }

  const cutoff = Date.now() - DELAY_MINUTES * 60_000
  const eligible: Group[] = []
  for (const g of groups.values()) {
    // Already reminded during this unread streak → skip until the recipient
    // reads and a new streak begins. (Same rule as before, now sourced from
    // step 1 because the stamped rows are no longer in `rows`.)
    if (remindedKeys.has(g.key)) continue
    // Oldest unread must have sat unread for the full delay.
    if (new Date(g.msgs[g.msgs.length - 1].createdAt).getTime() > cutoff) continue
    eligible.push(g)
  }

  // Stamp BEFORE sending (dedup is per-thread regardless of send outcome). If
  // the cron restarts mid-loop, the failure mode is a rare missed reminder — not
  // re-emailing every recipient on the next tick, which stamping-after causes.
  //
  // The stamp IS the atomic claim: `AND "reminderEmailSentAt" IS NULL` +
  // RETURNING means only ONE of two overlapping cron runs wins each message, so
  // no recipient gets the same reminder twice. A thread is emailed only when
  // this run actually claimed at least one of its messages — the other run
  // claimed the rest and is sending for that thread itself. (Same pattern as
  // lib/sessionReminders.)
  const stampedIds = eligible.flatMap(g => g.msgs.map(m => m.id))
  let claimedIds = new Set<string>()
  if (stampedIds.length) {
    const claimed = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `UPDATE "Message" SET "reminderEmailSentAt" = NOW() WHERE id = ANY($1::text[]) AND "reminderEmailSentAt" IS NULL RETURNING id`,
      stampedIds,
    )
    claimedIds = new Set(claimed.map(c => c.id))
  }
  const claimedGroups = eligible.filter(g => g.msgs.some(m => claimedIds.has(m.id)))

  let emails = 0
  for (const g of claimedGroups) {
    // Rows are newest-first within a group (see the grouping loop) — index 0 is
    // the most recent message, which is the one the email previews.
    const latest = g.msgs[0]
    const [recipient, sender] = await Promise.all([
      prisma.user.findUnique({ where: { id: g.toId }, select: { email: true, fullName: true, notificationPrefs: true } }),
      prisma.user.findUnique({ where: { id: latest.fromId }, select: { fullName: true } }),
    ])
    if (!recipient?.email) continue
    // Honor the recipient's MESSAGE_NEW pref — in-app message notifs already
    // check it via notify(); the reminder email must too. (Rows stay stamped so
    // an opted-out user isn't re-scanned each tick — same as a skipped send.)
    if (!normalizePrefs(recipient.notificationPrefs).MESSAGE_NEW) continue

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

  return { threads: claimedGroups.length, emails }
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
