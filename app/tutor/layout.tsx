import { requireRole } from '@/lib/auth'

// Re-verify the session on every request for this segment (matching the student
// layout), so the tutor shell can never be served from a cached render that
// outlived the session — otherwise the server-side role guard may not re-run
// per request and a stale, signed-out shell renders while API subroutes 401.
export const dynamic = 'force-dynamic'

export default async function TutorLayout({ children }: { children: React.ReactNode }) {
  await requireRole(['TUTOR', 'ADMIN'])
  return <>{children}</>
}
