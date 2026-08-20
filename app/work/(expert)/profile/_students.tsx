'use client'
// „ჩემი მოსწავლეები" — the teacher's roster.
//
// SHAPE IS AUDITED, NOT INVENTED. Circle's course dashboard and Deel's
// assignment table both render the same thing for the same reason: name ·
// progress bar · state · action. A teacher is managing ONGOING relationships,
// so what they need to see is how far through each person is and who has
// stalled — not a list of discrete bookings, which is the consultant's view.
//
// Pending requests sort first because they are the only rows that are waiting
// on the teacher to do something.

import { useCallback, useEffect, useState } from 'react'
import { Btn } from '@/components/Btn'
import { Eyebrow } from '@/components/Eyebrow'
import { useToast } from '@/components/ToastProvider'
import { fmtKaDate } from '@/lib/kaDate'

type Row = {
  id: string
  status: 'REQUESTED' | 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED'
  lessonsTotal: number
  lessonsUsed: number
  left: number
  priceTotal: number
  perLessonPrice: number
  paidAt: string | null
  expiresAt: string | null
  createdAt: string
  student: { id: string; fullName: string }
  /** Snapshotted lesson length; null only for rows predating the column. */
  minutesPerLesson: number | null
  package: { title: string } | null
}

const STATUS: Record<Row['status'], { label: string; cls: string }> = {
  REQUESTED: { label: 'მოთხოვნილი', cls: 'border-warning-300 text-warning-800' },
  ACTIVE: { label: 'მიმდინარე', cls: 'border-brand-400 text-brand-700' },
  COMPLETED: { label: 'დასრულებული', cls: 'border-ink-300 text-ink-600' },
  EXPIRED: { label: 'ვადაგასული', cls: 'border-danger-300 text-danger-700' },
  CANCELLED: { label: 'გაუქმებული', cls: 'border-ink-300 text-ink-500' },
}

export function StudentsSection() {
  const { toast } = useToast()
  const [rows, setRows] = useState<Row[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tutor/enrollments', { cache: 'no-store' })
      if (res.status === 404) return setLoaded(true)   // vertical off
      const j = await res.json()
      setRows(j.items ?? [])
      setLoaded(true)
    } catch {
      // A failed fetch must not render as „you have no students" — leave the
      // section out entirely rather than state something false.
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const act = async (id: string, action: 'accept' | 'decline') => {
    setBusy(id)
    try {
      const res = await fetch(`/api/tutor/enrollments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast(j.message || 'ვერ შესრულდა', 'error'); return }
      toast(action === 'accept' ? 'დადასტურდა — კრედიტები აქტიურია' : 'უარყოფილია', 'success')
      await load()
    } catch { toast('ქსელის შეცდომა', 'error') }
    finally { setBusy(null) }
  }

  // Nothing to manage yet → no empty section cluttering the page.
  if (!loaded || rows.length === 0) return null

  return (
    <section id="section-students" className="scroll-mt-24 p-6 rounded-card border border-ink-200 bg-white space-y-4">
      <div>
        <Eyebrow tone="muted" className="mb-1">ჩემი მოსწავლეები</Eyebrow>
        <p className="text-meta text-ink-500 leading-snug max-w-[520px]">
          ვინ არის პაკეტზე, სად არის და როდის უწურდება ვადა.
        </p>
      </div>

      <div className="space-y-2">
        {rows.map(r => {
          const s = STATUS[r.status]
          const pct = r.lessonsTotal > 0 ? Math.round((r.lessonsUsed / r.lessonsTotal) * 100) : 0
          return (
            <div key={r.id} className="p-3 rounded-card border border-ink-200">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-display text-body font-bold text-ink-900">{r.student.fullName}</div>
                  <div className="mt-0.5 text-meta text-ink-600 tabular-nums">
                    {r.package?.title ?? 'პაკეტი'} · ₾{r.priceTotal}
                    {r.expiresAt && r.status === 'ACTIVE' && <> · ვადა {fmtKaDate(new Date(r.expiresAt))}</>}
                  </div>
                </div>
                <span className={`inline-flex items-center h-6 px-2 rounded-pill border font-display text-micro font-bold uppercase ${s.cls}`}>
                  {s.label}
                </span>
              </div>

              {/* Progress — the one number a teacher checks every week. */}
              {r.status !== 'REQUESTED' && (
                <div className="mt-2.5">
                  <div className="flex items-baseline justify-between gap-2 text-meta tabular-nums">
                    <span className="text-ink-600">{r.lessonsUsed} / {r.lessonsTotal} გაკვეთილი</span>
                    <span className="text-ink-500">დარჩა {r.left}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-pill bg-ink-100 overflow-hidden">
                    <div className="h-full bg-brand-500 rounded-pill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )}

              {r.status === 'REQUESTED' && (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className="text-meta text-ink-600">
                    გადახდაზე შეთანხმების შემდეგ დაადასტურე — მერე კრედიტები აქტიურდება.
                  </span>
                  <span className="flex-1" />
                  <Btn variant="ghost" size="sm" type="button" disabled={busy === r.id} onClick={() => act(r.id, 'decline')}>უარი</Btn>
                  <Btn variant="primary" size="sm" type="button" disabled={busy === r.id} onClick={() => act(r.id, 'accept')}>
                    {busy === r.id ? 'ინახება…' : 'გადახდილია'}
                  </Btn>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
