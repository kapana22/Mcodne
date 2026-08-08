'use client'
// Admin tab: აუდიტი — the admin action log.

import { useState, useEffect } from 'react'
import { Icon } from '@/components/Icon'
import { EmptyState } from '@/components/EmptyState'
import { TabHeader, AdminLoading, AdminError, downloadCsv, fmtDT } from './_parts'

/* ───── Section: Audit log ───── */
type AuditItem = {
  id: string
  actorId: string
  action: string
  targetType: string | null
  targetId: string | null
  meta: any
  createdAt: string
  actor: { id: string; fullName: string; email: string } | null
}

// Every action string written by an audit() call site must have a label here —
// an unmapped one falls back to the raw `noun.verb` and reads like a bug.
const ACTION_LABEL: Record<string, string> = {
  'application.approve': 'განაცხადი დამტკიცდა',
  'application.approve.verified': 'დამტკიცებისას მიენიჭა „გადამოწმებული“',
  'application.reject': 'განაცხადი უარყოფილია',
  'application.revise': 'განაცხადი შესასწორებლად დაბრუნდა',
  'booking.cancel': 'ჯავშანი გაუქმდა',
  'review.delete': 'შეფასება წაიშალა',
  'dispute.resolve': 'დავა გადაწყდა',
  'user.impersonate.start': 'იმპერსონაცია დაიწყო',
  'user.impersonate.end': 'იმპერსონაცია დასრულდა',
  'user.suspend': 'ანგარიში შეჩერდა',
  'user.unsuspend': 'შეჩერება მოიხსნა',
  'user.message': 'მომხმარებელს მიეწერა',
  'user.makeAdmin': 'მიენიჭა ადმინის უფლება',
  'user.revokeAdmin': 'მოეხსნა ადმინის უფლება',
  'user.delete': 'ანგარიში სრულად წაიშალა',
  'user.anonymize': 'ანგარიში ანონიმიზდა',
  'tutor.feature': 'ექსპერტი გახდა რჩეული',
  'tutor.unfeature': 'ექსპერტს მოეხსნა რჩეული',
  'tutor.verify': 'ექსპერტი ვერიფიცირდა',
  'tutor.unverify': 'ვერიფიკაცია მოეხსნა',
  'integration.set': 'ინტეგრაციის კოდი ჩაიწერა',
  'integration.clear': 'ინტეგრაციის კოდი ამოიშალა',
  'siteText.set': 'საიტის ტექსტი შეიცვალა',
  'siteText.reset': 'საიტის ტექსტი დაუბრუნდა ნაგულისხმევს',
  'post.create': 'სტატია შეიქმნა',
  'post.update': 'სტატია დარედაქტირდა',
  'post.publish': 'სტატია გამოქვეყნდა',
  'post.unpublish': 'სტატია დაიმალა',
  'post.delete': 'სტატია წაიშალა',
  'category.create': 'კატეგორია დაემატა',
  'category.update': 'კატეგორია შეიცვალა',
  'category.hide': 'კატეგორია დაიმალა',
  'category.show': 'კატეგორია გამოჩნდა',
  'category.delete': 'კატეგორია წაიშალა',
  'broadcast.send': 'მასობრივი შეტყობინება გაიგზავნა',
}

