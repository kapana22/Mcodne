'use client'
import { WorkspaceSidebar } from './WorkspaceSidebar'
import { WorkspaceTopBar } from './WorkspaceTopBar'
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
        <main className="flex-1 w-full max-w-[1120px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
