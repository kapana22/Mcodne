'use client'
import { usePathname } from 'next/navigation'
import { WorkspaceSidebar } from './WorkspaceSidebar'
import { WorkspaceTopBar } from './WorkspaceTopBar'
import { WorkspaceFooter } from '@/components/WorkspaceFooter'
import { Container } from '@/components/Container'
import { OpenTimeNudge } from './OpenTimeNudge'
import { useNavBadges } from './useNavBadges'
import { isProviderWorkspacePath } from '@/lib/requests'
import type { NavGroups } from './navConfig'

/* Visual shell for every /work/* page: desktop = sticky sidebar + top bar,
   mobile = top bar + global BottomNav (mounted from AppShell — do not
   duplicate it here). IMPORTANT: children scroll in the document, never in a
   nested scroll container — BottomNav's body[data-bottom-nav] padding and all
   sticky rails depend on document scrolling (body uses overflow-x: clip).

   ONE SHELL, TWO GROUPS (stage 6, 2026-08-19). The expert's items and the
   master's items are both drawn from here; `groups` says which this viewer
   holds and is decided by app/work/layout.tsx from lib/capabilities — the
   shell never guesses. The guards live in the route groups below the layout,
   not here: this is chrome. */
export function WorkspaceShell({
  user,
  role,
  groups,
  openRequests = 0,
  isProvider = true,
  children,
}: {
  user?: { name: string; avatar?: string | null }
  role: 'USER' | 'PROVIDER' | 'ADMIN'
  groups: NavGroups
  /** Verified requests with a place left — the master's queue badge. */
  openRequests?: number
  /** False when the viewer passes the requests gate by ROLE only (an admin
   *  with no allowlist row): the master's screens then say so once, at the
   *  top, instead of showing an offer form that cannot work. */
  isProvider?: boolean
  children: React.ReactNode
}) {
  const path = usePathname() ?? ''
  const badges = useNavBadges({ enabled: groups.expert, openRequests })
  const onMasterScreen = isProviderWorkspacePath(path)
  return (
    <div className="min-h-screen bg-ink-50 lg:flex lg:items-start">
      <WorkspaceSidebar badges={badges} groups={groups} />
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        <WorkspaceTopBar user={user} role={role} />
        {/* An admin reading the master's screens is told once, at the top,
            rather than discovering it on a button that does nothing. Neutral
            ink and not a warning tint: nothing is wrong, this is simply not
            their screen. (Moved here from the retired app/provider/_shell.) */}
        {onMasterScreen && !isProvider && (
          <div className="border-b border-ink-200 bg-ink-100">
            <Container className="py-2.5">
              <p className="text-small text-ink-700">ხედავ როგორც ადმინი — შეთავაზების დაწერა არ შეგიძლია.</p>
            </Container>
          </div>
        )}
        {/* The canon page grid itself ("wide" = 1280, gutter px-6 sm:px-8) so the
            two workspaces line up edge-for-edge. Pages that nest their own
            <Container> inside this one (booking detail's not-found / loading
            states) would otherwise pay the gutter TWICE — 48px on mobile — so a
            nested container drops its own horizontal padding here; the shell's
            gutter already covers it. */}
        <Container as="main" className="flex-1 py-6 lg:py-8 [&_.mx-auto.px-6]:px-0">
          {children}
        </Container>
        <WorkspaceFooter />
      </div>
      {/* Mounted at shell level (not per page) so the „open your time" nudge can
          reach a freshly approved expert wherever they land in the workspace.
          Experts only — it is about a calendar the master does not have. */}
      {groups.expert && <OpenTimeNudge noAvailability={badges.noAvailability} />}
    </div>
  )
}
