'use client'
import { ClientSidebar } from './ClientSidebar'
import { ClientTopBar } from './ClientTopBar'
import { WorkspaceFooter } from '@/components/WorkspaceFooter'

/* Visual shell for every /student/* page: desktop = sticky sidebar + top bar,
   mobile = top bar + the global BottomNav (mounted from AppShell — do not
   duplicate here). Mirrors the tutor's WorkspaceShell so both workspaces read
   as one product.

   Unlike the tutor shell, the content column imposes NO max-width — each page
   keeps its own <Container> (the enforced grid primitive), so per-page widths
   (content / narrow / wide) and the canon gutter are preserved. Children scroll
   in the document, never a nested scroll container (BottomNav padding + sticky
   rails depend on document scrolling). */
export function ClientShell({
  user,
  children,
}: {
  user?: { name: string; avatar?: string | null }
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-ink-50/40 lg:flex lg:items-start">
      <ClientSidebar />
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        <ClientTopBar user={user} />
        {children}
        <WorkspaceFooter />
      </div>
    </div>
  )
}
