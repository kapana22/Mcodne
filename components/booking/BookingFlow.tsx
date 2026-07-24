'use client'
// BookingFlow — THE one shared booking component (DESIGN_FIX_PROMPT 1.1).
// Extracted from the profile's BookingModal (the honest reference: viewer-tz
// labels via lib/tz, PAYMENTS_LIVE-gated copy, „მოთხოვნა გაგზავნილია" request
// wording, server-authoritative price/duration via consultationId).
//
// Steps (dynamic):
//   [1. სერვისი]  — only when the expert has 2+ consultation tiers (1.2)
//    2. დრო       — month calendar + per-day picker (viewer-local, honest tz)
//    3. დეტალები  — mandatory intake „რისი განხილვა გინდა?" (1.3) + confirm
//   [4. გადახდა]  — only when PAYMENTS_LIVE flips true
//
// Two data modes:
//   - preloaded: the profile page passes `tutor` (mapTutorPayload of its
//     already-fetched /api/tutors/[id] JSON) — no extra request.
//   - self-fetch: the listing passes only `tutorId`; the flow fetches
//     /api/tutors/[id] on open (same payload the profile uses).
import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Sheet } from '@/components/Sheet'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { PAYMENTS_LIVE } from '@/lib/flags'
import { RISK_REVERSAL_LINE } from '@/lib/copy'
import { KA_MONTHS_LONG as KA_MONTHS_FULL } from '@/lib/kaDate'
import {
  TUTOR_DEFAULTS, priceForDuration, DAY_SHORT, isoWeekday, startOfDay, fmtHM,
  groupSlotsByDay, enumerateTimes,
  type ApiSlot, type BusySlot, type ConsultationItem,
} from './slots'
import { Calendar } from './Calendar'
import { DayTimeline } from './DayTimeline'
import { IntakeStep, TOPIC_OPTIONS, MIN_INTAKE_CHARS, type DetailsState } from './IntakeStep'
import { PaymentStep, INITIAL_PAYMENT, isPaymentValid, type PaymentState } from './PaymentStep'
import { OrderSummary } from './OrderSummary'
import { TierStep } from './TierStep'
// mapTutorPayload / BookingTutorInfo moved to ./mapTutorPayload so the profile
// page can import the tiny mapper without bundling this whole component. Kept
// re-exported here so existing `from '.../BookingFlow'` imports still resolve.
import { mapTutorPayload, type BookingTutorInfo } from './mapTutorPayload'
export { mapTutorPayload, type BookingTutorInfo }

/* Step rail — dynamic labels because the tier and payment steps come and go. */
const Steps = ({ step, labels }: { step: number; labels: string[] }) => (
  <div className="flex items-center gap-2 flex-wrap">
    {labels.map((l, i) => {
      const n = i + 1
      const done = step > n
      const active = step === n
      return (
        <React.Fragment key={l}>
          <div className={`inline-flex items-center gap-1.5 ${active ? 'text-brand-700' : done ? 'text-success-600' : 'text-ink-400'}`}>
            <span className={`w-5 h-5 rounded-full inline-flex items-center justify-center text-[11px] font-display font-bold ${active ? 'bg-brand-500 text-white' : done ? 'bg-success-500 text-white' : 'bg-ink-100 text-ink-500'}`}>
              {done ? <Icon.check className="w-3 h-3" /> : n}
            </span>
            <span className="font-display text-[12px] font-semibold tracking-wide">{l}</span>
          </div>
          {i < labels.length - 1 && <div className="w-6 h-px bg-ink-200" />}
        </React.Fragment>
      )
    })}
  </div>
)

