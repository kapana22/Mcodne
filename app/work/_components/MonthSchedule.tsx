'use client'
// The teacher's month — the surface a teaching business is actually run from.
//
// WHY A CALENDAR AND NOT A LIST. A consultant's work is discrete: someone books
// an hour, it happens, it ends. A teacher's work is a RHYTHM — eight lessons
// spread over a month, at times that repeat — and the only question they open
// the app to answer is „what does my month look like". A chronological list
// cannot answer that; a grid answers it at a glance.
//
// Shape is audited, not invented: Preply's „My lessons" calendar tab and
// Teachworks both render a grid with the student's name in the block and a
// legend separating recurring from single lessons. This is the month view of
// the same idea, sized for a workspace column rather than a full-screen app.

import { useMemo, useState } from 'react'
import { Eyebrow } from '@/components/Eyebrow'
import { Icon } from '@/components/Icon'
import { KA_MONTHS_LONG } from '@/lib/kaDate'

export type ScheduleLesson = {
  id: string
  startAt: string
  durationMin: number
  status: string
  studentName: string
  /** True when this lesson came out of a package — see Booking.enrollmentId. */
  fromPackage: boolean
}

const KA_DOW = ['ორშ', 'სამ', 'ოთხ', 'ხუთ', 'პარ', 'შაბ', 'კვი']

/** Monday-first weekday index, which is how a Georgian week is read. */
const dowMon = (d: Date) => (d.getDay() + 6) % 7

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

export function MonthSchedule({ lessons, loading }: { lessons: ScheduleLesson[]; loading?: boolean }) {
  // Offset in months from the current one. Kept in state rather than the URL:
  // this is a glance, not a destination worth deep-linking.
  const [offset, setOffset] = useState(0)

  const { cells, label, monthLessons } = useMemo(() => {
    const today = new Date()
    const first = new Date(today.getFullYear(), today.getMonth() + offset, 1)
    const year = first.getFullYear()
    const month = first.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    // Pad to the Monday on or before the 1st, so the grid always starts on a
    // week boundary and the columns line up with their headers.
    const lead = dowMon(first)

    const parsed = lessons
      .map(l => ({ ...l, date: new Date(l.startAt) }))
      .filter(l => Number.isFinite(l.date.getTime()))
    const inMonth = parsed.filter(l => l.date.getFullYear() === year && l.date.getMonth() === month)

    const out: { date: Date | null; items: typeof parsed }[] = []
    for (let i = 0; i < lead; i++) out.push({ date: null, items: [] })
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d)
      out.push({
        date,
        items: inMonth
          .filter(l => sameDay(l.date, date))
          .sort((a, b) => a.date.getTime() - b.date.getTime()),
      })
    }
    // Trailing pad so the last row is complete and the grid keeps its shape.
    while (out.length % 7 !== 0) out.push({ date: null, items: [] })

    return { cells: out, label: `${KA_MONTHS_LONG[month]} ${year}`, monthLessons: inMonth.length }
  }, [lessons, offset])

  const today = new Date()

  return (
    <section className="rounded-card border border-ink-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <Eyebrow tone="muted" className="mb-1">განრიგი</Eyebrow>
          <div className="font-display text-h3 font-bold text-ink-900 tracking-tight">{label}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-meta text-ink-500 tabular-nums mr-1.5">{monthLessons} გაკვეთილი</span>
          <button
            type="button" aria-label="წინა თვე" onClick={() => setOffset(o => o - 1)}
            className="w-9 h-9 inline-flex items-center justify-center rounded-btn border border-ink-200 text-ink-700 hover:bg-ink-50 transition-colors duration-fast"
          ><Icon.chevL className="w-4 h-4" /></button>
          <button
            type="button" onClick={() => setOffset(0)} disabled={offset === 0}
            className="h-9 px-3 rounded-btn border border-ink-200 text-ink-700 hover:bg-ink-50 font-display text-meta font-semibold transition-colors duration-fast disabled:opacity-40"
          >დღეს</button>
          <button
            type="button" aria-label="შემდეგი თვე" onClick={() => setOffset(o => o + 1)}
            className="w-9 h-9 inline-flex items-center justify-center rounded-btn border border-ink-200 text-ink-700 hover:bg-ink-50 transition-colors duration-fast"
          ><Icon.chevR className="w-4 h-4" /></button>
        </div>
      </div>

      {/* The grid scrolls inside its own container — a month of columns must
          never make the workspace page scroll sideways. */}
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {KA_DOW.map(d => (
              <div key={d} className="font-display text-micro font-bold uppercase text-ink-400 text-center py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((c, i) => {
              if (!c.date) return <div key={`pad-${i}`} className="min-h-[76px] rounded-btn bg-ink-50/40" />
              const isToday = sameDay(c.date, today)
              return (
                <div
                  key={c.date.toISOString()}
                  className={`min-h-[76px] rounded-btn border p-1.5 ${isToday ? 'border-brand-400 bg-brand-50/40' : 'border-ink-100 bg-white'}`}
                >
                  <div className={`text-meta tabular-nums mb-1 ${isToday ? 'font-display font-bold text-brand-700' : 'text-ink-400'}`}>
                    {c.date.getDate()}
                  </div>
                  <div className="flex flex-col gap-1">
                    {c.items.slice(0, 3).map(l => (
                      <div
                        key={l.id}
                        title={`${hhmm(l.date)} · ${l.studentName}`}
                        // Package lessons are FILLED, one-offs are outlined —
                        // the same distinction Preply's legend draws between a
                        // recurring lesson and a single one. Colour alone would
                        // not carry it for a colour-blind reader, so the two
                        // differ in fill AND border.
                        className={`px-1.5 py-1 rounded text-micro leading-tight truncate ${
                          l.fromPackage
                            ? 'bg-brand-600 text-white'
                            : 'bg-white border border-ink-300 text-ink-700'
                        }`}
                      >
                        <span className="tabular-nums font-semibold">{hhmm(l.date)}</span>{' '}
                        <span className="opacity-90">{l.studentName.split(' ')[0]}</span>
                      </div>
                    ))}
                    {c.items.length > 3 && (
                      <div className="text-micro text-ink-500 tabular-nums px-1.5">+{c.items.length - 3}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 flex-wrap text-meta text-ink-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-brand-600" /> პაკეტის გაკვეთილი
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-white border border-ink-300" /> ერთჯერადი სესია
        </span>
        {loading && <span className="text-ink-400">იტვირთება…</span>}
      </div>
    </section>
  )
}
