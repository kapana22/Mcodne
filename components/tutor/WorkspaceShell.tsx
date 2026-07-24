'use client'
import { WorkspaceSidebar } from './WorkspaceSidebar'
import { WorkspaceTopBar } from './WorkspaceTopBar'
import { WorkspaceFooter } from '@/components/WorkspaceFooter'
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
        {/* Column matches the canon Container ("wide" = 1280, gutter px-6 sm:px-8)
            so the tutor and student workspaces line up edge-for-edge — they were
            1120/px-4 vs the student's 1280/px-6 before. */}
        <main className="flex-1 w-full max-w-[1280px] mx-auto px-6 sm:px-8 py-6 lg:py-8">
          {children}
        </main>
        <WorkspaceFooter />
      </div>
    </div>
  )
}
