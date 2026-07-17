// Next.js route-level loading UI — shown while the server component
// resolves its Prisma query. Uses the shared Skeleton primitives so the
// placeholder shape matches the eventual message-row layout.
import Link from 'next/link'
import { Skeleton } from '@/components/Skeleton'

export default function Loading() {
  return (
    <div className="font-sans bg-ink-50/40 min-h-screen">
      <header className="sticky top-0 z-40 bg-ink-50/90 backdrop-blur-md border-b border-ink-100">
        <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/student" className="inline-flex items-center" aria-label="მცოდნე">
            <img src="/logo.svg" alt="მცოდნე" className="h-7 w-auto object-contain select-none" draggable={false} />
          </Link>
        </div>
      </header>

      <main className="max-w-[820px] mx-auto px-6 py-10" aria-busy="true">
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
    </div>
  )
}
