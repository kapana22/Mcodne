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
import { PAYMENTS_LIVE, FEATURE_REQUEST_BOOKING } from '@/lib/flags'
import { isAbroadCategory, eurLabel } from '@/lib/abroad'
import { KA_MONTHS_LONG as KA_MONTHS_FULL } from '@/lib/kaDate'
import {
  TUTOR_DEFAULTS, priceForDuration, DAY_SHORT, DAY_NAMES_FULL, isoWeekday, startOfDay, fmtHM,
  openStartsByDay, startsOnDay, firstOpenDay, toTimeChoices, isOpenStart, orderedTiers, isFreeTier,
  type ApiSlot, type BusySlot, type ConsultationItem, type SlotRules,
} from './slots'
import { Calendar } from './Calendar'
import { DayTimeline } from './DayTimeline'
import { AbroadTzNote } from './TzLabels'
import { IntakeStep, TOPIC_OPTIONS, type DetailsState } from './IntakeStep'
// B2B. Renders and fetches NOTHING unless the viewer is a company member — see
// the header of ./CompanyBalance.
import { useCompanyBalance, CompanyBalanceChoice } from './CompanyBalance'
import { PaymentStep, INITIAL_PAYMENT, isPaymentValid, type PaymentState } from './PaymentStep'
import { OrderSummary } from './OrderSummary'
// Funnel instrumentation. Pure observation: nothing below changes what the flow
// does, and every emit is fire-and-forget (see ./funnelEvents).
import {
  BOOKING_FUNNEL_EVENTS as FUNNEL, trackFunnel, newFlowId, leadDays, CODE_RE,
} from './funnelEvents'
// mapTutorPayload / BookingTutorInfo moved to ./mapTutorPayload so the profile
// page can import the tiny mapper without bundling this whole component. Kept
// re-exported here so existing `from '.../BookingFlow'` imports still resolve.
import { mapTutorPayload, type BookingTutorInfo } from './mapTutorPayload'
export { mapTutorPayload, type BookingTutorInfo }

/* Server codes that mean „the time you picked is no longer bookable" — as
 * opposed to „the request was wrong" (INVALID, FORBIDDEN) or „the expert is
 * gone" (TUTOR_NOT_FOUND, TUTOR_UNAVAILABLE), which a new time cannot fix.
 * Every message for these ends in „აირჩიე სხვა", so the flow returns to the
 * slot step when one comes back — see the submit handler. */
const TIME_DEAD_CODES = new Set([
  'SLOT_TAKEN', 'NO_AVAILABILITY', 'PAST_DATE', 'STUDENT_OVERLAP',
])

/* Step rail — dynamic labels because the tier and payment steps come and go.
 *
 * MOBILE: only the ACTIVE step spells out its name (2026-08-04). Three labelled
 * steps wrapped onto a second line at 375px and left a dangling connector
 * pointing at nothing, and the wrap alone cost ~30px of a header that had
 * already grown to 201px — on a 567px panel that is the difference between the
 * next step's input being on screen and being below the fold. The dots and
 * checks still carry „where am I / how far in", which is what a rail is for. */
