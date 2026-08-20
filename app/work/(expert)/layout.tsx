// /work/(expert) — THE EXPERT'S GUARD. Nothing visual lives here: the shell is
// app/work/layout.tsx, shared with the master's (provider) group, so one URL
// prefix carries two guards and one chrome (stage 6, 2026-08-19).
import { redirect } from 'next/navigation'
import { requireRole, requireUser } from '@/lib/auth'
import { capabilitiesOf } from '@/lib/capabilities'
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
    // ⚠️ THE TARGET IS `/work` SINCE 2026-08-20, not the queue. This bounce
    // exists because a WORK-only provider must not be handed to `requireRole`
    // below, which would send them to /me — the one workspace that is not
    // theirs. It used to drop them straight into the request list, which was
    // the honest answer while `/work` was an expert-only session dashboard;
    // `/work` now serves both capabilities and carries their balance, so it is
    // their door too. Sending them to the queue instead would skip the only
    // screen that tells them what they can spend.
    if (caps.includes('WORK')) redirect('/work')
  }
  await requireRole([ROLE.EXPERT, ROLE.ADMIN])
  return <>{children}</>
}
