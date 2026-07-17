import Link from 'next/link'
import Image from 'next/image'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Icon } from '@/components/Icon'
import { EmptyState } from '@/components/EmptyState'
import { fmtKaDateTime } from '@/lib/kaDate'

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

  return (
    <div className="font-sans bg-ink-50/40 min-h-screen">
      <header className="sticky top-0 z-40 bg-ink-50/90 backdrop-blur-md border-b border-ink-100">
        <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/student" className="inline-flex items-center" aria-label="მცოდნე">
            <img src="/logo.svg" alt="მცოდნე" className="h-7 w-auto object-contain select-none" draggable={false} />
          </Link>
          <nav className="flex items-center gap-4 lg:gap-3 overflow-x-auto scrollbar-hide whitespace-nowrap min-w-0 ml-4">
            <Link href="/student" className="text-[13px] font-display font-semibold text-ink-700 hover:text-ink-900">დაშბორდი</Link>
            <Link href="/student/bookings" className="text-[13px] font-display font-semibold text-ink-700 hover:text-ink-900">ჩემი ჯავშნები</Link>
            <Link href="/student/favorites" className="text-[13px] font-display font-semibold text-ink-700 hover:text-ink-900">შენახული</Link>
            <Link href="/student/profile" className="text-[13px] font-display font-semibold text-ink-700 hover:text-ink-900">პროფილი</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-[820px] mx-auto px-6 py-10">
        <div className="mb-8">
          <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-2 motion-safe:animate-rise-in">შეტყობინებები</div>
          <h1 className="font-display text-3xl font-bold text-ink-900 tracking-tight motion-safe:animate-rise-in" style={{ animationDelay: '60ms' }}>ჩატები ექსპერტებთან</h1>
        </div>

        {bookings.length === 0 ? (
          <EmptyState
            icon={<Icon.chat className="w-6 h-6" />}
            title="ცარიელი inbox"
            description="დაიწყე ჯავშანი და მიწერე ექსპერტს."
            cta={{ label: 'იპოვე ექსპერტი', href: '/tutors' }}
          />
        ) : (
          <div className="rounded-card border border-ink-200 bg-white overflow-hidden divide-y divide-ink-100">
            {bookings.map(b => {
              const other = b.tutor.user
              const last = b.messages[0]
              const isMine = last?.fromId === user.id
              const unread = b._count.messages
              return (
                <Link key={b.id} href={`/student/bookings/${b.id}#chat`}
                      className="flex items-center gap-4 p-4 hover:bg-brand-50/40 transition-colors group">
                  <div className="relative w-12 h-12 rounded-full overflow-hidden ring-1 ring-ink-200 shrink-0 transition-transform group-hover:scale-105">
                    {other.avatarUrl ? (
                      <Image src={other.avatarUrl} alt="" fill sizes="48px" className="object-cover" />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-brand-100 to-brand-200 text-brand-800 font-display font-semibold text-[18px]">
                        {other.fullName?.slice(0, 1).toUpperCase() ?? 'მ'}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={`font-display text-[14px] text-ink-900 truncate ${unread > 0 ? 'font-bold' : 'font-semibold'}`}>{other.fullName}</span>
                      <span className="font-mono text-[10.5px] text-ink-400 tabular-nums shrink-0">
                        {last ? fmtKaDateTime(last.createdAt) : null}
                      </span>
                    </div>
                    <div className="text-[12.5px] text-ink-500 truncate mt-0.5">{b.topic}</div>
                    <div className={`text-[13px] truncate mt-1 ${unread > 0 ? 'text-ink-900 font-medium' : 'text-ink-700'}`}>
                      {isMine && <span className="text-ink-400">შენ: </span>}
                      {last?.body}
                    </div>
                  </div>
                  {unread > 0 && (
                    <span className="shrink-0 inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-brand-500 text-white font-display text-[11px] font-bold tabular-nums">
                      {unread}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
