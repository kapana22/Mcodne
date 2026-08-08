'use client'
// Admin tab: ჯავშნები — all bookings with admin cancel.

import { useState, useEffect } from 'react'
import { Icon } from '@/components/Icon'
import { EmptyState } from '@/components/EmptyState'
import { AdminConfirmDialog, TabHeader, AdminLoading, AdminError, downloadCsv, KA_STATUS, fmtDT, LoadMoreBar } from './_parts'

/* ───── Section: Bookings (admin view of all bookings + cancel) ───── */
type AdminBooking = {
  id: string
  ref: string
  topic: string
  status: 'PREPARING'|'CONFIRMED'|'LIVE'|'COMPLETED'|'CANCELED'|'NO_SHOW'
  startAt: string
  durationMin: number
  price: number
  student: { id: string; fullName: string; email: string; avatarUrl: string | null } | null
  tutor: {
    id: string
    user: { id: string; fullName: string; email: string; avatarUrl: string | null }
  } | null
}

const BOOKING_STATUS_TABS: { id: 'all' | AdminBooking['status']; label: string }[] = [
  { id: 'all',       label: 'ყველა' },
  { id: 'PREPARING', label: 'მოსამზადებელი' },
  { id: 'CONFIRMED', label: 'დადასტურდა' },
  { id: 'LIVE',      label: 'ცოცხალი' },
  { id: 'COMPLETED', label: 'დასრულდა' },
  { id: 'CANCELED',  label: 'გაუქმდა' },
  { id: 'NO_SHOW',   label: 'გამოუცხადებლობა' },
]

