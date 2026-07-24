'use client'
import { useEffect } from 'react'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { KA_WEEKDAYS_SHORT, KA_MONTHS_SHORT, KA_MONTHS_LONG } from '@/lib/kaDate'

// Comfortable date+time picker for reschedule/booking requests: a horizontal
// rail of day-chips + a grid of time-chips, instead of the native
// <input type=date/time> spinners (fiddly, especially on mobile). The value
// contract stays the same — dateStr "YYYY-MM-DD" + timeStr "HH:MM" — so callers
// keep building `new Date(`${dateStr}T${timeStr}:00`)` unchanged.

const pad = (n: number) => String(n).padStart(2, '0')
const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// Next `n` calendar days from today (local midnight-anchored).
function nextDays(n: number): Date[] {
  const base = new Date()
  const out: Date[] = []
  for (let i = 0; i < n; i++) out.push(new Date(base.getFullYear(), base.getMonth(), base.getDate() + i))
  return out
}

// 09:00 … 21:00, every 30 min.
const SLOTS: string[] = (() => {
  const out: string[] = []
  for (let h = 9; h <= 21; h++) { out.push(`${pad(h)}:00`); if (h !== 21) out.push(`${pad(h)}:30`) }
  return out
})()

const DAYS_AHEAD = 21

export function DateTimePicker({
  dateStr,
  timeStr,
  onDate,
  onTime,
  durationLabel,
}: {
  dateStr: string
  timeStr: string
  onDate: (s: string) => void
  onTime: (s: string) => void
  durationLabel?: string
}) {
  const days = nextDays(DAYS_AHEAD)

  // If the caller opened with no date (or one outside the visible rail), settle
  // on tomorrow — the same safe, lead-time-respecting default the student modal
  // starts from — so a chip is always highlighted and the summary is truthful.
  const hasValidDate = days.some(d => toISODate(d) === dateStr)
  useEffect(() => {
    if (!hasValidDate) onDate(toISODate(days[1]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStr])

  const selDay = days.find(d => toISODate(d) === dateStr) ?? days[1]
  const now = new Date()
  const todayISO = toISODate(now)
  const nowHM = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  const isToday = dateStr === todayISO

  return (
    <div className="space-y-4">
      {/* Day rail */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Eyebrow as="span" tone="muted">თარიღი</Eyebrow>
          <span className="text-[11.5px] text-ink-400">{KA_MONTHS_LONG[selDay.getMonth()]} {selDay.getFullYear()}</span>
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

      {/* Time grid */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Eyebrow as="span" tone="muted">დრო</Eyebrow>
          {durationLabel && <span className="text-[11.5px] text-ink-400">{durationLabel}</span>}
        </div>
        <div className="grid grid-cols-4 gap-2 max-h-[148px] overflow-y-auto pr-0.5">
          {SLOTS.map(s => {
            const past = isToday && s <= nowHM
            const sel = s === timeStr
            return (
              <button
                key={s}
                type="button"
                disabled={past}
                onClick={() => onTime(s)}
                aria-pressed={sel}
                className={`h-9 rounded-field border text-[13px] font-display font-semibold tabular-nums transition-colors motion-safe:active:scale-[0.97] ${
                  sel
                    ? 'bg-brand-500 border-brand-500 text-white'
                    : past
                      ? 'border-ink-100 text-ink-300 cursor-not-allowed'
                      : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300'
                }`}
              >
                {s}
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected summary */}
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-field bg-ink-75 border border-ink-100 text-[12.5px] text-ink-700">
        <Icon.cal className="w-3.5 h-3.5 text-brand-600 shrink-0" />
        <span>
          შენ ირჩევ:{' '}
          <span className="font-display font-bold text-ink-900">
            {KA_WEEKDAYS_SHORT[selDay.getDay()]}, {selDay.getDate()} {KA_MONTHS_SHORT[selDay.getMonth()]} · {timeStr}
          </span>
        </span>
      </div>
    </div>
  )
}
