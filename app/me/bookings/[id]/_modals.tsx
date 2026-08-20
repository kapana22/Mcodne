'use client'
// /student/bookings/[id] — the two dialogs that change a booking:
// reschedule and dispute.

import { useState, useEffect } from 'react'
import { PAYMENTS_LIVE, CANCEL_CUTOFF_HOURS } from '@/lib/flags'
import { Sheet } from '@/components/Sheet'
import { Eyebrow } from '@/components/Eyebrow'
import { Icon } from '@/components/Icon'
import { RescheduleTimePicker } from '@/components/booking/RescheduleTimePicker'
import { Booking, fmtDate, fmtTime } from './_model'

/* ───── Reschedule modal — POST /api/bookings/[id]/reschedule ───── */
export const RescheduleModal = ({ open, onClose, onSent, booking }: { open: boolean; onClose: () => void; onSent: () => void; booking: Booking }) => {
  const [dateStr, setDateStr] = useState(() => {
    const t = new Date(Date.now() + 24 * 3600_000)
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  })
  const [timeStr, setTimeStr] = useState('14:00')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Escape/scroll-lock/focus now come from Sheet — only reset form state on open.
  useEffect(() => {
    if (!open) return
    setSending(false); setErr(null); setNote('')
  }, [open])

  const send = async () => {
    if (sending) return
    setSending(true); setErr(null)
    const target = new Date(`${dateStr}T${timeStr}:00`)
    if (isNaN(target.getTime()) || target.getTime() < Date.now()) {
      setErr('აირჩიე მომავალი დრო.'); setSending(false); return
    }
    try {
      const res = await fetch(`/api/bookings/${booking.id}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newStartAt: target.toISOString(), reason: note.trim() || undefined }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        setErr(
          j?.error === 'TOO_SOON' ? 'დრო ძალიან ახლოსაა — მინიმუმ 1 საათი წინ.' :
          j?.error === 'NO_SLOT' ? 'ექსპერტს ამ დროს ხელმისაწვდომობა არ აქვს.' :
          j?.error === 'BAD_STATE' ? 'ჯავშნის სტატუსი ამას აღარ უშვებს.' :
          'მოთხოვნის გაგზავნა ვერ მოხერხდა.'
        )
        return
      }
      onSent()
    } catch { setErr('ქსელის შეცდომა') }
    finally { setSending(false) }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="md"
      busy={sending}
      eyebrow={`გადადება — უფასოდ ${CANCEL_CUTOFF_HOURS}სთ-მდე`}
      title="აირჩიე ახალი დრო"
      footer={
        <>
          <button type="button" onClick={onClose} className="font-display text-small font-semibold text-ink-500 hover:text-ink-800">გაუქმება</button>
          <button type="button" onClick={send} disabled={sending} className="h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body inline-flex items-center gap-1.5 disabled:opacity-60">
            {sending ? 'იგზავნება…' : 'მოთხოვნის გაგზავნა'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
          <div className="text-meta text-ink-500">ამჟამინდელი: <span className="font-display font-semibold text-ink-900">{fmtDate(new Date(booking.startAt))} · {fmtTime(new Date(booking.startAt))} · {booking.tutor.user.fullName}</span></div>
          <RescheduleTimePicker tutorId={booking.tutor.id} durationMin={booking.durationMin} dateStr={dateStr} timeStr={timeStr} onDate={setDateStr} onTime={setTimeStr} />
          <div>
            <Eyebrow as="label" tone="muted" className="block mb-2">დამატებით <span className="text-ink-400 font-normal normal-case tracking-normal">— სურვილისამებრ</span></Eyebrow>
            <textarea value={note} onChange={e => setNote(e.target.value.slice(0, 600))} rows={3} placeholder="მიზეზი, დამატებითი კონტექსტი…"
                      className="w-full p-3 rounded-field border border-ink-200 text-small focus:border-brand-500 focus:outline-none resize-none leading-relaxed" />
          </div>
          <p className="text-meta text-ink-500 leading-snug">მოთხოვნა გაიგზავნება მიმოწერაში. ექსპერტის დადასტურების შემდეგ დრო შეიცვლება.</p>
          {err && <div role="alert" className="rounded-btn border border-danger-200 bg-danger-50 text-danger-800 px-3 py-2 text-meta font-medium">{err}</div>}
      </div>
    </Sheet>
  )
}

/* ───── Dispute modal — sends real message ───── */
type DisputeReason = 'no-show' | 'quality' | 'wrong-topic' | 'unprofessional' | 'tech' | 'other'
export const DisputeModal = ({ open, onClose, bookingId, onSent }: { open: boolean; onClose: () => void; bookingId: string; onSent: () => void }) => {
  const [reason, setReason] = useState<DisputeReason | null>(null)
  const [story, setStory] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Escape/scroll-lock/focus now come from Sheet — only reset form state on open.
  useEffect(() => {
    if (!open) return
    setReason(null); setStory(''); setSending(false); setErr(null)
  }, [open])

  const REASONS: { id: DisputeReason; l: string; sub: string }[] = [
    { id: 'no-show',        l: 'ექსპერტი არ მოვიდა',        sub: PAYMENTS_LIVE ? '100% დაბრუნება' : 'სწრაფად განვიხილავთ' },
    { id: 'quality',        l: 'დაბალი ხარისხი',           sub: 'ცოდნა/მომზადება' },
    { id: 'wrong-topic',    l: 'არასწორი თემა',            sub: 'სხვა რაზე ვისაუბრეთ' },
    { id: 'unprofessional', l: 'არაპროფესიული ქცევა',      sub: 'უპატივცემულობა · დაგვიანება' },
    { id: 'tech',           l: 'ტექნიკური პრობლემა',        sub: 'ვიდეო/აუდიო არ მუშაობდა' },
    { id: 'other',          l: 'სხვა',                     sub: 'თავად ჩავწერ' },
  ]

  const send = async () => {
    if (!reason || sending) return
    setSending(true); setErr(null)
    // Map UI reason id → schema enum (screaming snake case).
    const REASON_ENUM: Record<DisputeReason, string> = {
      'no-show': 'NO_SHOW',
      'quality': 'QUALITY',
      'wrong-topic': 'WRONG_TOPIC',
      'unprofessional': 'UNPROFESSIONAL',
      'tech': 'TECHNICAL',
      'other': 'OTHER',
    }
    try {
      const res = await fetch('/api/disputes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          reason: REASON_ENUM[reason],
          details: story.trim() || undefined,
        }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        setErr(j.error === 'ALREADY_EXISTS' ? 'ამ ჯავშანზე უკვე გახსნილია საჩივარი.' : 'საჩივრის გაგზავნა ვერ მოხერხდა')
        return
      }
      onSent()
    } catch { setErr('ქსელის შეცდომა') }
    finally { setSending(false) }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="md"
      busy={sending}
      ariaLabel="საჩივარი"
      title={
        <>
          <div className="font-display text-micro font-semibold uppercase text-danger-700 mb-1 inline-flex items-center gap-1.5"><Icon.flag className="w-3 h-3" /> საჩივარი</div>
          <div>გვითხარი — რა მოხდა?</div>
        </>
      }
      footer={
        <>
          <button type="button" onClick={onClose} className="font-display text-small font-semibold text-ink-500 hover:text-ink-800">გაუქმება</button>
          <button type="button" disabled={!reason || sending} onClick={send} className={`h-11 px-4 rounded-btn font-display font-semibold text-small inline-flex items-center gap-1.5 ${!reason || sending ? 'bg-ink-100 text-ink-400 cursor-not-allowed' : 'bg-danger-500 hover:bg-danger-600 text-white'}`}>
            <Icon.flag className="w-3.5 h-3.5" /> {sending ? 'იგზავნება…' : 'გააგზავნე'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
          <div>
            <Eyebrow tone="muted" className="mb-2">მთავარი მიზეზი</Eyebrow>
            <div className="grid sm:grid-cols-2 gap-1.5">
              {REASONS.map(r => {
                const on = reason === r.id
                return (
                  <button key={r.id} type="button" onClick={() => setReason(r.id)} className={`p-3 rounded-card border text-left transition-all duration-fast ${on ? 'border-brand-500 bg-brand-50/40 ring-2 ring-brand-500/15' : 'border-ink-200 bg-white hover:border-ink-300'}`}>
                    <div className="font-display text-small font-bold text-ink-900">{r.l}</div>
                    <div className="text-meta text-ink-500 mt-0.5">{r.sub}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {reason && (
            <div>
              <Eyebrow tone="muted" className="mb-2">დეტალურად <span className="text-ink-400 font-normal normal-case tracking-normal">— სურვილისამებრ</span></Eyebrow>
              <textarea value={story} onChange={e => setStory(e.target.value.slice(0, 1000))} rows={4} placeholder="რა მოხდა, რა იყო მოლოდინი, რა მიიღე…" className="w-full p-3 rounded-field bg-white border border-ink-200 focus:border-brand-500 focus:outline-none text-small resize-none leading-relaxed" />
              <p className="mt-1 text-meta text-ink-500 text-right tabular-nums">{story.length} / 1000</p>
            </div>
          )}

          {err && <div role="alert" className="rounded-btn border border-danger-200 bg-danger-50 text-danger-800 px-3 py-2 text-meta font-medium">{err}</div>}
      </div>
    </Sheet>
  )
}