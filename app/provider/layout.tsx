// /provider — the provider's workspace.
//
// ITS OWN SPACE, BESIDE /tutor AND /student RATHER THAN INSIDE EITHER, and that
// is a product decision rather than a routing one. An expert's /tutor workspace
// is about sessions: a calendar, bookings, messages, earnings. This is about
// bidding on work that has no time attached to it yet. Filing it under /tutor
// would put two different jobs behind one nav and make every screen there
// answer „is this about a booking or a request?" — which is exactly the
// confusion the whole subsystem was carved out to avoid.
//
// It also means the two can be switched off independently, and that an account
// with requests access but no expert profile (a company member) has somewhere
// to land at all.
//
// ⚠️ notFound() and NEVER requireRole(). requireRole redirects a signed-out
// visitor to /signin, which tells them the page is real and worth coming back
// to with an account — the one thing the 404 exists to deny. Everyone the
// allowlist does not admit gets the same answer an unknown URL gets.

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requestsViewer } from '@/lib/requestsServer'
import { ProviderShell } from './_shell'

// Re-verify on every request for this segment, matching the student and tutor
// layouts: the shell must never be served from a cached render that outlived
// the session or the allowlist row behind it.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'მოთხოვნები — მცოდნე',
  robots: { index: false, follow: false },
}

export default async function ProviderLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requestsViewer()
  if (!viewer.providerAllowed) notFound()

  // An ADMIN passes the gate by role and has no provider identity — they can
  // read the space to see what a provider sees, and the offer form refuses
  // them (POST /api/provider/offers answers 404 with no identity to attach).
  // Passing the flag down lets the pages say so instead of showing a control
  // that cannot work.
  // The queue badge — how many verified requests still have a place. The same
  // philosophy as the admin rail's badges: a number on a nav item means a
  // person is waiting behind it. One indexed count per page load.
  const openCount = await prisma.serviceRequest.count({
    where: { status: 'VERIFIED', offerCount: { lt: prisma.serviceRequest.fields.offerLimit } },
  })

  return (
    <ProviderShell isProvider={viewer.provider !== null} openCount={openCount}>
      {children}
    </ProviderShell>
  )
}
