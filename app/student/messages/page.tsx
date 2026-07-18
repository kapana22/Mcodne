import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Icon } from '@/components/Icon'
import { EmptyState } from '@/components/EmptyState'
import { ConversationRow } from '@/components/ConversationRow'
import { StudentAppBar } from '@/components/StudentAppBar'
import { WorkspaceFooter } from '@/components/WorkspaceFooter'

export const dynamic = 'force-dynamic'

export default async function StudentMessagesPage() {
  const user = await requireUser()

  // Student inbox — only bookings where I'm the client (the old OR-clause was a
  // copy-paste from shared code and also matched my-bookings-as-tutor).
  const [bookingRows, preMsgs] = await Promise.all([
    prisma.booking.findMany({
      where: {
        studentId: user.id,
        messages: { some: {} },
      },
      include: {
        tutor: { include: { user: { select: { id: true, fullName: true, avatarUrl: true } } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        // Unread = messages addressed to me not yet read (readAt is stamped when
        // I open the thread — GET /api/messages?bookingId side effect).
        _count: { select: { messages: { where: { toId: user.id, readAt: null } } } },
      },
    }),
    // Pre-booking PAIR threads — messages with bookingId:null involving me,
    // grouped below by the OTHER participant (the expert-user).
    prisma.message.findMany({
      where: { bookingId: null, OR: [{ fromId: user.id }, { toId: user.id }] },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        from: { select: { id: true, fullName: true, avatarUrl: true } },
        to: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    }),
  ])

  // Normalize both thread kinds into one row shape so ConversationRow renders
  // them identically (pre-booking rows carry a subtle „წინასწარი შეკითხვა" label
  // in place of a booking topic).
  type Row = {
    key: string
    href: string
    name: string | null
    avatarUrl: string | null
    topic: string
    lastBody?: string | null
    lastHasFile: boolean
    lastAt: Date | null
    lastFromMe: boolean
    unread: number
  }

  // Booking threads ordered by last-message time (booking.updatedAt is not
  // bumped by messages, so sorting on it buries fresh threads). The merged sort
  // below re-orders across both kinds; this keeps the booking-only ordering
  // canonical and self-documenting.
  const sortedBookings = bookingRows.sort(
    (a, z) => (z.messages[0]?.createdAt.getTime() ?? 0) - (a.messages[0]?.createdAt.getTime() ?? 0),
  )
  const bookingItems: Row[] = sortedBookings.map(b => {
    const last = b.messages[0]
    return {
      key: `b-${b.id}`,
      href: `/student/messages/${b.id}`,
      name: b.tutor?.user?.fullName ?? 'ექსპერტი აღარ არის ხელმისაწვდომი',
      avatarUrl: b.tutor?.user?.avatarUrl ?? null,
      topic: b.topic,
      lastBody: last?.body,
      lastHasFile: !!last?.fileUrl,
      lastAt: last?.createdAt ?? null,
      lastFromMe: last?.fromId === user.id,
      unread: b._count.messages,
    }
  })

  const preByPartner = new Map<string, Row>()
  for (const m of preMsgs) {
    const other = m.fromId === user.id ? m.to : m.from
    if (!other) continue
    let row = preByPartner.get(other.id)
    if (!row) {
      // preMsgs is desc — the first row seen per partner is the latest message.
      row = {
        key: `u-${other.id}`,
        href: `/student/messages/u/${other.id}`,
        name: other.fullName,
        avatarUrl: other.avatarUrl,
        topic: 'წინასწარი შეკითხვა',
        lastBody: m.body,
        lastHasFile: !!m.fileUrl,
        lastAt: m.createdAt,
        lastFromMe: m.fromId === user.id,
        unread: 0,
      }
      preByPartner.set(other.id, row)
    }
    if (m.toId === user.id && m.readAt === null) row.unread++
  }

  // Order by LAST MESSAGE time — booking.updatedAt is not bumped by messages,
  // so sorting on it left threads with fresh messages buried.
  const bookings = [...bookingItems, ...preByPartner.values()].sort(
    (a, z) => (z.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0),
  )
  // One clock for the whole render so every row's relative label agrees.
  const now = new Date()

  return (
    <div className="font-sans bg-ink-50/40 min-h-screen flex flex-col">
      <StudentAppBar user={{ name: user.fullName, avatar: user.avatarUrl }} />

      <main className="w-full max-w-[820px] mx-auto px-6 sm:px-8 py-8 lg:py-10 flex-1">
        <div className="mb-8">
          <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-2 motion-safe:animate-rise-in">შეტყობინებები</div>
          <h1 className="font-display text-3xl font-bold text-ink-900 tracking-tight motion-safe:animate-rise-in" style={{ animationDelay: '60ms' }}>ჩატები ექსპერტებთან</h1>
        </div>

        {bookings.length === 0 ? (
          <EmptyState
            icon={<Icon.chat className="w-6 h-6" />}
            title="ჯერ არ გაქვს მიმოწერა"
            description="მიმოწერა ჯავშანთან ერთად იხსნება — დაჯავშნე კონსულტაცია და მიწერე ექსპერტს."
            cta={{ label: 'იპოვე ექსპერტი', href: '/tutors' }}
          />
        ) : (
          <>
            <div className="rounded-card border border-ink-200 bg-white overflow-hidden divide-y divide-ink-100">
              {bookings.map(row => (
                <ConversationRow
                  key={row.key}
                  href={row.href}
                  name={row.name}
                  avatarUrl={row.avatarUrl}
                  topic={row.topic}
                  lastBody={row.lastBody}
                  lastHasFile={row.lastHasFile}
                  lastAt={row.lastAt}
                  lastFromMe={row.lastFromMe}
                  unread={row.unread}
                  now={now}
                />
              ))}
            </div>
            <p className="flex items-center justify-center gap-1.5 mt-4 text-[11.5px] text-ink-400">
              <Icon.shield className="w-3.5 h-3.5 shrink-0" />
              მიმოწერა ხილულია მხოლოდ შენთვის და ექსპერტისთვის.
            </p>
          </>
        )}
      </main>

      <WorkspaceFooter />
    </div>
  )
}
