'use client'
import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { KA_WEEKDAYS_SHORT, KA_MONTHS_SHORT, KA_MONTHS_LONG } from '@/lib/kaDate'
import { openStartsByDay, startsOnDay, toTimeChoices, fmtHM, type ApiSlot, type BusySlot } from './slots'

// Reschedule picker driven by the expert's REAL published availability (same
// AvailabilitySlot rows the booking flow uses) — NOT a synthetic 09:00–21:00
// grid. Starts are DERIVED for THIS booking's own service length
// (windows − bookings − durationMin), so a reschedule can never propose a time
// the expert never opened or one that no longer fits. Same value contract as
// DateTimePicker (dateStr "YYYY-MM-DD" + timeStr "HH:MM").

const pad = (n: number) => String(n).padStart(2, '0')
const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function RescheduleTimePicker({
  tutorId, durationMin, dateStr, timeStr, onDate, onTime, durationLabel,
}: {
  tutorId: string
  durationMin: number
  dateStr: string
  timeStr: string
  onDate: (s: string) => void
  onTime: (s: string) => void
  durationLabel?: string
}) {
  const [avail, setAvail] = useState<ApiSlot[] | null>(null)
  const [busy, setBusy] = useState<BusySlot[]>([])
  const [bufferMin, setBufferMin] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setAvail(null); setFailed(false)
    fetch(`/api/tutors/${tutorId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled) return
        if (!d) { setFailed(true); setAvail([]); return }
        setAvail(Array.isArray(d.availability) ? d.availability : [])
        setBusy(Array.isArray(d.busySlots) ? d.busySlots : [])
        // Absent until the profile carries it — 0 keeps the derivation honest.
        setBufferMin(typeof d.bufferMin === 'number' && d.bufferMin > 0 ? d.bufferMin : 0)
      })
      .catch(() => { if (!cancelled) { setFailed(true); setAvail([]) } })
    return () => { cancelled = true }
  }, [tutorId])

  // ONE derivation — bookable starts for THIS booking's length, by day.
  const startsByDay = useMemo(
    () => openStartsByDay(avail ?? [], busy, durationMin, { bufferMin }),
    [avail, busy, durationMin, bufferMin],
  )

  // Days that have ≥1 genuinely bookable start.
  const days = useMemo(() => {
    const out: Date[] = []
    for (const arr of startsByDay.values()) {
      const first = arr[0]
      if (first) out.push(new Date(first.getFullYear(), first.getMonth(), first.getDate()))
    }
    out.sort((a, b) => a.getTime() - b.getTime())
    return out
  }, [startsByDay])

  const selDay = days.find(d => toISODate(d) === dateStr) ?? days[0] ?? null

  const times = useMemo(
    () => toTimeChoices(startsOnDay(startsByDay, selDay), durationMin),
    [startsByDay, selDay, durationMin],
  )

  // Keep the parent's selection valid: snap to the first real day/time when the
  // current one isn't on the availability grid.
  useEffect(() => {
    if (days.length && !days.some(d => toISODate(d) === dateStr)) onDate(toISODate(days[0]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])
  useEffect(() => {
    if (times.length && !times.some(t => fmtHM(t.start) === timeStr)) onTime(fmtHM(times[0].start))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [times])

  if (avail === null) {
    return <div className="py-8 text-center text-small text-ink-400">იტვირთება…</div>
  }
  if (failed) {
    return <div className="py-6 text-center text-small text-danger-700">დროები ვერ ჩაიტვირთა.</div>
  }
  if (!days.length) {
    return (
      <div className="rounded-card border border-dashed border-ink-200 bg-ink-50/40 p-6 text-center">
        <Icon.cal className="w-5 h-5 text-ink-400 mx-auto mb-2" />
        <p className="text-small text-ink-600">ექსპერტს ახლა თავისუფალი დრო არ აქვს.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Day rail — only days the expert actually opened */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Eyebrow as="span" tone="muted">თარიღი</Eyebrow>
          {selDay && <span className="text-meta text-ink-400">{KA_MONTHS_LONG[selDay.getMonth()]} {selDay.getFullYear()}</span>}
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide rail-fade-end -mx-1 px-1 pb-1">
          {days.map(d => {
            const iso = toISODate(d)
            const sel = iso === dateStr
            return (
              <button
                key={iso}
                type="button"
                onClick={() => onDate(iso)}
                aria-pressed={sel}
                className={`flex-none w-[58px] h-[64px] rounded-card border flex flex-col items-center justify-center gap-0.5 transition-colors duration-fast motion-safe:active:scale-[0.97] ${
                  sel ? 'bg-brand-600 border-brand-600' : 'border-ink-200 bg-white hover:border-ink-300'
                }`}
              >
                {/* Solid white on the selected fill, never translucent. On
                    brand-600 even white/90 measures 4.19:1 — every opacity step
                    fails AA, so the fill simply cannot carry a second white
                    tier. Hierarchy here comes from size and weight instead,
                    which is what the type scale is for. */}
                <span className={`text-meta font-medium ${sel ? 'text-white' : 'text-ink-500'}`}>{KA_WEEKDAYS_SHORT[d.getDay()]}</span>
                <span className={`text-h3 font-display font-bold tabular-nums leading-none ${sel ? 'text-white' : 'text-ink-900'}`}>{d.getDate()}</span>
                <span className={`text-micro uppercase ${sel ? 'text-white' : 'text-ink-400'}`}>{KA_MONTHS_SHORT[d.getMonth()]}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Time grid — only genuinely free times for the selected day */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Eyebrow as="span" tone="muted">დრო</Eyebrow>
          {durationLabel && <span className="text-meta text-ink-400">{durationLabel}</span>}
        </div>
        {times.length === 0 ? (
          <p className="text-meta text-ink-400 py-3">ამ დღეს დრო აღარ დარჩა — აირჩიე სხვა.</p>
        ) : (
          <div className="grid grid-cols-4 gap-2 max-h-[148px] overflow-y-auto pr-0.5">
            {times.map(t => {
              const hm = fmtHM(t.start)
              const sel = hm === timeStr
              return (
                <button
                  key={hm}
                  type="button"
                  onClick={() => onTime(hm)}
                  aria-pressed={sel}
                  className={`h-9 rounded-field border text-small font-display font-semibold tabular-nums transition-colors duration-fast motion-safe:active:scale-[0.97] ${
                    sel ? 'bg-brand-600 border-brand-600 text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300'
                  }`}
                >
                  {hm}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Selected summary */}
      {selDay && times.some(t => fmtHM(t.start) === timeStr) && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-field bg-ink-75 border border-ink-100 text-small text-ink-700">
          <Icon.cal className="w-3.5 h-3.5 text-brand-600 shrink-0" />
          <span>
            შენ ირჩევ:{' '}
            <span className="font-display font-bold text-ink-900">
              {KA_WEEKDAYS_SHORT[selDay.getDay()]}, {selDay.getDate()} {KA_MONTHS_SHORT[selDay.getMonth()]} · {timeStr}
            </span>
          </span>
        </div>
      )}
    </div>
  )
}
