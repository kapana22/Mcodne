import { requireUser } from '@/lib/auth'

// Settings is shared by every role, so requireUser (not requireRole) is the
// right gate. Without this server-side guard the client page rendered an
// authenticated-looking shell to anonymous visitors until its /api/me fetch
// came back 401 — now they go straight to /signin?redirect=/settings.
export const dynamic = 'force-dynamic'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireUser()
  return <>{children}</>
}
