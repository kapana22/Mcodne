'use client'
// Admin tab: დავები — list + resolve with an outcome.

import { useState, useEffect } from 'react'
import { Icon } from '@/components/Icon'
import { EmptyState } from '@/components/EmptyState'
import { AdminConfirmDialog, TabHeader, AdminLoading, AdminError, fmtDT, LoadMoreBar } from './_parts'

/* ───── Section: Disputes (list + resolve with outcome) ───── */
type AdminDispute = {
  id: string
  bookingId: string
  studentId: string
  tutorId: string
  reason: 'NO_SHOW' | 'QUALITY' | 'WRONG_TOPIC' | 'UNPROFESSIONAL' | 'TECHNICAL' | 'OTHER'
  details: string | null
  requested: string
  outcome: string
  resolution: string | null
  createdAt: string
  resolvedAt: string | null
  booking: {
    id: string; ref: string; topic: string; startAt: string; price: number; status: string
    student: { id: string; fullName: string; email: string; avatarUrl: string | null }
    tutor: { id: string; user: { id: string; fullName: string; email: string; avatarUrl: string | null } }
  }
}

const REASON_LABEL: Record<string, string> = {
  NO_SHOW: 'ექსპერტი არ მოვიდა',
  QUALITY: 'დაბალი ხარისხი',
  WRONG_TOPIC: 'არასწორი თემა',
  UNPROFESSIONAL: 'არაპროფესიული ქცევა',
  TECHNICAL: 'ტექნიკური პრობლემა',
  OTHER: 'სხვა',
}
const OUTCOME_LABEL: Record<string, string> = {
  PENDING: 'გახსნილი',
  REFUND_FULL: '100% ფული უკან',
  REFUND_PARTIAL: '50% ფული უკან',
  REDO_FREE: 'უფასო ხელახლა',
  DISMISSED: 'გამორიცხულია',
}

