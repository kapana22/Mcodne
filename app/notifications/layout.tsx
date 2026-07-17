import { requireUser } from '@/lib/auth'

// Notifications is shared by every role, so requireUser (not requireRole) is
// the right gate. Mirrors app/settings/layout.tsx: server-side guard so
// anonymous visitors never see the authenticated shell flash before the
// client-side 401 bounce — they go straight to /signin?redirect=/notifications.
export const dynamic = 'force-dynamic'

export default async function NotificationsLayout({ children }: { children: React.ReactNode }) {
  await requireUser()
  return <>{children}</>
}
