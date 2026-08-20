'use client'
// „ყოველკვირეული განრიგი" — pick the days and the hour, book the whole package.
//
// Shape from Numo's routine picker and Linktree's weekly-availability editor:
// seven day pills, then one time. Deliberately NOT a calendar — the user is not
// choosing dates, they are choosing a RHYTHM, and a month grid would invite
// them to pick eight individual days, which is the thing this replaces.
//
// PREVIEW BEFORE COMMIT is the non-negotiable part. The pattern expands into
// eight real dates; showing them first is what makes „book all" a safe button
// rather than a leap. The preview is the server's own expansion (dryRun), never
// a second calculation on the client.

import { useState } from 'react'
import { Btn } from '@/components/Btn'
import { useToast } from '@/components/ToastProvider'
// Tbilisi wall clock on both sides. The hour the client picks here is compared
// against the teacher's windows on the server in Tbilisi, so rendering these
// strings in the BROWSER's zone would let someone abroad tap „16:00", mean
// 16:00 Berlin, and be answered about 16:00 Tbilisi. <TzNote> captions the
// block for exactly those viewers. See components/workspace/sessionTime.
import { sessionDate, sessionTime } from '@/components/workspace/sessionTime'
import { TzNote } from '@/components/workspace/TzNote'

/** ISO weekday numbers, Monday first — the order a Georgian week is read in. */
const DAYS = [
  { iso: 1, label: 'ორშ' },
  { iso: 2, label: 'სამ' },
  { iso: 3, label: 'ოთხ' },
  { iso: 4, label: 'ხუთ' },
  { iso: 5, label: 'პარ' },
  { iso: 6, label: 'შაბ' },
  { iso: 7, label: 'კვი' },
]

export function WeeklyPattern({
  enrollmentId,
  starts,
  left,
  onDone,
}: {
  enrollmentId: string
  /** Real open starts, used ONLY to offer plausible times — the server decides. */
  starts: string[]
  left: number
  onDone: () => void
}) {
  const { toast } = useToast()
  const [days, setDays] = useState<number[]>([])
  const [time, setTime] = useState<string>('')
  const [preview, setPreview] = useState<string[] | null>(null)
  const [short, setShort] = useState(0)
  const [busy, setBusy] = useState(false)

  // The distinct times the teacher actually offers, so the picker cannot
  // suggest an hour that will only be refused.
  const times = Array.from(new Set(starts.map(s => sessionTime(s)))).sort()

  const toggle = (iso: number) => {
    setPreview(null)
    setDays(d => (d.includes(iso) ? d.filter(x => x !== iso) : [...d, iso].sort()))
  }

  const call = async (dryRun: boolean) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/enrollments/${enrollmentId}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekdays: days, time, dryRun }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast(j.message || 'ვერ მოხერხდა', 'error'); return }
      if (dryRun) { setPreview(j.preview ?? []); setShort(j.short ?? 0); return }
      toast(`დაიჯავშნა ${j.created} გაკვეთილი`, 'success')
      setPreview(null); setDays([]); setTime('')
      onDone()
    } catch { toast('ქსელის შეცდომა', 'error') }
    finally { setBusy(false) }
  }

  const ready = days.length > 0 && !!time

  return (
    <div className="mt-3 p-3 rounded-card border border-ink-200 bg-ink-50/50 space-y-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div className="font-display text-meta font-semibold text-ink-700">ყოველკვირეული განრიგი</div>
        <TzNote />
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="დღეები">
        {DAYS.map(d => {
          const on = days.includes(d.iso)
          return (
            <button
              key={d.iso}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(d.iso)}
              className={`h-9 px-3 rounded-btn border font-display text-meta font-semibold transition-colors duration-fast ${
                on ? 'border-brand-500 bg-brand-600 text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-brand-400'
              }`}
            >
              {d.label}
            </button>
          )
        })}
      </div>

      {times.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="დრო">
          {times.slice(0, 14).map(t => (
            <button
              key={t}
              type="button"
              aria-pressed={time === t}
              onClick={() => { setPreview(null); setTime(t) }}
              className={`h-9 px-3 rounded-btn border font-display text-meta font-semibold tabular-nums transition-colors duration-fast ${
                time === t ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-ink-200 bg-white text-ink-700 hover:border-brand-400'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {preview && (
        <div className="p-2.5 rounded-btn bg-white border border-ink-200">
          <div className="font-display text-meta font-semibold text-ink-800 mb-1 tabular-nums">
            {preview.length} გაკვეთილი
            {short > 0 && <span className="text-warning-800 font-normal"> — {left}-იდან {short} ვერ ჩაჯდა ამ განრიგში</span>}
          </div>
          <div className="text-meta text-ink-600 leading-relaxed">
            {preview.slice(0, 8).map(iso => sessionDate(iso)).join(' · ')}
            {preview.length > 8 && ` · +${preview.length - 8}`}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {!preview ? (
          <Btn variant="secondary" size="sm" type="button" disabled={!ready || busy} onClick={() => call(true)}>
            {busy ? 'ითვლება…' : 'ნახე განრიგი'}
          </Btn>
        ) : (
          <>
            <Btn variant="primary" size="sm" type="button" disabled={busy} onClick={() => call(false)}>
              {busy ? 'იჯავშნება…' : `დაჯავშნე ${preview.length} გაკვეთილი`}
            </Btn>
            <Btn variant="ghost" size="sm" type="button" disabled={busy} onClick={() => setPreview(null)}>შეცვლა</Btn>
          </>
        )}
      </div>
    </div>
  )
}
