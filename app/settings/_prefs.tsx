'use client'
// /settings — the notification preference toggles.

import { prefRows, type Me, type PrefKey, type PrefsMap, type Msg } from './_types'

type Props = {
  me: Me
  prefs: PrefsMap | null
  prefsMsg: Msg
  savingKey: PrefKey | null
  togglePref: (key: PrefKey) => void
}

export function PrefsSection({ me, prefs, prefsMsg, savingKey, togglePref }: Props) {
  return (
    <section className="bg-white rounded-card border border-ink-200 p-6 lg:p-8">
      <div className="mb-5">
        <h2 className="font-display text-h3 font-bold text-ink-900 tracking-tight">შეტყობინებები</h2>
        <p className="text-small text-ink-500 mt-0.5">აირჩიე, რა მიიღო</p>
      </div>

      {!prefs ? (
        <div className="text-small text-ink-500">იტვირთება…</div>
      ) : (
        <ul className="divide-y divide-ink-100">
          {prefRows(me.role).map(row => {
            const value = prefs[row.key]
            const busy = savingKey === row.key
            return (
              /* Switch is a 44×44 tap target (canon floor 40px); the visible
                 track keeps its 44×24 proportions inside it. */
              <li key={row.key} className="py-3.5 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-display text-body font-semibold text-ink-900">{row.label}</div>
                  <div className="text-meta text-ink-500 mt-0.5">{row.hint}</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={value}
                  // The visible label lives in a SIBLING div, so a screen
                  // reader announced five identical „switch, on" controls
                  // with no way to tell which setting it was reading.
                  aria-label={row.label}
                  disabled={busy}
                  onClick={() => togglePref(row.key)}
                  className="shrink-0 h-11 rounded-btn inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <span className={`relative block w-11 h-6 rounded-full transition-colors duration-fast ${value ? 'bg-brand-500' : 'bg-ink-200'} ${busy ? 'opacity-60' : ''}`}>
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-fast ${value ? 'translate-x-5' : 'translate-x-0'}`}
                    />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {prefsMsg && (
        <div role="alert" className={`mt-4 rounded-btn border px-3 py-2 text-small font-medium ${prefsMsg.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>
          {prefsMsg.text}
        </div>
      )}
    </section>
  )
}
