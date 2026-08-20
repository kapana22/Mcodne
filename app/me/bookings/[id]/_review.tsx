'use client'
// /student/bookings/[id] — the inline review card shown after a session.

import { useState, useEffect } from 'react'
import { useToast } from '@/components/ToastProvider'
import { fmtKaDate } from '@/lib/kaDate'
import { Eyebrow } from '@/components/Eyebrow'
import { Icon } from '@/components/Icon'
import { Container } from '@/components/Container'
import { Booking, ExistingReview } from './_model'

/* ───── Inline post-session review card — replaces the modal for
   discoverability. Shown below Hero on COMPLETED bookings. When a review
   already exists, renders read-only with an edit affordance. */
export const InlineReviewCard = ({ booking, existing, onSaved }: { booking: Booking; existing?: ExistingReview | null; onSaved: () => void }) => {
  const { toast } = useToast()
  const [editing, setEditing] = useState(!existing)
  const [rating, setRating] = useState(existing?.rating ?? 0)
  const [body, setBody] = useState(existing?.body ?? '')
  const [anonymous, setAnonymous] = useState(existing?.anonymous ?? false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setRating(existing?.rating ?? 0)
    setBody(existing?.body ?? '')
    setAnonymous(existing?.anonymous ?? false)
    setEditing(!existing)
  }, [existing?.id])

  const sessionEnd = new Date(new Date(booking.startAt).getTime() + booking.durationMin * 60_000)
  const windowClosesAt = sessionEnd.getTime() + 30 * 24 * 3600_000
  const windowClosed = Date.now() > windowClosesAt

  const submit = async () => {
    if (submitting || rating === 0) return
    if (body.trim().length < 3) { toast('შეფასება მინიმუმ 3 სიმბოლო უნდა იყოს', 'error'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id, rating, body: body.trim(), anonymous }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || j?.ok === false) {
        toast(
          j?.error === 'WINDOW_CLOSED' ? 'შეფასების ვადა ამოიწურა' :
          j?.error === 'NOT_COMPLETED' ? 'სესია ჯერ არ დასრულებულა' :
          j?.error === 'AUTO_COMPLETED' ? 'ეს სესია ავტომატურად დაიხურა — შეფასება მხოლოდ ხელით დადასტურებულ სესიებზეა შესაძლებელი' :
          j?.message || 'შენახვა ვერ მოხერხდა',
          'error',
        )
        return
      }
      toast(existing ? 'შეფასება განახლდა' : 'შეფასება გაიგზავნა', 'success')
      setEditing(false)
      onSaved()
    } catch {
      toast('ქსელის შეცდომა', 'error')
    } finally { setSubmitting(false) }
  }

  return (
    <Container as="section" id="leave-review" className="mt-4 scroll-mt-24">
      <div className="rounded-card border border-brand-200 bg-brand-50/50 p-5 lg:p-6">
        {/* Auto-closed sessions (48h cron, tutor never confirmed completion)
            can't be reviewed — the API rejects with AUTO_COMPLETED. Show an
            honest note instead of a form that would always fail. A pre-existing
            review still renders read-only below (defensive). */}
        {booking.autoCompleted && !existing ? (
          <div>
            <Eyebrow tone="muted" className="mb-1.5">შეფასება</Eyebrow>
            <p className="text-small text-ink-600 leading-[1.6]">
              ეს სესია ავტომატურად დაიხურა — შეფასება ხელმისაწვდომი არ არის. თუ სესია არ ჩატარდა ან რამე ხარვეზი იყო, გამოიყენე „საჩივარი“.
            </p>
          </div>
        ) : existing && !editing ? (
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-2 h-6 px-2.5 rounded-pill bg-warning-50 border border-warning-200 text-warning-800 font-display text-meta font-bold">
                შეფასდა · {existing.rating}<span className="sr-only"> 5-დან</span>
                <Icon.star aria-hidden className="w-3 h-3 text-warning-500" />
              </div>
              {/* break-words: globals.css sets overflow-wrap only on h1–h4, so an
                  unbroken string here would overflow into the clipped area. */}
              <p className="mt-2 text-body text-ink-800 leading-[1.6] whitespace-pre-wrap break-words">{existing.body}</p>
              <div className="mt-2 font-mono text-meta tabular-nums text-ink-500">
                {fmtKaDate(new Date(existing.createdAt), { year: true })}
              </div>
            </div>
            {!windowClosed && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="font-display text-small font-semibold text-brand-700 hover:text-brand-900 underline underline-offset-2 decoration-dotted shrink-0"
              >
                შესწორება
              </button>
            )}
          </div>
        ) : (
          <>
            <Eyebrow className="mb-1">დატოვე შეფასება</Eyebrow>
            <h3 className="font-display text-h3 font-bold text-ink-900 tracking-tight">როგორი იყო სესია {booking.tutor.user.fullName.split(' ')[0]}-სთან?</h3>
            {/* Outcome-inviting hint (2.5): nudge toward concrete results — no new DB fields,
                the outcome lives in the same body text. */}
            <p className="mt-1 text-meta text-ink-500 leading-snug">რა შედეგი მიიღე? კონკრეტული შედეგი ყველაზე მეტად ეხმარება სხვებს არჩევანში.</p>
            <div className="mt-4 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  aria-label={`${n} ვარსკვლავი`}
                  className={`w-10 h-10 rounded-btn inline-flex items-center justify-center transition-all duration-fast ${rating >= n ? 'text-warning-500 hover:scale-110' : 'text-ink-300 hover:text-ink-400'}`}
                >
                  <Icon.star aria-hidden className="w-7 h-7" />
                </button>
              ))}
              {rating > 0 && <span className="ml-2 font-display text-small font-bold text-ink-900 tabular-nums">{rating}.0 / 5</span>}
            </div>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value.slice(0, 2000))}
              rows={4}
              placeholder="მაგ.: ერთ სესიაში ამიხსნა, როგორ დავარეგისტრირო შპს — კონკრეტული ნაბიჯებით…"
              className="mt-3 w-full px-3.5 py-2.5 rounded-field border border-ink-200 bg-white text-body focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none resize-none leading-relaxed"
            />
            <div className="mt-1 flex items-center justify-between">
              <span className="text-meta text-ink-500">30-დღიანი ვადა შენახვისთვის</span>
              <span className="font-mono text-meta tabular-nums text-ink-400">{body.length} / 2000</span>
            </div>
            <label className="mt-3 flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={anonymous}
                onChange={e => setAnonymous(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-ink-300 accent-brand-500 focus:ring-brand-400"
              />
              <span className="min-w-0">
                <span className="block font-display text-small font-semibold text-ink-800">ანონიმურად გამოქვეყნება</span>
                <span className="block text-meta text-ink-500 mt-0.5">ექსპერტი შენს სახელს ვერ დაინახავს</span>
              </span>
            </label>
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={submit}
                disabled={submitting || rating === 0 || body.trim().length < 3}
                className="h-11 px-5 rounded-btn bg-brand-600 hover:bg-brand-700 disabled:bg-ink-100 disabled:text-ink-500 text-white font-display font-semibold text-body"
              >
                {submitting ? 'იგზავნება…' : existing ? 'შენახვა' : 'გაგზავნა'}
              </button>
              {existing && (
                <button
                  type="button"
                  onClick={() => { setEditing(false); setRating(existing.rating); setBody(existing.body) }}
                  className="font-display text-small font-semibold text-ink-500 hover:text-ink-800"
                >
                  გაუქმება
                </button>
              )}
            </div>
            {/* WHY the button is grey — a disabled control with no stated
                reason reads as broken. One line, only while it's disabled. */}
            {!submitting && (rating === 0 || body.trim().length < 3) && (
              <p className="mt-2 text-meta text-ink-500">
                {rating === 0 ? 'აირჩიე შეფასება' : 'დაწერე მინიმუმ 3 სიმბოლო'}
              </p>
            )}
          </>
        )}
      </div>
    </Container>
  )
}