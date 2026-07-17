import { requireUser } from '@/lib/auth'
import { ProfileClient } from './client'
import { StudentAppBar } from '@/components/StudentAppBar'
import { WorkspaceFooter } from '@/components/WorkspaceFooter'

export const dynamic = 'force-dynamic'

export default async function StudentProfilePage() {
  const user = await requireUser()
  return (
    <div className="font-sans bg-ink-50/40 min-h-screen flex flex-col">
      <StudentAppBar user={{ name: user.fullName, avatar: user.avatarUrl }} />

      <main className="w-full max-w-[820px] mx-auto px-6 sm:px-8 py-8 lg:py-10 flex-1">
        <div className="mb-8">
          <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-2">პროფილი</div>
          <h1 className="font-display text-3xl font-bold text-ink-900 tracking-tight">პროფილი და პარამეტრები</h1>
          <p className="text-[13.5px] text-ink-600 mt-1.5">ინფორმაცია, პაროლი და შეტყობინებების პარამეტრები ერთ ადგილას.</p>
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

      <WorkspaceFooter />
    </div>
  )
}