export const AuditSection = () => {
  const [items, setItems] = useState<AuditItem[] | null>(null)
  const [actionFilter, setActionFilter] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const load = async () => {
    setErr(null)
    try {
      const params = new URLSearchParams({ limit: '200' })
      if (actionFilter) params.set('action', actionFilter)
      const res = await fetch(`/api/admin/audit?${params}`, { cache: 'no-store' })
      if (!res.ok) { setErr('ჩატვირთვა ვერ მოხერხდა'); return }
      const rows = await res.json()
      setItems(Array.isArray(rows) ? rows : [])
    } catch { setErr('ქსელის შეცდომა') }
  }
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t) }, [actionFilter])

  return (
    <>
      <TabHeader
        eyebrow="სისტემა · აუდიტი"
        title={<>{items ? `${items.length} ` : '—'} ჩანაწერი</>}
        sub="ყოველი admin action ინახება აუდიტში — approve/reject, cancel, delete, impersonate, message."
        actions={items && items.length > 0 ? (
          <button
            type="button"
            onClick={() => downloadCsv(`audit-${new Date().toISOString().slice(0, 10)}.csv`, [
              ['createdAt', 'actor', 'action', 'targetType', 'targetId', 'meta'],
              ...items.map(i => [i.createdAt, i.actor?.email ?? i.actorId, i.action, i.targetType ?? '', i.targetId ?? '', JSON.stringify(i.meta ?? {})]),
            ])}
            className="h-9 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-700 font-display font-semibold text-meta inline-flex items-center gap-1.5 transition-colors duration-fast"
          >
            <Icon.download className="w-3.5 h-3.5" /> CSV ექსპორტი
          </button>
        ) : undefined}
      />
      <section className="px-6 lg:px-8 py-4 bg-ink-50/40 border-b border-ink-100 sticky top-16 z-20">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-[360px]">
            <Icon.search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="text" value={actionFilter} onChange={e => setActionFilter(e.target.value)} placeholder="მოქმედების პრეფიქსი (booking, review, application…)" className="w-full h-11 pl-9 pr-3 rounded-field border border-ink-200 bg-white text-small focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none" />
          </div>
        </div>
      </section>
      <section className="px-6 lg:px-8 py-6">
        {err && <AdminError message={err} className="mb-4" />}
        <div className="rounded-card border border-ink-200 bg-white overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-small min-w-[800px]">
              <thead className="bg-ink-50/40 border-b border-ink-100">
                <tr className="text-left">
                  <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 whitespace-nowrap">დრო</th>
                  <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 whitespace-nowrap">ვინ</th>
                  <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 whitespace-nowrap">მოქმედება</th>
                  <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 whitespace-nowrap">ობიექტი</th>
                  <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 whitespace-nowrap">დეტალი</th>
                </tr>
              </thead>
              <tbody>
                {items === null ? (
                  <tr><td colSpan={5} className="px-3 py-10 text-center"><AdminLoading /></td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={5} className="px-3">
                    <EmptyState
                      variant="inline"
                      icon={<Icon.doc className="w-6 h-6" />}
                      title="ჩანაწერი არ არის"
                      description="ადმინის მოქმედებები აქ დაფიქსირდება."
                      cta={actionFilter ? { label: 'ფილტრის გასუფთავება', onClick: () => setActionFilter('') } : undefined}
                    />
                  </td></tr>
                ) : items.map(i => (
                  <tr key={i.id} className="border-t border-ink-100 hover:bg-ink-50/40">
                    <td className="px-3 py-2.5 font-mono text-meta tabular-nums text-ink-500 whitespace-nowrap">{fmtDT(i.createdAt)}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-display text-small font-bold text-ink-900 truncate max-w-[180px]">{i.actor?.fullName ?? i.actorId}</div>
                      <div className="font-mono text-meta text-ink-500 truncate max-w-[180px]">{i.actor?.email ?? ''}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-display text-small font-bold text-ink-900">{ACTION_LABEL[i.action] ?? i.action}</div>
                      <div className="font-mono text-meta text-ink-400 tabular-nums">{i.action}</div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-meta tabular-nums text-ink-500 truncate max-w-[200px]">{i.targetType ?? '—'}{i.targetId ? ' · ' + i.targetId.slice(0, 12) : ''}</td>
                    <td className="px-3 py-2.5 font-mono text-meta tabular-nums text-ink-500 truncate max-w-[280px]" title={JSON.stringify(i.meta ?? {})}>{i.meta ? JSON.stringify(i.meta).slice(0, 80) : '—'}</td>
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
                icon={<Icon.doc className="w-6 h-6" />}
                title="ჩანაწერი არ არის"
                description="ადმინის მოქმედებები აქ დაფიქსირდება."
                cta={actionFilter ? { label: 'ფილტრის გასუფთავება', onClick: () => setActionFilter('') } : undefined}
              />
            ) : items.map(i => (
              <div key={i.id} className="px-4 py-3 border-b border-ink-100 last:border-b-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-display text-small font-bold text-ink-900 truncate">{ACTION_LABEL[i.action] ?? i.action}</div>
                    <div className="font-mono text-meta text-ink-400 tabular-nums truncate">{i.action}</div>
                  </div>
                  <span className="shrink-0 font-mono text-meta tabular-nums text-ink-500">{fmtDT(i.createdAt)}</span>
                </div>
                <div className="mt-1 text-meta text-ink-600 truncate">
                  <span className="font-display font-semibold">{i.actor?.fullName ?? i.actorId}</span>
                  {i.actor?.email ? <span className="font-mono text-ink-500"> · {i.actor.email}</span> : null}
                </div>
                <div className="mt-0.5 font-mono text-meta tabular-nums text-ink-500 truncate">
                  {i.targetType ?? '—'}{i.targetId ? ' · ' + i.targetId.slice(0, 12) : ''}
                </div>
                {i.meta ? (
                  <div className="mt-0.5 font-mono text-meta tabular-nums text-ink-500 truncate" title={JSON.stringify(i.meta ?? {})}>
                    {JSON.stringify(i.meta).slice(0, 80)}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}

