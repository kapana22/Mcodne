'use client'
// /tutor/schedule — the „გაიმეორე კვირაში“ template sheet: pick weekdays,
// an hour range and how many weeks to publish.

import type { Dispatch, SetStateAction } from 'react'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { Sheet } from '@/components/Sheet'
import { DAY_LABELS, fmtDur } from './_shared'
import { Eyebrow } from '@/components/Eyebrow'
import { KA_WEEKDAYS_SHORT } from '@/lib/kaDate'

type Props = {
  tplOpen: boolean
  setTplOpen: Dispatch<SetStateAction<boolean>>
  tplDays: boolean[]
  setTplDays: Dispatch<SetStateAction<boolean[]>>
  tplStartHour: number
  setTplStartHour: Dispatch<SetStateAction<number>>
  tplEndHour: number
  setTplEndHour: Dispatch<SetStateAction<number>>
  tplWeeks: number
  setTplWeeks: Dispatch<SetStateAction<number>>
  tplSaving: boolean
  tplErr: string | null
  setTplErr: Dispatch<SetStateAction<string | null>>
  tplMsg: string | null
  setTplMsg: Dispatch<SetStateAction<string | null>>
  submitTemplate: (e: React.FormEvent) => void
  applyTplPreset: (dayIdxs: number[], start: number, end: number) => void
  durationMin: number
}

