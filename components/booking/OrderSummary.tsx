'use client'
// Booking summary card (right column of the intake/payment steps) — moved from
// app/tutors/[id]/client.tsx (DESIGN_FIX_PROMPT 1.1).
import React from 'react'
import { Icon } from '@/components/Icon'
import { PAYMENTS_LIVE } from '@/lib/flags'
import { KA_MONTHS_LONG as KA_MONTHS_FULL } from '@/lib/kaDate'
import { DAY_SHORT, isoWeekday, fmtHM } from './slots'

export const OrderSummary = ({
  start,
  duration,
  topic,
  total,
  tutorName,
  tutorSpecialty,
  tutorAvatar,
  serviceTitle,
}: {
  start: Date | null
  duration: number
  topic: string
  total: string
  tutorName: string
  tutorSpecialty: string
  tutorAvatar?: string | null
  /** Title of the consultation tier the user chose — null for the generic
      flat-price flow. */
  serviceTitle?: string | null
}) => {
  const dayShort = start ? DAY_SHORT[isoWeekday(start)] : ''
  const dayLabel = start ? `${dayShort} ${start.getDate()} ${KA_MONTHS_FULL[start.getMonth()]}` : '— აირჩიე დღე'
  const timeLabel = start
    ? `${fmtHM(start)} · ${duration} წუთი`
    : '—'

  return (
    <div className="rounded-card border border-ink-200 bg-ink-50/50 p-5">
      <div className="font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-500 mb-4">დაჯავშნის შეჯამება</div>

      <div className="flex items-center gap-3 pb-4 border-b border-ink-200">
        {tutorAvatar ? (
          <img src={tutorAvatar} alt="" width={40} height={40} className="w-10 h-10 rounded-card object-cover" />
        ) : (
          <span className="w-10 h-10 rounded-card bg-brand-100 text-brand-700 inline-flex items-center justify-center font-display font-bold text-[13px]">
            {tutorName.slice(0, 1)}
          </span>
        )}
        <div className="min-w-0">
          <div className="font-display text-[13.5px] font-bold text-ink-900 truncate">{tutorName}</div>
          <div className="text-[11.5px] text-ink-500 truncate">{tutorSpecialty}</div>
        </div>
      </div>

      <dl className="mt-4 space-y-3 text-[12.5px]">
        {serviceTitle && (
          <div className="grid grid-cols-[80px_1fr] gap-2 items-baseline">
            <dt className="font-display text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">სერვისი</dt>
            <dd className="font-display font-bold text-ink-900 leading-snug">{serviceTitle}</dd>
          </div>
        )}
        <div className="grid grid-cols-[80px_1fr] gap-2 items-baseline">
          <dt className="font-display text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">დღე</dt>
          <dd className="font-display font-bold text-ink-900 tabular-nums">{dayLabel}</dd>
        </div>
        <div className="grid grid-cols-[80px_1fr] gap-2 items-baseline">
          <dt className="font-display text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">დრო</dt>
          <dd className="font-display font-bold text-ink-900 tabular-nums">{timeLabel}</dd>
        </div>
        <div className="grid grid-cols-[80px_1fr] gap-2 items-baseline">
          <dt className="font-display text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">თემა</dt>
          <dd className="font-display font-medium text-ink-800 leading-snug">{topic || '— ჯერ არ არჩეული'}</dd>
        </div>
        <div className="grid grid-cols-[80px_1fr] gap-2 items-baseline">
          <dt className="font-display text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">ფორმატი</dt>
          <dd className="font-display font-bold text-ink-900 inline-flex items-center gap-1.5">
            <Icon.video className="w-3.5 h-3.5" />
            ვიდეო · 1-on-1
          </dd>
        </div>
      </dl>

      <div className="mt-5 pt-4 border-t border-ink-200">
        <div className="flex items-baseline justify-between">
          <span className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-700">ჯამი</span>
          <span className="font-display text-[22px] font-bold text-ink-900 tabular-nums tracking-tight leading-none">{total}</span>
        </div>
      </div>

      <div className="mt-4 rounded-card bg-brand-50 border border-brand-100 p-3.5 grid grid-cols-[auto_1fr] gap-2.5 items-start">
        <Icon.shieldCheck className="w-4 h-4 mt-0.5 text-brand-700 shrink-0" />
        <div className="space-y-1">
          {PAYMENTS_LIVE ? (
            <>
              <p className="font-display text-[12px] font-bold text-brand-800 leading-snug">Escrow-ით დაცული გადახდა</p>
              <p className="text-[11.5px] text-ink-600 leading-[1.5]">
                თანხა ინახება უსაფრთხოდ და ექსპერტს გადაერიცხება მხოლოდ სესიის შემდეგ.
                თუ ექსპერტი არ გამოცხადდა — 100% ავტომატური დაბრუნება. გაუქმება უფასოა სესიამდე 24 საათით ადრე.
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-[12px] font-bold text-brand-800 leading-snug">დაჯავშნა უფასოა</p>
              <p className="text-[11.5px] text-ink-600 leading-[1.5]">
                გადახდის სისტემა მალე ჩაირთვება — ამჟამად ჯავშანი უფასოა. ექსპერტი დაგიდასტურებს მოთხოვნას; გაუქმება ნებისმიერ დროს შესაძლებელია.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
