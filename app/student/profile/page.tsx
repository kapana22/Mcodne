import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { ProfileClient } from './client'

export const dynamic = 'force-dynamic'

export default async function StudentProfilePage() {
  const user = await requireUser()
  return (
    <div className="font-sans bg-ink-50/40 min-h-screen">
      <header className="sticky top-0 z-40 bg-ink-50/90 backdrop-blur-md border-b border-ink-100">
        <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/student" className="inline-flex items-center" aria-label="მცოდნე">
            <img src="/logo.svg" alt="მცოდნე" className="h-7 w-auto object-contain select-none" draggable={false} />
          </Link>
          <nav className="flex items-center gap-3">
            <Link href="/student" className="text-[13px] font-display font-semibold text-ink-700 hover:text-ink-900">დაშბორდი</Link>
            <Link href="/student/bookings" className="text-[13px] font-display font-semibold text-ink-700 hover:text-ink-900">ჩემი ჯავშნები</Link>
            <Link href="/student/messages" className="text-[13px] font-display font-semibold text-ink-700 hover:text-ink-900">შეტყობინებები</Link>
            <Link href="/student/favorites" className="text-[13px] font-display font-semibold text-ink-700 hover:text-ink-900">შენახული</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-[820px] mx-auto px-6 py-10">
        <div className="mb-8">
          <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-2">პროფილი</div>
          <h1 className="font-display text-3xl font-bold text-ink-900 tracking-tight">ჩემი პროფილი</h1>
          <p className="text-[13.5px] text-ink-600 mt-1.5">შეცვალე შენი ინფორმაცია, ავატარი და პაროლი.</p>
        </div>

        <ProfileClient
          initialName={user.fullName}
          initialEmail={user.email}
          initialPhone={user.phone ?? ''}
          initialBio={(user as any).bio ?? ''}
          initialAvatar={user.avatarUrl}
          role={user.role}
        />
      </main>
    </div>
  )
}
