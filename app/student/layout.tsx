import { requireRole } from '@/lib/auth'

// Re-verify the session on every request for this segment (matching the
// force-dynamic child routes), so /student can never be served from a cached
// render that outlived the session.
export const dynamic = 'force-dynamic'

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  await requireRole(['STUDENT', 'ADMIN'])
  return <>{children}</>
}
