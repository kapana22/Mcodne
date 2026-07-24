'use client'
import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { KA_WEEKDAYS_SHORT, KA_MONTHS_SHORT, KA_MONTHS_LONG } from '@/lib/kaDate'
import { enumerateTimes, groupSlotsByDay, startOfDay, fmtHM, type ApiSlot, type BusySlot } from './slots'

// Reschedule picker driven by the expert's REAL published availability (same
// AvailabilitySlot rows the booking flow uses) — NOT a synthetic 09:00–21:00
// grid. Only days/times the expert actually declared as free are selectable, so
// a reschedule can never propose a time the expert never opened. Same value
// contract as DateTimePicker (dateStr "YYYY-MM-DD" + timeStr "HH:MM").

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
      })
      .catch(() => { if (!cancelled) { setFailed(true); setAvail([]) } })
    return () => { cancelled = true }
  }, [tutorId])

  // Days that have ≥1 genuinely free time for this duration.
  const days = useMemo(() => {
    if (!avail) return []
    const out: Date[] = []
    for (const [, slots] of groupSlotsByDay(avail)) {
      const day = startOfDay(new Date(slots[0].startAt))
      if (enumerateTimes(day, avail, busy, durationMin).some(t => !t.taken)) out.push(day)
    }
    out.sort((a, b) => a.getTime() - b.getTime())
    return out
  }, [avail, busy, durationMin])

  const selDay = days.find(d => toISODate(d) === dateStr) ?? days[0] ?? null

  const times = useMemo(() => {
    if (!selDay) return []
    return enumerateTimes(selDay, avail ?? [], busy, durationMin).filter(t => !t.taken)
  }, [selDay, avail, busy, durationMin])

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
    return <div className="py-8 text-center text-[13px] text-ink-400">იტვირთება ხელმისაწვდომი დროები…</div>
  }
  if (failed) {
    return <div className="py-6 text-center text-[13px] text-danger-700">დროების ჩატვირთვა ვერ მოხერხდა.</div>
  }
  if (!days.length) {
    return (
      <div className="rounded-card border border-dashed border-ink-200 bg-ink-50/40 p-6 text-center">
        <Icon.cal className="w-5 h-5 text-ink-400 mx-auto mb-2" />
        <p className="text-[13px] text-ink-600">ექსპერტს ამჟამად გამოცხადებული თავისუფალი დრო არ აქვს.</p>
        <p className="text-[11.5px] text-ink-400 mt-1">გადადება მხოლოდ ექსპერტის ხელმისაწვდომ დროზეა შესაძლებელი.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Day rail — only days the expert actually opened */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Eyebrow as="span" tone="muted">თარიღი</Eyebrow>
          {selDay && <span className="text-[11.5px] text-ink-400">{KA_MONTHS_LONG[selDay.getMonth()]} {selDay.getFullYear()}</span>}
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
                className={`flex-none w-[58px] h-[64px] rounded-card border flex flex-col items-center justify-center gap-0.5 transition-colors motion-safe:active:scale-[0.97] ${
                  sel ? 'bg-brand-500 border-brand-500' : 'border-ink-200 bg-white hover:border-ink-300'
                }`}
              >
                <span className={`text-[11px] font-medium ${sel ? 'text-white/90' : 'text-ink-500'}`}>{KA_WEEKDAYS_SHORT[d.getDay()]}</span>
                <span className={`text-[18px] font-display font-bold tabular-nums leading-none ${sel ? 'text-white' : 'text-ink-900'}`}>{d.getDate()}</span>
                <span className={`text-[9px] uppercase tracking-wide ${sel ? 'text-white/80' : 'text-ink-400'}`}>{KA_MONTHS_SHORT[d.getMonth()]}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Time grid — only genuinely free times for the selected day */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Eyebrow as="span" tone="muted">დრო</Eyebrow>
          {durationLabel && <span className="text-[11.5px] text-ink-400">{durationLabel}</span>}
        </div>
        {times.length === 0 ? (
          <p className="text-[12px] text-ink-400 py-3">ამ დღეს თავისუფალი დრო აღარ დარჩა — აირჩიე სხვა დღე.</p>
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
                  className={`h-9 rounded-field border text-[13px] font-display font-semibold tabular-nums transition-colors motion-safe:active:scale-[0.97] ${
                    sel ? 'bg-brand-500 border-brand-500 text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300'
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
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-field bg-ink-75 border border-ink-100 text-[12.5px] text-ink-700">
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
