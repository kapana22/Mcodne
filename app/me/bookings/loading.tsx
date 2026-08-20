// Next.js route-level loading UI for /student/bookings — mirrors the page's
// title + tab bar + list-card layout using the shared Skeleton primitives.
// It renders INSIDE StudentWorkspaceShell (sidebar + top bar + footer), so it
// must repeat neither the logo header nor the page background — a second
// `sticky top-0 z-40` bar here flashed two stacked headers on every nav.
// Root element mirrors the real page's <Container as="main"> exactly.
import { Skeleton } from '@/components/Skeleton'
import { Container } from '@/components/Container'

export default function Loading() {
  return (
    <Container as="main" className="w-full py-8 lg:py-10 flex-1" aria-busy="true">
      <div className="mb-8 space-y-2">
        <Skeleton.Line width={12} className="h-2.5" />
        <Skeleton.Line width={30} className="h-6" />
      </div>
      <div className="flex items-center gap-6 mb-6 border-b border-ink-200 pb-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton.Line key={i} width={9} className="h-3.5" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-card bg-white border border-ink-200 p-5 grid sm:grid-cols-[auto_1fr_auto] gap-4 sm:gap-5 items-center">
            <Skeleton className="w-14 h-14" rounded="rounded-card" />
            <div className="min-w-0 space-y-2">
              <Skeleton className="h-5 w-28" rounded="rounded-pill" />
              <Skeleton.Line width={45} />
              <Skeleton.Line width={60} className="h-3" />
            </div>
            <div className="space-y-2 sm:justify-self-end">
              <Skeleton.Line className="h-4 w-14" />
              <Skeleton.Line className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    </Container>
  )
}
