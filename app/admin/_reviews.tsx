'use client'
// Admin tab: შეფასებები — moderation list + delete.

import { useState, useEffect } from 'react'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { Icon } from '@/components/Icon'
import { EmptyState } from '@/components/EmptyState'
import { AdminConfirmDialog, TabHeader, AdminLoading, AdminError, downloadCsv, fmtDT, LoadMoreBar } from './_parts'

/* ───── Section: Reviews (moderation — list + delete) ───── */
type AdminReview = {
  id: string
  rating: number
  body: string
  createdAt: string
  student: { id: string; fullName: string; avatarUrl: string | null }
  tutor: { id: string; user: { id: string; fullName: string; avatarUrl: string | null } }
  booking: { id: string; topic: string; ref: string } | null
}

export const ReviewsSection = () => {
  const [items, setItems] = useState<AdminReview[] | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [maxRating, setMaxRating] = useState<number>(5)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)
  const [pendDelete, setPendDelete] = useState<AdminReview | null>(null)

  const load = async () => {
    setErr(null)
    try {
      const params = new URLSearchParams({ maxRating: String(maxRating), limit: '50' })
      if (q.trim()) params.set('q', q.trim())
      const res = await fetch(`/api/admin/reviews?${params}`, { cache: 'no-store' })
      if (!res.ok) { setErr('ჩატვირთვა ვერ მოხერხდა'); return }
      const j = await res.json()
      setItems(Array.isArray(j.items) ? j.items : [])
      setNextCursor(j.nextCursor ?? null)
    } catch { setErr('ქსელის შეცდომა') }
  }

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const params = new URLSearchParams({ maxRating: String(maxRating), limit: '50', cursor: nextCursor })
      if (q.trim()) params.set('q', q.trim())
      const res = await fetch(`/api/admin/reviews?${params}`, { cache: 'no-store' })
      if (!res.ok) return
      const j = await res.json()
      setItems(prev => [...(prev ?? []), ...(Array.isArray(j.items) ? j.items : [])])
      setNextCursor(j.nextCursor ?? null)
    } catch { /* keep current page */ } finally { setLoadingMore(false) }
  }

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [maxRating, q])

  const remove = async (r: AdminReview, reason: string) => {
    setBusy(r.id)
    setFlash(null)
    try {
      const res = await fetch(`/api/admin/reviews?id=${r.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) { setFlash({ kind: 'error', msg: 'წაშლა ვერ მოხერხდა' }); return }
      await load()
      setFlash({ kind: 'success', msg: 'შეფასება წაიშალა — ექსპერტის რეიტინგი გადაითვალა.' })
    } catch { setFlash({ kind: 'error', msg: 'ქსელის შეცდომა' }) }
    finally { setBusy(null) }
  }

  return (
    <>
      <TabHeader
        eyebrow="მოდერაცია · შეფასებები"
        // Cursor-paginated list — while a next page remains this is the LOADED
        // count, not the total match, and the CSV carries exactly these rows.
        title={<>{items ? (nextCursor ? `ჩატვირთულია ${items.length} ` : `${items.length} `) : '— '}შეფასება</>}
        sub="ცუდი/სპამი/შეურაცხმყოფელი შეფასების წაშლა · წაშლისას ექსპერტის რეიტინგი გადაითვლება ავტომატურად."
        actions={items && items.length > 0 ? (
          <button
            type="button"
            title="ექსპორტდება მხოლოდ ჩატვირთული ჩანაწერები"
            onClick={() => downloadCsv(`reviews-${new Date().toISOString().slice(0, 10)}.csv`, [
              ['id', 'rating', 'student', 'tutor', 'topic', 'body', 'createdAt'],
              ...items.map(r => [r.id, r.rating, r.student.fullName, r.tutor.user.fullName, r.booking?.topic ?? '', r.body, r.createdAt]),
            ])}
            className="h-9 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-700 font-display font-semibold text-meta inline-flex items-center gap-1.5 transition-colors duration-fast"
          >
            <Icon.download className="w-3.5 h-3.5" /> CSV · {items.length}
          </button>
        ) : undefined}
      />
      <section className="px-6 lg:px-8 py-4 bg-ink-50/40 border-b border-ink-100 sticky top-16 z-20">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-[420px]">
            <Icon.search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="ტექსტი ან სახელი…" className="w-full h-11 pl-9 pr-3 rounded-field border border-ink-200 bg-white text-small focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none" />
          </div>
          <div className="inline-flex items-center p-0.5 rounded-pill bg-white border border-ink-200">
            {[
              { v: 5, label: 'ყველა' },
              { v: 3, label: '≤ 3 ★' },
              { v: 2, label: '≤ 2 ★' },
              { v: 1, label: '1 ★ (ცუდი)' },
            ].map(o => (
              <button key={o.v} type="button" onClick={() => setMaxRating(o.v)} className={`h-8 px-3 rounded-pill font-display text-meta font-semibold tracking-wide transition-colors duration-fast ${maxRating === o.v ? 'bg-ink-900 text-white hover:bg-ink-800' : 'text-ink-600 hover:bg-ink-100'}`}>{o.label}</button>
            ))}
          </div>
        </div>
      </section>
      <section className="px-6 lg:px-8 py-6 space-y-3">
        {err && <AdminError message={err} />}
        {flash && (
          <div role="alert" className={`rounded-btn border px-3 py-2 text-small font-medium ${flash.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>
            {flash.msg}
          </div>
        )}
        {items === null ? (
          <AdminLoading inset />
        ) : items.length === 0 ? (
          <EmptyState
            variant="inline"
            icon={<Icon.star className="w-6 h-6" />}
            title="ამ ფილტრით შეფასება არ არის"
            description="სცადე სხვა ძებნა ან რეიტინგის ზღვარი."
            cta={q.trim() || maxRating !== 5 ? { label: 'ფილტრის გასუფთავება', onClick: () => { setQ(''); setMaxRating(5) } } : undefined}
          />
        ) : items.map(r => (
          <article key={r.id} className="rounded-card border border-ink-200 bg-white p-4">
            <div className="flex items-start gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <img src={r.student.avatarUrl || DEFAULT_AVATAR} alt="" className="w-9 h-9 rounded-full object-cover ring-1 ring-ink-200" />
                <div className="min-w-0">
                  <div className="font-display text-small font-bold text-ink-900 truncate">{r.student.fullName}</div>
                  <div className="text-meta text-ink-500 truncate">→ {r.tutor.user.fullName}{r.booking ? ` · #${r.booking.ref.slice(0, 8)}` : ''}</div>
                </div>
              </div>
              <div className="inline-flex items-center gap-0.5 text-warning-500">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Icon.star key={i} className={`w-3.5 h-3.5 ${i < r.rating ? '' : 'text-ink-200'}`} />
                ))}
                <span className="ml-2 font-display text-meta font-semibold text-ink-700 tabular-nums">{r.rating}.0</span>
              </div>
              <span className="font-mono text-meta tabular-nums text-ink-400">{fmtDT(r.createdAt)}</span>
              <button
                type="button"
                onClick={() => setPendDelete(r)}
                disabled={busy === r.id}
                className="h-9 px-2.5 rounded-btn bg-white border border-ink-200 hover:border-danger-300 hover:bg-danger-50 disabled:opacity-50 text-ink-700 hover:text-danger-700 font-display font-semibold text-meta transition-colors duration-fast"
              >
                {busy === r.id ? '…' : 'წაშლა'}
              </button>
            </div>
            <p className="mt-3 text-small text-ink-700 leading-[1.55] whitespace-pre-wrap">{r.body}</p>
            {r.booking && (
              <div className="mt-2 text-meta text-ink-500">
                <span className="font-display font-semibold">ჯავშანი:</span> {r.booking.topic}
              </div>
            )}
          </article>
        ))}
        {items && <LoadMoreBar hasMore={!!nextCursor} loading={loadingMore} onMore={loadMore} count={items.length} />}
      </section>
      <AdminConfirmDialog
        open={pendDelete !== null}
        title="შეფასების წაშლა"
        body={pendDelete ? <>{pendDelete.student.fullName} → {pendDelete.tutor.user.fullName} · {pendDelete.rating}★. მიზეზი ინახება აუდიტში; ექსპერტის რეიტინგი გადაითვლება.</> : null}
        tone="danger"
        reason="required"
        confirmLabel="წაშალე"
        busy={pendDelete !== null && busy === pendDelete.id}
        onCancel={() => setPendDelete(null)}
        onConfirm={async (reason) => {
          const r = pendDelete
          setPendDelete(null)
          if (r) await remove(r, reason)
        }}
      />
    </>
  )
}

