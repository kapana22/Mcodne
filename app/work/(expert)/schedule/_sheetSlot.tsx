'use client'
// /tutor/schedule — the add/edit window sheet.

import type { Dispatch, SetStateAction } from 'react'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { Sheet } from '@/components/Sheet'
import { fmtDur, fmtTime } from './_shared'
import { Eyebrow } from '@/components/Eyebrow'
import { MAX_WINDOW_MS, windowErrorMessage } from '@/lib/availabilityRules'

type Props = {
  modalOpen: boolean
  setModalOpen: Dispatch<SetStateAction<boolean>>
  form: { date: string; start: string; durMin: number; editId: string | null }
  setForm: Dispatch<SetStateAction<{ date: string; start: string; durMin: number; editId: string | null }>>
  saving: boolean
  modalErr: string | null
  setModalErr: Dispatch<SetStateAction<string | null>>
  submitSlot: (e: React.FormEvent) => void
  formRange: () => { start: Date; end: Date } | null
}

export function SlotSheet({ modalOpen, setModalOpen, form, setForm, saving, modalErr, setModalErr, submitSlot, formRange }: Props) {
  return (
  <Sheet
    open={modalOpen}
    onClose={() => { setModalOpen(false); setModalErr(null) }}
    size="sm"
    busy={saving}
    title={form.editId ? 'შუალედის შეცვლა' : 'თავისუფალი დროის დამატება'}
    footer={
      <>
        <Btn variant="ghost" size="md" type="button" onClick={() => { setModalOpen(false); setModalErr(null) }}>გაუქმება</Btn>
        <Btn variant="primary" size="md" type="submit" form="add-slot-form" disabled={saving}>
          {saving ? 'ინახება…' : form.editId ? 'შენახვა' : 'დამატება'}
        </Btn>
      </>
    }
  >
        <form id="add-slot-form" onSubmit={submitSlot} className="space-y-4">
          <p className="text-small text-ink-500 leading-snug">
            მიუთითე შუალედი, რომელშიც თავისუფალი ხარ — კლიენტი დაწყებას მის შიგნით აირჩევს, სერვისის ხანგრძლივობის მიხედვით. დრო თბილისის დროითაა (UTC+4) — სწორედ ასე დაინახავს კლიენტი.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Eyebrow as="label" htmlFor="slot-date" tone="muted" className="block mb-1.5">დღე</Eyebrow>
              <input id="slot-date" type="date" required value={form.date}
                     onChange={e => setForm({ ...form, date: e.target.value })}
                     className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none" />
            </div>
            <div>
              <Eyebrow as="label" htmlFor="slot-start" tone="muted" className="block mb-1.5">დაწყება</Eyebrow>
              {/* 15-minute steps: the granularity real availability is
                  published at, and it keeps the native picker short. */}
              <input id="slot-start" type="time" required step={900} value={form.start}
                     onChange={e => setForm({ ...form, start: e.target.value })}
                     className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 tabular-nums focus:border-brand-400 focus:outline-none" />
            </div>
          </div>

          {/* LENGTH, not an end time. The end is arithmetic — asking for it
              was asking the expert to do the sum, and to re-enter the date
              to do it. Chips cover what people actually publish; ±30წთ
              covers everything else without a second picker. */}
          <div>
            <Eyebrow as="span" id="slot-dur-label" tone="muted" className="block mb-1.5">ხანგრძლივობა</Eyebrow>
            <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="slot-dur-label">
              {[60, 120, 180, 240, 480].map(m => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={form.durMin === m}
                  onClick={() => setForm({ ...form, durMin: m })}
                  className={`h-11 px-3.5 rounded-pill border font-display text-small font-semibold tabular-nums inline-flex items-center transition-colors duration-fast ${
                    form.durMin === m
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white text-ink-700 border-ink-200 hover:border-ink-400'
                  }`}
                >
                  {fmtDur(m)}
                </button>
              ))}
              <span className="inline-flex items-center gap-1">
                <button
                  type="button"
                  aria-label="ხანგრძლივობის შემცირება ნახევარი საათით"
                  disabled={form.durMin <= 30}
                  onClick={() => setForm({ ...form, durMin: Math.max(30, form.durMin - 30) })}
                  className="w-11 h-11 rounded-btn border border-ink-200 bg-white text-ink-600 hover:border-ink-400 disabled:opacity-40 inline-flex items-center justify-center transition-colors duration-fast"
                >−30</button>
                <button
                  type="button"
                  aria-label="ხანგრძლივობის გაზრდა ნახევარი საათით"
                  disabled={form.durMin >= MAX_WINDOW_MS / 60_000}
                  onClick={() => setForm({ ...form, durMin: Math.min(MAX_WINDOW_MS / 60_000, form.durMin + 30) })}
                  className="w-11 h-11 rounded-btn border border-ink-200 bg-white text-ink-600 hover:border-ink-400 disabled:opacity-40 inline-flex items-center justify-center transition-colors duration-fast"
                >+30</button>
              </span>
            </div>
          </div>

          {/* Exactly what will be published, in the expert's own words,
              before they commit to it. */}
          {(() => {
            const r = formRange()
            if (!r) return null
            return (
              <p className="rounded-btn bg-ink-50 border border-ink-200 px-3 py-2.5 text-small text-ink-800">
                <span className="font-display font-bold tabular-nums">{fmtTime(r.start.toISOString())}–{fmtTime(r.end.toISOString())}</span>
                <span className="text-ink-500"> · {fmtDur(form.durMin)} · გამოქვეყნდება როგორც ერთი შუალედი</span>
              </p>
            )
          })()}

          {modalErr && (
            <div role="alert" className="p-2.5 rounded-btn bg-danger-50 border border-danger-200 text-danger-700 text-small">
              {modalErr}
            </div>
          )}
        </form>
  </Sheet>
  )
}
