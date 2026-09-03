// Next.js route-level loading UI for /me/favorites — mirrors the page's title +
// card-grid layout using the shared Skeleton primitives. It renders INSIDE
// ClientShell (sidebar + top bar + footer), so it must repeat neither the logo
// header nor the page background — a second `sticky top-0 z-40` bar here
// flashed two stacked headers on every nav. Root element mirrors the real
// page's <Container as="main"> exactly.
//
// ⚠️ IT DREW A 4:3 PHOTO BANNER UNTIL 2026-08-31, and the card lost that banner
// on 2026-08-05. A skeleton that promises a shape the page does not have is
// worse than none: it reserves the wrong space and the content jumps into it.
// This is the canvas's card — a 56px mark, two lines, a chip, a footer row.
import { Skeleton } from '@/components/Skeleton'
import { Container } from '@/components/Container'
import { Card } from '@/components/Card'

export default function Loading() {
  return (
    <Container as="main" size="content" className="w-full flex-1 py-7 lg:py-8 pb-12" aria-busy="true">
      <div className="mb-5 space-y-2">
        <Skeleton.Line width={28} className="h-7" />
        <Skeleton.Line width={40} className="h-3" />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} edge="hairline" padding="none" className="flex flex-col gap-3.5 p-5">
            <div className="flex items-center gap-3.5">
              <Skeleton className="h-14 w-14 shrink-0" rounded="rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton.Line width={70} />
                <Skeleton.Line width={45} className="h-3" />
              </div>
            </div>
            <Skeleton className="h-[26px] w-32" rounded="rounded-pill" />
            <div className="mt-auto flex items-center justify-between gap-3 border-t border-ink-100 pt-3.5">
              <Skeleton.Line className="h-5 w-20" />
              <Skeleton className="h-11 w-40" rounded="rounded-btn" />
            </div>
          </Card>
        ))}
      </div>
    </Container>
  )
}