export function TemplateSheet({ tplOpen, setTplOpen, tplDays, setTplDays, tplStartHour, setTplStartHour, tplEndHour, setTplEndHour, tplWeeks, setTplWeeks, tplSaving, tplErr, setTplErr, tplMsg, setTplMsg, submitTemplate, applyTplPreset, durationMin }: Props) {
  return (
  <Sheet
    open={tplOpen}
    onClose={() => { setTplOpen(false); setTplErr(null); setTplMsg(null) }}
    size="md"
    busy={tplSaving}
    title="ყოველკვირეული განრიგი"
    footer={
      <>
        <Btn variant="ghost" size="md" type="button" onClick={() => { setTplOpen(false); setTplErr(null); setTplMsg(null) }}>გაუქმება</Btn>
        <Btn variant="primary" size="md" type="submit" form="weekly-template-form" disabled={tplSaving}>
          {tplSaving ? 'იქმნება…' : 'შექმნა'}
        </Btn>
      </>
    }
  >
        <p className="text-small text-ink-500 mb-4 leading-snug">
          ორშ–პარ 10:00–18:00 უკვე მონიშნულია — გამორთე დღეები ან შეცვალე საათები, თუ სხვანაირად გირჩევნია. თითოეული დღე ერთ თავისუფალ შუალედად დაემატება და გამეორდება არჩეულ კვირებზე; სტუდენტი დაწყებას შუალედის შიგნით აირჩევს, სერვისის ხანგრძლივობის მიხედვით. საათები თბილისის დროითაა (UTC+4); გადამფარავი შუალედები გამოტოვდება.
        </p>
        <form id="weekly-template-form" onSubmit={submitTemplate} className="space-y-5">
          <div>
            <Eyebrow as="span" tone="muted" className="block mb-2">სწრაფი შაბლონები</Eyebrow>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: 'სრული განაკვეთი (ორშ–პარ, 10:00–18:00)', days: [0, 1, 2, 3, 4], start: 10, end: 18 },
                { label: 'ორშ–შაბ, 10:00–18:00', days: [0, 1, 2, 3, 4, 5], start: 10, end: 18 },
                { label: 'ყოველდღე, 10:00–20:00', days: [0, 1, 2, 3, 4, 5, 6], start: 10, end: 20 },
              ].map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyTplPreset(p.days, p.start, p.end)}
                  className="h-8 px-3 rounded-pill border border-ink-200 bg-white text-ink-700 text-meta font-display font-semibold inline-flex items-center hover:border-ink-300 hover:bg-ink-50 transition-colors duration-fast"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2 gap-2">
              {/* Not a <label>: this heads a group of toggle BUTTONS, not a
                  form control — a label with nothing to point at is a lie to
                  screen readers. Named via aria-labelledby on the group. */}
              <Eyebrow as="span" id="tpl-days-label" tone="muted">დღეები</Eyebrow>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setTplDays([true, true, true, true, true, false, false])}
                  className="h-7 px-2 rounded-btn text-meta font-display font-semibold text-ink-500 hover:text-ink-800 hover:bg-ink-50 transition-colors duration-fast"
                >
                  სამუშაო დღეები
                </button>
                <button
                  type="button"
                  onClick={() => setTplDays([true, true, true, true, true, true, true])}
                  className="h-7 px-2 rounded-btn text-meta font-display font-semibold text-ink-500 hover:text-ink-800 hover:bg-ink-50 transition-colors duration-fast"
                >
                  ყველა
                </button>
                <button
                  type="button"
                  onClick={() => setTplDays([false, false, false, false, false, false, false])}
                  className="h-7 px-2 rounded-btn text-meta font-display font-semibold text-ink-500 hover:text-ink-800 hover:bg-ink-50 transition-colors duration-fast"
                >
                  გასუფთავება
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1.5" role="group" aria-labelledby="tpl-days-label">
              {DAY_LABELS.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  aria-pressed={tplDays[i]}
                  onClick={() => setTplDays(prev => prev.map((v, j) => j === i ? !v : v))}
                  className={`h-11 rounded-btn font-display font-bold text-meta tracking-wide border transition-colors duration-fast ${
                    tplDays[i]
                      ? 'bg-brand-600 border-brand-600 text-white'
                      : 'bg-white border-ink-200 text-ink-700 hover:border-ink-300'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Eyebrow as="label" htmlFor="tpl-start" tone="muted" className="block mb-1.5">დაწყება</Eyebrow>
              <select id="tpl-start" value={tplStartHour} onChange={e => setTplStartHour(Number(e.target.value))}
                      className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none">
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                ))}
              </select>
            </div>
            <div>
              <Eyebrow as="label" htmlFor="tpl-end" tone="muted" className="block mb-1.5">დასრულება</Eyebrow>
              <select id="tpl-end" value={tplEndHour} onChange={e => setTplEndHour(Number(e.target.value))}
                      className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none">
                {Array.from({ length: 24 }, (_, h) => h + 1).map(h => (
                  <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            {/* Button group, not a control — see the „დღეები" note above. */}
            <Eyebrow as="span" id="tpl-weeks-label" tone="muted" className="block mb-1.5">კვირების რაოდენობა</Eyebrow>
            <div className="flex gap-1.5" role="group" aria-labelledby="tpl-weeks-label">
              {[1, 2, 4, 8, 12].map(w => (
                <button
                  key={w}
                  type="button"
                  aria-pressed={tplWeeks === w}
                  onClick={() => setTplWeeks(w)}
                  className={`h-11 flex-1 rounded-btn font-display font-bold text-small tabular-nums border transition-colors duration-fast ${
                    tplWeeks === w
                      ? 'bg-brand-600 border-brand-600 text-white'
                      : 'bg-white border-ink-200 text-ink-700 hover:border-ink-300'
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
          {/* Estimate in the SAME unit as the rest of the screen: how many
              windows and how much free time they add up to. Session counts
              can't be promised here — the client's service decides them. */}
          <div className="rounded-btn bg-ink-50 border border-ink-200 px-3 py-2.5 text-small text-ink-700">
            {(() => {
              const days = tplDays.filter(Boolean).length
              const windowMin = Math.max(0, (tplEndHour - tplStartHour) * 60)
              const count = days * tplWeeks
              const total = count * windowMin
              return total > 0
                ? (
                  <>
                    დაახლ. <span className="font-display font-bold tabular-nums">{count}</span> შუალედი · სულ{' '}
                    <span className="font-display font-bold tabular-nums">{fmtDur(total)}</span> თავისუფალი დრო
                    <span className="block text-meta text-ink-500 mt-0.5">შენი ნაგულისხმევი სესია — {durationMin} წთ.</span>
                  </>
                )
                : <>აირჩიე დღეები და დროის დიაპაზონი</>
            })()}
          </div>
          {tplErr && (
            <div className="p-2.5 rounded-btn bg-danger-50 border border-danger-200 text-danger-700 text-small">
              {tplErr}
            </div>
          )}
          {tplMsg && (
            <div className="p-2.5 rounded-btn bg-success-50 border border-success-200 text-success-800 text-small">
              {tplMsg}
            </div>
          )}
        </form>
  </Sheet>
  )
}
