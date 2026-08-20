// /work/(expert) — THE EXPERT'S GUARD. Nothing visual lives here: the shell is
// app/work/layout.tsx, shared with the master's (provider) group, so one URL
// prefix carries two guards and one chrome (stage 6, 2026-08-19).
import { redirect } from 'next/navigation'
import { requireRole, requireUser } from '@/lib/auth'
import { capabilitiesOf } from '@/lib/capabilities'
import { PROVIDER_ROUTE } from '@/lib/requests'
import { ROLE } from '@/lib/roles'

// Re-verify the session on every request for this segment (matching the /me
// layout), so the expert pages can never be served from a cached render that
// outlived the session — otherwise the server-side role guard may not re-run
// per request and a stale, signed-out shell renders while API subroutes 401.
export const dynamic = 'force-dynamic'

export default async function ExpertLayout({ children }: { children: React.ReactNode }) {
  // A WORK-only master (role STUDENT, no expert profile) shares this prefix:
  // /work is their door too, and requireRole below would bounce them to /me —
  // the one workspace that is not theirs. Send them to their own screen
  // instead. Read once, before the role guard, and only for somebody the guard
  // would otherwise refuse, so an expert pays no extra query.
  const user = await requireUser()
  if (user.role !== ROLE.EXPERT && user.role !== ROLE.ADMIN) {
    const caps = await capabilitiesOf(user.id)
    if (caps.includes('WORK')) redirect(`${PROVIDER_ROUTE}/requests`)
  }
  await requireRole([ROLE.EXPERT, ROLE.ADMIN])
  return <>{children}</>
}
