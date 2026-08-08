'use client'
// Admin tab: კატეგორიები — isLive + defaultServiceType toggles.

import { useState, useEffect } from 'react'
import { Icon } from '@/components/Icon'
import { AdminConfirmDialog, TabHeader, adminOk, AdminError } from './_parts'

/* ───── Section: Categories (isLive + defaultServiceType toggles) ─────
   Small admin surface for controlling the /categories browse page. Every
   toggle hits PATCH /api/admin/categories/:id — we mutate local state first
   (optimistic) and revert on network failure so the switch feels instant. */
export type AdminCategory = {
  id: string
  slug: string
  name: string
  defaultServiceType: 'CONSULTATION' | 'RECURRING'
  isLive: boolean
  tutorCount: number
}

export const CategoriesSection = () => {
  const [rows, setRows] = useState<AdminCategory[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [query, setQuery] = useState('')
  // Category delete was the only destructive admin action firing instantly on
  // click — route it through the shared confirm dialog like every other delete.
  const [pendDelete, setPendDelete] = useState<AdminCategory | null>(null)
  // Turning isLive OFF is far more destructive than DELETE (which is blocked
  // while the category still has experts): it delists every expert in it from
  // /tutors, the category page, the sitemap and the homepage. Confirm it.
  // Turning it back ON is harmless and stays one click.
  const [pendHide, setPendHide] = useState<AdminCategory | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/categories', { cache: 'no-store' })
        if (!res.ok) throw new Error('fetch failed')
        const data: AdminCategory[] = await res.json()
        if (!cancelled) setRows(Array.isArray(data) ? data : [])
      } catch {
        if (!cancelled) setErr('კატეგორიების ჩატვირთვა ვერ მოხერხდა.')
      }
    })()
    return () => { cancelled = true }
  }, [])

  const patch = async (id: string, body: Partial<Pick<AdminCategory, 'isLive' | 'defaultServiceType'>>) => {
    if (!rows) return
    const before = rows
    // Optimistic mutation first — the UI feels instant. If the server rejects
    // (auth expired, 404, network drop) we swap the array back and flash.
    const next = rows.map(r => r.id === id ? { ...r, ...body } : r)
    setRows(next)
    setFlash(null)
    try {
      const res = await fetch(`/api/admin/categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      // adminOk, not res.ok — an expired session 307s to sign-in and fetch
      // hands the HTML back as a 200, which used to flash fake success while
      // the category never changed.
      if (!(await adminOk(res))) throw new Error('patch failed')
      setFlash({ kind: 'success', msg: 'ცვლილება შეინახა.' })
    } catch {
      setRows(before)
      setFlash({ kind: 'error', msg: 'ცვლილება ვერ შეინახა — სცადე თავიდან.' })
    }
  }

  // Create a category from a name — it appears in /apply + discovery instantly
  // (both read the DB), so the field list is no longer hardcoded in the app.
  const create = async () => {
    const name = newName.trim()
    if (name.length < 2 || creating) return
    setCreating(true); setFlash(null)
    try {
      const res = await fetch('/api/admin/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error()
      setRows(prev => [...(prev ?? []), j.category])
      setNewName('')
      setFlash({ kind: 'success', msg: 'კატეგორია დაემატა.' })
    } catch { setFlash({ kind: 'error', msg: 'დამატება ვერ მოხერხდა.' }) }
    finally { setCreating(false) }
  }

  const rename = async (id: string) => {
    const name = editName.trim()
    setEditingId(null)
    if (name.length < 2) return
    const before = rows
    setRows(prev => (prev ?? []).map(r => r.id === id ? { ...r, name } : r))
    setFlash(null)
    try {
      const res = await fetch(`/api/admin/categories/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
      // adminOk, not res.ok — see patch() above.
      if (!(await adminOk(res))) throw new Error()
      setFlash({ kind: 'success', msg: 'სახელი შეიცვალა.' })
    } catch { setRows(before); setFlash({ kind: 'error', msg: 'ვერ შეინახა.' }) }
  }

  const remove = async (id: string) => {
    setFlash(null)
    try {
      const res = await fetch(`/api/admin/categories/${id}`, { method: 'DELETE' })
      const j = await res.json().catch(() => ({}))
      if (res.status === 409) { setFlash({ kind: 'error', msg: 'ვერ წაიშლება — ამ კატეგორიას ექსპერტები ჰყავს. დამალე ნაცვლად.' }); return }
      if (!res.ok || !j.ok) throw new Error()
      setRows(prev => (prev ?? []).filter(r => r.id !== id))
      setFlash({ kind: 'success', msg: 'კატეგორია წაიშალა.' })
    } catch { setFlash({ kind: 'error', msg: 'წაშლა ვერ მოხერხდა.' }) }
  }

  const filtered = (rows ?? []).filter(r => {
    const q = query.trim().toLowerCase()
    return !q || r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q)
  })

  return (
    <>
      <TabHeader
        eyebrow="კატეგორიები · სფეროების მართვა"
        title={<>სფეროების მართვა</>}
        sub="დაამატე, გადაარქვი, დამალე ან წაშალე სფერო — /apply და ძებნა DB-დან კითხულობს, ასე რომ კოდის შეცვლა აღარ სჭირდება."
        actions={undefined}
      />
      <section className="px-6 lg:px-8 py-6">
        {err && <AdminError message={err} className="mb-4" />}
        {flash && (
          <div role="alert" className={`mb-4 rounded-btn border px-3 py-2 text-small font-medium ${flash.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>
            {flash.msg}
          </div>
        )}

        {/* Add a category + (once the list grows) filter it. */}
        <div className="mb-4 flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="flex gap-2 flex-1">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') create() }}
              placeholder="ახალი სფერო — მაგ. ეთიკური ჰაკინგი"
              maxLength={60}
              className="flex-1 h-11 px-3 rounded-btn border border-ink-200 text-small focus:border-brand-500 focus:outline-none"
            />
            <button type="button" onClick={create} disabled={creating || newName.trim().length < 2} className="h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 disabled:bg-ink-100 disabled:text-ink-500 text-white font-display font-semibold text-body inline-flex items-center gap-1.5 transition-colors duration-fast shrink-0">
              <Icon.plus className="w-3.5 h-3.5" /> დამატება
            </button>
          </div>
          {(rows?.length ?? 0) > 6 && (
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="ძებნა…" aria-label="კატეგორიების ძებნა" className="h-11 px-3 rounded-btn border border-ink-200 text-small focus:border-brand-500 focus:outline-none sm:w-44" />
          )}
        </div>

        {rows === null ? (
          <div className="rounded-card border border-ink-200 bg-white overflow-hidden">
            {[0,1,2,3,4].map(i => (
              <div key={i} className="flex items-center justify-between px-4 py-3.5 border-b border-ink-100 last:border-b-0">
                <div className="h-4 w-40 rounded bg-ink-100 motion-safe:animate-pulse" />
                <div className="h-6 w-24 rounded-pill bg-ink-100 motion-safe:animate-pulse" />
                <div className="h-4 w-16 rounded bg-ink-100 motion-safe:animate-pulse" />
                <div className="h-6 w-11 rounded-pill bg-ink-100 motion-safe:animate-pulse" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-card border border-dashed border-ink-200 bg-white py-12 px-6 text-center">
            <div className="font-display text-body-lg font-bold text-ink-900 tracking-tight">კატეგორია არ არის</div>
            <p className="text-small text-ink-500 mt-1.5">დაამატე პირველი სფერო ზემოთ ველიდან.</p>
          </div>
        ) : (
          <div className="rounded-card border border-ink-200 bg-white overflow-hidden">
            <div className="hidden sm:grid grid-cols-[1.5fr_1fr_0.6fr_auto] gap-4 px-4 py-2.5 border-b border-ink-200 bg-ink-50/60 font-display text-micro font-semibold uppercase text-ink-500">
              <div>სახელი</div>
              <div>Slug</div>
              <div>ექსპერტი</div>
              <div className="text-right">მართვა</div>
            </div>
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-small text-ink-500">ვერაფერი მოიძებნა.</div>
            ) : filtered.map(r => (
              <div key={r.id} className="grid grid-cols-1 sm:grid-cols-[1.5fr_1fr_0.6fr_auto] gap-2 sm:gap-4 items-center px-4 py-3 border-b border-ink-100 last:border-b-0">
                <div className="min-w-0">
                  {editingId === r.id ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onBlur={() => rename(r.id)}
                      onKeyDown={e => { if (e.key === 'Enter') rename(r.id); if (e.key === 'Escape') setEditingId(null) }}
                      maxLength={60}
                      className="w-full h-9 px-2.5 rounded-btn border border-brand-400 text-body font-display font-semibold focus:outline-none"
                    />
                  ) : (
                    <div className="font-display font-semibold text-body text-ink-900 truncate">{r.name}</div>
                  )}
                </div>
                <div className="font-mono text-meta text-ink-500 tabular-nums truncate">{r.slug}</div>
                <div className="font-display font-semibold text-small text-ink-800 tabular-nums">{r.tutorCount}</div>
                <div className="flex items-center gap-1 sm:justify-end">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={r.isLive}
                    aria-label={`კატეგორია ${r.name} — ${r.isLive ? 'ცოცხალი' : 'დამალული'}`}
                    onClick={() => r.isLive ? setPendHide(r) : patch(r.id, { isLive: true })}
                    className={`relative inline-flex items-center h-6 w-11 rounded-pill transition-colors duration-fast shrink-0 ${r.isLive ? 'bg-success-500' : 'bg-ink-200'}`}
                  >
                    <span className={`inline-block w-5 h-5 rounded-full bg-white shadow-xs transition-transform duration-fast ${r.isLive ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
                  </button>
                  <button type="button" onClick={() => { setEditingId(r.id); setEditName(r.name) }} className="h-8 px-2.5 rounded-btn text-meta font-display font-semibold text-ink-600 hover:bg-ink-100 transition-colors duration-fast">რედაქტ.</button>
                  <button type="button" onClick={() => setPendDelete(r)} disabled={r.tutorCount > 0} title={r.tutorCount > 0 ? 'ჯერ ექსპერტები ჰყავს — დამალე' : 'წაშლა'} className="h-8 px-2.5 rounded-btn text-meta font-display font-semibold text-danger-600 hover:bg-danger-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-fast">წაშლა</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <AdminConfirmDialog
        open={pendHide !== null}
        title="კატეგორიის დამალვა"
        body={<>
          „{pendHide?.name ?? ''}“ საჯარო საიტიდან გაქრება — მისი <span className="font-display font-semibold tabular-nums">{pendHide?.tutorCount ?? 0}</span> ექსპერტი აღარ გამოჩნდება ძებნაში, კატეგორიის გვერდზე, sitemap-სა და მთავარ გვერდზე.
          {(pendHide?.tutorCount ?? 0) > 0 && <span className="mt-2 block text-danger-700">ჯავშნები და პროფილები რჩება — მაგრამ ვეღარავინ იპოვის. ჩართვით ყველაფერი დაბრუნდება.</span>}
        </>}
        tone="danger"
        confirmLabel="დამალე"
        onCancel={() => setPendHide(null)}
        onConfirm={async () => {
          const id = pendHide?.id
          setPendHide(null)
          if (id) await patch(id, { isLive: false })
        }}
      />
      <AdminConfirmDialog
        open={pendDelete !== null}
        title="კატეგორიის წაშლა"
        body={<>წაიშლება კატეგორია <span className="font-display font-semibold">{pendDelete?.name ?? ''}</span>. ეს შეუქცევადია.</>}
        tone="danger"
        confirmLabel="წაშლა"
        onCancel={() => setPendDelete(null)}
        onConfirm={async () => {
          const id = pendDelete?.id
          setPendDelete(null)
          if (id) await remove(id)
        }}
      />
    </>
  )
}

