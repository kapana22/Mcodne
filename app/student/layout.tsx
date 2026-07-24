import { requireRole } from '@/lib/auth'
import { StudentWorkspaceShell } from '@/components/student/StudentWorkspaceShell'

// Re-verify the session on every request for this segment (matching the
// force-dynamic child routes), so /student can never be served from a cached
// render that outlived the session. The persistent workspace shell (sidebar +
// top bar) wraps every /student/* page — pages render only their content.
export const dynamic = 'force-dynamic'

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  // TUTOR is allowed in too: an approved expert was a STUDENT first and keeps
  // their client-side bookings + message threads here. Without this a tutor who
  // had student messages got bounced out of their own chats. The UserMenu offers
  // a switch back to the expert workspace.
  const user = await requireRole(['STUDENT', 'TUTOR', 'ADMIN'])
  return (
    <StudentWorkspaceShell user={{ name: user.fullName, avatar: user.avatarUrl ?? undefined }}>
      {children}
    </StudentWorkspaceShell>
  )
}
