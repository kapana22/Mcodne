import { requireRole } from '@/lib/auth'
import { ClientShell } from '@/components/me/ClientShell'
import { ROLE } from '@/lib/roles'

// /me — the client's space (was /student until stage 6, 2026-08-19; the old
// address 308s here from middleware.ts). THE GUARD IS UNCHANGED.
//
// Re-verify the session on every request for this segment (matching the
// force-dynamic child routes), so /me can never be served from a cached
// render that outlived the session. The persistent workspace shell (sidebar +
// top bar) wraps every /me/∗ page — pages render only their content.
export const dynamic = 'force-dynamic'

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  // TUTOR is allowed in too: an approved expert was a STUDENT first and keeps
  // their client-side bookings + message threads here. Without this a tutor who
  // had student messages got bounced out of their own chats. The UserMenu offers
  // a switch back to the expert workspace.
  const user = await requireRole([ROLE.USER, ROLE.PROVIDER, ROLE.ADMIN])
  return (
    <ClientShell user={{ name: user.fullName, avatar: user.avatarUrl ?? undefined }}>
      {children}
    </ClientShell>
  )
}
