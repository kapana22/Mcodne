import { requireRole } from '@/lib/auth'

// Re-verify the session on every request, matching the student/tutor layouts'
// convention — the admin shell must never be served from a cached render that
// outlived the session. (The cookies() read inside requireRole already forces
// dynamic rendering; this makes the guarantee explicit and grep-able.)
export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole('ADMIN')
  return <>{children}</>
}
