'use client'
import Link from 'next/link'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { fmtKaDateTime } from '@/lib/kaDate'
import { type DashBooking, awaitsClosure, awaitsRescheduleAnswer } from './types'

type Alert = {
  key: string
  tone: 'warning' | 'info'
  icon: keyof typeof Icon
  text: string
  sub?: string
  cta: { label: string; href: string }
}

/* Compact "needs your attention" rows above the hero — one line + one action
   each (CLAUDE.md compact-state rule), capped at 3 with a "see all" link.
   Priority: no published availability (expert is unbookable) > reschedule
   proposals awaiting an answer > ended sessions awaiting complete/no-show. */
export function AlertsStack({
  bookings,
  upcomingSlots,
}: {
  bookings: DashBooking[]
  upcomingSlots: number | null
}) {
  const now = Date.now()
  const alerts: Alert[] = []

  if (upcomingSlots === 0) {
    alerts.push({
      key: 'no-slots',
      tone: 'warning',
      icon: 'calendar',
      text: 'ჯერ ხელმისაწვდომი დრო არ გამოგიქვეყნებია',
      sub: 'კლიენტი მხოლოდ გამოცხადებულ დროზე დაგიჯავშნის — სანამ თავისუფალ დროს არ დაამატებ, ჯავშანს ვერ მიიღებ.',
      cta: { label: 'დროების გამოქვეყნება', href: '/tutor/schedule' },
    })
  }

  for (const b of bookings) {
    if (awaitsRescheduleAnswer(b)) {
      alerts.push({
        key: `resched-${b.id}`,
        tone: 'info',
        icon: 'clock',
        text: `${b.student?.fullName ?? 'კლიენტი'} ითხოვს გადადებას`,
        sub: b.rescheduleRequest?.newStartAt
          ? `შემოთავაზებული დრო: ${fmtKaDateTime(new Date(b.rescheduleRequest.newStartAt))}`
          : undefined,
        cta: { label: 'პასუხი', href: `/tutor/bookings/${b.id}` },
      })
    }
  }

  for (const b of bookings) {
    if (awaitsClosure(b, now)) {
      alerts.push({
        key: `closure-${b.id}`,
        tone: 'info',
        icon: 'check',
        text: `სესია დასრულდა — ${b.student?.fullName ?? 'კლიენტი'}`,
        sub: 'მონიშნე დასრულებულად ან no-show-დ.',
        cta: { label: 'დახურვა', href: `/tutor/bookings/${b.id}` },
      })
    }
  }

  if (alerts.length === 0) return null
  const shown = alerts.slice(0, 3)
  const rest = alerts.length - shown.length

  return (
    <section aria-label="საჭიროებს ყურადღებას" className="mb-6 space-y-2">
      {shown.map(a => {
        const IconComp = Icon[a.icon]
        const warning = a.tone === 'warning'
        return (
          <div
            key={a.key}
            className={`rounded-card border p-3.5 sm:px-5 flex items-center gap-3 flex-wrap ${
              warning ? 'border-warning-300 bg-warning-50' : 'border-ink-200 bg-white'
            }`}
          >
            <span className={`w-8 h-8 rounded-btn inline-flex items-center justify-center shrink-0 ${
              warning ? 'bg-warning-100 text-warning-700' : 'bg-info-50 text-info-700'
            }`}>
              <IconComp className="w-4 h-4" />
            </span>
            <div className="flex-1 min-w-[200px]">
              <div className="font-display text-[13.5px] font-bold text-ink-900">{a.text}</div>
              {a.sub && <div className="text-[12px] text-ink-600 mt-0.5 leading-snug">{a.sub}</div>}
            </div>
            <Btn href={a.cta.href} variant={warning ? 'primary' : 'secondary'} size="sm" className="shrink-0">
              {a.cta.label}
            </Btn>
          </div>
        )
      })}
      {rest > 0 && (
        <div className="text-right">
          <Link href="/tutor/bookings?tab=attention" className="text-[12.5px] text-brand-700 hover:text-brand-800 font-display font-semibold">
            კიდევ {rest} ყურადღების საკითხი →
          </Link>
        </div>
      )}
    </section>
  )
}
