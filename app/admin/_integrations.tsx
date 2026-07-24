'use client'
import React, { useEffect, useState } from 'react'
import { Icon } from '@/components/Icon'
import { TabHeader } from './_parts'

type State = { gaId: string; headerHtml: string; footerHtml: string }
type Field = keyof State

export const IntegrationsSection = () => {
  const [saved, setSaved] = useState<State | null>(null)
  const [draft, setDraft] = useState<State>({ gaId: '', headerHtml: '', footerHtml: '' })
  const [err, setErr] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)
  const [busy, setBusy] = useState<Field | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/integrations')
        if (!res.ok) throw new Error()
        const data: State = await res.json()
        if (!cancelled) { setSaved(data); setDraft(data) }
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
      setFlash({ kind: 'success', msg: opts.reset ? 'ამოიშალა — გამორთულია.' : 'შენახულია — ცოცხალია საიტზე.' })
    } catch { setFlash({ kind: 'error', msg: 'ვერ შეინახა — სცადე თავიდან.' }) }
    finally { setBusy(null) }
  }

  const gaActive = !!saved?.gaId
  const dirty = (f: Field) => saved !== null && draft[f] !== saved[f]

  return (
    <>
      <TabHeader
        eyebrow="ინტეგრაციები"
        title="ინტეგრაციები · ჰედერი / ფუტერი"
        sub="ჩასვი Google Analytics ან სხვა კოდი ჰედერსა და ფუტერში. ცვლილება მაშინვე ცოცხლდება — deploy არ სჭირდება. ამოსაშლელად გაასუფთავე და შეინახე."
      />

      <section className="px-6 lg:px-8 py-6 max-w-[760px] flex flex-col gap-6">
        {err && <div className="p-3 rounded-btn bg-danger-50 border border-danger-200 text-danger-700 text-[13px]">{err}</div>}
        {flash && (
          <div role="alert" className={`rounded-btn border px-3 py-2 text-[12.5px] font-medium ${flash.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>{flash.msg}</div>
        )}

        {/* Google Analytics */}
        <div className="rounded-card border border-ink-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3 mb-1">
            <h2 className="font-display text-[15px] font-bold text-ink-900">Google Analytics</h2>
            <span className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-pill text-[10px] font-bold uppercase tracking-wide ${gaActive ? 'bg-success-100 text-success-800' : 'bg-ink-100 text-ink-500'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${gaActive ? 'bg-success-500' : 'bg-ink-400'}`} /> {gaActive ? 'აქტიური' : 'გამორთული'}
            </span>
          </div>
          <p className="text-[12.5px] text-ink-500 leading-relaxed mb-3">Measurement ID (მაგ. <code className="text-ink-600">G-XXXXXXXX</code>). იტვირთება მხოლოდ ქუქი-თანხმობის შემდეგ.</p>
          <div className="flex gap-2">
            <input value={draft.gaId} onChange={e => setDraft(d => ({ ...d, gaId: e.target.value }))} placeholder="G-XXXXXXXX" className="flex-1 h-10 px-3 rounded-btn border border-ink-200 text-[13px] font-mono focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-shadow" />
            <button type="button" onClick={() => patch('gaId')} disabled={!dirty('gaId') || busy === 'gaId'} className="h-10 px-4 rounded-btn bg-ink-900 hover:bg-ink-800 disabled:bg-ink-200 disabled:text-ink-400 text-white font-display font-semibold text-[12.5px] transition-colors shrink-0">{busy === 'gaId' ? '…' : 'შენახვა'}</button>
            {gaActive && <button type="button" onClick={() => patch('gaId', { reset: true })} disabled={busy === 'gaId'} className="h-10 px-3 rounded-btn text-danger-600 hover:bg-danger-50 font-display text-[12px] font-semibold transition-colors shrink-0">ამოშლა</button>}
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
                <h2 className="font-display text-[15px] font-bold text-ink-900">{title}</h2>
                <span className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-pill text-[10px] font-bold uppercase tracking-wide ${active ? 'bg-success-100 text-success-800' : 'bg-ink-100 text-ink-500'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-success-500' : 'bg-ink-400'}`} /> {active ? 'ჩასმულია' : 'ცარიელი'}
                </span>
              </div>
              <p className="text-[12.5px] text-ink-500 leading-relaxed mb-3">{where}. ⚠️ სრული HTML/JavaScript — ჩასვი მხოლოდ სანდო კოდი.</p>
              <textarea value={draft[f]} onChange={e => setDraft(d => ({ ...d, [f]: e.target.value }))} rows={5} placeholder={ph} className="w-full px-3 py-2.5 rounded-btn border border-ink-200 text-[12.5px] font-mono leading-relaxed focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none resize-y transition-shadow" />
              <div className="mt-2.5 flex items-center gap-2">
                <button type="button" onClick={() => patch(f)} disabled={!dirty(f) || busy === f} className="h-9 px-4 rounded-btn bg-ink-900 hover:bg-ink-800 disabled:bg-ink-200 disabled:text-ink-400 text-white font-display font-semibold text-[12.5px] transition-colors">{busy === f ? '…' : 'შენახვა'}</button>
                {active && <button type="button" onClick={() => patch(f, { reset: true })} disabled={busy === f} className="h-9 px-3 rounded-btn text-danger-600 hover:bg-danger-50 font-display text-[12px] font-semibold transition-colors inline-flex items-center gap-1.5"><Icon.close className="w-3.5 h-3.5" /> ამოშლა</button>}
              </div>
            </div>
          )
        })}
      </section>
    </>
  )
}
