import type { Metadata } from 'next'

// ⚠️ ITS OWN NAME (2026-09-01). Swept every route locally and this one still
// printed the root's marketing line, „მცოდნე — აღწერე რა გჭირდება, მიიღე
// შეთავაზებები", so a signed-in person could not tell it from the
// landing page in a row of tabs. Same fix the client room got; the word is
// the screen's own, not a new one.
export const metadata: Metadata = { title: 'პარამეტრები — მცოდნე', robots: { index: false, follow: false } }

import { requireUser } from '@/lib/auth'
import { SpaceChrome } from '@/components/SpaceChrome'

// Settings is shared by every role, so requireUser (not requireRole) is the
// right gate. Without this server-side guard the client page rendered an
// authenticated-looking shell to anonymous visitors until its /api/me fetch
// came back 401 — now they go straight to /signin?redirect=/settings.
//
// ⚠️ THE CHROME IS THE READER'S OWN ROOM SINCE 2026-09-03, WHICH FINISHES A
// JOB THAT WAS HALF DONE. app/settings/client already calls its standalone bar
// „a FIFTH chrome in a product that already has four", and /me/profile already
// renders this same component with `chrome={false}` inside ClientShell. What
// stopped the other half is the line at app/me/profile/page.tsx: /settings „is
// the address a provider and an admin use — neither of whom has this rail." A
// provider has one. `SpaceChrome` hands it to them.
export const dynamic = 'force-dynamic'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  return <SpaceChrome user={user}>{children}</SpaceChrome>
}
