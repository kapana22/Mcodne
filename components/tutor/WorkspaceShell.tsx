'use client'
import { WorkspaceSidebar } from './WorkspaceSidebar'
import { WorkspaceTopBar } from './WorkspaceTopBar'
import { WorkspaceFooter } from '@/components/WorkspaceFooter'
import { Container } from '@/components/Container'
import { OpenTimeNudge } from './OpenTimeNudge'
import { useNavBadges } from './useNavBadges'

/* Visual shell for every /tutor/* page: desktop = sticky sidebar + top bar,
   mobile = top bar + global BottomNav (mounted from AppShell — do not
   duplicate it here). IMPORTANT: children scroll in the document, never in a
   nested scroll container — BottomNav's body[data-bottom-nav] padding and all
   sticky rails depend on document scrolling (body uses overflow-x: clip). */
export function WorkspaceShell({
  user,
  children,
}: {
  user?: { name: string; avatar?: string | null }
  children: React.ReactNode
}) {
  const badges = useNavBadges()
  return (
    <div className="min-h-screen bg-ink-50 lg:flex lg:items-start">
      <WorkspaceSidebar badges={badges} />
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        <WorkspaceTopBar user={user} />
        {/* The canon page grid itself ("wide" = 1280, gutter px-6 sm:px-8) so the
            tutor and student workspaces line up edge-for-edge. Pages that nest
            their own <Container> inside this one (booking detail's not-found /
            loading states) would otherwise pay the gutter TWICE — 48px on mobile
            — so a nested container drops its own horizontal padding here; the
            shell's gutter already covers it. */}
        <Container as="main" className="flex-1 py-6 lg:py-8 [&_.mx-auto.px-6]:px-0">
          {children}
        </Container>
        <WorkspaceFooter />
      </div>
      {/* Mounted at shell level (not per page) so the „open your time" nudge can
          reach a freshly approved expert wherever they land in the workspace. */}
      <OpenTimeNudge noAvailability={badges.noAvailability} />
    </div>
  )
}
