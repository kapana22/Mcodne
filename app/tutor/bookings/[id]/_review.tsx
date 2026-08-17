'use client'
// /tutor/bookings/[id] — the review the client left, as the expert sees it.

import { useState } from 'react'
import { Eyebrow } from '@/components/Eyebrow'
import { Icon } from '@/components/Icon'
import { Btn } from '@/components/Btn'
import { useToast } from '@/components/ToastProvider'
import { fmtKaDate } from '@/lib/kaDate'
import { BookingReview } from './_model'

/* Client review + expert reply. One reply per review (server allows edits —
   PATCH overwrites). The reply ships publicly on the expert profile, so the
   form says so under the textarea. */
export function ReviewBlock({
  bookingId,
  review,
  onUpdated,
}: {
  bookingId: string
  review: BookingReview
  onUpdated: (tutorResponse: string, respondedAt: string) => void
}) {
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(review.tutorResponse ?? '')
  const [saving, setSaving] = useState(false)
  const trimmed = text.trim()

  const submit = async () => {
    if (trimmed.length < 2 || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/reviews/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: trimmed }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        toast(j?.message || 'პასუხის შენახვა ვერ მოხერხდა', 'error')
        return
      }
      onUpdated(j.tutorResponse, j.respondedAt)
      setEditing(false)
      toast(review.tutorResponse ? 'პასუხი განახლდა' : 'პასუხი გამოქვეყნდა', 'success')
    } catch { toast('ქსელის შეცდომა', 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="rounded-card border border-ink-200 bg-white shadow-xs p-5 sm:p-6">
      <Eyebrow tone="muted" className="mb-2">სტუდენტის შეფასება</Eyebrow>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span role="img" aria-label={`${review.rating} 5-დან`} className="inline-flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map(n => (
            <Icon.star aria-hidden key={n} className={`w-4 h-4 ${n <= review.rating ? 'text-warning-500' : 'text-ink-200'}`} />
          ))}
        </span>
        <span className="font-display text-small font-bold text-ink-900 tabular-nums">{review.rating}.0</span>
        <span className="ml-auto font-mono text-meta tabular-nums text-ink-400">{fmtKaDate(new Date(review.createdAt), { year: true })}</span>
      </div>
      <p className="mt-2 text-body text-ink-800 leading-[1.6] whitespace-pre-wrap">{review.body}</p>

      <div className="mt-4 pt-4 border-t border-ink-100">
        {review.tutorResponse && !editing ? (
          <>
            <Eyebrow className="mb-1.5">შენი პასუხი</Eyebrow>
            <blockquote className="border-l-2 border-brand-300 pl-3 text-small text-ink-800 leading-[1.6] whitespace-pre-wrap">
              {review.tutorResponse}
            </blockquote>
            <div className="mt-2 flex items-center gap-3">
              {review.respondedAt && (
                <span className="font-mono text-meta tabular-nums text-ink-400">{fmtKaDate(new Date(review.respondedAt), { year: true })}</span>
              )}
              <button
                type="button"
                onClick={() => { setText(review.tutorResponse ?? ''); setEditing(true) }}
                className="font-display text-meta font-semibold text-brand-700 hover:text-brand-900 underline underline-offset-2 decoration-dotted"
              >
                რედაქტირება
              </button>
            </div>
          </>
        ) : editing ? (
          <div>
            <Eyebrow tone="muted" className="mb-2">
              {review.tutorResponse ? 'პასუხის რედაქტირება' : 'პასუხი შეფასებაზე'}
            </Eyebrow>
            <textarea
              value={text}
              onChange={e => setText(e.target.value.slice(0, 600))}
              rows={3}
              placeholder="მადლობა შეფასებისთვის…"
              className="w-full p-3 rounded-field border border-ink-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none text-body resize-none leading-relaxed"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="font-mono text-meta tabular-nums text-ink-400">{text.length} / 600</span>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setEditing(false)} className="font-display text-small font-semibold text-ink-500 hover:text-ink-800">
                  გაუქმება
                </button>
                <Btn variant="primary" size="sm" onClick={submit} disabled={saving || trimmed.length < 2}>
                  {saving ? 'ინახება…' : 'გამოქვეყნება'}
                </Btn>
              </div>
            </div>
            <p className="mt-1.5 text-meta text-ink-500">პასუხი საჯაროდ ჩანს პროფილზე.</p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setText(''); setEditing(true) }}
            className="font-display text-small font-semibold text-brand-700 hover:text-brand-900 inline-flex items-center gap-1.5"
          >
            <Icon.chat className="w-3.5 h-3.5" /> უპასუხე შეფასებას
          </button>
        )}
      </div>
    </div>
  )
}