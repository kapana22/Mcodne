// /notifications — the bell's full list.
//
// ⚠️ THE PAGE ITSELF IS A SERVER COMPONENT SO THE HEADER IS NEVER HALF-DRAWN
// (2026-08-30). The whole screen used to be a client component that asked
// /api/me on mount purely to fill the top bar's name, avatar and role — so the
// bar rendered incomplete and finished a round trip later. The list stays
// client-side: it has an all/unread filter and mark-as-read mutations, which
// are the kind of live state a server render cannot hold.
import { requireUser } from '@/lib/auth'
import NotificationsClient from './client'

export const dynamic = 'force-dynamic'

export default async function NotificationsPage() {
  // ⚠️ A REAL GUARD, NOT A CLIENT REDIRECT. The list route answers 401 and the
  // page then sent the browser to /signin — a bounce that cannot happen until
  // React has booted, so a signed-out visitor read an empty page first.
  // The identity is still required — it is the guard — but it is no longer
  // handed to the list: the rail around this page (app/notifications/layout →
  // SpaceChrome) is what draws a name and an avatar now.
  await requireUser()
  return <NotificationsClient />
}
