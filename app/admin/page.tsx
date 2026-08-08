'use client'
// /admin — the composition root. Every tab lives in its own `_<tab>.tsx`
// beside this file; this module owns only the active-tab state, the URL hash
// sync, and the nav badge counts that the sidebar and top bar both read.

import { useState, useEffect } from 'react'
import { AdminSidebar, TopBar, VALID_TABS, type AdminTab } from './_nav'
import { OverviewSection } from './_overview'
import { ModerationSection } from './_moderation'
import { UsersSection } from './_users'
import { BookingsSection } from './_bookings'
import { ReviewsSection } from './_reviews'
import { DisputesSection } from './_disputes'
import { FinanceSection } from './_finance'
import { AnalyticsSection } from './_analytics'
import { BroadcastSection } from './_broadcast'
import { CategoriesSection } from './_categories'
import { AuditSection } from './_audit'
import { BlogSection } from './_blog'
import { SiteTextsSection } from './_texts'
import { IntegrationsSection } from './_integrations'
import { SystemSection } from './_system'
import { InsightsSection } from './_insights'
import { HelpSection } from './_help'

/* ───── Impersonation banner ─────
   Polls the /status endpoint (a cheap read of the impersonation cookie, no DB
   hit) so the banner also appears when this same tab is idle after an admin
   in a different tab triggered impersonation. */
// Local ImpersonationBanner was replaced by the global one mounted in app/layout.tsx
// so the banner appears on every page (student, tutor, public) — not only /admin.

export default function AdminOverview() {
  // MODERATION is the landing tab (2026-08-03, user's call): reviewing expert
  // applications is the one job on this panel that someone is WAITING on — an
  // unopened queue costs an applicant days. „მიმოხილვა“ is a dashboard you read
  // when you choose to; it is one click away and still the first nav item.
  const [active, setActive] = useState<AdminTab>('moderation')
  const [pendingCount, setPendingCount] = useState<number | null>(null)
  // People waiting for a reply from the help chat. It gets a nav badge for the
  // same reason the application queue does: it is a person, not a number, and
  // until now the only way to discover one was to open the tab and scroll past
  // four stat tiles.
  const [helpOpen, setHelpOpen] = useState<number | null>(null)
  // Bump this to force <OverviewSection> KPI re-fetch after a moderation
  // decision (approve/reject changes counts).
  const [statsTick, setStatsTick] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const applyHash = () => {
      const h = window.location.hash.replace('#', '') as AdminTab
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
    } catch {}
  }
  useEffect(() => { loadPending() }, [statsTick])

  const setActiveWithHash = (id: AdminTab) => {
    setActive(id)
    if (typeof window !== 'undefined') window.location.hash = id
  }

  return (
    <div className="font-sans bg-ink-50/30 text-ink-900 antialiased min-h-screen lg:flex lg:items-start">
      <AdminSidebar active={active} onNav={setActiveWithHash} pendingCount={pendingCount} helpOpen={helpOpen} />
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
      <TopBar active={active} onNav={setActiveWithHash} pendingCount={pendingCount} helpOpen={helpOpen} />

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
        {active === 'bookings' && <BookingsSection />}
        {active === 'reviews' && <ReviewsSection />}
        {active === 'disputes' && <DisputesSection />}
        {active === 'finance' && <FinanceSection />}
        {active === 'analytics' && <AnalyticsSection />}
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