const Steps = ({ step, labels }: { step: number; labels: string[] }) => (
  <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
    {labels.map((l, i) => {
      const n = i + 1
      const done = step > n
      const active = step === n
      return (
        <React.Fragment key={l}>
          <div className={`inline-flex items-center gap-1.5 min-w-0 ${active ? 'text-brand-700' : done ? 'text-success-600' : 'text-ink-400'}`}>
            <span className={`w-5 h-5 shrink-0 rounded-full inline-flex items-center justify-center text-meta font-display font-bold ${active ? 'bg-brand-600 text-white' : done ? 'bg-success-500 text-white' : 'bg-ink-100 text-ink-500'}`}>
              {done ? <Icon.check className="w-3 h-3" /> : n}
            </span>
            <span className={`font-display text-meta font-semibold tracking-wide truncate ${active ? '' : 'hidden sm:inline'}`}>{l}</span>
          </div>
          {i < labels.length - 1 && <div className="w-4 sm:w-6 h-px shrink-0 bg-ink-200" />}
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

  // `fetched` FIRST, not last (2026-08-05). It is null for the whole preloaded
  // path, so this is identical to `tutor ?? fetched` in the ordinary case — but
  // when a submit comes back „that time is taken", the flow refetches into
  // `fetched`, and the fresher payload has to win over the snapshot the parent
  // handed us at open. Otherwise the picker keeps offering the very slot the
  // server has just refused.
  const info = fetched ?? tutor
  const availability = info?.availability ?? []
  const busySlots = info?.busySlots ?? []
  const tiers = info?.consultations ?? []
  // May this client propose a time? BOTH terms, mirroring the server: the flag
  // is the kill switch, the category is the audience. Showing the control to
  // anyone else would offer a path the API refuses — the worst kind of dead
  // control, because it fails only after the user has filled the form.
  const isAbroadExpert = isAbroadCategory(info?.categorySlug)
  const canPropose = FEATURE_REQUEST_BOOKING && isAbroadExpert
  // Session types become step 1 only when there is a real choice to make;
  // single-tier / no-tier experts go straight to the slot picker (1.2).
  /* TWO STEPS, ALWAYS (2026-08-07, owner's call).
   *
   * „სერვისი" used to be a whole screen of its own whenever the expert had 2+
   * tiers, so choosing between „30 წუთი" and „60 წუთი" — one tap — cost a full
   * page transition before the calendar was even visible. On a funnel measured
   * at 132 opens → 2 bookings, a screen that carries a single decision is a
   * screen to delete. The tiers are now CHIPS above the calendar: the choice is
   * still explicit and still first, it just no longer hides the times behind it.
   *
   * `hasTierPicker` (chips shown inline) replaces `hasTierStep` (its own step).
   */
  const hasTierPicker = tiers.length >= 2
  const slotStepN = 1
  const detailsStepN = 2
  const totalSteps = detailsStepN + (PAYMENTS_LIVE ? 1 : 0)
  const stepLabels = [
    hasTierPicker ? 'სერვისი და დრო' : 'დრო',
    'დეტალები',
    ...(PAYMENTS_LIVE ? ['გადახდა'] : []),
  ]

  /* ── state ── */
  const [step, setStep] = useState<number>(1)
  const [selectedService, setSelectedService] = useState<ConsultationItem | null>(initialService)

  // A tapped consultation tier overrides the flat defaults: its minutes drive
  // the slot DERIVATION and its price is what the summary restates (the server
  // re-reads both from the Consultation row via consultationId anyway). This
  // sits above the slot memos on purpose — the tier is chosen FIRST, so every
  // start below is computed for the length actually being booked.
  const duration = selectedService?.minutes ?? info?.sessionMin ?? TUTOR_DEFAULTS.durationMin
  const priceNum = priceForDuration(selectedService?.price ?? info?.price ?? TUTOR_DEFAULTS.price, duration)
  const price = `₾${priceNum}`
  const total = `₾${priceNum}`
  // Approximate euro, shown UNDER the lari total for a diaspora expert only.
  // Derived from `priceNum` — the SAME authoritative figure the lari label uses
  // — so the two can never quote different sessions.
  const eurNote = isAbroadExpert ? eurLabel(priceNum) : null
  const rules = React.useMemo<SlotRules>(() => ({ bufferMin: info?.bufferMin ?? 0 }), [info?.bufferMin])

  // Windows − bookings − THIS service's length: recomputed whenever the tier
  // changes, so the calendar dots and the time grid always describe what can
  // genuinely be booked.
  const startsByDay = React.useMemo(
    () => openStartsByDay(availability, busySlots, duration, rules),
    [availability, busySlots, duration, rules],
  )
  const firstFreeDate = React.useMemo(() => firstOpenDay(startsByDay), [startsByDay])
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const anchor = initialStart ?? new Date()
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  })
  const [selectedStart, setSelectedStart] = useState<Date | null>(initialStart)
  // Request-based booking (FEATURE_REQUEST_BOOKING). When the expert has
  // published nothing bookable, the client may PROPOSE a time instead of
  // hitting the dead end — the expert then accepts or declines it exactly as
  // they already accept every other booking. `proposed` rides along on submit;
  // everything else in this flow is unchanged, which is why the proposal simply
  // sets `selectedStart` rather than growing a second submit path.
  const [proposing, setProposing] = useState(false)
  const [proposed, setProposed] = useState(false)
  const [proposeDate, setProposeDate] = useState('')
  const [proposeTime, setProposeTime] = useState('')
  // Their 2nd and 3rd choice. OPTIONAL, and the reason the request is worth
  // sending at all: one named time is a yes/no that fails half the time, three
  // is a decision the expert can actually make in one go. Kept as raw
  // date/time field pairs (not Dates) so a half-filled row is simply ignored
  // rather than becoming an Invalid Date.
  const [altSlots, setAltSlots] = useState<{ date: string; time: string }[]>([])
  const altIsos = React.useMemo(
    () =>
      altSlots
        .map(s => (s.date && s.time ? new Date(`${s.date}T${s.time}`) : null))
        .filter((d): d is Date => !!d && !isNaN(d.getTime()) && d.getTime() > Date.now())
        .map(d => d.toISOString()),
    [altSlots],
  )
  // ── The day picker collapses on a phone (2026-08-04) ─────────────────────
  // The slot step is a two-pane desktop layout — calendar left, times right —
  // and below lg the two panes simply stack. Measured on the live site at
  // 390×844: the month grid plus its legend pushed the FIRST bookable time to
  // 655px inside a 512px scroll area, so the step that exists to choose a time
  // opened with ZERO times on screen. The old remedy was a smooth auto-scroll
  // after a day tap, which moved 336px of content out from under the finger —
  // treating the symptom, and badly.
  //
  // So below lg the month is a disclosure. The flow already auto-selects the
  // first bookable day, so the collapsed state is never empty: it names the
  // chosen day and the times sit directly beneath it, visible without a scroll.
  // Tapping the day reopens the month; choosing from it collapses again. No new
  // copy — the trigger renders the date the timeline already formats, and takes
  // the calendar's own „აირჩიე დღე" as its accessible name.
  //
  // Desktop is untouched: at lg both panes render side by side as before, which
  // is why every class below is `lg:`-gated rather than a JS branch.
  const [dayPickerOpen, setDayPickerOpen] = useState(false)
  // Nothing chosen yet (self-fetch still landing, or a month with no open days)
  // → there is no collapsed state to show, so the month stays open.
  const monthOpen = dayPickerOpen || !selectedDate
  useEffect(() => { if (!open) setDayPickerOpen(false) }, [open])
  // Collapsing removes the day cell that was just activated from the document,
  // so keyboard focus would land back on <body> — the user's place in the sheet
  // gone, and a screen reader with nothing to announce. Hand focus to the
  // trigger, which is what now represents the choice they made.
  const dayTriggerRef = useRef<HTMLButtonElement | null>(null)
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
  })
  const [payment, setPayment] = useState<PaymentState>(INITIAL_PAYMENT)
  // B2B. `company` is null for everyone who is not a company member, which
  // makes both of these inert: the choice renders nothing and `useBalance`
  // never leaves false.
  const company = useCompanyBalance(open)
  const [useBalance, setUseBalance] = useState(false)
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
    // Always the slot step: the tier picker lives ON it now, so there is
    // nothing left to skip past.
    setStep(1)
    // Preselect the FLAGSHIP (orderedTiers puts the longest paid session first)
    // when the caller named no service. Without it a multi-tier expert's
    // calendar would derive against the profile's default length — i.e. show
    // availability for a session nobody had chosen yet.
    setSelectedService(initialService ?? (preTiers.length >= 2 ? orderedTiers(preTiers)[0] ?? null : null))
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

  /* ── funnel instrumentation ──────────────────────────────────────────────
   * One anonymous id per OPEN stitches this attempt's steps together, so
   * „opened → service → time → details → created/failed" can be read as a
   * single person's run instead of five unrelated counters. Refs, not state:
   * measuring must never cause a render, and it must never be a dependency of
   * anything the flow decides.
   */
  const flowIdRef = useRef<string>('')
  const noSlotsSentRef = useRef(false)
  const detailsSentRef = useRef(false)
  useEffect(() => {
    if (!open) { flowIdRef.current = ''; noSlotsSentRef.current = false; detailsSentRef.current = false; setProposing(false); setProposed(false); setProposeDate(''); setProposeTime(''); return }
    const id = newFlowId()
    flowIdRef.current = id
    noSlotsSentRef.current = false
    detailsSentRef.current = false
    trackFunnel(FUNNEL.opened, {
      flowId: id,
      // Lets /api/tutor/insights answer „how many started booking ME" — the
      // difference between „nobody sees me" and „they see me and don't book",
      // which need opposite fixes.
      ...(tutorId ? { tutorId } : {}),
      // Self-fetch (listing) vs preloaded (profile) start from different places
      // and drop people at different rates — worth telling apart.
      preloaded: !!tutor,
      prefilledTime: !!initialStart,
      prefilledService: !!initialService,
    })
    // Deliberately keyed on `open` alone: the props above are an OPENING
    // snapshot, and a parent rebuilding its payload object must not mint a
    // second flow id in the middle of one attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // A dead end the user did not choose: nothing bookable for this service
  // length. Recorded once per attempt so „couldn't" is never counted as
  // „didn't want to". Reads startsByDay directly (the `noOpenStarts` const
  // below lives past the early return, where hooks may not go).
  useEffect(() => {
    if (!open || !info || noSlotsSentRef.current || startsByDay.size > 0) return
    noSlotsSentRef.current = true
    trackFunnel(FUNNEL.noSlots, {
      flowId: flowIdRef.current,
      durationMin: duration,
      tierCount: tiers.length,
      // „published nothing at all" and „published, but this length never fits"
      // are two different product problems.
      hasWindows: availability.length > 0,
    })
  }, [open, info, startsByDay, duration, tiers.length, availability.length])

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

  // Tier switches change the duration — a start picked for 30 წთ may not fit
  // (or exist) in the 90-წთ derivation. Re-validate against the SAME predicate
  // the server uses (isStartOpen) and drop a now-illegal start rather than
  // carrying it into submit.
  //
  // It used to drop SILENTLY, and that was the flow's worst moment: the time
  // you had just chosen vanished with no explanation while you were looking at
  // a different control. Now it says so. (Picking a time on the profile no
  // longer triggers this at all — the #schedule chips derive their times from
  // the selected tier and hand it over with the tap — but switching tiers
  // INSIDE the sheet still can, and that is when the message matters.)
  const [startDropped, setStartDropped] = useState<Date | null>(null)
  useEffect(() => {
    if (!selectedStart || !info) return
    if (!isOpenStart(selectedStart, info.availability, info.busySlots, duration, rules)) {
      setStartDropped(selectedStart)
      setSelectedStart(null)
    }
  }, [duration, info, selectedStart, rules])
  // Clear the notice as soon as a new time is chosen, and on every reopen.
  useEffect(() => { if (selectedStart) setStartDropped(null) }, [selectedStart])
  useEffect(() => { if (!open) setStartDropped(null) }, [open])

  // …and the whole DAY can lose its free times when the service grows. Move to
  // the first day that still has one instead of leaving the user parked on a
  // day the calendar has just disabled.
  useEffect(() => {
    if (!open || !selectedDate || startsOnDay(startsByDay, selectedDate).length > 0) return
    const next = firstOpenDay(startsByDay)
    if (next) { setSelectedDate(next); setViewMonth(new Date(next.getFullYear(), next.getMonth(), 1)) }
  }, [open, selectedDate, startsByDay])

  // Re-read the expert's windows and bookings after the server has refused a
  // start. Best-effort on purpose: if it fails we keep the stale grid, because
  // the bounce back to the picker is the part that matters and a second error
  // banner would only bury the first. Writes into `fetched`, which `info` reads
  // ahead of the preloaded `tutor` — see the note there.
  const refreshAvailability = React.useCallback(async () => {
    const id = info?.id || tutorId
    if (!id) return
    try {
      const r = await fetch(`/api/tutors/${id}`)
      if (!r.ok) return
      setFetched(mapTutorPayload(await r.json()))
    } catch { /* keep the stale view */ }
  }, [info?.id, tutorId])

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
        setResendMsg(data?.error === 'RATE_LIMITED' ? 'ბევრი მცდელობა — სცადე მოგვიანებით.' : 'გაგზავნა ვერ მოხერხდა.')
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
    ? toTimeChoices(startsOnDay(startsByDay, selectedDate), duration)
    : []
  // „No free time" for THIS service — distinct from „the expert published
  // nothing at all", which is a different sentence to the client.
  const noOpenStarts = startsByDay.size === 0

  const dayLabelFull = selectedStart
    ? `${DAY_SHORT[isoWeekday(selectedStart)]} ${selectedStart.getDate()} ${KA_MONTHS_FULL[selectedStart.getMonth()]}`
    : '— აირჩიე დღე'


  // The failure terminal. A person stopped by SLOT_TAKEN is a different problem
  // from a person who lost interest, and only the code tells them apart.
  const trackFail = (code: string) => trackFunnel(FUNNEL.failed, {
    flowId: flowIdRef.current,
    tierCount: tiers.length,
    durationMin: duration,
    code,
  })

  const submitBooking = async () => {
    if (!bookTutorId || submitting) return
    if (!selectedStart) {
      setSubmitError('აირჩიე დრო.')
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    setSubmitUnverified(false)
    setResendMsg(null)
    try {
      if (selectedStart.getTime() < Date.now()) {
        trackFail('PAST_LOCAL')
        setSubmitError('ეს დრო წარსულშია — აირჩიე სხვა.')
        // Same bounce as the server-side codes below: the sentence says pick
        // another time, so put the picker back in front of them.
        setSelectedStart(null)
        setStep(slotStepN)
        return
      }
      // The intake goes through as the student wrote it. A „share material
      // before the session" checkbox used to append a sentence here on the
      // student's behalf; it was removed 2026-08-05 — it was pre-ticked, had no
      // API field of its own, and put words the student never typed into the
      // note the expert reads.
      const studentNotes = details.goal.trim()
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
          // and the booking detail page before the session. Carries the
          // pre-call material intent as an appended line when checked.
          studentNotes,
          startAt: selectedStart.toISOString(),
          durationMin: duration,
          price: priceNum,
          // Only ever true when the client came through the „შემომთავაზე დრო"
          // path; the server ignores it entirely while the feature is off or
          // the expert is outside the diaspora category.
          proposed: proposed || undefined,
          // Their 2nd/3rd choice. Sent only alongside `proposed` — outside a
          // request there is no such thing as an alternative time, and the
          // server drops the field on the same terms.
          proposedAlternates: proposed && altIsos.length ? altIsos : undefined,
          // B2B. Sent ONLY when a company member ticked the box — undefined
          // keys are dropped by JSON.stringify, so every other booking's
          // payload is byte-for-byte what it was. The server re-reads
          // membership, price and balance inside its transaction and ignores
          // this field entirely unless all three agree.
          paidBy: useBalance ? 'COMPANY_BALANCE' : undefined,
        }),
      })
      if (res.status === 401) {
        // The signin bounce is a real funnel exit, not a completion — record it
        // before navigating away (the beacon is `keepalive`, so it survives).
        trackFail('UNAUTHENTICATED')
        const here = typeof window !== 'undefined' ? window.location.pathname + window.location.search : `/experts/${bookTutorId}`
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
          code === 'SLOT_TAKEN' ? 'ეს დრო დაიკავეს — აირჩიე სხვა.' :
          code === 'NO_AVAILABILITY' ? 'ამ დროზე ექსპერტი დაკავებულია — აირჩიე სხვა დრო.' :
          code === 'PAST_DATE' ? 'ეს დრო წარსულშია.' :
          code === 'SELF_BOOKING' ? 'საკუთარ თავთან ჯავშნა შეუძლებელია.' :
          code === 'TUTOR_NOT_FOUND' ? 'ექსპერტი ვერ მოიძებნა.' :
          code === 'CONSULTATION_NOT_FOUND' ? 'ეს სერვისი აღარ არსებობს — აირჩიე სხვა.' :
          code === 'TUTOR_UNAVAILABLE' ? 'ექსპერტი პაუზაზეა — ვერ დაჯავშნი.' :
          code === 'RATE_LIMIT' ? 'ბევრი მცდელობა — სცადე ცოტა ხანში.' :
          code === 'STUDENT_OVERLAP' ? 'ამ დროს სხვა ჯავშანი გაქვს — აირჩიე სხვა.' :
          // B2B. Both mean „the balance did not pay for this" and nothing was
          // created — the whole transaction rolled back, so retrying without
          // the tick books normally.
          code === 'INSUFFICIENT_BALANCE' ? 'კომპანიის ბალანსზე საკმარისი თანხა არ არის.' :
          code === 'NOT_COMPANY_MEMBER' ? 'კომპანიის ბალანსით გადახდა ვერ მოხერხდა.' :
          code === 'INVALID' ? 'შეავსე ყველა ველი.' :
          code === 'FORBIDDEN' ? 'ჯავშანი მხოლოდ კლიენტს შეუძლია.' :
          // Surface the raw code when unmapped so a failure is never a silent
          // "try again" with no clue what went wrong.
          `ვერ დაიჯავშნა${code ? ` (${code})` : ''} — სცადე თავიდან.`
        // Same shape the endpoint enforces — an unexpected body can't turn the
        // code prop into free text, and the event is never silently dropped.
        trackFail(code && CODE_RE.test(code) ? code : 'UNKNOWN')
        setSubmitError(msg)
        // Five of these codes say „choose a different time" — and said it on the
        // details step, where there is no time to choose. The message asked for
        // an action the screen could not perform; the only way back was to spot
        // „უკან" in the footer and work out that it meant the picker. Now the
        // flow does what the sentence says: drop the dead start, return to the
        // slot step, and refresh availability so the refused time is actually
        // gone from the grid rather than sitting there ready to fail again.
        // The banner rides along (it lives in the footer, which every step
        // shares) and clears the moment a new time is tapped.
        if (code && TIME_DEAD_CODES.has(code)) {
          setSelectedStart(null)
          setStep(slotStepN)
          refreshAvailability()
        }
        return
      }
      trackFunnel(FUNNEL.created, {
        flowId: flowIdRef.current,
        tierCount: tiers.length,
        durationMin: duration,
        priceGel: priceNum,
        leadDays: leadDays(selectedStart),
      })
      setCreatedId(typeof data?.id === 'string' ? data.id : null)
      setSubmitted(true)
    } catch {
      trackFail('NETWORK')
      setSubmitError('ქსელის შეცდომა — სცადე თავიდან.')
    } finally {
      setSubmitting(false)
    }
  }

  const next = () => {
    // „დეტალები" completed. Reachable only when `canAdvance` is true, so this
    // genuinely means a valid intake — recorded once per attempt so a retry
    // after a server error doesn't double-count the step.
    if (step === detailsStepN && !detailsSentRef.current) {
      detailsSentRef.current = true
      trackFunnel(FUNNEL.detailsSubmitted, {
        flowId: flowIdRef.current,
        tierCount: tiers.length,
        durationMin: duration,
        // LENGTH only. The intake is someone describing a personal problem in
        // their own words — the words are never ours to log.
        notesLen: details.goal.trim().length,
        topicCustom: !TOPIC_OPTIONS.includes(details.topic),
      })
    }
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
      totalNote={eurNote}
      tutorName={info?.name ?? TUTOR_DEFAULTS.name}
      tutorSpecialty={info?.specialty ?? 'კონსულტაცია'}
      tutorAvatar={info?.avatarUrl ?? null}
      serviceTitle={selectedService?.title ?? null}
    />
  )

  const canAdvance =
    step === slotStepN ? selectedStart !== null :
    step === detailsStepN ? true :
    true

  const onPaymentStep = PAYMENTS_LIVE && step === totalSteps
  const cardValid = isPaymentValid(payment)

  const nextLabel =
    step < totalSteps
      ? step === slotStepN
        ? 'შემდეგი — დეტალები'
        : 'შემდეგი — გადახდა'
      : PAYMENTS_LIVE
        ? `${total}-ის გადახდა`
        : 'დაჯავშნე'

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
      // Each step starts at its own top — see Sheet's note. Without this the
      // calendar opened mid-scroll after a long service list.
      scrollResetKey={step}
      ariaLabel={`${info?.name ?? 'ექსპერტი'} — დაჯავშნა`}
      eyebrow="სესიის დაჯავშნა"
      title={
        <>
          {/* When a tier is chosen, name IT here — the user must see what
              they're booking from the first step onward. On a phone the tier
              rides in the footer's „არჩეული" line instead: at text-h2 the pair
              wrapped onto THREE lines at 375px, and the name alone identifies
              the sheet. One line, always. */}
          <span className="block truncate text-h3 sm:text-h2">
            {info?.name ?? 'ექსპერტი'}
            <span className="hidden sm:inline"> · {selectedService ? selectedService.title : info?.specialty ?? 'კონსულტაცია'}</span>
          </span>
          {/* The rail goes too when the keyboard is up — see the footer note.
              „Which step am I on" matters when you are choosing; it does not
              while you are typing into the step you are already looking at. */}
          <div className="mt-2.5 sm:mt-4 font-sans font-normal tracking-normal [@media(max-height:600px)]:hidden">
            <Steps step={step} labels={stepLabels} />
          </div>
        </>
      }
      footer={!submitted && info ? (
        <div className="w-full flex flex-col gap-3">
          {submitError && (
            <div role="alert" className="rounded-btn border border-danger-200 bg-danger-50 text-danger-800 px-3 py-2 text-small font-medium">
              {submitUnverified ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>დაადასტურე ელფოსტა</span>
                  <span>·</span>
                  <a href="/settings" className="underline font-semibold hover:text-danger-900">ვერიფიკაცია</a>
                  <button
                    type="button"
                    onClick={resendVerify}
                    disabled={resendingVerify}
                    className="ml-auto h-7 px-2 rounded-btn bg-white border border-danger-200 hover:border-danger-300 disabled:opacity-50 text-danger-700 font-display font-semibold text-meta transition-colors duration-fast"
                  >
                    {resendingVerify ? 'იგზავნება…' : 'ხელახლა გაგზავნა'}
                  </button>
                  {resendMsg && <div className="w-full text-meta text-danger-700 mt-0.5">{resendMsg}</div>}
                </div>
              ) : submitError}
            </div>
          )}
          {/* The footer is the OTHER half of the mobile height problem: at the
              details step it measured 189px of a 567px panel. The eyebrow is
              dropped below sm (the line reads as a selection without a label)
              and the line is clamped to TWO rows. Not one: a single truncated
              row cut „₾100" off the end at 375px, and the price is the last
              thing anyone should lose at the confirm step. Two rows hold the
              whole selection and still save the third and fourth. */}
          {/* …and when the KEYBOARD is up, both step aside entirely. Measured
              with a 336px keyboard on a 390×844 phone: the scroll area
              collapsed to 162px while this footer still claimed 167px — 62% of
              the panel spent on chrome at the exact moment the user is typing
              into the part that got squeezed. `dvh` cannot help here (it
              answers browser chrome, not the keyboard), so the fix is a footer
              that costs less when there is less: under 600px of height only the
              two buttons remain, which is all a keyboard-up screen needs.

              The query is height-ONLY, deliberately — it first shipped paired
              with an `sm:` escape hatch to protect desktop, and that hatch put
              every row straight back on a phone held SIDEWAYS (844×390 is wider
              than `sm`), where the squeeze is worst: measured 218px of chrome
              on a 390px screen. A window under 600px tall wants the compact
              footer whatever its width, desktop included. */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-4">
            <div className="text-small min-w-0 [@media(max-height:600px)]:hidden">
              <Eyebrow tone="muted" className="hidden sm:block">არჩეული</Eyebrow>
              {/* key = the selection: a new pick remounts the line and the
                  fast fade acknowledges it — the footer visibly RECEIVES the
                  choice made up in the panel. */}
              <div key={`${selectedService?.id ?? ''}·${selectedStart?.toISOString() ?? ''}`} className="font-display font-bold text-ink-900 sm:mt-0.5 line-clamp-2 sm:line-clamp-none motion-safe:animate-fade-in-fast">
                {selectedStart
                  ? <>{selectedService ? `${selectedService.title} · ` : ''}{dayLabelFull} · {fmtHM(selectedStart)} · <span className="tabular-nums">{duration}</span> წუთი · <span className="tabular-nums">{price}</span></>
                  : selectedService
                    ? <>{selectedService.title} · <span className="font-medium text-ink-500">აირჩიე დრო</span></>
                    : '— აირჩიე დრო'}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {step > 1 ? (
                <button type="button" onClick={back} disabled={submitting} className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 hover:border-ink-300 text-ink-700 font-display font-semibold text-small tracking-wide inline-flex items-center gap-1.5 transition-colors duration-fast disabled:opacity-50 disabled:cursor-not-allowed">
                  <Icon.chevL className="w-3.5 h-3.5" />
                  უკან
                </button>
              ) : (
                <button type="button" onClick={onClose} disabled={submitting} className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 hover:border-ink-300 text-ink-700 font-display font-semibold text-small tracking-wide transition-colors duration-fast disabled:opacity-50 disabled:cursor-not-allowed">
                  გაუქმება
                </button>
              )}
              <button
                type="button"
                onClick={next}
                disabled={submitting || !canAdvance || (onPaymentStep && !cardValid)}
                aria-busy={submitting}
                className="h-11 px-5 rounded-btn bg-gradient-cta hover:brightness-105 text-white font-display font-semibold text-body-lg tracking-wide inline-flex items-center gap-2 shadow-brand-glow hover:shadow-[0_10px_32px_rgba(47,156,134,0.36)] transition-all duration-fast disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none"
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
          {/* The free-cancellation reassurance line that used to sit under the
              confirm CTA was removed 2026-08-05 at the owner's request. */}
        </div>
      ) : undefined}
    >
        {/* Body — full-bleed inside Sheet's padded scroll area. `-mt-4` only:
            the old `-my-4` also ate the scroll area's bottom padding, so the
            last card sat welded to the footer hairline with no air. */}
        <div className="-mx-5 sm:-mx-6 -mt-4">
          {/* Scroll anchor: step-change effect scrolls this to the top of the sheet. */}
          <div ref={stepTopRef} aria-hidden />
          {!info ? (
            fetchState === 'error' ? (
              <div className="flex flex-col items-center justify-center text-center px-6 py-16">
                <div className="w-12 h-12 rounded-full bg-warning-50 border border-warning-200 inline-flex items-center justify-center text-warning-700 mb-4">
                  <Icon.warn className="w-5 h-5" />
                </div>
                <div className="font-display text-body-lg font-bold text-ink-900">მონაცემები ვერ ჩაიტვირთა</div>
                <p className="text-small text-ink-500 mt-2 max-w-[300px]">ქსელის დროებითი ხარვეზი.</p>
                <button
                  type="button"
                  onClick={() => setFetchAttempt(a => a + 1)}
                  className="mt-5 h-11 px-5 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide transition-colors duration-fast"
                >
                  სცადე თავიდან
                </button>
              </div>
            ) : (
              <div className="px-6 py-10 motion-safe:animate-pulse space-y-4" aria-busy="true" aria-live="polite">
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
              <h3 className="font-display text-h1 font-bold text-ink-900 tracking-tight motion-safe:animate-rise-in" style={{ animationDelay: '120ms' }}>
                მოთხოვნა გაგზავნილია
              </h3>
              <p className="text-body text-ink-600 mt-3 max-w-[440px] motion-safe:animate-rise-in" style={{ animationDelay: '200ms' }}>
                {dayLabelFull}{selectedStart ? ` · ${fmtHM(selectedStart)}` : ''} · {total} · {info.name}. ექსპერტი მალე დაადასტურებს.
              </p>
              <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-2 motion-safe:animate-rise-in" style={{ animationDelay: '280ms' }}>
                <Link
                  href={createdId ? `/me/bookings/${createdId}` : '/me/bookings'}
                  className="tap-shrink h-11 px-6 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center gap-2 shadow-brand-glow hover:shadow-[0_10px_32px_rgba(47,156,134,0.36)] transition-all duration-fast"
                >
                  ჯავშნის ნახვა
                </Link>
                <button type="button" onClick={onClose} className="h-11 px-5 rounded-btn bg-white border border-ink-200 hover:border-ink-300 hover:bg-ink-50 text-ink-700 font-display font-semibold text-small tracking-wide transition-colors duration-fast">
                  დახურვა
                </button>
              </div>
            </div>
          ) : step === slotStepN ? (
            <div className="lg:h-full lg:flex lg:flex-col motion-safe:animate-slide-in-b">
            {/* THE SERVICE CHOICE, INLINE (2026-08-07). It was a whole step; it
                is one tap, and hiding the calendar behind it cost a page
                transition on a funnel already measured at 132 opens → 2
                bookings. Changing a chip re-derives the calendar and the time
                list underneath it — the availability shown always belongs to
                the session actually being booked. */}
            {hasTierPicker && (
              <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-ink-100 shrink-0">
                <Eyebrow as="span" id="tier-pick" tone="muted" className="block mb-2">სესიის ტიპი</Eyebrow>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby="tier-pick">
                  {orderedTiers(tiers).map(c => {
                    const on = selectedService?.id === c.id
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => {
                          if (c.id !== selectedService?.id) {
                            trackFunnel(FUNNEL.serviceChosen, {
                              flowId: flowIdRef.current,
                              tierCount: tiers.length,
                              durationMin: c.minutes,
                              priceGel: c.price,
                            })
                          }
                          setSelectedService(c)
                          // The chosen length changes which starts exist, so a
                          // time picked for the previous one must not survive.
                          setSelectedStart(null)
                          if (submitError) setSubmitError(null)
                        }}
                        className={`h-11 px-3.5 rounded-pill border font-display text-small font-semibold inline-flex items-center gap-2 transition-colors duration-fast motion-safe:active:scale-[0.97] ${
                          on ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-ink-700 border-ink-200 hover:border-ink-400'
                        }`}
                      >
                        <span className="truncate max-w-[10rem]">{c.title}</span>
                        <span className={`tabular-nums ${on ? 'text-white/85' : 'text-ink-500'}`}>
                          {c.minutes}წთ · {isFreeTier(c) ? 'უფასო' : `₾${c.price}`}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            {/* Mobile: a collapsed day trigger over the time list (see the
                `dayPickerOpen` note above). Desktop (lg+): fixed-height two-pane
                with each column scrolling independently. The h-full + per-pane
                overflow only kick in at lg so mobile never gets the janky nested
                double-scroll. */}
            <div className="grid lg:grid-cols-[360px_1fr] lg:flex-1 lg:min-h-0">
              {/* The disclosure trigger, below lg only, and FIRST in the DOM so
                  the month opens beneath its own control rather than above it
                  (the grid is single-column on a phone, so source order is what
                  the reader gets). `lg:hidden` makes it display:none at lg, so
                  it claims no grid cell there and the two panes keep their
                  columns. Reuses the timeline's own date wording, so the day
                  never reads two different ways, and the calendar's own grid
                  label as its accessible name. */}
              {selectedDate && !noOpenStarts && (
                <button
                  type="button"
                  ref={dayTriggerRef}
                  onClick={() => setDayPickerOpen(o => !o)}
                  aria-expanded={monthOpen}
                  aria-label="აირჩიე დღე"
                  className="lg:hidden mx-5 mt-5 h-11 px-3.5 rounded-btn border border-ink-200 bg-white hover:border-ink-300 flex items-center gap-2.5 text-left transition-colors duration-fast"
                >
                  <Icon.cal className="w-4 h-4 shrink-0 text-ink-500" />
                  <span className="font-display text-body font-bold text-ink-900 truncate">
                    {DAY_NAMES_FULL[isoWeekday(selectedDate)]}, {selectedDate.getDate()} {KA_MONTHS_FULL[selectedDate.getMonth()]}
                  </span>
                  <Icon.chevD className={`w-4 h-4 shrink-0 ml-auto text-ink-500 transition-transform duration-fast ${monthOpen ? 'rotate-180' : ''}`} />
                </button>
              )}
              {/* p-5 below sm, not p-4: the full-bleed body cancels Sheet's
                  px-5, so a 16px pane inset left every step's content 4px to
                  the LEFT of the sheet title and footer. One gutter. */}
              <div className={`border-b lg:border-b-0 lg:border-r border-ink-100 p-5 sm:p-6 lg:overflow-y-auto ${monthOpen ? '' : 'hidden lg:block'}`}>
                <Calendar
                  viewMonth={viewMonth}
                  selected={selectedDate}
                  startsByDay={startsByDay}
                  onSelect={(d) => {
                    setSelectedDate(d)
                    setSelectedStart(null)
                    setDayPickerOpen(false)
                    // Only below lg, where the collapse actually happens — see
                    // the dayTriggerRef note. `offsetParent` is the cheapest
                    // honest test that the trigger is on screen at all.
                    requestAnimationFrame(() => {
                      const t = dayTriggerRef.current
                      if (t && t.offsetParent !== null) t.focus({ preventScroll: true })
                    })
                  }}
                  onPrev={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                  onNext={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                />
              </div>
              <div className="p-5 sm:p-6 lg:overflow-y-auto scroll-mt-4">
                {/* Diaspora only — see AbroadTzNote. Every time in this pane is
                    already the viewer's own wall clock; this states the gap to
                    Tbilisi, which is the thing a client abroad is actually
                    trying to work out. Renders nothing for a Tbilisi viewer, so
                    the ordinary flow is byte-identical. */}
                {isAbroadExpert && <AbroadTzNote className="mb-4" />}
                {/* Why your time disappeared. Only ever shown right after a tier
                    switch invalidated an already-picked start — the one moment
                    the flow silently undid a user's choice. */}
                {startDropped && (
                  <div className="mb-4 flex items-start gap-2.5 p-3 rounded-card bg-warning-50 border border-warning-200">
                    <Icon.info className="w-4 h-4 text-warning-700 mt-0.5 shrink-0" />
                    <p className="text-meta text-warning-800 leading-[1.5]">
                      {fmtHM(startDropped)} {duration} წუთს ვერ იტევს — აირჩიე სხვა დრო.
                    </p>
                  </div>
                )}
                {/* Nothing bookable for THIS service length short-circuits the
                    picker — a calendar of disabled days is a dead end. */}
                {noOpenStarts ? (
                  <div className="lg:h-full min-h-[260px] flex flex-col items-center justify-center text-center px-6 py-12">
                    <div className="w-12 h-12 rounded-full bg-ink-100 inline-flex items-center justify-center text-ink-500 mb-4">
                      <Icon.cal className="w-5 h-5" />
                    </div>
                    <div className="font-display text-body-lg font-bold text-ink-900">
                      {availability.length === 0
                        ? 'ჯერ არ აქვს თავისუფალი დროები'
                        : `${duration} წუთი ვერსად ეტევა`}
                    </div>
                    <p className="text-small text-ink-500 mt-2 max-w-[320px]">
                      {availability.length === 0
                        ? 'მიწერე — ხშირად ცალკე დროსაც ხსნიან.'
                        : 'აირჩიე უფრო მოკლე სერვისი ან მიწერე ექსპერტს.'}
                    </p>
                    {/* ── The way out of the dead end ──────────────────────
                        31 of 68 booking attempts ended on this screen, every
                        one because the expert had published nothing. Instead of
                        sending them away, let them name a time: the expert
                        answers it exactly as they already answer every booking.
                        Native date/time inputs on purpose — the canon's
                        Calendar/DayTimeline render PUBLISHED slots, and here
                        there are none to render. */}
                    {canPropose && bookTutorId && (
                      proposing ? (
                        <div className="mt-5 w-full max-w-[320px] text-left">
                          <label className="block">
                            <span className="font-display text-micro font-semibold uppercase text-ink-700">დღე</span>
                            <input
                              type="date"
                              value={proposeDate}
                              min={new Date(Date.now() + 3600_000).toISOString().slice(0, 10)}
                              onChange={e => setProposeDate(e.target.value)}
                              className="w-full mt-1.5 h-11 px-3 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-body text-ink-900 transition-colors duration-fast"
                            />
                          </label>
                          <label className="block mt-3">
                            <span className="font-display text-micro font-semibold uppercase text-ink-700">დრო</span>
                            <input
                              type="time"
                              value={proposeTime}
                              onChange={e => setProposeTime(e.target.value)}
                              className="w-full mt-1.5 h-11 px-3 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-body text-ink-900 transition-colors duration-fast"
                            />
                          </label>
                          {/* ── 2nd / 3rd choice ─────────────────────────
                              Optional, and the single change that makes a
                              request likely to succeed: one named time is a
                              coin flip, three is something the expert can
                              settle in one reply instead of a thread. Added on
                              demand rather than shown as three empty rows —
                              this reader abandons a form that looks long. */}
                          {altSlots.map((s, i) => (
                            <div key={i} className="mt-3 pt-3 border-t border-ink-100">
                              <span className="font-display text-micro font-semibold uppercase text-ink-700">
                                სათადარიგო დრო {i + 1}
                              </span>
                              {/* Wraps below ~360px (M4): a fixed 7.5rem time
                                  field beside a flex-1 date field left the date
                                  ~100px on the narrowest phones — the year was
                                  clipped. Wrapping puts the time on its own line
                                  there and changes nothing from 390px up. */}
                              <div className="flex flex-wrap gap-2 mt-1.5">
                                <input
                                  type="date"
                                  aria-label={`სათადარიგო დრო ${i + 1} — დღე`}
                                  value={s.date}
                                  min={new Date(Date.now() + 3600_000).toISOString().slice(0, 10)}
                                  onChange={e => setAltSlots(prev => prev.map((p, j) => j === i ? { ...p, date: e.target.value } : p))}
                                  className="flex-1 min-w-[10rem] h-11 px-3 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-body text-ink-900 transition-colors duration-fast"
                                />
                                <input
                                  type="time"
                                  aria-label={`სათადარიგო დრო ${i + 1} — საათი`}
                                  value={s.time}
                                  onChange={e => setAltSlots(prev => prev.map((p, j) => j === i ? { ...p, time: e.target.value } : p))}
                                  className="w-[7.5rem] shrink-0 h-11 px-3 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-body text-ink-900 transition-colors duration-fast"
                                />
                              </div>
                            </div>
                          ))}
                          {altSlots.length < 2 && (
                            <button
                              type="button"
                              onClick={() => setAltSlots(prev => [...prev, { date: '', time: '' }])}
                              className="mt-3 h-11 w-full rounded-btn border border-ink-200 hover:border-ink-300 hover:bg-ink-50 text-ink-800 font-display font-semibold text-small inline-flex items-center justify-center gap-1.5 transition-colors duration-fast"
                            >
                              + კიდევ ერთი დრო
                            </button>
                          )}
                          <p className="text-meta text-ink-500 mt-3 leading-snug">
                            რაც მეტ დროს დაასახელებ, მით უფრო სწრაფად შეთანხმდებით. ექსპერტი აირჩევს ერთს ან შემოგთავაზებს სხვას.
                          </p>
                          <button
                            type="button"
                            disabled={!proposeDate || !proposeTime}
                            onClick={() => {
                              // Built from the two local fields, so the Date is
                              // in the VIEWER's zone — the same zone every other
                              // time in this sheet is shown in.
                              const at = new Date(`${proposeDate}T${proposeTime}`)
                              if (isNaN(at.getTime()) || at.getTime() < Date.now()) return
                              setProposed(true)
                              setSelectedStart(at)
                              setSelectedDate(at)
                              // From here the ordinary flow takes over: details,
                              // validation, submit. Nothing else forks.
                              setStep(s => Math.min(s + 1, totalSteps))
                            }}
                            className="tap-shrink w-full h-11 mt-4 rounded-btn bg-brand-600 hover:bg-brand-700 disabled:bg-ink-100 disabled:text-ink-500 disabled:cursor-not-allowed text-white font-display font-semibold text-body tracking-wide inline-flex items-center justify-center transition-colors duration-fast"
                          >
                            გაგრძელება
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setProposing(true)}
                          className="tap-shrink h-11 px-4 mt-5 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide inline-flex items-center gap-1.5 transition-colors duration-fast"
                        >
                          შემომთავაზე დრო
                        </button>
                      )
                    )}
                    <div className="mt-5 flex flex-col sm:flex-row gap-2 items-center">
                      <Link
                        href={`/experts/${bookTutorId}?intent=message`}
                        onClick={(e) => { e.preventDefault(); onClose(); if (bookTutorId) window.location.href = `/experts/${bookTutorId}?intent=message` }}
                        className={`tap-shrink h-11 px-4 rounded-btn font-display font-semibold text-small tracking-wide inline-flex items-center gap-1.5 transition-colors duration-fast ${
                          // Demoted to secondary once proposing is possible —
                          // two primary buttons would make neither one the
                          // obvious next step.
                          canPropose
                            ? 'bg-white border border-ink-200 hover:border-ink-300 text-ink-800'
                            : 'bg-brand-600 hover:bg-brand-700 text-white'
                        }`}
                      >
                        მიწერე ექსპერტს
                      </Link>
                      <Link
                        href="/experts"
                        onClick={() => onClose()}
                        className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-800 font-display font-semibold text-small tracking-wide inline-flex items-center transition-colors duration-fast"
                      >
                        მსგავსი ექსპერტები
                      </Link>
                    </div>
                  </div>
                ) : selectedDate ? (
                  <>
                    <DayTimeline
                      date={selectedDate}
                      selected={selectedStart}
                      onSelect={(t) => {
                        trackFunnel(FUNNEL.timeChosen, {
                          flowId: flowIdRef.current,
                          tierCount: tiers.length,
                          durationMin: duration,
                          // How far out people book — coarse whole days, never
                          // the timestamp itself.
                          leadDays: leadDays(t),
                        })
                        setSelectedStart(t); if (submitError) setSubmitError(null)
                      }}
                      duration={duration}
                      price={price}
                      timeChoices={timeChoices}
                      dayNamedByHost
                    />
                    {/* Persistent escape hatch: the expert HAS slots, but if none
                        of them suit the client there's no need to abandon the
                        sheet — offer the direct-message path right here. */}
                    {bookTutorId && (
                      <div className="mt-5 pt-4 border-t border-ink-100 text-center">
                        <Link
                          href={`/experts/${bookTutorId}?intent=message`}
                          onClick={() => onClose()}
                          className="text-small text-ink-500 hover:text-brand-700 font-display font-medium transition-colors duration-fast"
                        >
                          დრო არ გაწყობს? მიწერე ექსპერტს
                        </Link>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="lg:h-full min-h-[260px] flex flex-col items-center justify-center text-center px-6 py-12">
                    <div className="w-12 h-12 rounded-full bg-ink-100 inline-flex items-center justify-center text-ink-500 mb-4">
                      <Icon.cal className="w-5 h-5" />
                    </div>
                    <div className="font-display text-body-lg font-bold text-ink-900">აირჩიე დღე კალენდარში</div>
                    <p className="text-small text-ink-500 mt-2 max-w-[280px]">გამოჩნდება თავისუფალი დროები.</p>
                  </div>
                )}
              </div>
            </div>
            </div>
          ) : step === detailsStepN ? (
            <div className="motion-safe:animate-slide-in-b">
              <IntakeStep value={details} onChange={setDetails} summary={summary} />
              {/* Nothing for anybody who is not a company member: the component
                  returns null and this is an empty node. The intake step above
                  is untouched. */}
              <div className="px-4 sm:px-7 lg:px-10 pb-4">
                <CompanyBalanceChoice
                  company={company}
                  priceGel={priceNum}
                  value={useBalance}
                  onChange={setUseBalance}
                />
              </div>
            </div>
          ) : (
            <div className="motion-safe:animate-slide-in-b"><PaymentStep value={payment} onChange={setPayment} summary={summary} /></div>
          )}
        </div>
    </Sheet>
  )
}
