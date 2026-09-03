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
//
// ⚠️ THAT RULE WAS A COMMENT AND NOTHING CHECKED IT (fixed 2026-08-26).
// Measured that day: THIRTEEN of the twenty-nine actions the panel writes had
// no label — including `master.approve` (approving an expert, the single most
// common decision here), `request.routed` (telling providers about a request)
// and every company/B2B action. The whole point of this tab is that an admin
// can read back what was done, and a third of it read `noun.verb`.
// `tests/adminAudit.test.ts` now walks the audit() call sites and fails on the
// first unlabelled one, so the comment above is enforced rather than hoped for.
const ACTION_LABEL: Record<string, string> = {
  'application.approve': 'განაცხადი დამტკიცდა',
  'application.approve.verified': 'დამტკიცებისას მიენიჭა „გადამოწმებული“',
  'application.reject': 'განაცხადი უარყოფილია',
  'application.revise': 'განაცხადი შესასწორებლად დაბრუნდა',
  'review.delete': 'შეფასება წაიშალა',
  'user.impersonate.start': 'იმპერსონაცია დაიწყო',
  'user.impersonate.end': 'იმპერსონაცია დასრულდა',
  'user.suspend': 'ანგარიში შეჩერდა',
  'user.unsuspend': 'შეჩერება მოიხსნა',
  'user.message': 'მომხმარებელს მიეწერა',
  'user.makeAdmin': 'მიენიჭა ადმინის უფლება',
  'user.revokeAdmin': 'მოეხსნა ადმინის უფლება',
  'user.delete': 'ანგარიში სრულად წაიშალა',
  'user.anonymize': 'ანგარიში ანონიმიზდა',
  'provider.feature': 'ექსპერტი გახდა რჩეული',
  'provider.unfeature': 'ექსპერტს მოეხსნა რჩეული',
  'provider.verify': 'ექსპერტი ვერიფიცირდა',
  'provider.unverify': 'ვერიფიკაცია მოეხსნა',
  // ⚠️ THE `tutor.*` KEYS STAY, AND THEY ARE NOT DEAD CODE. An audit action is
  // WRITTEN INTO THE ROW (lib/audit → AuditLog.action); every entry filed before
  // the rename still says `tutor.verify`, and a label map that forgot the old
  // key would print the raw string into the one table whose whole job is to be
  // readable months later. Nothing emits these any more — the three routes under
  // /api/admin/providers now write `provider.*` — so this block only ever grows
  // older, and it is deleted the day the rows it explains are.
  'tutor.feature': 'ექსპერტი გახდა რჩეული',
  'tutor.unfeature': 'ექსპერტს მოეხსნა რჩეული',
  'tutor.verify': 'ექსპერტი ვერიფიცირდა',
  'tutor.unverify': 'ვერიფიკაცია მოეხსნა',
  'integration.set': 'ინტეგრაციის კოდი ჩაიწერა',
  'integration.clear': 'ინტეგრაციის კოდი ამოიშალა',
  'message.on': 'შეტყობინება ჩაირთო',
  'message.off': 'შეტყობინება გამოირთო',
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
  'category.redirect': 'კატეგორია გადამისამართდა',

  // ── The service application queue („განაცხადები") ──
  // ⚠️ BOTH SPELLINGS, AND THE OLD ONE IS NOT A LEFTOVER (2026-08-30). The
  // writer says `provider.*` since the „მასტერი" rename; every row already in
  // the table says `master.*`, and an audit log's whole job is to still be
  // readable years later. Dropping the old keys would turn real history into
  // raw codes on screen — which is the one thing this map exists to prevent.
  'provider.approve': 'სერვისის განაცხადი დამტკიცდა',
  'provider.reject': 'სერვისის განაცხადი უარყოფილია',
  'provider.revise': 'სერვისის განაცხადი შესასწორებლად დაბრუნდა',
  'master.approve': 'სერვისის განაცხადი დამტკიცდა',
  'master.reject': 'სერვისის განაცხადი უარყოფილია',
  'master.revise': 'სერვისის განაცხადი შესასწორებლად დაბრუნდა',

  // ── Requests: the verification call, and who was told about it ──
  'request.verified': 'მოთხოვნა გადამოწმდა',
  'request.rejected': 'მოთხოვნა უარყოფილია',
  'request.new': 'მოთხოვნა დაბრუნდა რიგში',
  'request.matched': 'მოთხოვნას შესრულებელი მოეძებნა',
  'request.closed': 'მოთხოვნა დაიხურა',
  'request.update': 'მოთხოვნა დარედაქტირდა',
  'request.routed': 'მოთხოვნა ექსპერტებს გაეგზავნა',

  // ── The requests allowlist („წვდომა") ──
  'request.access.grant': 'წვდომა მიენიჭა',
  'request.access.enable': 'წვდომა ჩაირთო',
  'request.access.disable': 'წვდომა გამოირთო',

  // ── Credits ──
  'credits.grant': 'კრედიტი დაერიცხა',
  'credits.deduct': 'კრედიტი ჩამოეჭრა',

  // ── The provider's own row ──
  'provider.category.set': 'ექსპერტს კატეგორია შეეცვალა',
  'tutor.category.set': 'ექსპერტს კატეგორია შეეცვალა', // historical rows — see above

  // ── B2B. The vertical is dark (lib/flags → B2B_VISIBILITY), and these stay
  //    because the audit log is written by whatever ran, not by what is on
  //    screen today: rows from the period it WAS on are still in the table.
  'company.create': 'კომპანია დაემატა',
  'company.update': 'კომპანია დარედაქტირდა',
  'company.member.add': 'კომპანიას წევრი დაემატა',
  'company.member.remove': 'კომპანიას წევრი მოეხსნა',
  'company.balance.topup': 'კომპანიის ბალანსი შეივსო',
  'company.balance.charge': 'კომპანიის ბალანსიდან ჩამოიჭრა',
  'businessLead.status': 'B2B განაცხადის სტატუსი შეიცვალა',
  'businessLead.deal': 'B2B განაცხადი გარიგებად ჩაიწერა',
  'b2bService.create': 'B2B სერვისი დაემატა',
  'b2bService.update': 'B2B სერვისი დარედაქტირდა',
  'b2bService.delete': 'B2B სერვისი წაიშალა',
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
            {/* ⚠️ THE EXAMPLES ARE PREFIXES THE CODE STILL WRITES (2026-08-30). It read
              „booking, review, application…" and led with the one that is dead:
              no `booking.*` row has been written since the product went on
              2026-08-24, so the panel's own first suggestion returned nothing.
              A filter that teaches a query with no rows is worse than an empty
              box — it reads as „the log is broken". */}
            <input type="text" value={actionFilter} onChange={e => setActionFilter(e.target.value)} placeholder="მოქმედების პრეფიქსი (request, user, company…)" className="w-full h-11 pl-9 pr-3 rounded-field border border-ink-200 bg-white text-small focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none" />
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

