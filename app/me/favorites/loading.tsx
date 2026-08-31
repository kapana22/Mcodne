// Next.js route-level loading UI for /student/favorites — mirrors the page's
// title + card-grid layout using the shared Skeleton primitives. It renders
// INSIDE ClientShell (sidebar + top bar + footer), so it must repeat
// neither the logo header nor the page background — a second `sticky top-0
// z-40` bar here flashed two stacked headers on every nav. Root element
// mirrors the real page's <Container as="main"> exactly.
import { Skeleton } from '@/components/Skeleton'
import { Container } from '@/components/Container'

export default function Loading() {
  return (
    <Container as="main" className="w-full py-8 lg:py-10 flex-1" aria-busy="true">
      <div className="mb-8 space-y-2">
        <Skeleton.Line width={10} className="h-2.5" />
        <Skeleton.Line width={28} className="h-6" />
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-card border border-ink-200 bg-white overflow-hidden">
            <Skeleton className="aspect-[4/3] w-full" rounded="" />
            <div className="p-3 space-y-2">
              <Skeleton.Line width={70} />
              <Skeleton.Line width={50} className="h-3" />
              <div className="pt-1 flex items-center justify-between">
                <Skeleton.Line className="h-3 w-12" />
                <Skeleton.Line className="h-3 w-14" />
              </div>
              <Skeleton className="h-11 w-full mt-2" rounded="rounded-btn" />
            </div>
          </div>
        ))}
      </div>
    </Container>
  )
}
