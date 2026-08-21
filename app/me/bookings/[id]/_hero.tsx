'use client'
// /student/bookings/[id] — breadcrumb + the hero: who, when, and the
// countdown to the session.

import React from 'react'
import Link from 'next/link'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { fmtDateTime as fmtInTz, TBILISI } from '@/lib/tz'
import { PAYMENTS_LIVE } from '@/lib/flags'
import { isBookingLive } from '@/lib/bookingLive'
import { Eyebrow } from '@/components/Eyebrow'
import { Icon } from '@/components/Icon'
import { Container } from '@/components/Container'
import { ApiStatus, Booking, STATUS_MAP, fmtDate, fmtTime, isExpertNoShow, rebookHref, tabOf, useCountdown, useRemainingLabel, useUserTz } from './_model'

/* ───── Breadcrumb ───── */
export const Breadcrumb = ({ status, ref }: { status: ApiStatus; ref: string }) => (
  <Container className="pt-6 flex items-center gap-2 text-meta text-ink-500">
    <Link href={`/me/bookings?tab=${status === 'COMPLETED' || status === 'NO_SHOW' ? 'past' : status === 'CANCELED' ? 'canceled' : 'upcoming'}`}
          className="hover:text-ink-900 font-display font-semibold inline-flex items-center gap-1">
      <Icon.chevL className="w-3 h-3" /> ჩემი ჯავშნები
    </Link>
    <Icon.chevR className="w-3 h-3 text-ink-300" />
    <span className="font-display font-semibold text-ink-700">{tabOf(status)}</span>
    <Icon.chevR className="w-3 h-3 text-ink-300" />
    <span className="font-mono tabular-nums text-ink-500">#{ref.slice(0, 8)}</span>
  </Container>
)

