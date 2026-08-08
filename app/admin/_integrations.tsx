'use client'
import React, { useEffect, useState } from 'react'
import { Icon } from '@/components/Icon'
import { AdminConfirmDialog, TabHeader, AdminError } from './_parts'

type State = { gaId: string; headerHtml: string; footerHtml: string }
type Field = keyof State
// components/Analytics.tsx falls back to NEXT_PUBLIC_GA_ID when the DB value is
// empty, so „ამოშლა" does NOT necessarily turn GA off. The API reports whether
// such an env id exists; the badge and copy must say so rather than claim
// „გამორთული" while GA keeps loading. (Analytics.tsx itself is untouched here —
// removing the env fallback is a separate call.)
type Loaded = State & { envGaId?: string }

export const IntegrationsSection = () => {
  const [saved, setSaved] = useState<State | null>(null)
  const [envGaId, setEnvGaId] = useState('')
  const [draft, setDraft] = useState<State>({ gaId: '', headerHtml: '', footerHtml: '' })
  const [err, setErr] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)
  const [busy, setBusy] = useState<Field | null>(null)
  // Saving raw header/footer code injects arbitrary JS into EVERY visitor's
  // every page — that earns a confirm dialog showing exactly what will run.
  // Clearing (reset) stays one click: removing code is the safe direction.
  const [pendSave, setPendSave] = useState<'headerHtml' | 'footerHtml' | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/integrations', { cache: 'no-store' })
        if (!res.ok) throw new Error()
        const data: Loaded = await res.json()
        if (!cancelled) {
          const { gaId, headerHtml, footerHtml } = data
          setSaved({ gaId, headerHtml, footerHtml })
          setDraft({ gaId, headerHtml, footerHtml })
          setEnvGaId((data.envGaId ?? '').trim())
        }
      } catch { if (!cancelled) setErr('ჩატვირთვა ვერ მოხერხდა.') }
    })()
    return () => { cancelled = true }
  }, [])

  const patch = async (field: Field, opts: { reset?: boolean } = {}) => {
    setBusy(field); setFlash(null)
    const value = opts.reset ? '' : draft[field]
    try {
      const res = await fetch('/api/admin/integrations', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ field, value, reset: opts.reset }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) {
        if (j.error === 'BAD_GA_ID') { setFlash({ kind: 'error', msg: 'GA ID არასწორია — ფორმატი: G-XXXXXXXX.' }); return }
        throw new Error()
      }
      const newVal = opts.reset ? '' : value
      setSaved(s => ({ ...(s ?? draft), [field]: newVal }))
      setDraft(d => ({ ...d, [field]: newVal }))
      setFlash({
        kind: 'success',
        msg: opts.reset
          // Don't claim „გამორთულია" when the env fallback keeps GA running.
          ? (field === 'gaId' && envGaId
            ? 'ამოიშალა — მაგრამ GA მაინც მუშაობს NEXT_PUBLIC_GA_ID-ით.'
            : 'ამოიშალა — გამორთულია.')
          : 'შენახულია — ცოცხალია საიტზე.',
      })
    } catch { setFlash({ kind: 'error', msg: 'ვერ შეინახა — სცადე თავიდან.' }) }
    finally { setBusy(null) }
  }

  // GA runs when EITHER the DB id or the env fallback is set — the badge must
  // reflect what visitors actually get, not just what this panel stores.
  const envOnly = !saved?.gaId && !!envGaId
  const gaActive = !!saved?.gaId || envOnly
  const dirty = (f: Field) => saved !== null && draft[f] !== saved[f]

  return (
    <>
      <TabHeader
        eyebrow="ინტეგრაციები"
        title="ინტეგრაციები · ჰედერი / ფუტერი"
        sub="ჩასვი Google Analytics ან სხვა კოდი ჰედერსა და ფუტერში. ცვლილება მაშინვე ცოცხლდება — deploy არ სჭირდება. ამოსაშლელად გაასუფთავე და შეინახე."
      />

      <section className="px-6 lg:px-8 py-6 max-w-[760px] flex flex-col gap-6">
        {err && <AdminError message={err} />}
        {flash && (
          <div role="alert" className={`rounded-btn border px-3 py-2 text-small font-medium ${flash.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>{flash.msg}</div>
        )}

        {/* Google Analytics */}
        <div className="rounded-card border border-ink-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3 mb-1">
            <h2 className="font-display text-body-lg font-bold text-ink-900">Google Analytics</h2>
            <span className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-pill text-micro font-bold uppercase ${gaActive ? 'bg-success-100 text-success-800' : 'bg-ink-100 text-ink-500'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${gaActive ? 'bg-success-500' : 'bg-ink-400'}`} /> {gaActive ? (envOnly ? 'აქტიური · env' : 'აქტიური') : 'გამორთული'}
            </span>
          </div>
          <p className="text-small text-ink-500 leading-relaxed mb-3">Measurement ID (მაგ. <code className="text-ink-600">G-XXXXXXXX</code>). იტვირთება მხოლოდ ქუქი-თანხმობის შემდეგ.</p>
          {/* Honest note: with NEXT_PUBLIC_GA_ID set, clearing this field does NOT
              stop GA — the code falls back to the env id until it's removed on Railway. */}
          {envGaId && (
            <p className="text-meta text-warning-700 leading-relaxed mb-3">
              გარემოს ცვლადში (<code>NEXT_PUBLIC_GA_ID</code>) მითითებულია <code className="font-mono">{envGaId}</code>
              {saved?.gaId
                ? ' — აქ შენახული ID-ს ენიჭება უპირატესობა.'
                : ' — ეს ID მუშაობს ახლაც. აქედან „ამოშლა“ მას ვერ გამორთავს: წაშალე ცვლადი Railway-ზე.'}
            </p>
          )}
          <div className="flex gap-2">
            <input value={draft.gaId} onChange={e => setDraft(d => ({ ...d, gaId: e.target.value }))} placeholder="G-XXXXXXXX" className="flex-1 h-11 px-3 rounded-btn border border-ink-200 text-small font-mono focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-shadow duration-fast" />
            <button type="button" onClick={() => patch('gaId')} disabled={!dirty('gaId') || busy === 'gaId'} className="h-11 px-4 rounded-btn bg-ink-900 hover:bg-ink-800 disabled:bg-ink-100 disabled:text-ink-500 text-white font-display font-semibold text-small transition-colors duration-fast shrink-0">{busy === 'gaId' ? '…' : 'შენახვა'}</button>
            {gaActive && <button type="button" onClick={() => patch('gaId', { reset: true })} disabled={busy === 'gaId'} className="h-11 px-3 rounded-btn text-danger-600 hover:bg-danger-50 font-display text-meta font-semibold transition-colors duration-fast shrink-0">ამოშლა</button>}
          </div>
        </div>

        {/* Header / Footer raw code */}
        {([
          { f: 'headerHtml' as Field, title: 'ჰედერის კოდი', where: '<head>-ში ჩაისმის', ph: '<!-- მაგ. Search Console, Meta Pixel, სხვა tracking -->' },
          { f: 'footerHtml' as Field, title: 'ფუტერის კოდი', where: 'ფურცლის ბოლოს ჩაისმის', ph: '<!-- მაგ. chat widget, სხვა სკრიპტი -->' },
        ]).map(({ f, title, where, ph }) => {
          const active = !!saved?.[f]
          return (
            <div key={f} className="rounded-card border border-ink-200 bg-white p-5">
              <div className="flex items-center justify-between gap-3 mb-1">
                <h2 className="font-display text-body-lg font-bold text-ink-900">{title}</h2>
                <span className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-pill text-micro font-bold uppercase ${active ? 'bg-success-100 text-success-800' : 'bg-ink-100 text-ink-500'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-success-500' : 'bg-ink-400'}`} /> {active ? 'ჩასმულია' : 'ცარიელი'}
                </span>
              </div>
              <p className="text-small text-ink-500 leading-relaxed mb-3">{where}. ⚠️ სრული HTML/JavaScript — ჩასვი მხოლოდ სანდო კოდი.</p>
              <textarea value={draft[f]} onChange={e => setDraft(d => ({ ...d, [f]: e.target.value }))} rows={5} placeholder={ph} className="w-full px-3 py-2.5 rounded-btn border border-ink-200 text-small font-mono leading-relaxed focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none resize-y transition-shadow duration-fast" />
              <div className="mt-2.5 flex items-center gap-2">
                <button type="button" onClick={() => setPendSave(f as 'headerHtml' | 'footerHtml')} disabled={!dirty(f) || busy === f} className="h-9 px-4 rounded-btn bg-ink-900 hover:bg-ink-800 disabled:bg-ink-100 disabled:text-ink-500 text-white font-display font-semibold text-small transition-colors duration-fast">{busy === f ? '…' : 'შენახვა'}</button>
                {active && <button type="button" onClick={() => patch(f, { reset: true })} disabled={busy === f} className="h-9 px-3 rounded-btn text-danger-600 hover:bg-danger-50 font-display text-meta font-semibold transition-colors duration-fast inline-flex items-center gap-1.5"><Icon.close className="w-3.5 h-3.5" /> ამოშლა</button>}
              </div>
            </div>
          )
        })}
      </section>
      <AdminConfirmDialog
        open={pendSave !== null}
        title={pendSave === 'headerHtml' ? 'ჰედერის კოდის ჩასმა' : 'ფუტერის კოდის ჩასმა'}
        body={<>
          ეს კოდი გაეშვება ყველა ვიზიტორის ყველა გვერდზე — შეცდომა ან მავნე სკრიპტი მთელ საიტს გაჰყვება. ზუსტად ეს ჩაისმის:
          <span className="mt-2 block max-h-40 overflow-y-auto rounded-btn border border-ink-200 bg-ink-50 p-2.5 font-mono text-micro text-ink-800 whitespace-pre-wrap break-all">
            {pendSave ? (draft[pendSave].trim() || '— ცარიელი —') : ''}
          </span>
        </>}
        tone="danger"
        confirmLabel="ჩასვი საიტზე"
        onCancel={() => setPendSave(null)}
        onConfirm={async () => {
          const f = pendSave
          setPendSave(null)
          if (f) await patch(f)
        }}
      />
    </>
  )
}
