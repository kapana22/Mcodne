// Next.js route-level loading UI for the tutor messages inbox. Shown while
// the server component's Prisma query resolves. Skeleton shape mirrors the
// eventual conversation row so nothing jumps when data lands.
import { TutorAppBar } from '@/components/TutorAppBar'
import { Footer } from '@/components/Footer'
import { Skeleton } from '@/components/Skeleton'

export default function Loading() {
  return (
    <div className="min-h-screen bg-ink-50 flex flex-col">
      <TutorAppBar />
      <main className="flex-1 max-w-[820px] w-full mx-auto px-6 py-10" aria-busy="true">
        <div className="mb-8 space-y-2">
          <Skeleton.Line width={20} className="h-2.5" />
          <Skeleton.Line width={55} className="h-6" />
        </div>
        <div className="rounded-card border border-ink-200 bg-white overflow-hidden divide-y divide-ink-100">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <Skeleton.Avatar size={48} />
              <div className="flex-1 min-w-0 space-y-2">
                <Skeleton.Line width={40} />
                <Skeleton.Line width={65} className="h-3" />
                <Skeleton.Line width={80} className="h-3" />
              </div>
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  )
}
