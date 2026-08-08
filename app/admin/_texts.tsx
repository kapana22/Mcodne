'use client'
import React, { useEffect, useMemo, useState } from 'react'
import { TabHeader, AdminLoading, AdminError } from './_parts'
import { Icon } from '@/components/Icon'
import { Container } from '@/components/Container'

/** An override stored in the DB whose key no longer exists in the registry. */
type Orphan = { key: string; value: string }

type Item = {
  key: string; group: string; label: string; multiline: boolean
  default: string; value: string; overridden: boolean
}

export const SiteTextsSection = () => {
  const [items, setItems] = useState<Item[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  /** Per-field save result. See `save()` for why the page-level banner alone
   *  was not enough. */
  const [notes, setNotes] = useState<Record<string, { kind: 'ok' | 'warn' | 'err'; msg: string } | null>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [openGroups, setOpenGroups] = useState<string[]>([])
  const [orphans, setOrphans] = useState<Orphan[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // `no-store`, like every other admin panel. Without it the browser may
        // serve a cached response — which is how a warning that was already
        // fixed on the server kept appearing in the operator's tab, and how a
        // text edited in another session could show as stale. An admin panel
        // reading anything but the current truth is worse than a slow one.
        const res = await fetch('/api/admin/site-texts', { cache: 'no-store' })
        if (!res.ok) throw new Error()
        // The route used to return a bare array; it now returns
        // { items, orphans }. Both shapes are accepted so a stale cached
        // response cannot blank the whole editor.
        const raw = await res.json()
        const data: Item[] = Array.isArray(raw) ? raw : raw.items
        const orph: Orphan[] = Array.isArray(raw) ? [] : (raw.orphans ?? [])
        if (!cancelled) {
          setItems(data)
          setOrphans(orph)
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
    setNotes(n => ({ ...n, [key]: null }))
    try {
      const res = await fetch('/api/admin/site-texts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error()
      setItems(prev => (prev ?? []).map(i => i.key === key ? { ...i, value, overridden: value !== i.default } : i))
      // Per-FIELD confirmation. The banner at the top of the page is far off
      // screen by the time you are editing the twentieth field, so a save that
      // landed and a save that failed looked identical: nothing happened where
      // you were looking. The note sits under the box you just typed in.
      setNotes(n => ({
        ...n,
        // A copy warning is advice about text that IS saved — never a failure.
        [key]: j.warnings
          ? { kind: 'warn', msg: `შენახულია. შენიშვნა: ${j.warnings}` }
          : { kind: 'ok', msg: 'შენახულია — ცოცხალია საიტზე.' },
      }))
    } catch {
      setNotes(n => ({ ...n, [key]: { kind: 'err', msg: 'ვერ შეინახა — სცადე თავიდან.' } }))
    }
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
        sub="დააჭირე ჯგუფს, რომ გაიხსნას. ცვლილება მაშინვე ცოცხლდება საიტზე და შენს ტექსტს კოდი ვერასდროს გადააწერს."
      />

      <Container as="section" size="content" className="py-6">
        {err && <AdminError message={err} className="mb-4" />}
        {flash && (
          <div role="alert" className={`mb-4 rounded-btn border px-3 py-2 text-small font-medium ${flash.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>{flash.msg}</div>
        )}

        {orphans.length > 0 && (
          /* Your text is still in the database but the site is no longer
             showing it — the only way an edit can vanish without anyone being
             told. Reported, never auto-deleted. */
          <div className="mb-5 rounded-card border border-warning-300 bg-warning-50/50 p-4">
            <p className="font-display text-small font-bold text-ink-900">
              {orphans.length} შენახული ტექსტი საიტზე აღარ ჩანს
            </p>
            <p className="mt-1 text-small text-ink-700 leading-[1.55]">
              ეს ტექსტები შენ შეცვალე, მაგრამ მათი ველი კოდში აღარ არსებობს (გადარქმეული ან წაშლილი) —
              საიტი ნაგულისხმევ ვარიანტს აჩვენებს. არაფერი წაშლილა; გადაეცი დეველოპერს.
            </p>
            <ul className="mt-2.5 space-y-1.5">
              {orphans.map(o => (
                <li key={o.key} className="text-meta text-ink-700">
                  <span className="font-mono text-ink-900">{o.key}</span>
                  <span className="block text-ink-600 truncate">„{o.value}“</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {items === null && <AdminLoading />}

        {items !== null && (
          <div className="relative mb-6">
            <input
              type="search"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="მოძებნე ტექსტი, სახელი ან key…"
              className="w-full h-11 pl-3 pr-9 rounded-btn border border-ink-200 text-body focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-shadow duration-fast"
            />
            {q && (
              <button type="button" onClick={() => setQ('')} aria-label="გასუფთავება" className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded-btn text-ink-400 hover:text-ink-800 hover:bg-ink-100 transition-colors duration-fast text-body-lg leading-none">×</button>
            )}
          </div>
        )}

        {items !== null && groups.length === 0 && (
          <div className="text-small text-ink-400 py-10">ვერაფერი მოიძებნა „{q}“-ზე.</div>
        )}

        {/* COLLAPSED BY DEFAULT.
            33 groups fully expanded is roughly 175 inputs and 175 button rows
            on one page — you cannot find the field you came for, and you cannot
            see which groups you have already changed. Collapsed, the panel
            becomes a table of contents: each row says how many fields it holds
            and how many of them you have edited.
            A search TERM re-expands everything, because then the list is
            already the answer rather than the haystack. */}
        <div className="flex flex-col gap-3">
          {groups.map(([group, list]) => {
            const changed = list.filter(x => x.overridden).length
            const openGroup = q.trim().length > 0 || openGroups.includes(group)
            return (
            <div key={group} className="rounded-card border border-ink-200 bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenGroups(g => g.includes(group) ? g.filter(x => x !== group) : [...g, group])}
                aria-expanded={openGroup}
                className="w-full min-h-11 px-4 py-3 flex items-center gap-3 text-left hover:bg-ink-50/60 transition-colors duration-fast"
              >
                <Icon.chevD className={`w-4 h-4 shrink-0 text-ink-400 transition-transform duration-fast ${openGroup ? 'rotate-180' : ''}`} />
                <span className="flex-1 font-display text-small font-bold text-ink-900 truncate">{group}</span>
                {changed > 0 && (
                  <span className="text-micro font-bold uppercase text-brand-700 bg-brand-50 px-1.5 h-5 inline-flex items-center rounded-pill shrink-0">
                    {changed} შეცვლილი
                  </span>
                )}
                <span className="text-meta text-ink-400 tabular-nums shrink-0">{list.length}</span>
              </button>
              {openGroup && (
              <div className="flex flex-col gap-3 p-4 pt-0 border-t border-ink-100">
                {list.map(it => {
                  const draft = drafts[it.key] ?? ''
                  const dirty = draft !== it.value
                  return (
                    <div key={it.key} className={`rounded-card border bg-white p-4 transition-colors duration-fast ${dirty ? 'border-brand-300 ring-1 ring-brand-100' : 'border-ink-200'}`}>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-small font-semibold text-ink-800">{it.label}</span>
                        {it.overridden && <span className="text-micro font-bold uppercase text-brand-700 bg-brand-50 px-1.5 h-5 inline-flex items-center rounded-pill">შეცვლილი</span>}
                      </div>
                      {it.multiline ? (
                        <textarea value={draft} onChange={e => setDrafts(d => ({ ...d, [it.key]: e.target.value }))} rows={3} maxLength={4000} className="w-full px-3 py-2 rounded-btn border border-ink-200 text-body leading-relaxed focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none resize-y transition-shadow duration-fast" />
                      ) : (
                        <input value={draft} onChange={e => setDrafts(d => ({ ...d, [it.key]: e.target.value }))} maxLength={4000} className="w-full h-11 px-3 rounded-btn border border-ink-200 text-body focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-shadow duration-fast" />
                      )}
                      <div className="mt-2.5 flex items-center gap-2 min-h-[36px]">
                        {dirty && <button type="button" onClick={() => save(it.key)} disabled={busy === it.key} className="h-9 px-4 rounded-btn bg-ink-900 hover:bg-ink-800 disabled:bg-ink-100 disabled:text-ink-500 text-white font-display font-semibold text-small transition-colors duration-fast">{busy === it.key ? 'ინახება…' : 'შენახვა'}</button>}
                        {dirty && <button type="button" onClick={() => setDrafts(d => ({ ...d, [it.key]: it.value }))} className="h-9 px-3 rounded-btn text-ink-500 hover:text-ink-800 hover:bg-ink-100 font-display text-meta font-medium transition-colors duration-fast">გაუქმება</button>}
                        {!dirty && it.overridden && <button type="button" onClick={() => reset(it.key)} disabled={busy === it.key} className="h-9 px-3 rounded-btn text-ink-500 hover:text-ink-800 hover:bg-ink-100 font-display text-meta font-medium transition-colors duration-fast">ნაგულისხმევზე დაბრუნება</button>}
                        {!dirty && !it.overridden && <span className="text-meta text-ink-400">ნაგულისხმევი ტექსტი</span>}
                      </div>
                      {notes[it.key] && (
                        <p
                          role="status"
                          className={`text-meta leading-snug ${
                            notes[it.key]!.kind === 'ok' ? 'text-success-700'
                            : notes[it.key]!.kind === 'warn' ? 'text-warning-800'
                            : 'text-danger-700'
                          }`}
                        >
                          {notes[it.key]!.msg}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
              )}
            </div>
            )
          })}
        </div>
      </Container>
    </>
  )
}
