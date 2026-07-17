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
  const rows = await prisma.booking.findMany({
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
  })
  // Order by LAST MESSAGE time — booking.updatedAt is not bumped by messages,
  // so sorting on it left threads with fresh messages buried.
  const bookings = rows.sort(
    (a, z) => (z.messages[0]?.createdAt.getTime() ?? 0) - (a.messages[0]?.createdAt.getTime() ?? 0),
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
              {bookings.map(b => {
                const last = b.messages[0]
                return (
                  <ConversationRow
                    key={b.id}
                    href={`/student/messages/${b.id}`}
                    name={b.tutor?.user?.fullName ?? 'ექსპერტი აღარ არის ხელმისაწვდომი'}
                    avatarUrl={b.tutor?.user?.avatarUrl ?? null}
                    topic={b.topic}
                    lastBody={last?.body}
                    lastHasFile={!!last?.fileUrl}
                    lastAt={last?.createdAt}
                    lastFromMe={last?.fromId === user.id}
                    unread={b._count.messages}
                    now={now}
                  />
                )
              })}
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
