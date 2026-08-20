import Link from 'next/link'
import Image from 'next/image'
import { requireUser } from '@/lib/auth'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { PAYMENTS_LIVE } from '@/lib/flags'
import { prisma } from '@/lib/prisma'
import { Icon } from '@/components/Icon'
import { TzNote } from '@/components/workspace/TzNote'
import { sessionDateTime } from '@/components/workspace/sessionTime'
import { isBookingLive } from '@/lib/bookingLive'
import { StatusPill } from '@/components/StatusPill'
import { EmptyState } from '@/components/EmptyState'
import { Container } from '@/components/Container'
import { PageHeader } from '@/components/PageHeader'
import { Btn } from '@/components/Btn'

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
    // Cap (matches /api/student/bookings) + drop the heavy TutorProfile blobs the
    // list cards never read, so this force-dynamic page doesn't transfer
    // professionData/base64 video per row from the remote DB on every visit.
    take: 500,
    include: {
      tutor: { omit: { professionData: true, videoUrl: true }, include: { user: { select: { id: true, fullName: true, avatarUrl: true } } } },
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
    <Container as="main" className="w-full py-8 lg:py-10 flex-1">
        <PageHeader
          className="mb-8"
          eyebrow="ჩემი სივრცე"
          title="ჯავშნები"
          sub={<>
            {PAYMENTS_LIVE ? 'ყველა ჯავშანი · დაცული გადახდით' : 'ყველა ჯავშანი ერთ ადგილას'}
            {/* Rendered server-side in Tbilisi wall-clock — the note appears
                only for viewers whose browser sits in another zone. */}
            <TzNote className="text-small text-ink-500 before:content-['·'] before:mx-1" />
          </>}
          actions={<Btn href="/experts" iconLeft={<Icon.plus className="w-3.5 h-3.5" />}>ახალი ჯავშანი</Btn>}
        />

        {/* id + `#bookings` on each tab link: this is a server component and the
            tabs navigate to the SAME pathname with a different ?tab=, so neither
            the router nor AppShell resets the scroll — with a long list you
            switched bucket and stayed staring at the old position. The hash makes
            the browser land on the tabs itself, with no client JS. */}
        <div id="bookings" className="flex items-center gap-1 mb-6 border-b border-ink-200 overflow-x-auto scrollbar-hide">
          {[
            { id: 'upcoming', l: 'მომავალი', c: upcoming.length },
            { id: 'past', l: 'დასრულებული', c: past.length },
            { id: 'canceled', l: 'გაუქმებული', c: canceled.length },
          ].map(t => {
            const on = t.id === tab
            return (
              <Link key={t.id} href={`/me/bookings?tab=${t.id}#bookings`}
                    className={`relative inline-flex items-center gap-2 min-h-[40px] pt-2 pb-3 px-1 mr-4 font-display text-small font-semibold ${on ? 'text-ink-900' : 'text-ink-500 hover:text-ink-800'}`}>
                {t.l}
                <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-pill text-meta font-bold tabular-nums ${on ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600'}`}>{t.c}</span>
                {on && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-ink-900 rounded-full" />}
              </Link>
            )
          })}
        </div>

        {list.length === 0 ? (
          <EmptyState
            illustration="bookings"
            title="ჯერ ჯავშანი არ გაქვს"
            /* The brief's line is for the „nothing booked" case. The past and
               canceled tabs keep their own sentences — „აირჩიე ექსპერტი და
               დაჯავშნე" is not a true thing to say to someone looking at an
               empty CANCELLED list. */
            description={tab === 'past' ? 'ჯერ არ გქონია დასრულებული სესია.' : tab === 'canceled' ? 'გაუქმებული ჯავშანი არ არის.' : 'აირჩიე ექსპერტი და დაჯავშნე შენთვის მოსახერხებელი დრო.'}
            cta={{ label: 'იპოვე ექსპერტი', href: '/experts' }}
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
                     className="relative rounded-card bg-white border border-ink-200 shadow-xs hover:border-ink-300 transition-colors duration-fast overflow-hidden">
                  <Link href={`/me/bookings/${b.id}`} className="absolute inset-0" aria-label={b.topic} />
                  <div className="p-5 grid sm:grid-cols-[auto_1fr_auto] gap-4 sm:gap-5 items-center pointer-events-none">
                    <div className="relative w-14 h-14 rounded-card overflow-hidden ring-1 ring-ink-200 shrink-0 bg-brand-50">
                      <Image src={tutorUser?.avatarUrl || DEFAULT_AVATAR} alt="" fill sizes="56px" unoptimized={(tutorUser?.avatarUrl || DEFAULT_AVATAR).startsWith('data:')} className="object-cover" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <StatusPill tone={STATUS[b.status]} />
                        {unread > 0 && (
                          <span className="inline-flex items-center gap-1 h-5 px-2 rounded-pill bg-brand-600 text-white text-meta font-display font-bold tabular-nums">
                            <Icon.chat className="w-3 h-3" /> {unread}
                          </span>
                        )}
                        {needsReview && (
                          <span className="inline-flex items-center gap-1 h-5 px-2 rounded-pill bg-transparent border border-warning-200 text-warning-700 text-micro font-display font-bold uppercase">
                            <Icon.star aria-hidden className="w-3 h-3" /> შეფასება ელოდება
                          </span>
                        )}
                        <span className="ml-auto font-mono text-meta tabular-nums text-ink-400 truncate max-w-[80px]" title={b.ref}>#{b.ref.slice(0, 8)}</span>
                      </div>
                      <div className="font-display text-body-lg font-bold text-ink-900 truncate">{b.topic}</div>
                      <div className="text-meta text-ink-500 mt-0.5 truncate">
                        {tutorName} · {sessionDateTime(b.startAt.toISOString(), { year: true })}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-display text-body-lg font-bold tabular-nums text-ink-900">₾{b.price}</div>
                      <div className="text-meta font-mono text-ink-400 tabular-nums">{b.durationMin} წუთი</div>
                      {isBookingLive(b) && (
                        <Link href={`/session/${b.id}`}
                              className="pointer-events-auto relative z-10 mt-2 h-9 px-3 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-small inline-flex items-center gap-1.5 transition-colors duration-fast">
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
    </Container>
  )
}