export const BookingsSection = () => {
  const [items, setItems] = useState<AdminBooking[] | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [status, setStatus] = useState<'all' | AdminBooking['status']>('all')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  // Action feedback (success/error) — separate from load errors so a reload
  // doesn't wipe the "canceled" confirmation.
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)
  const [pendCancel, setPendCancel] = useState<AdminBooking | null>(null)

  const load = async () => {
    setErr(null)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (status !== 'all') params.set('status', status)
      if (q.trim()) params.set('q', q.trim())
      const res = await fetch(`/api/admin/bookings?${params}`, { cache: 'no-store' })
      if (!res.ok) { setErr('ჩატვირთვა ვერ მოხერხდა'); return }
      const j = await res.json()
      setItems(j.items ?? [])
      setNextCursor(j.nextCursor ?? null)
    } catch { setErr('ქსელის შეცდომა') }
  }

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const params = new URLSearchParams({ limit: '50', cursor: nextCursor })
      if (status !== 'all') params.set('status', status)
      if (q.trim()) params.set('q', q.trim())
      const res = await fetch(`/api/admin/bookings?${params}`, { cache: 'no-store' })
      if (!res.ok) return
      const j = await res.json()
      setItems(prev => [...(prev ?? []), ...(j.items ?? [])])
      setNextCursor(j.nextCursor ?? null)
    } catch { /* keep current page */ } finally { setLoadingMore(false) }
  }

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [status, q])

  const cancel = async (b: AdminBooking, reason: string) => {
    setBusy(b.id)
    setFlash(null)
    try {
      const res = await fetch(`/api/bookings/${b.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        setFlash({ kind: 'error', msg: j.error === 'BAD_STATE' ? 'ეს ჯავშანი უკვე დახურულია' : 'გაუქმება ვერ მოხერხდა' })
        return
      }
      await load()
      setFlash({ kind: 'success', msg: 'ჯავშანი გაუქმდა — ორივე მხარეს ეცნობა.' })
    } catch { setFlash({ kind: 'error', msg: 'ქსელის შეცდომა' }) }
    finally { setBusy(null) }
  }

  return (
    <>
      <TabHeader
        eyebrow="მოდერაცია · ჯავშნები"
        // Cursor-paginated list — while a next page remains this is the LOADED
        // count, not the total match, and the CSV carries exactly these rows.
        title={<>{items ? (nextCursor ? `ჩატვირთულია ${items.length} ` : `${items.length} `) : '— '}ჯავშანი</>}
        sub="ყველა ჯავშნის ნახვა · გაუქმება სტუდენტის/ექსპერტის სახელით · მიზეზი გამოჩნდება ორივე მხარისთვის."
        actions={items && items.length > 0 ? (
          <button
            type="button"
            title="ექსპორტდება მხოლოდ ჩატვირთული ჩანაწერები"
            onClick={() => downloadCsv(`bookings-${new Date().toISOString().slice(0, 10)}.csv`, [
              ['id', 'ref', 'topic', 'status', 'startAt', 'durationMin', 'price', 'studentEmail', 'tutorEmail'],
              ...items.map(b => [b.id, b.ref, b.topic, b.status, b.startAt, b.durationMin, b.price, b.student?.email ?? '', b.tutor?.user.email ?? '']),
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
            <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="თემა, ref, სახელი…" className="w-full h-11 pl-9 pr-3 rounded-field border border-ink-200 bg-white text-small focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none" />
          </div>
          <div className="inline-flex items-center p-0.5 rounded-pill bg-white border border-ink-200 overflow-x-auto">
            {BOOKING_STATUS_TABS.map(t => (
              <button key={t.id} type="button" onClick={() => setStatus(t.id)} className={`shrink-0 h-8 px-3 rounded-pill font-display text-meta font-semibold tracking-wide transition-colors duration-fast ${status === t.id ? 'bg-ink-900 text-white hover:bg-ink-800' : 'text-ink-600 hover:bg-ink-100'}`}>{t.label}</button>
            ))}
          </div>
        </div>
      </section>
      <section className="px-6 lg:px-8 py-6">
        {err && <AdminError message={err} className="mb-4" />}
        {flash && (
          <div role="alert" className={`mb-4 rounded-btn border px-3 py-2 text-small font-medium ${flash.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>
            {flash.msg}
          </div>
        )}
        <div className="rounded-card border border-ink-200 bg-white overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-small min-w-[900px]">
              <thead className="bg-ink-50/40 border-b border-ink-100">
                <tr className="text-left">
                  <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 whitespace-nowrap">ჯავშანი</th>
                  <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 whitespace-nowrap">სტუდენტი</th>
                  <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 whitespace-nowrap">ექსპერტი</th>
                  <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 whitespace-nowrap">დრო</th>
                  <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 whitespace-nowrap">სტატუსი</th>
                  <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 text-right whitespace-nowrap">ფასი</th>
                  <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 text-right whitespace-nowrap">მოქმ.</th>
                </tr>
              </thead>
              <tbody>
                {items === null ? (
                  <tr><td colSpan={7} className="px-3 py-10 text-center"><AdminLoading /></td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={7} className="px-3">
                    <EmptyState
                      variant="inline"
                      icon={<Icon.search className="w-6 h-6" />}
                      title="ჯავშანი ვერ მოიძებნა"
                      description="ამ ძებნას და სტატუსს არც ერთი ჯავშანი არ შეესაბამება."
                      cta={q.trim() || status !== 'all' ? { label: 'ფილტრის გასუფთავება', onClick: () => { setQ(''); setStatus('all') } } : undefined}
                    />
                  </td></tr>
                ) : items.map(b => (
                  <tr key={b.id} className="border-t border-ink-100 hover:bg-ink-50/40">
                    <td className="px-3 py-3">
                      <div className="font-display text-small font-bold text-ink-900 truncate max-w-[280px]">{b.topic}</div>
                      <div className="font-mono text-meta tabular-nums text-ink-500 truncate">#{b.ref.slice(0, 8)}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-display text-small font-semibold text-ink-900 truncate max-w-[180px]">{b.student?.fullName ?? '—'}</div>
                      <div className="font-mono text-meta tabular-nums text-ink-500 truncate max-w-[180px]">{b.student?.email ?? ''}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-display text-small font-semibold text-ink-900 truncate max-w-[180px]">{b.tutor?.user.fullName ?? '—'}</div>
                      <div className="font-mono text-meta tabular-nums text-ink-500 truncate max-w-[180px]">{b.tutor?.user.email ?? ''}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-mono text-meta tabular-nums text-ink-700 whitespace-nowrap">{fmtDT(b.startAt)}</div>
                      <div className="font-mono text-meta tabular-nums text-ink-500">{b.durationMin} წუთი</div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center h-5 px-1.5 rounded-pill font-display text-micro font-bold uppercase ${
                        b.status === 'COMPLETED' ? 'bg-success-50 text-success-700 border border-success-200'
                        : b.status === 'CANCELED' || b.status === 'NO_SHOW' ? 'bg-ink-100 text-ink-600 border border-ink-200'
                        : b.status === 'LIVE' ? 'bg-danger-50 text-danger-700 border border-danger-200'
                        : 'bg-brand-50 text-brand-700 border border-brand-200'
                      }`}>{KA_STATUS[b.status] ?? b.status}</span>
                    </td>
                    <td className="px-3 py-3 text-right font-display font-bold text-ink-900 tabular-nums whitespace-nowrap">₾{b.price}</td>
                    <td className="px-3 py-3 text-right">
                      {(b.status === 'PREPARING' || b.status === 'CONFIRMED') && (
                        <button
                          type="button"
                          onClick={() => setPendCancel(b)}
                          disabled={busy === b.id}
                          className="h-9 px-2.5 rounded-btn bg-white border border-ink-200 hover:border-danger-300 hover:bg-danger-50 disabled:opacity-50 text-ink-700 hover:text-danger-700 font-display font-semibold text-meta transition-colors duration-fast"
                        >
                          {busy === b.id ? '…' : 'გაუქმება'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile stacked-card fallback — same rows/states as the table. */}
          <div className="block md:hidden">
            {items === null ? (
              <AdminLoading inset />
            ) : items.length === 0 ? (
              <EmptyState
                variant="inline"
                icon={<Icon.search className="w-6 h-6" />}
                title="ჯავშანი ვერ მოიძებნა"
                description="ამ ძებნას და სტატუსს არც ერთი ჯავშანი არ შეესაბამება."
                cta={q.trim() || status !== 'all' ? { label: 'ფილტრის გასუფთავება', onClick: () => { setQ(''); setStatus('all') } } : undefined}
              />
            ) : items.map(b => (
              <div key={b.id} className="px-4 py-3 border-b border-ink-100 last:border-b-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-display text-small font-bold text-ink-900 truncate">{b.topic}</div>
                    <div className="font-mono text-meta tabular-nums text-ink-500">#{b.ref.slice(0, 8)} · {fmtDT(b.startAt)} · {b.durationMin} წუთი</div>
                  </div>
                  <span className={`shrink-0 inline-flex items-center h-5 px-1.5 rounded-pill font-display text-micro font-bold uppercase ${
                    b.status === 'COMPLETED' ? 'bg-success-50 text-success-700 border border-success-200'
                    : b.status === 'CANCELED' || b.status === 'NO_SHOW' ? 'bg-ink-100 text-ink-600 border border-ink-200'
                    : b.status === 'LIVE' ? 'bg-danger-50 text-danger-700 border border-danger-200'
                    : 'bg-brand-50 text-brand-700 border border-brand-200'
                  }`}>{KA_STATUS[b.status] ?? b.status}</span>
                </div>
                <div className="mt-1.5 text-meta text-ink-600 truncate">
                  <span className="font-display font-semibold">{b.student?.fullName ?? '—'}</span>
                  {' → '}
                  <span className="font-display font-semibold">{b.tutor?.user.fullName ?? '—'}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="font-display text-small font-bold text-ink-900 tabular-nums">₾{b.price}</span>
                  {(b.status === 'PREPARING' || b.status === 'CONFIRMED') && (
                    <button
                      type="button"
                      onClick={() => setPendCancel(b)}
                      disabled={busy === b.id}
                      className="h-9 px-2.5 rounded-btn bg-white border border-ink-200 hover:border-danger-300 hover:bg-danger-50 disabled:opacity-50 text-ink-700 hover:text-danger-700 font-display font-semibold text-meta transition-colors duration-fast"
                    >
                      {busy === b.id ? '…' : 'გაუქმება'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        {items && <LoadMoreBar hasMore={!!nextCursor} loading={loadingMore} onMore={loadMore} count={items.length} />}
      </section>
      <AdminConfirmDialog
        open={pendCancel !== null}
        title="ჯავშნის გაუქმება"
        body={pendCancel ? <>{pendCancel.topic} · {pendCancel.student?.fullName ?? '—'} → {pendCancel.tutor?.user.fullName ?? '—'}. მიზეზი გამოჩნდება ორივე მხარისთვის.</> : null}
        tone="danger"
        reason="required"
        confirmLabel="გააუქმე"
        busy={pendCancel !== null && busy === pendCancel.id}
        onCancel={() => setPendCancel(null)}
        onConfirm={async (reason) => {
          const b = pendCancel
          setPendCancel(null)
          if (b) await cancel(b, reason)
        }}
      />
    </>
  )
}

