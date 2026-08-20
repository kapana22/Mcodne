'use client'
// /admin — the composition root. Every tab lives in its own `_<tab>.tsx`
// beside this file; this module owns only the active-tab state, the URL hash
// sync, and the nav badge counts that the sidebar and top bar both read.

import { useState, useEffect } from 'react'
import { AdminSidebar, TopBar, VALID_TABS, TAB_ALIASES, type AdminTab } from './_nav'
import { PresenceBeat } from './_presence'
import { OverviewSection } from './_overview'
import { ModerationSection } from './_moderation'
import { UsersSection } from './_users'
import { BookingsSection } from './_bookings'
import { ReviewsSection } from './_reviews'
import { DisputesSection } from './_disputes'
import { FinanceSection } from './_finance'
import { BroadcastSection } from './_broadcast'
import { CategoriesSection } from './_categories'
import { AuditSection } from './_audit'
import { BlogSection } from './_blog'
import { SiteTextsSection } from './_texts'
import { IntegrationsSection } from './_integrations'
import { SystemSection } from './_system'
import { InsightsSection } from './_insights'
import { HelpSection } from './_help'
import { CompaniesSection } from './_companies'
import { RequestsSection } from './_requests'
import { AccessSection } from './_access'
import { MastersSection } from './_masters'

/* ───── Impersonation banner ─────
   Polls the /status endpoint (a cheap read of the impersonation cookie, no DB
   hit) so the banner also appears when this same tab is idle after an admin
   in a different tab triggered impersonation. */
// Local ImpersonationBanner was replaced by the global one mounted in app/layout.tsx
// so the banner appears on every page (student, tutor, public) — not only /admin.

export default function AdminOverview() {
  // OVERVIEW is the landing tab (owner's call, 2026-08-19 — it was „განაცხადები"
  // from 2026-08-03): the panel opens on the whole picture, and it is the first
  // nav item, standing alone above the groups. The queues are still one click
  // away, and every one of them that has somebody waiting carries a badge in
  // the rail — the six counts below — so an unopened queue is not a silent one.
  const [active, setActive] = useState<AdminTab>('overview')
  const [pendingCount, setPendingCount] = useState<number | null>(null)
  // People waiting for a reply from the help chat. It gets a nav badge for the
  // same reason the application queue does: it is a person, not a number, and
  // until now the only way to discover one was to open the tab and scroll past
  // four stat tiles.
  const [helpOpen, setHelpOpen] = useState<number | null>(null)
  // Unanswered B2B enquiries — the same kind of number as the two above: a
  // queue with a person waiting at the other end of it.
  const [b2bLeads, setB2bLeads] = useState<number | null>(null)
  // Unverified requests — a phone call waiting. Same treatment as the three
  // queue badges above it, from the same stats fetch.
  const [newRequests, setNewRequests] = useState<number | null>(null)
  // Submitted tradesperson applications and unresolved disputes — the last two
  // queues on the panel that had no badge, from the same stats fetch (2026-08-19).
  const [pendingMasters, setPendingMasters] = useState<number | null>(null)
  const [openDisputes, setOpenDisputes] = useState<number | null>(null)
  // Bump this to force <OverviewSection> KPI re-fetch after a moderation
  // decision (approve/reject changes counts).
  const [statsTick, setStatsTick] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const applyHash = () => {
      const raw = window.location.hash.replace('#', '')
      const h = (TAB_ALIASES[raw] ?? raw) as AdminTab
      if (VALID_TABS.includes(h)) setActive(h)
    }
    applyHash()
    window.addEventListener('hashchange', applyHash)
    return () => window.removeEventListener('hashchange', applyHash)
  }, [])

  const loadPending = async () => {
    try {
      // The applications list is cursor-paginated now, so its length is a page
      // size, not the backlog — the stats endpoint carries the real count.
      const r = await fetch('/api/admin/stats', { cache: 'no-store' })
      if (!r.ok) return
      const d = await r.json()
      if (typeof d?.pendingApps === 'number') setPendingCount(d.pendingApps)
      if (typeof d?.helpOpen === 'number') setHelpOpen(d.helpOpen)
      if (typeof d?.b2bLeads === 'number') setB2bLeads(d.b2bLeads)
      if (typeof d?.newRequests === 'number') setNewRequests(d.newRequests)
      if (typeof d?.pendingMasters === 'number') setPendingMasters(d.pendingMasters)
      if (typeof d?.openDisputes === 'number') setOpenDisputes(d.openDisputes)
    } catch {}
  }
  useEffect(() => { loadPending() }, [statsTick])

  const setActiveWithHash = (id: AdminTab) => {
    setActive(id)
    if (typeof window !== 'undefined') window.location.hash = id
  }

  return (
    <div className="font-sans bg-ink-50/30 text-ink-900 antialiased min-h-screen lg:flex lg:items-start">
      {/* Renders nothing. Here rather than inside the requests tab because an
          operator reading any tab is still an operator — see _presence. */}
      <PresenceBeat />
      <AdminSidebar active={active} onNav={setActiveWithHash} pendingCount={pendingCount} helpOpen={helpOpen} b2bLeads={b2bLeads} newRequests={newRequests} pendingMasters={pendingMasters} openDisputes={openDisputes} />
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
      <TopBar active={active} onNav={setActiveWithHash} pendingCount={pendingCount} helpOpen={helpOpen} b2bLeads={b2bLeads} newRequests={newRequests} pendingMasters={pendingMasters} openDisputes={openDisputes} />

      {/* NB: the `key` used to be `active + ':' + statsTick` so that a moderation
          decision would remount the overview KPIs. But `statsTick` also
          bumped while the moderation section was still mounted, destroying
          the success-flash local state. Key on `active` only; parent-level
          `loadPending` still refreshes the nav badge, and OverviewSection
          re-fetches its own KPIs whenever it mounts. */}
      <main key={active}>
        {active === 'overview' && <OverviewSection />}
        {active === 'moderation' && <ModerationSection onDecision={() => setStatsTick(t => t + 1)} />}
        {active === 'users' && <UsersSection />}
        {/* B2B. Unreachable while the vertical is off: `companies` is filtered
            out of ADMIN_NAV, and VALID_TABS is derived from it, so `active` can
            never hold this value. Its APIs are gated independently. */}
        {active === 'companies' && <CompaniesSection onLeadsChanged={() => setStatsTick(t => t + 1)} />}
        {/* Requests. Unreachable while the subsystem is off: both ids are
            filtered out of ADMIN_NAV, and VALID_TABS is derived from it, so
            `active` can never hold either value. Their APIs are gated
            independently — see app/api/admin/requests. */}
        {active === 'requests' && <RequestsSection onChanged={() => setStatsTick(t => t + 1)} />}
        {active === 'masters' && <MastersSection onChanged={() => setStatsTick(t => t + 1)} />}
        {active === 'access' && <AccessSection />}
        {active === 'bookings' && <BookingsSection />}
        {active === 'reviews' && <ReviewsSection />}
        {active === 'disputes' && <DisputesSection />}
        {active === 'finance' && <FinanceSection />}
        {active === 'insights' && <InsightsSection />}
        {active === 'help' && <HelpSection />}
        {active === 'broadcast' && <BroadcastSection />}
        {active === 'categories' && <CategoriesSection />}
        {active === 'blog' && <BlogSection />}
        {active === 'texts' && <SiteTextsSection />}
        {active === 'integrations' && <IntegrationsSection />}
        {active === 'audit' && <AuditSection />}
        {active === 'system' && <SystemSection />}
      </main>
      </div>
    </div>
  )
}