export const BookingFlow = ({
  open,
  onClose,
  tutorId,
  tutor = null,
  initialStart = null,
  initialTopic,
  initialService = null,
}: {
  open: boolean
  onClose: () => void
  tutorId?: string
  /** Preloaded payload (profile). Omit/null → the flow fetches /api/tutors/{tutorId} on open. */
  tutor?: BookingTutorInfo | null
  /** Pre-selected slot start (inline availability / rail continue). */
  initialStart?: Date | null
  /** Pre-selected topic from ?topic= (rebook flow). */
  initialTopic?: string | null
  /** Pre-selected consultation tier (services section). */
  initialService?: ConsultationItem | null
}) => {
  /* ── data: preloaded or self-fetched ── */
  const [fetched, setFetched] = useState<BookingTutorInfo | null>(null)
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [fetchAttempt, setFetchAttempt] = useState(0)
  useEffect(() => {
    if (!open || tutor || !tutorId) return
    let cancelled = false
    setFetchState('loading')
    fetch(`/api/tutors/${tutorId}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('http'))))
      .then(d => { if (!cancelled) { setFetched(mapTutorPayload(d)); setFetchState('idle') } })
      .catch(() => { if (!cancelled) setFetchState('error') })
    return () => { cancelled = true }
  }, [open, tutor, tutorId, fetchAttempt])

  const info = tutor ?? fetched
  const availability = info?.availability ?? []
  const busySlots = info?.busySlots ?? []
  const tiers = info?.consultations ?? []
  // Session types become step 1 only when there is a real choice to make;
  // single-tier / no-tier experts go straight to the slot picker (1.2).
  const hasTierStep = tiers.length >= 2
  const tierStepN = hasTierStep ? 1 : 0
  const slotStepN = tierStepN + 1
  const detailsStepN = slotStepN + 1
  const totalSteps = detailsStepN + (PAYMENTS_LIVE ? 1 : 0)
  const stepLabels = [
    ...(hasTierStep ? ['სერვისი'] : []),
    'დრო',
    'დეტალები',
    ...(PAYMENTS_LIVE ? ['გადახდა'] : []),
  ]

  /* ── state ── */
  const [step, setStep] = useState<number>(1)
  const [selectedService, setSelectedService] = useState<ConsultationItem | null>(initialService)
  const slotsByDay = React.useMemo(() => groupSlotsByDay(availability), [availability])
  const firstFreeDate = React.useMemo(() => {
    for (const s of availability) {
      if (s.booked) continue
      const d = new Date(s.startAt)
      if (d.getTime() > Date.now()) return d
    }
    return null
  }, [availability])
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const anchor = initialStart ?? new Date()
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  })
  const [selectedStart, setSelectedStart] = useState<Date | null>(initialStart)
  // Mobile: after the user taps a day, auto-scroll the (single-column) sheet
  // down to the time grid so the freshly-revealed slots come into view without
  // a manual scroll. Only fires on an explicit calendar tap (flag), never on
  // open, and only below lg where the layout is stacked (desktop shows both
  // panes side by side, so nothing to scroll).
  const timePaneRef = useRef<HTMLDivElement | null>(null)
  const scrollToTimesRef = useRef(false)
  useEffect(() => {
    if (!scrollToTimesRef.current || !selectedDate) return
    scrollToTimesRef.current = false
    if (typeof window === 'undefined' || !window.matchMedia('(max-width: 1023px)').matches) return
    requestAnimationFrame(() => timePaneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [selectedDate])
  // Reset the sheet's scroll to the top of the content on every step change —
  // otherwise advancing from the (auto-scrolled) slot step leaves the details
  // step opening mid-content, which reads as "it scrolled by itself".
  const stepTopRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    stepTopRef.current?.scrollIntoView({ block: 'start' })
  }, [step])
  const [details, setDetails] = useState<DetailsState>({
    topic: (initialTopic && initialTopic.trim()) || TOPIC_OPTIONS[0],
    goal: '',
    preCall: true,
  })
  const [payment, setPayment] = useState<PaymentState>(INITIAL_PAYMENT)
  const [submitted, setSubmitted] = useState(false)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitUnverified, setSubmitUnverified] = useState(false)
  const [resendingVerify, setResendingVerify] = useState(false)
  const [resendMsg, setResendMsg] = useState<string | null>(null)

  // Reset per open. A preselected tier jumps past the tier step (its card
  // stays reachable via „უკან"); a preselected slot lands selected on the
  // picker so the user confirms rather than re-hunts it.
  useEffect(() => {
    if (!open) return
    const preTiers = tutor?.consultations ?? []
    // Multi-tier + preselected tier → jump straight to the slot step (2);
    // every other combination starts at step 1 (tier step when multi-tier,
    // slot step otherwise — including the self-fetch path, where the tier
    // count is unknown yet and step 1 resolves correctly once data lands).
    setStep(preTiers.length >= 2 && initialService ? 2 : 1)
    setSelectedService(initialService)
    setSelectedStart(initialStart)
    setSelectedDate(initialStart ? startOfDay(initialStart) : null)
    const anchor = initialStart ?? new Date()
    setViewMonth(new Date(anchor.getFullYear(), anchor.getMonth(), 1))
    setSubmitted(false)
    setCreatedId(null)
    setSubmitError(null)
    if (initialTopic && initialTopic.trim()) {
      setDetails(d => ({ ...d, topic: initialTopic.trim() }))
    }
    // `tutor` is intentionally NOT a dependency: parents may rebuild the
    // payload object per render, and this reset must fire on open only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialStart, initialTopic, initialService])

  // Seed the calendar with the first bookable day once availability is known
  // (arrives async in self-fetch mode). Only fills the blank — never overrides
  // a user/preset selection.
  useEffect(() => {
    if (!open || selectedDate !== null) return
    const anchor = initialStart ?? firstFreeDate
    if (!anchor) return
    setSelectedDate(startOfDay(anchor))
    setViewMonth(new Date(anchor.getFullYear(), anchor.getMonth(), 1))
  }, [open, selectedDate, firstFreeDate, initialStart])

  // A tapped consultation tier overrides the flat defaults: its minutes drive
  // the slot enumeration and its price is what the summary restates (the
  // server re-reads both from the Consultation row via consultationId anyway).
  const duration = selectedService?.minutes ?? info?.sessionMin ?? TUTOR_DEFAULTS.durationMin
  const priceNum = priceForDuration(selectedService?.price ?? info?.price ?? TUTOR_DEFAULTS.price, duration)
  const price = `₾${priceNum}`
  const total = `₾${priceNum}`

  // Tier switches change the duration — a start picked for 30 წთ may not fit
  // (or exist) in the 90-წთ enumeration. Re-validate and clear silently; the
  // picker re-opens on the same day.
  useEffect(() => {
    if (!selectedStart || !info) return
    const choices = enumerateTimes(startOfDay(selectedStart), info.availability, info.busySlots, duration)
    const stillValid = choices.some(c => !c.taken && c.start.getTime() === selectedStart.getTime())
    if (!stillValid) setSelectedStart(null)
  }, [duration, info, selectedStart])

  const resendVerify = async () => {
    if (resendingVerify) return
    setResendingVerify(true)
    setResendMsg(null)
    try {
      const meRes = await fetch('/api/me')
      const meData = await meRes.json().catch(() => ({} as any))
      const email = meData?.user?.email
      if (!email) { setResendMsg('სესია ვერ მოიძებნა.'); return }
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose: 'verify' }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || data?.ok === false) {
        setResendMsg(data?.error === 'RATE_LIMITED' ? 'ხშირად ცდი — მოგვიანებით სცადე.' : 'გაგზავნა ვერ მოხერხდა.')
        return
      }
      setResendMsg('კოდი გაიგზავნა — შეამოწმე ელფოსტა.')
    } catch {
      setResendMsg('ქსელის შეცდომა.')
    } finally {
      setResendingVerify(false)
    }
  }

  if (!open) return null

  const bookTutorId = info?.id || tutorId
  const timeChoices = selectedDate && info
    ? enumerateTimes(selectedDate, availability, busySlots, duration)
    : []

  const dayLabelFull = selectedStart
    ? `${DAY_SHORT[isoWeekday(selectedStart)]} ${selectedStart.getDate()} ${KA_MONTHS_FULL[selectedStart.getMonth()]}`
    : '— აირჩიე დღე'

  const goalValid = details.goal.trim().length >= MIN_INTAKE_CHARS

  const submitBooking = async () => {
    if (!bookTutorId || submitting) return
    if (!selectedStart) {
      setSubmitError('აირჩიე კონკრეტული დრო.')
      return
    }
    if (!goalValid) {
      setSubmitError(`მოკლედ აღწერე, რისი განხილვა გინდა (მინ. ${MIN_INTAKE_CHARS} სიმბოლო).`)
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    setSubmitUnverified(false)
    setResendMsg(null)
    try {
      if (selectedStart.getTime() < Date.now()) {
        setSubmitError('არჩეული დრო წარსულშია. აირჩიე მომავალი დრო.')
        return
      }
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tutorId: bookTutorId,
          // Booking a chosen tier: the server validates ownership and uses the
          // Consultation row's minutes/price as authoritative (undefined keys
          // are dropped by JSON.stringify, so the generic flow is unchanged).
          consultationId: selectedService?.id,
          topic: details.topic || 'კონსულტაცია',
          // Mandatory intake (1.3) — the expert reads this on the request card
          // and the booking detail page before the session.
          studentNotes: details.goal.trim(),
          startAt: selectedStart.toISOString(),
          durationMin: duration,
          price: priceNum,
        }),
      })
      if (res.status === 401) {
        const here = typeof window !== 'undefined' ? window.location.pathname + window.location.search : `/tutors/${bookTutorId}`
        window.location.href = `/signin?redirect=${encodeURIComponent(here)}`
        return
      }
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || data?.ok === false) {
        const code = data?.error as string | undefined
        // NB: student signup deliberately skips email verification (2026-07-20),
        // and no API route returns EMAIL_NOT_VERIFIED today. The old branch here
        // walled the booking at submit — the worst possible moment — if the two
        // ever diverged. Removed: any such code now falls through to the generic
        // error below, never a hard verification wall.
        const msg =
          code === 'SLOT_TAKEN' ? 'ეს დრო უკვე დაჯავშნილია. აირჩიე სხვა დრო.' :
          code === 'NO_AVAILABILITY' ? 'ექსპერტი ამ დროზე არ არის ხელმისაწვდომი. აირჩიე მისი გამოცხადებული დროებიდან.' :
          code === 'PAST_DATE' ? 'არჩეული დრო წარსულშია.' :
          code === 'SELF_BOOKING' ? 'ვერ დაიჯავშნი საკუთარ თავს.' :
          code === 'TUTOR_NOT_FOUND' ? 'ექსპერტი ვერ მოიძებნა.' :
          code === 'CONSULTATION_NOT_FOUND' ? 'ეს სერვისი ვეღარ მოიძებნა — აირჩიე თავიდან.' :
          code === 'TUTOR_UNAVAILABLE' ? 'ექსპერტი ამჟამად პაუზაზეა — ახალი ჯავშანი ვერ შეიქმნება.' :
          code === 'RATE_LIMIT' ? 'ხშირად ცდი ჯავშანს — ცოტა ხანში სცადე თავიდან.' :
          code === 'STUDENT_OVERLAP' ? 'ამ დროს უკვე გაქვს სხვა ჯავშანი. აირჩიე თავისუფალი დრო.' :
          code === 'INVALID' ? 'შეავსე ყველა აუცილებელი ველი.' :
          code === 'FORBIDDEN' ? 'ჯავშანი მხოლოდ კლიენტის ანგარიშს შეუძლია — ექსპერტის/ადმინის ანგარიშით ვერ დაჯავშნი.' :
          // Surface the raw code when unmapped so a failure is never a silent
          // "try again" with no clue what went wrong.
          `დაჯავშნა ვერ შესრულდა${code ? ` (${code})` : ''}. სცადე თავიდან.`
        setSubmitError(msg)
        return
      }
      setCreatedId(typeof data?.id === 'string' ? data.id : null)
      setSubmitted(true)
    } catch {
      setSubmitError('ქსელის შეცდომა. შეამოწმე კავშირი და სცადე თავიდან.')
    } finally {
      setSubmitting(false)
    }
  }

  const next = () => {
    if (step < totalSteps) setStep(step + 1)
    else submitBooking()
  }
  const back = () => { if (step > 1) setStep(step - 1) }

  const summary = (
    <OrderSummary
      start={selectedStart}
      duration={duration}
      topic={details.topic}
      total={total}
      tutorName={info?.name ?? TUTOR_DEFAULTS.name}
      tutorSpecialty={info?.specialty ?? 'კონსულტაცია'}
      tutorAvatar={info?.avatarUrl ?? null}
      serviceTitle={selectedService?.title ?? null}
    />
  )

  const canAdvance =
    hasTierStep && step === tierStepN ? selectedService !== null :
    step === slotStepN ? selectedStart !== null :
    step === detailsStepN ? goalValid :
    true

  const onPaymentStep = PAYMENTS_LIVE && step === totalSteps
  const cardValid = isPaymentValid(payment)

  const nextLabel =
    step < totalSteps
      ? hasTierStep && step === tierStepN
        ? 'შემდეგი — დრო'
        : step === slotStepN
          ? 'შემდეგი — დეტალები'
          : 'შემდეგი — გადახდა'
      : PAYMENTS_LIVE
        ? `${total}-ის გადახდა`
        : 'დაჯავშნე'

  const lastInputStep = step === totalSteps

  return (
    // Right-side sheet (desktop) / bottom sheet (mobile) via the shared Sheet
    // container — the flow reads as a follow-up panel next to the page the
    // user came from, not a takeover.
    <Sheet
      open={open}
      onClose={onClose}
      variant="side"
      size="lg"
      busy={submitting}
      ariaLabel={`${info?.name ?? 'ექსპერტი'} — დაჯავშნა`}
      eyebrow="სესიის დაჯავშნა"
      title={
        <>
          {/* When a tier is chosen, name IT here — the user must see what
              they're booking from the first step onward. */}
          <span className="text-[20px] lg:text-[22px]">{info?.name ?? 'ექსპერტი'} · {selectedService ? selectedService.title : info?.specialty ?? 'კონსულტაცია'}</span>
          <div className="mt-4 font-sans font-normal tracking-normal">
            <Steps step={step} labels={stepLabels} />
          </div>
        </>
      }
      footer={!submitted && info ? (
        <div className="w-full flex flex-col gap-3">
          {submitError && (
            <div role="alert" className="rounded-btn border border-danger-200 bg-danger-50 text-danger-800 px-3 py-2 text-[12.5px] font-medium">
              {submitUnverified ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>დაჯავშნამდე დაადასტურე ელფოსტა</span>
                  <span>·</span>
                  <a href="/settings" className="underline font-semibold hover:text-danger-900">ბმული ვერიფიკაციაზე</a>
                  <button
                    type="button"
                    onClick={resendVerify}
                    disabled={resendingVerify}
                    className="ml-auto h-7 px-2 rounded-btn bg-white border border-danger-200 hover:border-danger-300 disabled:opacity-50 text-danger-700 font-display font-semibold text-[11.5px] transition-colors"
                  >
                    {resendingVerify ? 'იგზავნება…' : 'კოდის ხელახლა გაგზავნა'}
                  </button>
                  {resendMsg && <div className="w-full text-[11.5px] text-danger-700 mt-0.5">{resendMsg}</div>}
                </div>
              ) : submitError}
            </div>
          )}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="text-[13px]">
              <Eyebrow tone="muted">არჩეული</Eyebrow>
              <div className="font-display font-bold text-ink-900 mt-0.5">
                {selectedStart
                  ? <>{selectedService ? `${selectedService.title} · ` : ''}{dayLabelFull} · {fmtHM(selectedStart)} · <span className="tabular-nums">{duration}</span> წუთი · <span className="tabular-nums">{price}</span></>
                  : selectedService
                    ? <>{selectedService.title} · <span className="font-medium text-ink-500">აირჩიე დრო</span></>
                    : '— აირჩიე დრო'}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {step > 1 ? (
                <button type="button" onClick={back} disabled={submitting} className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 hover:border-ink-300 text-ink-700 font-display font-semibold text-[13px] tracking-wide inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  <Icon.chevL className="w-3.5 h-3.5" />
                  უკან
                </button>
              ) : (
                <button type="button" onClick={onClose} disabled={submitting} className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 hover:border-ink-300 text-ink-700 font-display font-semibold text-[13px] tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  გაუქმება
                </button>
              )}
              <button
                type="button"
                onClick={next}
                disabled={submitting || !canAdvance || (onPaymentStep && !cardValid)}
                aria-busy={submitting}
                className="h-11 px-5 rounded-btn bg-gradient-cta hover:brightness-105 text-white font-display font-semibold text-[13.5px] tracking-wide inline-flex items-center gap-2 shadow-brand-glow hover:shadow-[0_10px_32px_rgba(47,156,134,0.36)] transition-all duration-fast disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {submitting ? (
                  <>
                    <span aria-hidden className="inline-block w-4 h-4 rounded-full border-2 border-white/60 border-t-transparent motion-safe:animate-spin" />
                    იგზავნება…
                  </>
                ) : (
                  nextLabel
                )}
              </button>
            </div>
          </div>
          {/* Risk-reversal glued to the confirm CTA — the ONE canonical line. */}
          {lastInputStep && (
            <p className="text-[11.5px] text-ink-500 text-center leading-snug">{RISK_REVERSAL_LINE}</p>
          )}
        </div>
      ) : undefined}
    >
        {/* Body — full-bleed inside Sheet's padded scroll area */}
        <div className="-mx-5 sm:-mx-6 -my-4">
          {/* Scroll anchor: step-change effect scrolls this to the top of the sheet. */}
          <div ref={stepTopRef} aria-hidden />
          {!info ? (
            fetchState === 'error' ? (
              <div className="flex flex-col items-center justify-center text-center px-6 py-16">
                <div className="w-12 h-12 rounded-full bg-warning-50 border border-warning-200 inline-flex items-center justify-center text-warning-700 mb-4">
                  <Icon.warn className="w-5 h-5" />
                </div>
                <div className="font-display text-[15px] font-bold text-ink-900">მონაცემები ვერ ჩაიტვირთა</div>
                <p className="text-[13px] text-ink-500 mt-2 max-w-[300px]">დროებითი ქსელური ხარვეზია. სცადე თავიდან.</p>
                <button
                  type="button"
                  onClick={() => setFetchAttempt(a => a + 1)}
                  className="mt-5 h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13px] tracking-wide transition-colors"
                >
                  სცადე თავიდან
                </button>
              </div>
            ) : (
              <div className="px-6 py-10 animate-pulse space-y-4" aria-busy="true" aria-live="polite">
                <div className="h-5 w-1/3 bg-ink-100 rounded" />
                <div className="grid grid-cols-7 gap-1.5">
                  {Array.from({ length: 14 }).map((_, i) => <div key={i} className="aspect-square bg-ink-100 rounded-btn" />)}
                </div>
                <div className="h-24 w-full bg-ink-100 rounded-card" />
                <span className="sr-only">იტვირთება…</span>
              </div>
            )
          ) : submitted ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-7 py-14">
              <div className="relative w-20 h-20 rounded-full bg-success-100 inline-flex items-center justify-center text-success-700 mb-6 motion-safe:animate-scale-in">
                <span aria-hidden className="absolute inset-0 rounded-full bg-success-500/20 motion-safe:animate-pulse-soft" />
                <span aria-hidden className="absolute -inset-2 rounded-full border-2 border-success-200 motion-safe:animate-pulse-soft" />
                <Icon.check className="relative w-10 h-10" />
              </div>
              {/* One state = one truth: a REQUEST awaiting expert confirmation,
                  never "confirmed". */}
              <h3 className="font-display text-[26px] font-bold text-ink-900 tracking-tight motion-safe:animate-rise-in" style={{ animationDelay: '120ms' }}>
                მოთხოვნა გაგზავნილია
              </h3>
              <p className="text-[14px] text-ink-600 mt-3 max-w-[440px] leading-[1.55] motion-safe:animate-rise-in" style={{ animationDelay: '200ms' }}>
                {dayLabelFull}{selectedStart ? ` · ${fmtHM(selectedStart)}` : ''} · {total} · {info.name}. ექსპერტი მალე დაადასტურებს — შეტყობინებას მიიღებ. ჯავშანი გამოჩნდება „ჩემი ჯავშნების“ გვერდზე.
              </p>
              <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-2 motion-safe:animate-rise-in" style={{ animationDelay: '280ms' }}>
                <Link
                  href={createdId ? `/student/bookings/${createdId}` : '/student/bookings'}
                  className="h-11 px-6 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13px] tracking-wide inline-flex items-center gap-2 shadow-brand-glow hover:shadow-[0_10px_32px_rgba(47,156,134,0.36)] transition-all duration-fast"
                >
                  ჯავშნის ნახვა
                </Link>
                <button type="button" onClick={onClose} className="h-11 px-5 rounded-btn bg-white border border-ink-200 hover:border-ink-300 hover:bg-ink-50 text-ink-700 font-display font-semibold text-[13px] tracking-wide transition-colors">
                  დახურვა
                </button>
              </div>
            </div>
          ) : hasTierStep && step === tierStepN ? (
            <TierStep
              consultations={tiers}
              selected={selectedService}
              onSelect={s => { setSelectedService(s); if (submitError) setSubmitError(null) }}
            />
          ) : step === slotStepN ? (
            // Mobile: one natural scroll through the Sheet body (calendar →
            // time grid). Desktop (lg+): fixed-height two-pane with each column
            // scrolling independently. The h-full + per-pane overflow only kick
            // in at lg so mobile never gets the janky nested double-scroll.
            <div className="grid lg:grid-cols-[360px_1fr] lg:h-full">
              <div className="border-b lg:border-b-0 lg:border-r border-ink-100 p-4 sm:p-6 lg:overflow-y-auto">
                <Calendar
                  viewMonth={viewMonth}
                  selected={selectedDate}
                  slotsByDay={slotsByDay}
                  onSelect={(d) => { setSelectedDate(d); setSelectedStart(null); scrollToTimesRef.current = true }}
                  onPrev={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                  onNext={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                />
              </div>
              <div ref={timePaneRef} className="p-4 sm:p-6 lg:overflow-y-auto scroll-mt-4">
                {selectedDate ? (
                  <>
                    <DayTimeline
                      date={selectedDate}
                      selected={selectedStart}
                      onSelect={(t) => { setSelectedStart(t); if (submitError) setSubmitError(null) }}
                      duration={duration}
                      price={price}
                      timeChoices={timeChoices}
                    />
                    {/* Persistent escape hatch: the expert HAS slots, but if none
                        of them suit the client there's no need to abandon the
                        sheet — offer the direct-message path right here. */}
                    {bookTutorId && (
                      <div className="mt-5 pt-4 border-t border-ink-100 text-center">
                        <Link
                          href={`/tutors/${bookTutorId}?intent=message`}
                          onClick={() => onClose()}
                          className="text-[12.5px] text-ink-500 hover:text-brand-700 font-display font-medium transition-colors"
                        >
                          არცერთი დრო არ მაწყობს? მიწერე ექსპერტს
                        </Link>
                      </div>
                    )}
                  </>
                ) : availability.length === 0 ? (
                  <div className="lg:h-full min-h-[260px] flex flex-col items-center justify-center text-center px-6 py-12">
                    <div className="w-12 h-12 rounded-full bg-ink-100 inline-flex items-center justify-center text-ink-500 mb-4">
                      <Icon.cal className="w-5 h-5" />
                    </div>
                    <div className="font-display text-[15px] font-bold text-ink-900">
                      ექსპერტს ჯერ არ აქვს გამოცხადებული დროები
                    </div>
                    <p className="text-[13px] text-ink-500 mt-2 max-w-[320px]">
                      მიწერე პირდაპირ — ექსპერტი ხშირად ხსნის ინდივიდუალურ დროს კონკრეტული მოთხოვნით.
                    </p>
                    <div className="mt-5 flex flex-col sm:flex-row gap-2 items-center">
                      <Link
                        href={`/tutors/${bookTutorId}?intent=message`}
                        onClick={(e) => { e.preventDefault(); onClose(); if (bookTutorId) window.location.href = `/tutors/${bookTutorId}?intent=message` }}
                        className="h-11 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] tracking-wide inline-flex items-center gap-1.5 transition-colors"
                      >
                        დაუკავშირდი ექსპერტს
                      </Link>
                      <Link
                        href="/tutors"
                        onClick={() => onClose()}
                        className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-800 font-display font-semibold text-[12.5px] tracking-wide inline-flex items-center transition-colors"
                      >
                        მსგავსი ექსპერტები
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="lg:h-full min-h-[260px] flex flex-col items-center justify-center text-center px-6 py-12">
                    <div className="w-12 h-12 rounded-full bg-ink-100 inline-flex items-center justify-center text-ink-500 mb-4">
                      <Icon.cal className="w-5 h-5" />
                    </div>
                    <div className="font-display text-[15px] font-bold text-ink-900">აირჩიე დღე კალენდარში</div>
                    <p className="text-[13px] text-ink-500 mt-2 max-w-[280px]">შემდეგ გამოჩნდება ხელმისაწვდომი დროები.</p>
                  </div>
                )}
              </div>
            </div>
          ) : step === detailsStepN ? (
            <IntakeStep value={details} onChange={setDetails} summary={summary} />
          ) : (
            <PaymentStep value={payment} onChange={setPayment} summary={summary} />
          )}
        </div>
    </Sheet>
  )
}
