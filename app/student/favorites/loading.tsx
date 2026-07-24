// Next.js route-level loading UI for /student/favorites — mirrors the page's
// header + card-grid layout using the shared Skeleton primitives (same
// pattern/density as app/student/messages/loading.tsx).
import Link from 'next/link'
import { Skeleton } from '@/components/Skeleton'
import { Container } from '@/components/Container'

export default function Loading() {
  return (
    <div className="font-sans bg-ink-50/40 min-h-screen">
      <header className="sticky top-0 z-40 bg-ink-50 lg:bg-ink-50/90 lg:backdrop-blur-md border-b border-ink-100">
        <Container className="h-16 flex items-center justify-between">
          <Link href="/student" className="inline-flex items-center" aria-label="მცოდნე">
            <img src="/logo.svg" alt="მცოდნე" className="h-7 w-auto object-contain select-none" draggable={false} />
          </Link>
        </Container>
      </header>

      <Container as="main" className="py-8 lg:py-10" aria-busy="true">
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
    </div>
  )
}
