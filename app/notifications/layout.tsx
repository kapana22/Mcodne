import type { Metadata } from 'next'

// ⚠️ ITS OWN NAME (2026-09-01). Swept every route locally and this one still
// printed the root's marketing line, „მცოდნე — აღწერე რა გჭირდება, მიიღე
// შეთავაზებები", so a signed-in person could not tell it from the
// landing page in a row of tabs. Same fix the client room got; the word is
// the screen's own, not a new one.
export const metadata: Metadata = { title: 'შეტყობინებები — მცოდნე', robots: { index: false, follow: false } }

import { requireUser } from '@/lib/auth'
import { SpaceChrome } from '@/components/SpaceChrome'

// Notifications is shared by every role, so requireUser (not requireRole) is
// the right gate. Mirrors app/settings/layout.tsx: server-side guard so
// anonymous visitors never see the authenticated shell flash before the
// client-side 401 bounce — they go straight to /signin?redirect=/notifications.
//
// ⚠️ AND THE CHROME IS THE READER'S OWN ROOM SINCE 2026-09-03. This layout used
// to return `<>{children}</>` and the page drew a bar of its own — so pressing
// the bell inside /work put a provider on a page with no rail, no queue badge
// and one chevron home. `SpaceChrome` picks the rail by `sellsHere`; the whole
// argument, and the sweep that found this, is in that file's header.
export const dynamic = 'force-dynamic'

export default async function NotificationsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  return <SpaceChrome user={user}>{children}</SpaceChrome>
}