/* ───── Hero ───── */
export const Hero = ({ booking, onEnterRoom, onCopyRef }: { booking: Booking; onEnterRoom: () => void; onCopyRef: () => void }) => {
  // LIVE is never written to the DB — derive the in-progress state from the
  // clock. Hero re-renders every second via useCountdown, so this stays fresh.
  const live = isBookingLive(booking)
  const status: ApiStatus = live ? 'LIVE' : booking.status
  const m = STATUS_MAP[status]
  const start = new Date(booking.startAt)
  const end = new Date(start.getTime() + booking.durationMin * 60_000)
  const created = new Date(booking.createdAt)
  const tz = useUserTz()
  const showTzHint = tz !== TBILISI
  // Rendered wall-clock in Tbilisi — surfaced only when the visitor is
  // clearly in a different tz. Uses the shared helper so the string format
  // stays consistent with the tutor-side view.
  const tbilisiTime = showTzHint
    ? fmtInTz(booking.startAt, { weekday: 'short', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }, TBILISI).local
    : ''
  const cd = useCountdown(status === 'CONFIRMED' || status === 'PREPARING' || status === 'LIVE' ? start : null)
  const remainingLabel = useRemainingLabel(start, booking.durationMin)
  // Only show the "დაწყებამდე დარჩა" pill for non-terminal bookings — cancelled
  // and no-show sessions never start, so a countdown there is noise.
  const showRemainingPill = status !== 'CANCELED' && status !== 'NO_SHOW'
  // The session's time has fully passed. When the tutor hasn't yet marked it
  // complete (and the auto-complete cron may not be running), the booking is
  // still CONFIRMED — but a "დარჩა 00:00:00" countdown + a join button to an
  // empty room is misleading, so past-end sessions get an honest closing state.
  const sessionOver = Date.now() > end.getTime()
  const tutorFullName = booking.tutor.user.fullName
  // Category first, `specialty` only as the fallback — see app/experts/_data.tsx.
  const tutorSpecialty = booking.tutor.category?.name ?? booking.tutor.specialty ?? 'ექსპერტი'

  return (
    <Container as="section" className="pt-5">
      <div className="rounded-card overflow-hidden border border-ink-200 bg-white">
        {/* status banner */}
        <div className={`px-6 py-3 border-b ${m.cls} flex items-center justify-between gap-3 flex-wrap`}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-display text-small font-bold tracking-tight">{m.l}</span>
          </div>
          <span className="font-mono text-meta tabular-nums opacity-65 inline-flex items-center gap-1.5">
            {/* 36px tap target (canon floor); negative block margins keep the
                banner row at its original visual height. */}
            <button
              type="button"
              onClick={onCopyRef}
              aria-label="ჯავშნის ID-ის კოპირება"
              title="დააკოპირე ჯავშნის ID"
              className="inline-flex items-center gap-1 px-2 h-9 -my-2 rounded-btn hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-300 transition-colors duration-fast"
            >
              #{booking.ref.slice(0, 12)}
              <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 opacity-70">
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V5a2 2 0 0 1 2-2h10" />
              </svg>
            </button>
            <span>· შექმნა: {fmtDate(created)} {fmtTime(created)}</span>
          </span>
        </div>

        <div className="p-6 lg:p-7 grid lg:grid-cols-[1fr_360px] gap-6 items-start">
          <div className="min-w-0">
            <Eyebrow className="mb-2">სესია</Eyebrow>
            <h1 className="font-display text-h1 lg:text-display font-bold text-ink-900 tracking-tight leading-[1.1]">
              {booking.topic}
            </h1>

            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <div className="w-12 h-12 rounded-full overflow-hidden ring-1 ring-ink-200 shrink-0 bg-brand-100 inline-flex items-center justify-center">
                <img src={booking.tutor.user.avatarUrl || DEFAULT_AVATAR} alt={tutorFullName} className="w-full h-full object-cover" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-display text-body-lg font-bold text-ink-900">{tutorFullName}</span>
                </div>
                <div className="text-meta text-ink-500">{tutorSpecialty}</div>
              </div>
              {typeof booking.tutor.rating === 'number' && booking.tutor.rating > 0 && (
                <span className="ml-auto sm:ml-3 inline-flex items-center gap-1 text-small text-ink-700">
                  <Icon.star aria-hidden className="w-3.5 h-3.5 text-warning-500" />
                  <span role="img" aria-label={`${booking.tutor.rating.toFixed(2)} 5-დან`} className="font-display font-bold tabular-nums">{booking.tutor.rating.toFixed(2)}</span>
                  {booking.tutor.reviewsCount ? <span className="text-ink-500 tabular-nums">({booking.tutor.reviewsCount})</span> : null}
                </span>
              )}
            </div>

            <div className="mt-5 grid sm:grid-cols-3 gap-2.5">
              <div className="p-3 rounded-card border border-ink-200 bg-ink-50/50">
                <Eyebrow tone="muted" className="inline-flex items-center gap-1.5"><Icon.cal className="w-3 h-3" /> თარიღი</Eyebrow>
                <div className="mt-1 font-display text-body-lg font-bold text-ink-900 tabular-nums">{fmtDate(start)}</div>
                <div className="text-meta text-ink-500 tabular-nums">{start.getFullYear()} · თბილისი (GMT+4)</div>
              </div>
              <div className="p-3 rounded-card border border-ink-200 bg-ink-50/50">
                <Eyebrow tone="muted" className="inline-flex items-center gap-1.5"><Icon.clock className="w-3 h-3" /> დრო</Eyebrow>
                <div className="mt-1 font-display text-body-lg font-bold text-ink-900 tabular-nums">{fmtTime(start)} — {fmtTime(end)}</div>
                <div className="text-meta text-ink-500 tabular-nums">{booking.durationMin} წუთი</div>
                {showTzHint && (
                  <div className="mt-1 text-meta text-ink-400">თბილისის დროით: {tbilisiTime}</div>
                )}
              </div>
              <div className="p-3 rounded-card border border-ink-200 bg-ink-50/50">
                <Eyebrow tone="muted" className="inline-flex items-center gap-1.5"><Icon.wallet className="w-3 h-3" /> ფასი</Eyebrow>
                <div className="mt-1 font-display text-body-lg font-bold text-ink-900 tabular-nums">₾{booking.price}</div>
                <div className="text-meta text-ink-500 tabular-nums">{PAYMENTS_LIVE ? 'დაცულ გადახდაშია' : 'უფასოა'}</div>
              </div>
            </div>

            {showRemainingPill && (
              <div className="mt-3">
                <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-pill bg-brand-50 border border-brand-200 text-meta font-display font-semibold text-brand-800">
                  <Icon.clock className="w-3 h-3" />
                  {remainingLabel === 'დაწყებულია' || remainingLabel === 'დასრულებულია'
                    ? remainingLabel
                    : <>დაწყებამდე დარჩა · <span className="tabular-nums">{remainingLabel}</span></>}
                </span>
              </div>
            )}
          </div>

          {/* Right rail — action */}
          <div className="shrink-0 w-full lg:w-[260px]">
            {/* PREPARING: the old rail showed a DISABLED join button as the
                primary CTA — a dead end. The honest next step while waiting
                for confirmation is writing to the expert. */}
            {status === 'PREPARING' && (
              <div className="p-4 rounded-card bg-white border border-ink-200">
                <Eyebrow tone="muted" className="mb-2">ელოდება დადასტურებას</Eyebrow>
                <p className="text-small text-ink-700">
                  ექსპერტი მალე დაგიდასტურებს. სანამ ელოდები, შეგიძლია მიწერო.
                </p>
                <a href="#chat" className="tap-shrink mt-3 w-full h-11 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body inline-flex items-center justify-center gap-2 transition-colors duration-fast">
                  <Icon.chat className="w-4 h-4" /> მიწერე ექსპერტს
                </a>
                {cd && (
                  <div className="mt-2 text-meta text-ink-500 tabular-nums text-center">
                    სესიამდე დარჩა {cd.d > 0 ? `${cd.d} დღე ` : ''}{cd.h} სთ {cd.m} წთ
                  </div>
                )}
              </div>
            )}

            {status === 'CONFIRMED' && sessionOver && (
              <div className="p-4 rounded-card bg-white border border-ink-200">
                <Eyebrow tone="muted" className="mb-2">სესიის დრო გავიდა</Eyebrow>
                <p className="text-small text-ink-700">
                  ექსპერტი მალე დახურავს სესიას. თუ არ შედგა — მიწერე ან დაგვიკავშირდი.
                </p>
                <a href="#chat" className="mt-3 w-full h-11 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-800 font-display font-semibold text-small inline-flex items-center justify-center gap-2 transition-colors duration-fast">
                  <Icon.chat className="w-4 h-4" /> მიწერე ექსპერტს
                </a>
              </div>
            )}

            {(status === 'CONFIRMED' || status === 'LIVE') && cd && !sessionOver && (
              <div className="text-center p-4 rounded-card bg-ink-900 text-white">
                <div className="font-display text-micro font-semibold uppercase text-brand-300 mb-2">
                  {status === 'LIVE' ? 'ცოცხალია' : 'დარჩა'}
                </div>
                {status !== 'LIVE' && (
                  <div className="flex items-end justify-center gap-1">
                    {[{ l: 'დღე', v: cd.d }, { l: 'სთ', v: cd.h }, { l: 'წთ', v: cd.m }].map((u, i) => (
                      <React.Fragment key={u.l}>
                        <div className="flex flex-col items-center">
                          <div className="w-12 h-12 rounded-card bg-white/8 border border-white/10 inline-flex items-center justify-center font-display text-h3 font-bold tabular-nums">
                            {String(u.v).padStart(2, '0')}
                          </div>
                          <span className="mt-0.5 font-mono text-micro uppercase text-white/55">{u.l}</span>
                        </div>
                        {i < 2 && <span className="text-body text-white/30 pb-4">:</span>}
                      </React.Fragment>
                    ))}
                  </div>
                )}
                <button type="button" onClick={onEnterRoom}
                        className="mt-4 w-full h-11 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body inline-flex items-center justify-center gap-2 transition-colors duration-fast">
                  <Icon.video className="w-4 h-4" /> ვიდეოოთახში
                </button>
                <div className="mt-2 text-meta text-white/55">
                  {status === 'LIVE' ? 'სესია ახლა მიმდინარეობს — შემოუერთდი' : 'გაიხსნება 5 წუთით ადრე'}
                </div>
              </div>
            )}

            {status === 'COMPLETED' && (
              <div className="p-4 rounded-card bg-brand-50 border border-brand-200">
                <Eyebrow className="mb-2">სესია დასრულდა</Eyebrow>
                <p className="text-small text-ink-700">
                  {booking.review ? 'შენ უკვე შეაფასე ეს სესია.' : booking.autoCompleted ? 'ეს სესია ავტომატურად დაიხურა. შეგიძლია იგივე ექსპერტთან ხელახლა დაჯავშნო.' : 'დაჯავშნე იგივე ექსპერტთან ან დატოვე შეფასება.'}
                </p>
                <Link
                  href={rebookHref(booking)}
                  className="tap-shrink mt-3 w-full h-11 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body inline-flex items-center justify-center gap-2 transition-colors duration-fast"
                >
                  <Icon.refresh className="w-4 h-4" /> დაჯავშნე ისევ
                </Link>
                {booking.review ? (
                  <div className="mt-2 inline-flex items-center justify-center gap-1.5 w-full h-11 rounded-btn bg-warning-50 border border-warning-200 text-warning-800 font-display font-semibold text-small">
                    <Icon.star aria-hidden className="w-3.5 h-3.5 text-warning-500" />
                    შეფასდა · {booking.review.rating}<span className="sr-only"> 5-დან</span>
                  </div>
                ) : booking.autoCompleted ? null : (
                  <a href="#leave-review" className="mt-2 w-full h-11 rounded-btn bg-white border border-brand-200 hover:bg-brand-50 text-brand-800 font-display font-semibold text-small inline-flex items-center justify-center gap-2 transition-colors duration-fast">
                    <Icon.star aria-hidden className="w-4 h-4" /> შეფასების დატოვება
                  </a>
                )}
              </div>
            )}

            {(status === 'CANCELED' || status === 'NO_SHOW') && (
              <div className="p-4 rounded-card bg-ink-50 border border-ink-200">
                <Eyebrow tone="muted" className="mb-2">
                  {status === 'NO_SHOW' ? 'სესია არ შედგა' : 'ჯავშანი გაუქმდა'}
                </Eyebrow>
                <p className="text-small text-ink-700">
                  {status === 'NO_SHOW'
                    ? (isExpertNoShow(booking)
                        // Passive on purpose — the report may also have come from
                        // an admin resolving a refund, and nobody is accused here.
                        ? 'აღნიშნულია, რომ ექსპერტი არ გამოცხადდა.'
                        : 'ექსპერტმა აღნიშნა, რომ სესიაზე ვერ შეხვდით.')
                    /* ⚠️ „შენ" IS NO LONGER THE FALLBACK (2026-08-19). The
                       chain ended with it, so every row this reader could not
                       identify was reported to the client as their own doing —
                       and the biggest such group is the sweep that cancels a
                       booking the EXPERT never answered (app/api/internal/
                       cleanup). Being told you cancelled something you waited a
                       day for is worse than being told nothing. STUDENT is now
                       named explicitly and the unknown case says what is
                       actually known: it was cancelled, not by whom. */
                    : booking.cancelledBy === 'PROVIDER' ? 'ექსპერტმა გააუქმა ჯავშანი.'
                    : booking.cancelledBy === 'ADMIN' ? 'ადმინმა გააუქმა ჯავშანი.'
                    : booking.cancelledBy === 'USER' ? 'შენ გააუქმე ჯავშანი.'
                    : 'ჯავშანი ავტომატურად გაუქმდა.'}
                  {/* The reason, when the row carries one. All three exits write
                      it and none of them was showing it here — a cancellation
                      with no explanation is the state this screen was in for
                      every automatic one. */}
                  {booking.cancelReason ? <>{' '}{booking.cancelReason}.</> : null}
                  {/* The two no-show directions are opposite money outcomes —
                      they must never share one sentence. */}
                  {' '}{status === 'NO_SHOW' && !isExpertNoShow(booking)
                        ? (PAYMENTS_LIVE ? 'დაცული თანხა ექსპერტს გადაეცა.' : 'გადასახდელი არაფერია — დაჯავშნა უფასოა.')
                        : (PAYMENTS_LIVE ? 'დაცული თანხა დაბრუნებულია.' : 'გადასახდელი არაფერია — დაჯავშნა უფასოა.')}
                </p>
                <Link href="/experts" className="mt-3 w-full h-11 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-900 font-display font-semibold text-small inline-flex items-center justify-center transition-colors duration-fast">
                  ხელახლა დაჯავშნე
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </Container>
  )
}