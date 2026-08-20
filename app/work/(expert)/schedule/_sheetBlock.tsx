'use client'
// /tutor/schedule — the „დაბლოკე დრო“ sheet.

import type { Dispatch, SetStateAction } from 'react'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { Sheet } from '@/components/Sheet'
import { Eyebrow } from '@/components/Eyebrow'
import { tbDateValue } from './_shared'

type Props = {
  blockOpen: boolean
  setBlockOpen: Dispatch<SetStateAction<boolean>>
  blockForm: { from: string; to: string }
  setBlockForm: Dispatch<SetStateAction<{ from: string; to: string }>>
  blocking: boolean
  blockErr: string | null
  setBlockErr: Dispatch<SetStateAction<string | null>>
  submitBlockOff: (e: React.FormEvent) => void
}

export function BlockOffSheet({ blockOpen, setBlockOpen, blockForm, setBlockForm, blocking, blockErr, setBlockErr, submitBlockOff }: Props) {
  return (
  <Sheet
    open={blockOpen}
    onClose={() => { setBlockOpen(false); setBlockErr(null) }}
    size="sm"
    busy={blocking}
    title="შვებულების პერიოდი"
    footer={
      <>
        <Btn variant="ghost" size="md" type="button" onClick={() => { setBlockOpen(false); setBlockErr(null) }}>გაუქმება</Btn>
        <Btn variant="primary" size="md" type="submit" form="block-off-form" disabled={blocking}>
          {blocking ? 'იშლება…' : 'დაბლოკვა'}
        </Btn>
      </>
    }
  >
        <p className="text-small text-ink-500 mb-4 leading-snug">ამ პერიოდის ყველა <span className="font-display font-semibold text-ink-700">თავისუფალი</span> შუალედი წაიშლება. ჯავშნები არ დაზარალდება.</p>
        <form id="block-off-form" onSubmit={submitBlockOff} className="space-y-4">
          <div>
            <Eyebrow as="label" htmlFor="block-from" tone="muted" className="block mb-1.5">დაწყება</Eyebrow>
            {/* min = TODAY IN TBILISI (tbDateValue). toISOString() is UTC and
                between 00:00–04:00 Tbilisi still says yesterday. */}
            <input id="block-from" type="date" required value={blockForm.from} min={tbDateValue(new Date())}
                   onChange={e => setBlockForm({ ...blockForm, from: e.target.value })}
                   className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none" />
          </div>
          <div>
            <Eyebrow as="label" htmlFor="block-to" tone="muted" className="block mb-1.5">დასრულება</Eyebrow>
            <input id="block-to" type="date" required value={blockForm.to} min={blockForm.from || tbDateValue(new Date())}
                   onChange={e => setBlockForm({ ...blockForm, to: e.target.value })}
                   className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none" />
          </div>
          {blockErr && (
            <div className="p-2.5 rounded-btn bg-danger-50 border border-danger-200 text-danger-700 text-small">
              {blockErr}
            </div>
          )}
        </form>
  </Sheet>
  )
}
