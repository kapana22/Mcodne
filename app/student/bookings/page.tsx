import Link from 'next/link'
import Image from 'next/image'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Icon } from '@/components/Icon'
import { fmtKaDateTime } from '@/lib/kaDate'
import { StatusPill } from '@/components/StatusPill'
import { EmptyState } from '@/components/EmptyState'

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
    include: { tutor: { include: { user: { select: { id: true, fullName: true, avatarUrl: true } } } } },
  })

  const upcoming = allBookings.filter(b => ['PREPARING', 'CONFIRMED', 'LIVE'].includes(b.status))
  const past = allBookings.filter(b => b.status === 'COMPLETED')
  const canceled = allBookings.filter(b => ['CANCELED', 'NO_SHOW'].includes(b.status))

  const list = tab === 'past' ? past : tab === 'canceled' ? canceled : upcoming

  return (
    <div className="font-sans bg-ink-50/40 min-h-screen">
      <header className="sticky top-0 z-40 bg-ink-50/90 backdrop-blur-md border-b border-ink-100">
        <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/student" className="inline-flex items-center" aria-label="მცოდნე">
            <img src="/logo.svg" alt="მცოდნე" className="h-7 w-auto object-contain select-none" draggable={false} />
          </Link>
          <nav className="flex items-center gap-3">
            <Link href="/student" className="text-[13px] font-display font-semibold text-ink-700 hover:text-ink-900">დაშბორდი</Link>
            <Link href="/student/messages" className="text-[13px] font-display font-semibold text-ink-700 hover:text-ink-900">შეტყობინებები</Link>
            <Link href="/student/favorites" className="text-[13px] font-display font-semibold text-ink-700 hover:text-ink-900">შენახული</Link>
            <Link href="/student/profile" className="text-[13px] font-display font-semibold text-brand-700 hover:text-brand-800">პროფილი</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-[1120px] mx-auto px-6 py-10">
        <div className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-2">ჯავშნები</div>
            <h1 className="font-display text-3xl font-bold text-ink-900 tracking-tight">ჩემი სესიები</h1>
            <p className="text-[13.5px] text-ink-600 mt-1.5">ყველა შენი ჯავშანი ერთ ადგილას · escrow დაცული</p>
          </div>
          <Link href="/tutors" className="h-10 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 transition-colors">
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
                <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-pill text-[10.5px] font-bold tabular-nums ${on ? 'bg-accent-900 text-white' : 'bg-ink-100 text-ink-600'}`}>{t.c}</span>
                {on && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-accent-900 rounded-full" />}
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
            {list.map(b => (
              <Link key={b.id} href={`/student/bookings/${b.id}`}
                    className="block rounded-card bg-white border border-ink-200 hover:border-ink-300 hover:shadow-card transition-all overflow-hidden">
                <div className="p-5 grid sm:grid-cols-[auto_1fr_auto] gap-4 sm:gap-5 items-center">
                  <div className="relative w-14 h-14 rounded-card overflow-hidden ring-1 ring-ink-200 shrink-0">
                    <Image src={b.tutor.user.avatarUrl ?? `https://i.pravatar.cc/120?u=${b.tutor.userId}`} alt="" fill sizes="56px" className="object-cover" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusPill tone={STATUS[b.status]} />
                      <span className="ml-auto font-mono text-[10.5px] tabular-nums text-ink-400 truncate max-w-[80px]" title={b.ref}>#{b.ref.slice(0, 8)}</span>
                    </div>
                    <div className="font-display text-[14.5px] font-bold text-ink-900 truncate">{b.topic}</div>
                    <div className="text-[12px] text-ink-500 mt-0.5 truncate">
                      {b.tutor.user.fullName} · {fmtKaDateTime(b.startAt, { year: true })}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display text-[16px] font-bold tabular-nums text-ink-900">₾{b.price}</div>
                    <div className="text-[11px] font-mono text-ink-400 tabular-nums">{b.durationMin} წუთი</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
