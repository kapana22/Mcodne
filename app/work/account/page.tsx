// /work/account — „ანგარიში". The password, and the one switch that decides
// whether the provider is on the site at all.
//
// ⚠️ IT IS WHAT THE 2026-08-30 MERGE LEFT OVER, and that is the honest reason
// for a second page rather than a section: everything a CLIENT reads is now one
// editor (/work/profile), and these two controls read to nobody. A password is
// not a profile field; visibility is one field but it is a decision, and it
// takes effect the moment it is flipped rather than on a save — see `_client`.
//
// ⚠️ THE GATE IS THE SAME PAIR ITS SIBLING ASKS. Signed in, on the allowlist,
// holding a provider identity — 404 and never 403, because a 403 tells a
// stranger the page is real.

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { requestsViewer } from '@/lib/requestsServer'
import { PageHeader } from '@/components/PageHeader'
import { AccountClient } from './_client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'ანგარიში — მცოდნე',
  robots: { index: false, follow: false },
}

export default async function Page() {
  const user = await getCurrentUser()
  if (!user) notFound()

  const viewer = await requestsViewer()
  if (!viewer.providerAllowed || viewer.provider === null) notFound()

  return (
    <div>
      <PageHeader className="mb-6" title="ანგარიში" sub="ეს კლიენტს არ უჩანს" />
      <AccountClient />
    </div>
  )
}
