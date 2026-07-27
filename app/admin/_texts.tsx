'use client'
import React, { useEffect, useMemo, useState } from 'react'
import { TabHeader } from './_parts'

type Item = {
  key: string; group: string; label: string; multiline: boolean
  default: string; value: string; overridden: boolean
}

export const SiteTextsSection = () => {
  const [items, setItems] = useState<Item[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/site-texts')
        if (!res.ok) throw new Error()
        const data: Item[] = await res.json()
        if (!cancelled) {
          setItems(data)
          setDrafts(Object.fromEntries(data.map(i => [i.key, i.value])))
        }
      } catch { if (!cancelled) setErr('ტექსტების ჩატვირთვა ვერ მოხერხდა.') }
    })()
    return () => { cancelled = true }
  }, [])

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const match = (it: Item) =>
      !needle ||
      it.label.toLowerCase().includes(needle) ||
      it.key.toLowerCase().includes(needle) ||
      it.value.toLowerCase().includes(needle)
    const m = new Map<string, Item[]>()
    for (const it of items ?? []) {
      if (!match(it)) continue
      const a = m.get(it.group) ?? []; a.push(it); m.set(it.group, a)
    }
    return [...m.entries()]
  }, [items, q])

  const save = async (key: string) => {
    const value = drafts[key] ?? ''
    setBusy(key); setFlash(null)
    try {
      const res = await fetch('/api/admin/site-texts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error()
      setItems(prev => (prev ?? []).map(i => i.key === key ? { ...i, value, overridden: value !== i.default } : i))
      setFlash({ kind: 'success', msg: 'შენახულია — ცოცხალია საიტზე.' })
    } catch { setFlash({ kind: 'error', msg: 'ვერ შეინახა — სცადე თავიდან.' }) }
    finally { setBusy(null) }
  }

  const reset = async (key: string) => {
    setBusy(key); setFlash(null)
    try {
      const res = await fetch('/api/admin/site-texts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, reset: true }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error()
      const def = (items ?? []).find(i => i.key === key)?.default ?? ''
      setItems(prev => (prev ?? []).map(i => i.key === key ? { ...i, value: def, overridden: false } : i))
      setDrafts(d => ({ ...d, [key]: def }))
      setFlash({ kind: 'success', msg: 'დაბრუნდა ნაგულისხმევზე.' })
    } catch { setFlash({ kind: 'error', msg: 'ვერ დაბრუნდა.' }) }
    finally { setBusy(null) }
  }

  return (
    <>
      <TabHeader
        eyebrow="ტექსტები"
        title="საიტის ტექსტები"
        sub="მთავარი, სფეროები, ჩვენ შესახებ და დახმარების ტექსტები — ცვლილება მაშინვე ცოცხლდება საიტზე."
      />

      <section className="px-6 lg:px-8 py-6 max-w-[760px]">
        {err && <div className="mb-4 p-3 rounded-btn bg-danger-50 border border-danger-200 text-danger-700 text-[13px]">{err}</div>}
        {flash && (
          <div role="alert" className={`mb-4 rounded-btn border px-3 py-2 text-[12.5px] font-medium ${flash.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>{flash.msg}</div>
        )}

        {items === null && <div className="text-[13px] text-ink-400 py-10">იტვირთება…</div>}

        {items !== null && (
          <div className="relative mb-6">
            <input
              type="search"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="მოძებნე ტექსტი, სახელი ან key…"
              className="w-full h-10 pl-3 pr-9 rounded-btn border border-ink-200 text-[13.5px] focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-shadow"
            />
            {q && (
              <button type="button" onClick={() => setQ('')} aria-label="გასუფთავება" className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded-btn text-ink-400 hover:text-ink-800 hover:bg-ink-100 transition-colors text-[15px] leading-none">×</button>
            )}
          </div>
        )}

        {items !== null && groups.length === 0 && (
          <div className="text-[13px] text-ink-400 py-10">ვერაფერი მოიძებნა „{q}“-ზე.</div>
        )}

        <div className="flex flex-col gap-9">
          {groups.map(([group, list]) => (
            <div key={group}>
              <div className="flex items-center gap-3 mb-3.5">
                <h2 className="font-display text-[10.5px] font-bold text-ink-500 uppercase tracking-[0.16em]">{group}</h2>
                <div className="flex-1 h-px bg-ink-100" />
              </div>
              <div className="flex flex-col gap-3">
                {list.map(it => {
                  const draft = drafts[it.key] ?? ''
                  const dirty = draft !== it.value
                  return (
                    <div key={it.key} className={`rounded-card border bg-white p-4 transition-colors ${dirty ? 'border-brand-300 ring-1 ring-brand-100' : 'border-ink-200'}`}>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[12.5px] font-semibold text-ink-800">{it.label}</span>
                        {it.overridden && <span className="text-[9.5px] font-bold uppercase tracking-wide text-brand-700 bg-brand-50 px-1.5 h-5 inline-flex items-center rounded-pill">შეცვლილი</span>}
                      </div>
                      {it.multiline ? (
                        <textarea value={draft} onChange={e => setDrafts(d => ({ ...d, [it.key]: e.target.value }))} rows={3} maxLength={4000} className="w-full px-3 py-2 rounded-btn border border-ink-200 text-[13.5px] leading-relaxed focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none resize-y transition-shadow" />
                      ) : (
                        <input value={draft} onChange={e => setDrafts(d => ({ ...d, [it.key]: e.target.value }))} maxLength={4000} className="w-full h-10 px-3 rounded-btn border border-ink-200 text-[13.5px] focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-shadow" />
                      )}
                      <div className="mt-2.5 flex items-center gap-2 min-h-[36px]">
                        {dirty && <button type="button" onClick={() => save(it.key)} disabled={busy === it.key} className="h-9 px-4 rounded-btn bg-ink-900 hover:bg-ink-800 disabled:bg-ink-200 disabled:text-ink-400 text-white font-display font-semibold text-[12.5px] transition-colors">{busy === it.key ? 'ინახება…' : 'შენახვა'}</button>}
                        {dirty && <button type="button" onClick={() => setDrafts(d => ({ ...d, [it.key]: it.value }))} className="h-9 px-3 rounded-btn text-ink-500 hover:text-ink-800 hover:bg-ink-100 font-display text-[12px] font-medium transition-colors">გაუქმება</button>}
                        {!dirty && it.overridden && <button type="button" onClick={() => reset(it.key)} disabled={busy === it.key} className="h-9 px-3 rounded-btn text-ink-500 hover:text-ink-800 hover:bg-ink-100 font-display text-[12px] font-medium transition-colors">ნაგულისხმევზე დაბრუნება</button>}
                        {!dirty && !it.overridden && <span className="text-[11.5px] text-ink-400">ნაგულისხმევი ტექსტი</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