export const DisputesSection = () => {
  const [items, setItems] = useState<AdminDispute[] | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [outcome, setOutcome] = useState<string>('PENDING')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)
  // Pending resolution → confirm dialog with REQUIRED comment.
  const [pend, setPend] = useState<{ d: AdminDispute; out: 'REFUND_FULL' | 'REFUND_PARTIAL' | 'REDO_FREE' | 'DISMISSED' } | null>(null)

  const load = async () => {
    setErr(null)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (outcome !== 'ALL') params.set('outcome', outcome)
      const res = await fetch(`/api/admin/disputes?${params}`, { cache: 'no-store' })
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
      const params = new URLSearchParams({ limit: '50', cursor: nextCursor })
      if (outcome !== 'ALL') params.set('outcome', outcome)
      const res = await fetch(`/api/admin/disputes?${params}`, { cache: 'no-store' })
      if (!res.ok) return
      const j = await res.json()
      setItems(prev => [...(prev ?? []), ...(Array.isArray(j.items) ? j.items : [])])
      setNextCursor(j.nextCursor ?? null)
    } catch { /* keep current page */ } finally { setLoadingMore(false) }
  }
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t) }, [outcome])

  const resolve = async (d: AdminDispute, out: 'REFUND_FULL' | 'REFUND_PARTIAL' | 'REDO_FREE' | 'DISMISSED', resolution: string) => {
    setBusy(d.id)
    setFlash(null)
    try {
      const res = await fetch(`/api/admin/disputes/${d.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: out, resolution }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) { setFlash({ kind: 'error', msg: 'გადაწყვეტა ვერ მოხერხდა' }); return }
      await load()
      setFlash({ kind: 'success', msg: `დავა გადაწყდა: ${OUTCOME_LABEL[out]}. ორივე მხარეს ეცნობა.` })
    } catch { setFlash({ kind: 'error', msg: 'ქსელის შეცდომა' }) }
    finally { setBusy(null) }
  }

  const OUTCOME_TABS = [
    { id: 'PENDING', label: 'გახსნილი' },
    { id: 'ALL', label: 'ყველა' },
    { id: 'REFUND_FULL', label: '100% დაბრუნება' },
    { id: 'REFUND_PARTIAL', label: '50% დაბრუნება' },
    { id: 'REDO_FREE', label: 'ხელახალი სესია' },
    { id: 'DISMISSED', label: 'უარყოფილი' },
  ]

  return (
    <>
      <TabHeader
        eyebrow="მოდერაცია · დავები"
        // Cursor-paginated — while a next page remains this is the LOADED count.
        title={<>{items ? (nextCursor ? `ჩატვირთულია ${items.length} ` : `${items.length} `) : '— '}დავა</>}
        sub="სტუდენტის ფორმალური საჩივრები — გახსენი, გადახედე, გადაწყვიტე (refund / redo / dismiss). გადაწყვეტა უცნობდება ორივე მხარეს."
      />
      <section className="px-6 lg:px-8 py-4 bg-ink-50/40 border-b border-ink-100 sticky top-16 z-20">
        <div className="inline-flex items-center p-0.5 rounded-pill bg-white border border-ink-200 overflow-x-auto">
          {OUTCOME_TABS.map(t => (
            <button key={t.id} type="button" onClick={() => setOutcome(t.id)} className={`shrink-0 h-8 px-3 rounded-pill font-display text-meta font-semibold tracking-wide transition-colors duration-fast ${outcome === t.id ? 'bg-ink-900 text-white hover:bg-ink-800' : 'text-ink-600 hover:bg-ink-100'}`}>{t.label}</button>
          ))}
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
            icon={<Icon.flag className="w-6 h-6" />}
            title="ამ ფილტრით დავა არ არის"
            description={outcome === 'PENDING' ? 'გახსნილი დავა არ არის — ყველა გადაწყვეტილია ან საერთოდ არ ყოფილა.' : 'სცადე სხვა ფილტრი.'}
            cta={outcome !== 'ALL' ? { label: 'ყველას ჩვენება', onClick: () => setOutcome('ALL') } : undefined}
          />
        ) : items.map(d => (
          <article key={d.id} className="rounded-card border border-ink-200 bg-white p-4">
            <div className="flex items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <span className={`inline-flex items-center h-5 px-1.5 rounded-pill border font-display text-micro font-bold uppercase ${
                    d.outcome === 'PENDING' ? 'bg-warning-50 border-warning-200 text-warning-700'
                    : d.outcome.startsWith('REFUND') ? 'bg-danger-50 border-danger-200 text-danger-700'
                    : d.outcome === 'REDO_FREE' ? 'bg-brand-50 border-brand-200 text-brand-700'
                    : 'bg-ink-100 border-ink-200 text-ink-600'
                  }`}>{OUTCOME_LABEL[d.outcome] ?? d.outcome}</span>
                  <span className="font-display text-small font-bold text-ink-900">{REASON_LABEL[d.reason] ?? d.reason}</span>
                  <span className="font-mono text-meta text-ink-400 tabular-nums">{fmtDT(d.createdAt)}</span>
                </div>
                <div className="text-meta text-ink-600 truncate">
                  <span className="font-display font-semibold">{d.booking.student.fullName}</span>
                  {' → '}
                  <span className="font-display font-semibold">{d.booking.tutor.user.fullName}</span>
                  {' · '}
                  <span className="text-ink-400">{d.booking.topic}</span>
                  {' · '}
                  <span className="tabular-nums">₾{d.booking.price}</span>
                </div>
                {d.details && <p className="mt-2 text-small text-ink-700 leading-snug whitespace-pre-wrap">{d.details}</p>}
                {d.resolution && (
                  <div className="mt-2 p-2.5 rounded-btn bg-ink-50 border border-ink-100 text-meta text-ink-700"><span className="font-display font-semibold">გადაწყვეტა:</span> {d.resolution}</div>
                )}
              </div>
              {d.outcome === 'PENDING' && (
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <button type="button" disabled={busy === d.id} onClick={() => setPend({ d, out: 'REFUND_FULL' })} className="h-9 px-2.5 rounded-btn bg-danger-500 hover:bg-danger-600 disabled:opacity-50 text-white font-display text-meta font-semibold">100% დაბრუნება</button>
                  <button type="button" disabled={busy === d.id} onClick={() => setPend({ d, out: 'REFUND_PARTIAL' })} className="h-9 px-2.5 rounded-btn bg-warning-600 hover:bg-warning-700 disabled:opacity-50 text-white font-display text-meta font-semibold">50% დაბრუნება</button>
                  <button type="button" disabled={busy === d.id} onClick={() => setPend({ d, out: 'REDO_FREE' })} className="h-9 px-2.5 rounded-btn bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-display text-small font-semibold">ხელახალი სესია</button>
                  <button type="button" disabled={busy === d.id} onClick={() => setPend({ d, out: 'DISMISSED' })} className="h-9 px-2.5 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 disabled:opacity-50 text-ink-700 font-display text-meta font-semibold">უარყოფა</button>
                </div>
              )}
            </div>
          </article>
        ))}
        {items && <LoadMoreBar hasMore={!!nextCursor} loading={loadingMore} onMore={loadMore} count={items.length} />}
      </section>
      <AdminConfirmDialog
        open={pend !== null}
        title={pend ? `გადაწყვეტა: ${OUTCOME_LABEL[pend.out]}` : ''}
        body={pend ? <>{pend.d.booking.student.fullName} → {pend.d.booking.tutor.user.fullName} · {pend.d.booking.topic}. კომენტარი გამოჩნდება ორივე მხარის ცნობებში.</> : null}
        tone={pend?.out === 'REFUND_FULL' || pend?.out === 'REFUND_PARTIAL' ? 'danger' : 'brand'}
        reason="required"
        reasonLabel="კომენტარი (სავალდებულო)"
        confirmLabel="გადაწყვიტე"
        busy={pend !== null && busy === pend.d.id}
        onCancel={() => setPend(null)}
        onConfirm={async (resolution) => {
          const p = pend
          setPend(null)
          if (p) await resolve(p.d, p.out, resolution)
        }}
      />
    </>
  )
}

