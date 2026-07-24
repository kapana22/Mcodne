'use client'
import React, { useEffect, useState } from 'react'
import { Icon } from '@/components/Icon'
import { renderMarkdown } from '@/lib/markdown'
import { AdminConfirmDialog, TabHeader } from './_parts'

type Post = {
  id: string; slug: string; title: string; excerpt: string | null; body: string
  coverUrl: string | null; tag: string | null; status: string; authorName: string | null
  publishedAt: string | null; updatedAt: string
}

type Draft = { title: string; slug: string; tag: string; authorName: string; excerpt: string; coverUrl: string; body: string }

const fieldCls = 'w-full h-10 px-3 rounded-btn border border-ink-200 text-[13px] bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-shadow'
const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="block text-[10.5px] font-semibold text-ink-500 uppercase tracking-[0.1em] mb-1.5">{children}</span>
)

export const BlogSection = () => {
  const [rows, setRows] = useState<Post[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)
  const [creating, setCreating] = useState(false)
  const [selId, setSelId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [pendDelete, setPendDelete] = useState<Post | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/posts')
        if (!res.ok) throw new Error()
        const data: Post[] = await res.json()
        if (!cancelled) setRows(Array.isArray(data) ? data : [])
      } catch { if (!cancelled) setErr('სტატიების ჩატვირთვა ვერ მოხერხდა.') }
    })()
    return () => { cancelled = true }
  }, [])

  const selected = rows?.find(r => r.id === selId) ?? null

  const select = (p: Post) => {
    setSelId(p.id)
    setShowPreview(false)
    setDraft({
      title: p.title, slug: p.slug, tag: p.tag ?? '', authorName: p.authorName ?? '',
      excerpt: p.excerpt ?? '', coverUrl: p.coverUrl ?? '', body: p.body ?? '',
    })
  }

  const create = async () => {
    if (creating) return
    setCreating(true); setFlash(null)
    try {
      const res = await fetch('/api/admin/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'ახალი სტატია' }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error()
      setRows(prev => [j.post, ...(prev ?? [])])
      select(j.post)
      setFlash({ kind: 'success', msg: 'დრაფტი შეიქმნა — შეავსე და გამოაქვეყნე.' })
    } catch { setFlash({ kind: 'error', msg: 'შექმნა ვერ მოხერხდა.' }) }
    finally { setCreating(false) }
  }

  const save = async () => {
    if (!selected || !draft || saving) return
    setSaving(true); setFlash(null)
    try {
      const body = {
        title: draft.title.trim(), slug: draft.slug.trim(), tag: draft.tag.trim(),
        authorName: draft.authorName.trim(), excerpt: draft.excerpt.trim(),
        coverUrl: draft.coverUrl.trim(), body: draft.body,
      }
      const res = await fetch(`/api/admin/posts/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error()
      setRows(prev => (prev ?? []).map(r => r.id === selected.id ? j.post : r))
      setFlash({ kind: 'success', msg: 'შენახულია.' })
    } catch { setFlash({ kind: 'error', msg: 'ვერ შეინახა — სცადე თავიდან.' }) }
    finally { setSaving(false) }
  }

  const togglePublish = async (p: Post) => {
    const next = p.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED'
    setFlash(null)
    try {
      const res = await fetch(`/api/admin/posts/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error()
      setRows(prev => (prev ?? []).map(r => r.id === p.id ? j.post : r))
      setFlash({ kind: 'success', msg: next === 'PUBLISHED' ? 'გამოქვეყნდა — ცოცხალია /blog-ზე.' : 'დაიმალა (დრაფტი).' })
    } catch { setFlash({ kind: 'error', msg: 'ვერ შეიცვალა.' }) }
  }

  const remove = async (id: string) => {
    setFlash(null)
    try {
      const res = await fetch(`/api/admin/posts/${id}`, { method: 'DELETE' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error()
      setRows(prev => (prev ?? []).filter(r => r.id !== id))
      if (selId === id) { setSelId(null); setDraft(null) }
      setFlash({ kind: 'success', msg: 'სტატია წაიშალა.' })
    } catch { setFlash({ kind: 'error', msg: 'წაშლა ვერ მოხერხდა.' }) }
  }

  const set = (patch: Partial<Draft>) => setDraft(d => d ? { ...d, ...patch } : d)
  const live = selected?.status === 'PUBLISHED'

  return (
    <>
      <TabHeader
        eyebrow="ბლოგი"
        title="ბლოგის მართვა"
        sub="დაწერე, დაარედაქტირე და გამოაქვეყნე სტატიები. /blog DB-დან იკითხება — ტექსტი Markdown-ით."
        actions={
          <button type="button" onClick={create} disabled={creating} className="h-10 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 disabled:bg-ink-200 disabled:text-ink-400 text-white font-display font-semibold text-[12.5px] inline-flex items-center gap-1.5 transition-colors">
            <Icon.plus className="w-3.5 h-3.5" /> ახალი სტატია
          </button>
        }
      />

      <section className="px-6 lg:px-8 py-6">
        {err && <div className="mb-4 p-3 rounded-btn bg-danger-50 border border-danger-200 text-danger-700 text-[13px]">{err}</div>}
        {flash && (
          <div role="alert" className={`mb-4 rounded-btn border px-3 py-2 text-[12.5px] font-medium ${flash.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>{flash.msg}</div>
        )}

        <div className="grid lg:grid-cols-[290px_1fr] gap-6 items-start">
          {/* List */}
          <div className="flex flex-col gap-1.5">
            {rows === null && <div className="text-[13px] text-ink-400 py-10 text-center">იტვირთება…</div>}
            {rows?.length === 0 && (
              <div className="rounded-card border border-dashed border-ink-200 py-10 px-4 text-center">
                <p className="text-[13px] text-ink-500">ჯერ სტატია არ არის.</p>
                <button type="button" onClick={create} className="mt-3 text-[12.5px] font-semibold text-brand-700 hover:underline">დაამატე პირველი →</button>
              </div>
            )}
            {rows?.map(p => {
              const on = p.id === selId
              const pub = p.status === 'PUBLISHED'
              return (
                <button key={p.id} type="button" onClick={() => select(p)} className={`text-left rounded-btn border px-3 py-2.5 transition-colors ${on ? 'border-brand-400 bg-brand-50/40 ring-1 ring-brand-200' : 'border-ink-200 hover:bg-ink-50'}`}>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${pub ? 'bg-success-500' : 'bg-ink-300'}`} />
                    <span className={`text-[9.5px] font-bold uppercase tracking-wide ${pub ? 'text-success-700' : 'text-ink-400'}`}>{pub ? 'ცოცხალი' : 'დრაფტი'}</span>
                    {p.tag && <span className="ml-auto text-[10px] text-ink-400 truncate max-w-[90px]">{p.tag}</span>}
                  </div>
                  <div className="mt-1 text-[13px] font-semibold text-ink-900 leading-snug line-clamp-2">{p.title}</div>
                </button>
              )
            })}
          </div>

          {/* Editor */}
          {!selected || !draft ? (
            <div className="hidden lg:flex flex-col items-center justify-center h-[340px] rounded-card border border-dashed border-ink-200 bg-ink-50/30 text-center">
              <p className="text-[13.5px] text-ink-500">აირჩიე სტატია მარცხნიდან</p>
              <p className="text-[12px] text-ink-400 mt-1">ან შექმენი ახალი ზემოთ</p>
            </div>
          ) : (
            <div className="rounded-card border border-ink-200 bg-white overflow-hidden">
              {/* Toolbar */}
              <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-ink-100 bg-ink-50/40">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-pill text-[10px] font-bold uppercase tracking-wide ${live ? 'bg-success-100 text-success-800' : 'bg-ink-100 text-ink-500'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-success-500' : 'bg-ink-400'}`} /> {live ? 'ცოცხალი' : 'დრაფტი'}
                  </span>
                  {live && <a href={`/blog/${selected.slug}`} target="_blank" rel="noopener noreferrer" className="text-[12px] text-brand-700 hover:underline inline-flex items-center gap-1">ნახვა <Icon.external className="w-3 h-3" /></a>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => togglePublish(selected)} className={`h-8 px-3 rounded-btn font-display text-[12px] font-semibold transition-colors ${live ? 'bg-ink-100 text-ink-700 hover:bg-ink-200' : 'bg-brand-500 text-white hover:bg-brand-600'}`}>
                    {live ? 'დამალვა' : 'გამოქვეყნება'}
                  </button>
                  <button type="button" onClick={() => setPendDelete(selected)} aria-label="წაშლა" className="h-8 w-8 grid place-items-center rounded-btn text-ink-400 hover:text-danger-600 hover:bg-danger-50 transition-colors"><Icon.close className="w-4 h-4" /></button>
                </div>
              </div>

              {/* Fields */}
              <div className="p-4 sm:p-5 grid gap-4">
                <label className="block">
                  <Label>სათაური</Label>
                  <input value={draft.title} onChange={e => set({ title: e.target.value })} maxLength={160} className={`${fieldCls} !h-11 font-display font-bold !text-[15px]`} />
                </label>
                <div className="grid sm:grid-cols-2 gap-4">
                  <label className="block"><Label>URL (slug)</Label><input value={draft.slug} onChange={e => set({ slug: e.target.value })} maxLength={80} className={`${fieldCls} font-mono !text-[12px]`} /></label>
                  <label className="block"><Label>კატეგორია</Label><input value={draft.tag} onChange={e => set({ tag: e.target.value })} maxLength={40} placeholder="მაგ. ბიზნესი" className={fieldCls} /></label>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <label className="block"><Label>ავტორი</Label><input value={draft.authorName} onChange={e => set({ authorName: e.target.value })} maxLength={80} placeholder="არასავალდებულო" className={fieldCls} /></label>
                  <label className="block"><Label>ქავერ-სურათი (URL)</Label><input value={draft.coverUrl} onChange={e => set({ coverUrl: e.target.value })} maxLength={2000} placeholder="https://…" className={fieldCls} /></label>
                </div>
                <label className="block">
                  <Label>მოკლე აღწერა · ბარათზე ჩანს</Label>
                  <textarea value={draft.excerpt} onChange={e => set({ excerpt: e.target.value })} maxLength={400} rows={2} className="w-full px-3 py-2 rounded-btn border border-ink-200 text-[13px] focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none resize-none transition-shadow" />
                </label>

                <div className="pt-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <Label>ტექსტი · Markdown</Label>
                    <div className="inline-flex rounded-btn border border-ink-200 overflow-hidden -mt-1">
                      <button type="button" onClick={() => setShowPreview(false)} className={`h-7 px-3 text-[11.5px] font-semibold transition-colors ${!showPreview ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-50'}`}>რედაქტირება</button>
                      <button type="button" onClick={() => setShowPreview(true)} className={`h-7 px-3 text-[11.5px] font-semibold transition-colors ${showPreview ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-50'}`}>გადახედვა</button>
                    </div>
                  </div>
                  {showPreview ? (
                    <div className="prose-post min-h-[280px] px-4 py-3.5 rounded-btn border border-ink-200 bg-ink-50/30 text-[14px] leading-relaxed text-ink-800" dangerouslySetInnerHTML={{ __html: renderMarkdown(draft.body) || '<p style="color:#a8a29e">ცარიელია</p>' }} />
                  ) : (
                    <textarea value={draft.body} onChange={e => set({ body: e.target.value })} rows={16} placeholder={'## ქვესათაური\n\nდაწერე ტექსტი. **მსხვილი**, *დახრილი*, [ბმული](https://…).\n\n- სია\n- მეორე პუნქტი'} className="w-full px-4 py-3.5 rounded-btn border border-ink-200 text-[13.5px] leading-relaxed font-mono focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none resize-y transition-shadow" />
                  )}
                  <p className="mt-2 text-[11px] text-ink-400"><code className="text-ink-500">## სათაური</code> · <code className="text-ink-500">**მსხვილი**</code> · <code className="text-ink-500">*დახრილი*</code> · <code className="text-ink-500">[ტექსტი](ბმული)</code> · <code className="text-ink-500">- სია</code></p>
                </div>
              </div>

              {/* Save bar */}
              <div className="flex items-center gap-3 px-4 sm:px-5 py-3 border-t border-ink-100 bg-ink-50/40">
                <button type="button" onClick={save} disabled={saving} className="h-10 px-5 rounded-btn bg-ink-900 hover:bg-ink-800 disabled:bg-ink-300 text-white font-display font-semibold text-[13px] transition-colors">{saving ? 'ინახება…' : 'შენახვა'}</button>
                <span className="text-[11.5px] text-ink-400">ბოლო ცვლილება: {new Date(selected.updatedAt).toLocaleDateString('ka')}</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {pendDelete && (
        <AdminConfirmDialog
          open
          title="სტატიის წაშლა"
          body={`დარწმუნებული ხარ? „${pendDelete.title}" სამუდამოდ წაიშლება.`}
          confirmLabel="წაშლა"
          tone="danger"
          onConfirm={() => { const id = pendDelete.id; setPendDelete(null); remove(id) }}
          onCancel={() => setPendDelete(null)}
        />
      )}
    </>
  )
}
