'use client'
import React, { useEffect, useState } from 'react'
import { Icon } from '@/components/Icon'
import { renderMarkdown } from '@/lib/markdown'
import { AdminConfirmDialog, TabHeader, AdminLoading, AdminError } from './_parts'

// `body` is optional: the LIST endpoint omits it (60K-character articles × N
// posts made every open heavy), so a row only carries it after the detail
// fetch in `select` (or a create/save response) supplied it.
type Post = {
  id: string; slug: string; title: string; excerpt: string | null; body?: string
  coverUrl: string | null; tag: string | null; status: string; authorName: string | null
  publishedAt: string | null; updatedAt: string
}

type Draft = { title: string; slug: string; tag: string; authorName: string; excerpt: string; coverUrl: string; body: string }

const fieldCls = 'w-full h-11 px-3 rounded-btn border border-ink-200 text-small bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-shadow duration-fast'
const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="block text-micro font-semibold text-ink-500 uppercase mb-1.5">{children}</span>
)

export const BlogSection = () => {
  const [rows, setRows] = useState<Post[] | null>(null)
  const [coverBusy, setCoverBusy] = useState(false)
  const [coverErr, setCoverErr] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)
  const [creating, setCreating] = useState(false)
  const [selId, setSelId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [pendDelete, setPendDelete] = useState<Post | null>(null)
  // Unpublishing pulls a live, indexed page off /blog — confirm it like every
  // other destructive admin action. Publishing stays one click.
  const [pendUnpublish, setPendUnpublish] = useState<Post | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/posts', { cache: 'no-store' })
        if (!res.ok) throw new Error()
        const data: Post[] = await res.json()
        if (!cancelled) setRows(Array.isArray(data) ? data : [])
      } catch { if (!cancelled) setErr('სტატიების ჩატვირთვა ვერ მოხერხდა.') }
    })()
    return () => { cancelled = true }
  }, [])

  const selected = rows?.find(r => r.id === selId) ?? null

  // Single source for „post row → editable draft" so a saved post can re-seed the
  // form from the SERVER's version (the slug it actually stored, not what was typed).
  const draftOf = (p: Post): Draft => ({
    title: p.title, slug: p.slug, tag: p.tag ?? '', authorName: p.authorName ?? '',
    excerpt: p.excerpt ?? '', coverUrl: p.coverUrl ?? '', body: p.body ?? '',
  })

  // The list rows come body-less, so selection fetches the full post before
  // seeding the form. Never seed from a body-less row: an editor opened with an
  // empty textarea and then saved would silently wipe the article.
  const select = async (p: Post) => {
    setSelId(p.id)
    setShowPreview(false)
    setDraft(null)
    try {
      const res = await fetch(`/api/admin/posts/${p.id}`, { cache: 'no-store' })
      const j = await res.json().catch(() => null)
      if (!res.ok || !j?.ok) throw new Error()
      setRows(prev => (prev ?? []).map(r => r.id === p.id ? j.post : r))
      setDraft(draftOf(j.post))
    } catch {
      setSelId(null)
      setFlash({ kind: 'error', msg: 'სტატიის ჩატვირთვა ვერ მოხერხდა.' })
    }
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
      // Re-seed the form from the response: the server re-slugifies + de-duplicates,
      // so the typed slug and the live URL can differ. Without this the field kept
      // showing the typed value and lied about where the post actually lives.
      setDraft(draftOf(j.post))
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
          <button type="button" onClick={create} disabled={creating} className="h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 disabled:bg-ink-100 disabled:text-ink-500 text-white font-display font-semibold text-body inline-flex items-center gap-1.5 transition-colors duration-fast">
            <Icon.plus className="w-3.5 h-3.5" /> ახალი სტატია
          </button>
        }
      />

      <section className="px-6 lg:px-8 py-6">
        {err && <AdminError message={err} className="mb-4" />}
        {flash && (
          <div role="alert" className={`mb-4 rounded-btn border px-3 py-2 text-small font-medium ${flash.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>{flash.msg}</div>
        )}

        <div className="grid lg:grid-cols-[290px_1fr] gap-6 items-start">
          {/* List */}
          <div className="flex flex-col gap-1.5">
            {rows === null && <AdminLoading inset />}
            {rows?.length === 0 && (
              <div className="rounded-card border border-dashed border-ink-200 py-10 px-4 text-center">
                <p className="text-small text-ink-500">ჯერ სტატია არ არის.</p>
                <button type="button" onClick={create} className="mt-3 text-small font-semibold text-brand-700 hover:underline">დაამატე პირველი →</button>
              </div>
            )}
            {rows?.map(p => {
              const on = p.id === selId
              const pub = p.status === 'PUBLISHED'
              return (
                <button key={p.id} type="button" onClick={() => select(p)} className={`text-left rounded-btn border px-3 py-2.5 transition-colors duration-fast ${on ? 'border-brand-400 bg-brand-50/40 ring-1 ring-brand-200' : 'border-ink-200 hover:bg-ink-50'}`}>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${pub ? 'bg-success-500' : 'bg-ink-300'}`} />
                    <span className={`text-micro font-bold uppercase ${pub ? 'text-success-700' : 'text-ink-400'}`}>{pub ? 'ცოცხალი' : 'დრაფტი'}</span>
                    {p.tag && <span className="ml-auto text-meta text-ink-400 truncate max-w-[90px]">{p.tag}</span>}
                  </div>
                  <div className="mt-1 text-small font-semibold text-ink-900 leading-snug line-clamp-2">{p.title}</div>
                </button>
              )
            })}
          </div>

          {/* Editor */}
          {!selected ? (
            <div className="hidden lg:flex flex-col items-center justify-center h-[340px] rounded-card border border-dashed border-ink-200 bg-ink-50/30 text-center">
              <p className="text-body text-ink-500">აირჩიე სტატია მარცხნიდან</p>
              <p className="text-meta text-ink-400 mt-1">ან შექმენი ახალი ზემოთ</p>
            </div>
          ) : !draft ? (
            // Selected but the full post (with body) is still in flight.
            <div className="flex flex-col items-center justify-center h-[340px] rounded-card border border-dashed border-ink-200 bg-ink-50/30 text-center">
              <AdminLoading />
            </div>
          ) : (
            <div className="rounded-card border border-ink-200 bg-white overflow-hidden">
              {/* Toolbar */}
              <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-ink-100 bg-ink-50/40">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-pill text-micro font-bold uppercase ${live ? 'bg-success-100 text-success-800' : 'bg-ink-100 text-ink-500'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-success-500' : 'bg-ink-400'}`} /> {live ? 'ცოცხალი' : 'დრაფტი'}
                  </span>
                  {live && <a href={`/blog/${selected.slug}`} target="_blank" rel="noopener noreferrer" className="text-meta text-brand-700 hover:underline inline-flex items-center gap-1">ნახვა <Icon.external className="w-3 h-3" /></a>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => live ? setPendUnpublish(selected) : togglePublish(selected)} className={`h-8 px-3 rounded-btn font-display text-meta font-semibold transition-colors duration-fast ${live ? 'bg-ink-100 text-ink-700 hover:bg-ink-200' : 'bg-brand-600 text-white hover:bg-brand-600'}`}>
                    {live ? 'დამალვა' : 'გამოქვეყნება'}
                  </button>
                  <button type="button" onClick={() => setPendDelete(selected)} aria-label="წაშლა" className="h-8 w-8 grid place-items-center rounded-btn text-ink-400 hover:text-danger-600 hover:bg-danger-50 transition-colors duration-fast"><Icon.close className="w-4 h-4" /></button>
                </div>
              </div>

              {/* Fields */}
              <div className="p-4 sm:p-5 grid gap-4">
                <label className="block">
                  <Label>სათაური</Label>
                  <input value={draft.title} onChange={e => set({ title: e.target.value })} maxLength={160} className={`${fieldCls} !h-11 font-display font-bold !text-body-lg`} />
                </label>
                <div className="grid sm:grid-cols-2 gap-4">
                  <label className="block"><Label>URL (slug)</Label><input value={draft.slug} onChange={e => set({ slug: e.target.value })} maxLength={80} className={`${fieldCls} font-mono !text-meta`} /></label>
                  <label className="block"><Label>კატეგორია</Label><input value={draft.tag} onChange={e => set({ tag: e.target.value })} maxLength={40} placeholder="მაგ. ბიზნესი" className={fieldCls} /></label>
                </div>
                <label className="block"><Label>ავტორი</Label><input value={draft.authorName} onChange={e => set({ authorName: e.target.value })} maxLength={80} placeholder="არასავალდებულო" className={fieldCls} /></label>

                {/* COVER. This was a bare „URL" input, which is why not one of
                    the eight published posts had an image: it required hosting
                    the file somewhere else first. Now it uploads — the same
                    /api/uploads path everything else uses, with a `cover` kind
                    that crops to 1200×675 webp so eight of them on the index
                    page stay light. The URL field remains for an image that
                    already lives somewhere. */}
                <div className="block">
                  <Label>ქავერ-სურათი</Label>
                  <div className="flex items-start gap-4">
                    <div className="w-40 aspect-[16/9] rounded-btn border border-ink-200 bg-ink-50 overflow-hidden shrink-0 inline-flex items-center justify-center">
                      {draft.coverUrl
                        ? <img src={draft.coverUrl} alt="" className="w-full h-full object-cover" />
                        : <span className="text-micro text-ink-400">არ არის</span>}
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className={`h-10 px-3.5 rounded-btn border border-ink-200 bg-white hover:bg-ink-50 font-display text-small font-semibold text-ink-800 inline-flex items-center gap-1.5 transition-colors duration-fast ${coverBusy ? 'opacity-60 pointer-events-none' : 'cursor-pointer'}`}>
                          <Icon.upload className="w-4 h-4" />
                          {coverBusy ? 'იტვირთება…' : draft.coverUrl ? 'შეცვლა' : 'ატვირთე'}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="sr-only"
                            onChange={async e => {
                              const f = e.target.files?.[0]
                              e.target.value = ''
                              if (!f) return
                              setCoverBusy(true); setCoverErr(null)
                              try {
                                const fd = new FormData()
                                fd.append('file', f)
                                fd.append('kind', 'cover')
                                const res = await fetch('/api/uploads', { method: 'POST', body: fd })
                                const j = await res.json().catch(() => null)
                                if (!res.ok || !j?.url) {
                                  // Name the actual reason. „ატვირთვა ვერ
                                  // მოხერხდა" on a too-large file tells the
                                  // editor nothing about what to do next.
                                  setCoverErr(
                                    j?.error === 'TOO_LARGE' ? `ფაილი ძალიან დიდია — მაქსიმუმ ${Math.round((j.maxBytes ?? 0) / 1024 / 1024)}MB`
                                    : j?.error === 'BAD_TYPE' || j?.error === 'BAD_CONTENT' ? 'მხოლოდ JPG, PNG ან WebP'
                                    : j?.error === 'RATE_LIMITED' ? 'ძალიან ბევრი ატვირთვა — სცადე ცოტა ხანში'
                                    : 'ატვირთვა ვერ მოხერხდა',
                                  )
                                  return
                                }
                                set({ coverUrl: j.url })
                              } catch { setCoverErr('ქსელის შეცდომა') } finally { setCoverBusy(false) }
                            }}
                          />
                        </label>
                        {draft.coverUrl && (
                          <button type="button" onClick={() => set({ coverUrl: '' })} className="h-10 px-3 rounded-btn text-danger-700 hover:bg-danger-50 font-display text-small font-semibold transition-colors duration-fast">
                            მოხსნა
                          </button>
                        )}
                      </div>
                      <input value={draft.coverUrl} onChange={e => set({ coverUrl: e.target.value })} maxLength={2000000} placeholder="ან ჩასვი სურათის ბმული" className={`${fieldCls} !text-meta`} />
                      {coverErr
                        ? <div role="alert" className="text-meta text-danger-700">{coverErr}</div>
                        : <div className="text-meta text-ink-500">16:9 — ბარათზეც და სტატიის თავშიც ჩანს.</div>}
                    </div>
                  </div>
                </div>
                <label className="block">
                  <Label>მოკლე აღწერა · ბარათზე ჩანს</Label>
                  <textarea value={draft.excerpt} onChange={e => set({ excerpt: e.target.value })} maxLength={400} rows={2} className="w-full px-3 py-2 rounded-btn border border-ink-200 text-small focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none resize-none transition-shadow duration-fast" />
                </label>

                <div className="pt-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <Label>ტექსტი · Markdown</Label>
                    <div className="inline-flex rounded-btn border border-ink-200 overflow-hidden -mt-1">
                      <button type="button" onClick={() => setShowPreview(false)} className={`h-7 px-3 text-meta font-semibold transition-colors duration-fast ${!showPreview ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-50'}`}>რედაქტირება</button>
                      <button type="button" onClick={() => setShowPreview(true)} className={`h-7 px-3 text-meta font-semibold transition-colors duration-fast ${showPreview ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-50'}`}>გადახედვა</button>
                    </div>
                  </div>
                  {showPreview ? (
                    <div className="prose-post min-h-[280px] px-4 py-3.5 rounded-btn border border-ink-200 bg-ink-50/30 text-body leading-relaxed text-ink-800" dangerouslySetInnerHTML={{ __html: renderMarkdown(draft.body) || '<p style="color:#a8a29e">ცარიელია</p>' }} />
                  ) : (
                    <textarea value={draft.body} onChange={e => set({ body: e.target.value })} rows={16} placeholder={'## ქვესათაური\n\nდაწერე ტექსტი. **მსხვილი**, *დახრილი*, [ბმული](https://…).\n\n- სია\n- მეორე პუნქტი'} className="w-full px-4 py-3.5 rounded-btn border border-ink-200 text-body leading-relaxed font-mono focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none resize-y transition-shadow duration-fast" />
                  )}
                  <p className="mt-2 text-meta text-ink-400"><code className="text-ink-500">## სათაური</code> · <code className="text-ink-500">**მსხვილი**</code> · <code className="text-ink-500">*დახრილი*</code> · <code className="text-ink-500">[ტექსტი](ბმული)</code> · <code className="text-ink-500">- სია</code></p>
                </div>
              </div>

              {/* Save bar */}
              <div className="flex items-center gap-3 px-4 sm:px-5 py-3 border-t border-ink-100 bg-ink-50/40">
                <button type="button" onClick={save} disabled={saving} className="h-11 px-5 rounded-btn bg-ink-900 hover:bg-ink-800 disabled:bg-ink-300 text-white font-display font-semibold text-small transition-colors duration-fast">{saving ? 'ინახება…' : 'შენახვა'}</button>
                <span className="text-meta text-ink-400">ბოლო ცვლილება: {new Date(selected.updatedAt).toLocaleDateString('ka')}</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {pendUnpublish && (
        <AdminConfirmDialog
          open
          title="სტატიის დამალვა"
          body={`„${pendUnpublish.title}“ /blog-იდან გაქრება — ბმული და საძიებოში დაინდექსებული გვერდი აღარ იმუშავებს. ტექსტი რჩება დრაფტად.`}
          confirmLabel="დამალე"
          tone="danger"
          onConfirm={() => { const p = pendUnpublish; setPendUnpublish(null); togglePublish(p) }}
          onCancel={() => setPendUnpublish(null)}
        />
      )}
      {pendDelete && (
        <AdminConfirmDialog
          open
          title="სტატიის წაშლა"
          body={`დარწმუნებული ხარ? „${pendDelete.title}“ სამუდამოდ წაიშლება.`}
          confirmLabel="წაშლა"
          tone="danger"
          onConfirm={() => { const id = pendDelete.id; setPendDelete(null); remove(id) }}
          onCancel={() => setPendDelete(null)}
        />
      )}
    </>
  )
}
