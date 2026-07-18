import Link from 'next/link'
import Image from 'next/image'
import { requireUser } from '@/lib/auth'
import { PAYMENTS_LIVE } from '@/lib/flags'
import { prisma } from '@/lib/prisma'
import { Icon } from '@/components/Icon'
import { fmtKaDateTime } from '@/lib/kaDate'
import { StatusPill } from '@/components/StatusPill'
import { EmptyState } from '@/components/EmptyState'
import { StudentAppBar } from '@/components/StudentAppBar'
import { WorkspaceFooter } from '@/components/WorkspaceFooter'

export const dynamic = 'force-dynamic'

const STATUS: Record<string, 'preparing'|'confirmed'|'live'|'completed'|'canceled'|'noshow'> = {
  PREPARING: 'preparing', CONFIRMED: 'confirmed', LIVE: 'live',
  COMPLETED: 'completed', CANCELED: 'canceled', NO_SHOW: 'noshow',
}

export default async function StudentBookingsPage({
  searchParams,
}: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser()
  const { tab = 'upcoming' } = await searchParams

  const allBookings = await prisma.booking.findMany({
    where: { studentId: user.id },
    orderBy: { startAt: 'desc' },
    include: {
      tutor: { include: { user: { select: { id: true, fullName: true, avatarUrl: true } } } },
      // Actionable signals for the list cards: a pending review and unread
      // chat messages (addressed to me, not yet read).
      review: { select: { id: true } },
      _count: { select: { messages: { where: { toId: user.id, readAt: null } } } },
    },
  })

  const upcoming = allBookings.filter(b => ['PREPARING', 'CONFIRMED', 'LIVE'].includes(b.status))
  const past = allBookings.filter(b => b.status === 'COMPLETED')
  const canceled = allBookings.filter(b => ['CANCELED', 'NO_SHOW'].includes(b.status))

  const list = tab === 'past' ? past : tab === 'canceled' ? canceled : upcoming

  return (
    <div className="font-sans bg-ink-50/40 min-h-screen flex flex-col">
      <StudentAppBar user={{ name: user.fullName, avatar: user.avatarUrl }} />

      <main className="w-full max-w-[1280px] mx-auto px-6 sm:px-8 py-8 lg:py-10 flex-1">
        <div className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-2">ჯავშნები</div>
            <h1 className="font-display text-3xl font-bold text-ink-900 tracking-tight">ჩემი სესიები</h1>
            <p className="text-[13.5px] text-ink-600 mt-1.5">{PAYMENTS_LIVE ? 'ყველა შენი ჯავშანი ერთ ადგილას · დაცული გადახდით' : 'ყველა შენი ჯავშანი ერთ ადგილას'}</p>
          </div>
          <Link href="/tutors" className="h-11 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 transition-colors">
            <Icon.plus className="w-3.5 h-3.5" /> ახალი ჯავშანი
          </Link>
        </div>

        <div className="flex items-center gap-1 mb-6 border-b border-ink-200">
          {[
            { id: 'upcoming', l: 'მომავალი', c: upcoming.length },
            { id: 'past', l: 'დასრულებული', c: past.length },
            { id: 'canceled', l: 'გაუქმებული', c: canceled.length },
          ].map(t => {
            const on = t.id === tab
            return (
              <Link key={t.id} href={`/student/bookings?tab=${t.id}`}
                    className={`relative inline-flex items-center gap-2 pb-3 px-1 mr-4 font-display text-[13px] font-semibold ${on ? 'text-ink-900' : 'text-ink-500 hover:text-ink-800'}`}>
                {t.l}
                <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-pill text-[10.5px] font-bold tabular-nums ${on ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600'}`}>{t.c}</span>
                {on && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-ink-900 rounded-full" />}
              </Link>
            )
          })}
        </div>

        {list.length === 0 ? (
          <EmptyState
            icon={<Icon.calendar className="w-6 h-6" />}
            title="ცარიელია"
            description={tab === 'past' ? 'ჯერ არ გქონია დასრულებული სესია.' : tab === 'canceled' ? 'გაუქმებული ჯავშანი არ არის.' : 'დაიწყე შენი პირველი კონსულტაცია.'}
            cta={{ label: 'იპოვე ექსპერტი', href: '/tutors' }}
          />
        ) : (
          <div className="space-y-3">
            {list.map(b => {
              const unread = b._count.messages
              const needsReview = b.status === 'COMPLETED' && !b.review
              // A deleted tutor leaves `tutor: null` on the booking — never
              // deref it unguarded (server crash) and never fall back to
              // stock-photo avatar services.
              const tutorUser = b.tutor?.user
              const tutorName = tutorUser?.fullName ?? 'ექსპერტი აღარ არის ხელმისაწვდომი'
              return (
                // Overlay-link card: the whole surface opens the detail, while
                // the LIVE join button stays an independent link on top of it
                // (nested <a> is invalid HTML, hence the absolute cover link).
                <div key={b.id}
                     className="relative rounded-card bg-white border border-ink-200 shadow-xs hover:border-ink-300 transition-colors overflow-hidden">
                  <Link href={`/student/bookings/${b.id}`} className="absolute inset-0" aria-label={b.topic} />
                  <div className="p-5 grid sm:grid-cols-[auto_1fr_auto] gap-4 sm:gap-5 items-center pointer-events-none">
                    <div className="relative w-14 h-14 rounded-card overflow-hidden ring-1 ring-ink-200 shrink-0 bg-brand-50">
                      {tutorUser?.avatarUrl ? (
                        <Image src={tutorUser.avatarUrl} alt="" fill sizes="56px" className="object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center font-display text-[18px] font-bold text-brand-600/70">
                          {(tutorUser?.fullName?.[0] ?? '?').toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <StatusPill tone={STATUS[b.status]} />
                        {unread > 0 && (
                          <span className="inline-flex items-center gap-1 h-5 px-2 rounded-pill bg-brand-500 text-white text-[10.5px] font-display font-bold tabular-nums">
                            <Icon.chat className="w-2.5 h-2.5" /> {unread}
                          </span>
                        )}
                        {needsReview && (
                          <span className="inline-flex items-center gap-1 h-5 px-2 rounded-pill bg-warning-50 border border-warning-200 text-warning-700 text-[10.5px] font-display font-bold uppercase tracking-[0.08em]">
                            <Icon.star aria-hidden className="w-2.5 h-2.5" /> შეფასება ელოდება
                          </span>
                        )}
                        <span className="ml-auto font-mono text-[10.5px] tabular-nums text-ink-400 truncate max-w-[80px]" title={b.ref}>#{b.ref.slice(0, 8)}</span>
                      </div>
                      <div className="font-display text-[14.5px] font-bold text-ink-900 truncate">{b.topic}</div>
                      <div className="text-[12px] text-ink-500 mt-0.5 truncate">
                        {tutorName} · {fmtKaDateTime(b.startAt, { year: true })}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-display text-[16px] font-bold tabular-nums text-ink-900">₾{b.price}</div>
                      <div className="text-[11px] font-mono text-ink-400 tabular-nums">{b.durationMin} წუთი</div>
                      {b.status === 'LIVE' && (
                        <Link href={`/session/${b.id}`}
                              className="pointer-events-auto relative z-10 mt-2 h-9 px-3 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12px] inline-flex items-center gap-1.5 transition-colors">
                          <Icon.video className="w-3.5 h-3.5" /> ოთახში შესვლა
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      <WorkspaceFooter />
    </div>
  )
}
