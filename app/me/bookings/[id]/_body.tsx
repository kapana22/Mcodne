'use client'
// /student/bookings/[id] — the page body: the reschedule banner, the detail
// panes and the status timeline.

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useToast } from '@/components/ToastProvider'
import { fmtKaDateTime } from '@/lib/kaDate'
import { BookingChat } from '@/components/chat/BookingChat'
import { PAYMENTS_LIVE } from '@/lib/flags'
import { Eyebrow } from '@/components/Eyebrow'
import { Icon } from '@/components/Icon'
import { Container } from '@/components/Container'
import { Booking, NO_SHOW_GRACE_MS, fmtDate, fmtTime, isExpertNoShow, rebookHref } from './_model'

/* ───── Pending reschedule banner. Rendered on both sides when a proposal
   is in flight. The party who did NOT propose can accept or reject inline. */
export const RescheduleBanner = ({
  booking,
  meRole,
  onResolved,
}: {
  booking: Booking
  meRole: 'USER' | 'PROVIDER'
  onResolved: () => void
}) => {
  const { toast } = useToast()
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null)
  const req = booking.rescheduleRequest
  if (!req) return null
  const proposedTime = new Date(req.newStartAt)
  const iProposed = req.proposedBy === meRole

  const respond = async (accept: boolean) => {
    setBusy(accept ? 'accept' : 'reject')
    try {
      const res = await fetch(`/api/bookings/${booking.id}/reschedule/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) { toast('მოქმედება ვერ შესრულდა', 'error'); return }
      toast(accept ? 'გადადება დადასტურდა' : 'გადადება უარყოფილია', accept ? 'success' : 'info')
      onResolved()
    } catch {
      toast('ქსელის შეცდომა', 'error')
    } finally { setBusy(null) }
  }

  return (
    <Container as="section" className="mt-4">
      <div className="rounded-card border border-warning-200 bg-warning-50 p-5 flex items-start gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="font-display text-micro font-semibold uppercase text-warning-800 mb-1">
            {iProposed ? 'გადადების მოთხოვნა გაგზავნილია' : 'გადადების მოთხოვნა'}
          </div>
          <div className="font-display text-body-lg font-bold text-ink-900">
            ახალი დრო: {fmtKaDateTime(proposedTime, { month: 'long', weekday: true })}
          </div>
          {req.reason && <p className="mt-1 text-small text-ink-700 whitespace-pre-wrap break-words">„{req.reason}“</p>}
          {iProposed && (
            <p className="mt-1 text-meta text-ink-500">ველოდებით მეორე მხარის დადასტურებას.</p>
          )}
        </div>
        {!iProposed && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => respond(false)}
              disabled={busy !== null}
              className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-800 font-display font-semibold text-small"
            >
              {busy === 'reject' ? '…' : 'უარი'}
            </button>
            <button
              type="button"
              onClick={() => respond(true)}
              disabled={busy !== null}
              className="h-11 px-4 rounded-btn bg-success-600 hover:bg-success-700 disabled:opacity-60 text-white font-display font-semibold text-small"
            >
              {busy === 'accept' ? '…' : 'დადასტურება'}
            </button>
          </div>
        )}
      </div>
    </Container>
  )
}

/* ───── Booking body ───── */
export const BookingBody = ({
  booking,
  meId,
  onRefresh,
  onReschedule,
  onCancel,
  onDispute,
  onReportNoShow,
}: {
  booking: Booking
  meId: string | null
  onRefresh: () => void
  onReschedule: () => void
  onCancel: () => void
  onDispute: () => void
  onReportNoShow: () => void
}) => {
  const status = booking.status
  const canCancel = status === 'PREPARING' || status === 'CONFIRMED'
  // Suppress the "propose reschedule" button while a proposal is already
  // in flight — the banner drives the accept/reject decision instead.
  const canReschedule = (status === 'PREPARING' || status === 'CONFIRMED') && !booking.rescheduleRequest
  // Report-the-expert offered ONLY when the server would accept it: a session
  // that reached a live state (already-NO_SHOW / COMPLETED / CANCELED are out)
  // and whose start is more than the grace window behind us.
  const canReportNoShow =
    (status === 'CONFIRMED' || status === 'LIVE') &&
    Date.now() > new Date(booking.startAt).getTime() + NO_SHOW_GRACE_MS

  return (
    <Container as="section" className="mt-6 grid lg:grid-cols-[1fr_360px] gap-6 pb-28 lg:pb-12">
      {/* On mobile the action rail comes FIRST — cancel/reschedule/receipt
          are why people open this page; burying them under the whole chat
          thread made them near-undiscoverable at 390px. Desktop keeps
          content-left / rail-right. */}
      {/* Left — content */}
      <div className="space-y-4 min-w-0 order-2 lg:order-1">
        {/* Topic + notes */}
        <div className="rounded-card bg-white border border-ink-200 p-6">
          <Eyebrow tone="muted" className="mb-2">თემა და მიზანი</Eyebrow>
          <h2 className="font-display text-h3 font-bold text-ink-900 tracking-tight mb-3 break-words">{booking.topic}</h2>
          {booking.studentNotes ? (
            <p className="text-body text-ink-700 leading-[1.6] whitespace-pre-wrap break-words">{booking.studentNotes}</p>
          ) : (
            <p className="text-small text-ink-400 italic">— დამატებითი ჩანაწერი არ არის.</p>
          )}
        </div>

        {/* Tutor's post-session summary — read-only, shown when the tutor
            filled in `tutorNotes` after marking the session complete. */}
        {status === 'COMPLETED' && booking.tutorNotes && (
          <div className="rounded-card bg-brand-50/40 border border-brand-200 p-6">
            <Eyebrow className="mb-2">ექსპერტისგან</Eyebrow>
            <blockquote className="border-l-2 border-brand-300 pl-3 text-body text-ink-800 leading-[1.6] whitespace-pre-wrap break-words italic">
              {booking.tutorNotes}
            </blockquote>
          </div>
        )}

        {/* Status timeline */}
        <div className="rounded-card bg-white border border-ink-200 p-6">
          <Eyebrow tone="muted" className="mb-3">ისტორია</Eyebrow>
          <StatusTimeline booking={booking} />
        </div>

        {/* Chat — the SHARED component, so the booking page and the messages
            center render the exact same thread (bubbles, composer, instant
            video-call). #chat is a public anchor: DB notification hrefs and
            inbox deep-links point here forever. */}
        <div id="chat" className="scroll-mt-24">
          <BookingChat
            bookingId={booking.id}
            me={booking.student}
            counterparty={booking.tutor?.user ?? null}
            variant="embedded"
            initialMessages={booking.messages}
            onActivity={onRefresh}
            header={
              <div className="px-5 sm:px-6 py-4 border-b border-ink-100">
                <Eyebrow className="mb-0.5">შეტყობინებები</Eyebrow>
                <h3 className="font-display text-body-lg font-bold text-ink-900 tracking-tight">{booking.tutor?.user?.fullName ?? 'ექსპერტი'}-სთან მიმოწერა</h3>
              </div>
            }
            emptyState={{ title: 'დაიწყე საუბარი', body: 'მიწერე ექსპერტს კითხვა ან დააზუსტე დეტალები კონსულტაციამდე — სწრაფი, კონკრეტული შეტყობინება უკეთეს პასუხს იძლევა.' }}
          />
        </div>
      </div>

      {/* Right — actions + receipt */}
      <aside className="space-y-4 order-1 lg:order-2">
        <div className="rounded-card bg-white border border-ink-200 p-5">
          <Eyebrow tone="muted" className="mb-3">სწრაფი მოქმედებები</Eyebrow>
          <div className="space-y-2">
            {/* Payment link — FIRST, and the only filled row here, whenever one
                exists. It is not a platform checkout: the expert pasted their
                bank's own payment page and this makes it reachable, which for a
                client abroad is the difference between owing money and being
                able to send it. It is therefore also the reason they opened
                this page, so it outranks every other action.
                `paymentLinkUrl` is validated https-only on write; the render
                guard is a second lock, not a substitute for that one.
                Terminal states are excluded — asking for payment on a canceled
                or no-show booking is a bug, not a nudge. */}
            {booking.paymentLinkUrl
              && /^https:\/\//i.test(booking.paymentLinkUrl)
              && status !== 'CANCELED' && status !== 'NO_SHOW' && (
              <a
                href={booking.paymentLinkUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="tap-shrink w-full flex items-center gap-2.5 h-11 px-3 rounded-btn bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-display font-semibold text-body transition-colors duration-fast"
              >
                <Icon.money aria-hidden className="w-4 h-4" />
                <span className="flex-1 text-left">გადახდა · ₾{booking.price}</span>
                <Icon.external aria-hidden className="w-3.5 h-3.5 opacity-70" />
              </a>
            )}

            <a href="#chat" className="flex items-center gap-2.5 h-11 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-800 font-display font-semibold text-small transition-colors duration-fast">
              <Icon.chat className="w-4 h-4 text-ink-500" />
              <span className="flex-1">მიმოწერა {booking.tutor.user.fullName.split(' ')[0]}-სთან</span>
              {booking.messages.length > 0 && <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-ink-100 text-ink-600 font-display text-meta font-bold tabular-nums">{booking.messages.length}</span>}
            </a>

            {(status === 'CONFIRMED' || status === 'LIVE') && booking.meetingUrl && (
              <Link href={`/session/${booking.id}`} className="flex items-center gap-2.5 h-11 px-3 rounded-btn bg-brand-50 border border-brand-200 hover:bg-brand-100 text-brand-800 font-display font-semibold text-small transition-colors duration-fast">
                <Icon.video className="w-4 h-4" />
                <span className="flex-1">ვიდეოოთახი</span>
              </Link>
            )}

            {canReschedule && (
              <button type="button" onClick={onReschedule} className="w-full flex items-center gap-2.5 h-11 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-800 font-display font-semibold text-small transition-colors duration-fast">
                <Icon.refresh className="w-4 h-4 text-ink-500" />
                <span className="flex-1 text-left">გადადება</span>
                <span className="text-meta text-success-700 font-display font-bold">უფასოდ</span>
              </button>
            )}

            {canCancel && (
              <button type="button" onClick={onCancel} className="w-full flex items-center gap-2.5 h-11 px-3 rounded-btn bg-white border border-ink-200 hover:bg-danger-50 hover:border-danger-200 text-ink-600 hover:text-danger-700 font-display font-semibold text-small transition-colors duration-fast">
                <Icon.x className="w-4 h-4" />
                <span className="flex-1 text-left">გაუქმება</span>
              </button>
            )}

            {status === 'COMPLETED' && (
              <>
                <Link
                  href={rebookHref(booking)}
                  className="tap-shrink w-full flex items-center gap-2.5 h-11 px-3 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body transition-colors duration-fast"
                >
                  <Icon.refresh className="w-4 h-4" />
                  <span className="flex-1 text-left">დაჯავშნე ისევ</span>
                </Link>
                {!booking.review && !booking.autoCompleted && (
                  <a href="#leave-review" className="w-full flex items-center gap-2.5 h-11 px-3 rounded-btn bg-warning-50 border border-warning-200 hover:bg-warning-100 text-warning-800 font-display font-semibold text-small transition-colors duration-fast">
                    <Icon.star aria-hidden className="w-4 h-4" />
                    <span className="flex-1 text-left">დატოვე შეფასება</span>
                  </a>
                )}
              </>
            )}

            {/* Dispute only makes sense once a session ran (or should have run);
                iCal only for sessions still ahead. State-blind actions read as
                noise and invite mistakes. */}
            {(status === 'LIVE' || status === 'COMPLETED' || status === 'NO_SHOW') && (
              <button type="button" onClick={onDispute} className="w-full flex items-center gap-2.5 h-9 px-3 rounded-btn text-ink-500 hover:text-danger-700 hover:bg-danger-50 font-display font-semibold text-meta transition-colors duration-fast">
                <Icon.flag className="w-3.5 h-3.5" />
                <span>საჩივარი</span>
              </button>
            )}
            {(status === 'PREPARING' || status === 'CONFIRMED') && (
              <a href={`/api/bookings/${booking.id}/ical`} className="w-full flex items-center gap-2.5 h-9 px-3 rounded-btn text-ink-500 hover:text-ink-900 hover:bg-ink-50 font-display font-semibold text-meta transition-colors duration-fast">
                <Icon.download className="w-3.5 h-3.5" />
                <span>კალენდარში დამატება</span>
              </a>
            )}

            {/* Expert no-show — the client's half of the symmetric no-show
                flow (the expert has the same action pointed the other way).
                Quiet on purpose: last resort, never a primary CTA. h-11 keeps
                the tap target ≥40px even though it reads as a ghost row. */}
            {canReportNoShow && (
              <button
                type="button"
                onClick={onReportNoShow}
                className="w-full flex items-center gap-2.5 h-11 px-3 rounded-btn text-ink-500 hover:text-ink-900 hover:bg-ink-50 font-display font-semibold text-meta transition-colors duration-fast"
              >
                <Icon.flag className="w-3.5 h-3.5" />
                <span className="flex-1 text-left">ექსპერტი არ გამოცხადდა?</span>
              </button>
            )}
          </div>
        </div>

        {/* Receipt */}
        <div className="rounded-card bg-white border border-ink-200 p-5">
          <Eyebrow tone="muted" className="mb-3">ანგარიში</Eyebrow>
          <div className="space-y-1.5 text-small mb-4">
            <div className="flex justify-between">
              <span className="text-ink-600">{booking.topic}</span>
              <span className="font-display font-semibold text-ink-900 tabular-nums">₾{booking.price}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-600">ხანგრძლივობა</span>
              <span className="font-mono text-ink-500 tabular-nums">{booking.durationMin} წუთი</span>
            </div>
          </div>
          <div className="pt-3 border-t border-ink-200 flex items-baseline justify-between">
            <span className="font-display text-meta font-semibold text-ink-900">ჯამი</span>
            <span className="font-display text-h2 font-bold text-ink-900 tabular-nums">₾{booking.price}</span>
          </div>
          <div className="mt-3 text-meta text-ink-600 flex items-center gap-1.5">
            <Icon.shield className="w-3 h-3 text-brand-700" />
            {PAYMENTS_LIVE
              ? (status === 'CANCELED' ? 'თანხა დაბრუნებულია' :
                 // NO_SHOW has TWO opposite money outcomes — payoutStatus is the
                 // discriminator: REFUNDED = ექსპერტი არ გამოცხადდა (client not
                 // charged, `expert_no_show`); RELEASED = ექსპერტი გამოცხადდა,
                 // სტუდენტი არა (money stays with the expert, `no_show`).
                 status === 'NO_SHOW' ? (isExpertNoShow(booking) ? 'თანხა დაგიბრუნდა' : 'თანხა ექსპერტს გადაეცა') :
                 status === 'COMPLETED' ? 'გათავისუფლდა ექსპერტზე' :
                 'დაცული გადახდით')
              : 'დაჯავშნა უფასოა — გადახდები მალე'}
          </div>
        </div>

        {/* Policy */}
        <div className="rounded-card bg-brand-50/40 border border-brand-200 p-5">
          <div className="flex items-start gap-2.5">
            <Icon.shield className="w-4 h-4 text-brand-700 mt-0.5 shrink-0" />
            <div>
              {PAYMENTS_LIVE ? (
                <>
                  <div className="font-display text-small font-bold text-ink-900 tracking-tight mb-1">100% თანხის დაბრუნების გარანტია</div>
                  <p className="text-meta text-ink-700 leading-[1.5]">თუ ექსპერტი არ მოვა ან სესია ვერ შესრულდება — დაცული თანხა მთლიანად დაგიბრუნდება.</p>
                </>
              ) : (
                <>
                  <div className="font-display text-small font-bold text-ink-900 tracking-tight mb-1">დაჯავშნა უფასოა</div>
                  <p className="text-meta text-ink-700 leading-[1.5]">ამ ეტაპზე არაფერს იხდი — გადახდები და დაცული გადახდის სისტემა მალე ჩაირთვება. თუ ექსპერტი არ მოვა, დაგეხმარებით ახალი დროის შერჩევაში.</p>
                </>
              )}
            </div>
          </div>
        </div>
      </aside>
    </Container>
  )
}

/* ───── Real status timeline ─────
   Timestamps are shown ONLY for events whose time we actually know:
   createdAt for creation, startAt/end for the session slot. Events the DB
   doesn't stamp (confirmation, cancellation) render without a time — a fake
   "now"/created timestamp is worse than none. */
const StatusTimeline = ({ booking }: { booking: Booking }) => {
  const items = useMemo(() => {
    const created = new Date(booking.createdAt)
    const start = new Date(booking.startAt)
    const end = new Date(start.getTime() + booking.durationMin * 60_000)
    const now = new Date()
    const s = booking.status

    const list: { at: Date | null; l: string; sub?: string; done: boolean }[] = []
    list.push({ at: created, l: 'ჯავშანი შეიქმნა', done: true, sub: PAYMENTS_LIVE ? `₾${booking.price} დაცულ გადახდაშია` : 'დაჯავშნა უფასოა — გადახდები მალე' })

    if (s === 'PREPARING') {
      list.push({ at: null, l: 'ველოდებით ექსპერტის დადასტურებას', done: false })
    } else if (s !== 'CANCELED') {
      list.push({ at: null, l: 'ექსპერტმა დაადასტურა', done: true })
    }

    if (s !== 'CANCELED' && s !== 'NO_SHOW') {
      list.push({ at: start, l: 'სესია იწყება', done: now.getTime() >= start.getTime() && s !== 'PREPARING' })
      list.push({ at: end, l: 'სესია სრულდება', done: now.getTime() >= end.getTime() && s === 'COMPLETED' })
    }

    if (s === 'CANCELED') {
      // Same fallback correction as _hero: an unrecognised actor is the
      // platform's own sweep, never the client. See the note there.
      const who = booking.cancelledBy === 'PROVIDER' ? 'ექსპერტმა გააუქმა'
        : booking.cancelledBy === 'ADMIN' ? 'ადმინმა გააუქმა'
        : booking.cancelledBy === 'USER' ? 'შენ გააუქმე'
        : 'ავტომატურად გაუქმდა'
      list.push({ at: null, l: who, done: true, sub: booking.cancelReason || (PAYMENTS_LIVE ? 'დაცული თანხა დაბრუნდა' : undefined) })
    }
    if (s === 'NO_SHOW') {
      // Opposite directions, opposite money — never one shared sub-line.
      const expertMissed = isExpertNoShow(booking)
      list.push({
        at: end,
        l: expertMissed ? 'სესია არ შედგა — ექსპერტი არ გამოცხადდა' : 'სესია არ შედგა',
        done: true,
        sub: PAYMENTS_LIVE ? (expertMissed ? 'დაცული თანხა დაგიბრუნდა' : 'დაცული თანხა ექსპერტს გადაეცა') : undefined,
      })
    }
    if (s === 'COMPLETED') {
      list.push({ at: end, l: PAYMENTS_LIVE ? 'დასრულდა · დაცული თანხა ექსპერტს გადაეცა' : 'დასრულდა', done: true })
    }
    return list
  }, [booking])

  return (
    <ol className="relative space-y-3">
      <span className="absolute top-3 bottom-3 left-[7px] w-px bg-ink-200" aria-hidden />
      {items.map((s, i) => (
        <li key={i} className="relative flex gap-3">
          <span className={`relative z-10 mt-0.5 w-[15px] h-[15px] shrink-0 rounded-full border-2 inline-flex items-center justify-center ${
            s.done ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-ink-300'
          }`}>
            {s.done && <Icon.check className="w-2 h-2" />}
          </span>
          <div className="min-w-0 flex-1">
            {s.at && <span className="font-mono text-meta tabular-nums text-ink-500">{fmtDate(s.at)} {fmtTime(s.at)}</span>}
            <div className={`${s.at ? 'mt-0.5 ' : ''}font-display text-small font-semibold ${s.done ? 'text-ink-900' : 'text-ink-500'}`}>{s.l}</div>
            {s.sub && <div className="text-meta text-ink-500 mt-0.5">{s.sub}</div>}
          </div>
        </li>
      ))}
    </ol>
  )
}