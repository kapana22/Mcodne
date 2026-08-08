'use client'
import React, { useState } from 'react'
import { Icon } from '@/components/Icon'
import { PRIMARY_LANGUAGES, langLabel, toLangCode } from '@/lib/languages'

/**
 * Three chips and a text field — the language picker for every surface that
 * collects languages (/tutor/profile, /apply).
 *
 * WHY IT ISN'T THIRTEEN CHIPS ANYMORE. Measured 2026-07-31 across all twelve
 * profiles: ka×11, en×5, ru×1, de×1. Four languages in use; thirteen chips on
 * screen to express them, in a form that is already long enough that people
 * abandon it. The other ten were not a choice anyone was making — they were a
 * wall to scroll past.
 *
 * Nothing was removed, only un-shown:
 *  - a typed entry runs through `toLangCode`, so „French", „ფრანგული", „fr" and
 *    „fr-FR" all land on the same canonical code the browse filter speaks;
 *  - an unrecognized entry is REFUSED with a visible reason, never stored — the
 *    whole point of lib/languages.ts is that a raw name in this array shows the
 *    expert zero selected chips and duplicates their card's language line;
 *  - any code already on the profile renders as its own chip, so the one expert
 *    with German keeps German without doing anything.
 */
export function LanguagePicker({
  value,
  onChange,
  idPrefix = 'lang',
}: {
  /** Canonical ISO-639-1 codes. */
  value: string[]
  onChange: (codes: string[]) => void
  idPrefix?: string
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const primary = PRIMARY_LANGUAGES.map(l => l.code)
  // Anything on the profile that isn't one of the three gets its own chip, in
  // the order it was added — otherwise editing would silently drop it.
  const extras = value.filter(c => !primary.includes(c as never))

  const toggle = (code: string) =>
    onChange(value.includes(code) ? value.filter(c => c !== code) : [...value, code])

  const submit = () => {
    const code = toLangCode(draft)
    if (!code) { setErr('ვერ ვცანი ეს ენა — სცადე მისი სახელი ქართულად ან ინგლისურად'); return }
    if (!value.includes(code)) onChange([...value, code])
    setDraft(''); setErr(null); setAdding(false)
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {[...PRIMARY_LANGUAGES, ...extras.map(c => ({ code: c, label: langLabel(c) }))].map(l => {
          const active = value.includes(l.code)
          return (
            <button
              key={l.code}
              type="button"
              onClick={() => toggle(l.code)}
              aria-pressed={active}
              className={`h-9 px-3 rounded-pill border text-small font-display font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 ${
                active ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-ink-200 text-ink-700 hover:border-ink-300'
              }`}
            >
              {l.label}
            </button>
          )
        })}

        {!adding && (
          <button
            type="button"
            onClick={() => { setAdding(true); setErr(null) }}
            className="h-9 px-3 rounded-pill border border-dashed border-ink-300 text-small font-display font-semibold text-ink-600 hover:border-ink-400 hover:text-ink-800 inline-flex items-center gap-1.5 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
          >
            <Icon.plus className="w-3.5 h-3.5" /> სხვა ენა
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <input
              id={`${idPrefix}-add`}
              autoFocus
              value={draft}
              onChange={e => { setDraft(e.target.value); setErr(null) }}
              // Enter must not submit the surrounding form — on /apply that
              // would advance the step with the language unsaved.
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); submit() }
                if (e.key === 'Escape') { setAdding(false); setDraft(''); setErr(null) }
              }}
              maxLength={40}
              placeholder="მაგ. გერმანული"
              aria-label="დაამატე ენა"
              aria-invalid={!!err}
              className="h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 focus:border-brand-400 focus:outline-none w-full max-w-[240px]"
            />
            <button
              type="button"
              onClick={submit}
              // Secondary, deliberately. `bg-ink-900` is the admin panel's save
              // colour and brand green belongs to the step's own CTA — a third
              // filled button on the same screen would compete with the action
              // that actually moves the form forward.
              className="h-11 px-4 rounded-btn bg-white border border-ink-300 hover:border-ink-400 hover:bg-ink-50 text-ink-800 font-display text-small font-semibold tracking-wide transition-colors duration-fast"
            >
              დამატება
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setDraft(''); setErr(null) }}
              aria-label="გაუქმება"
              className="w-10 h-10 rounded-btn text-ink-500 hover:bg-ink-50 inline-flex items-center justify-center transition-colors duration-fast"
            >
              <Icon.close className="w-4 h-4" />
            </button>
          </div>
          {err && <div role="alert" className="mt-2 text-meta text-danger-700">{err}</div>}
        </div>
      )}
    </div>
  )
}
