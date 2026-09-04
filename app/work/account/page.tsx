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
//
// ⚠️ THE TWO FACTS ARE READ HERE NOW, NOT AFTER MOUNT (2026-09-01). `_client`
// used to open with `available = null` and fetch /api/me and /api/me/provider
// itself, and the switch renders `available !== false` — so `null` drew the ON
// state. Measured today with `curl` against the local database: the first paint
// of this page says „გვერდი ჩანს" and „ჩანხარ ძებნაში, გვერდი ღიაა და
// მოთხოვნები მოგდის" to EVERYBODY, including a provider who is switched off,
// and if either fetch failed the `catch {}` left that claim standing for the
// rest of the visit with the control disabled underneath it. A switch is the
// one kind of control that may never guess its own position.
//
// The page is `force-dynamic` and already reads the session and the allowlist,
// so this is one more indexed lookup on a request that is making three. It is
// the same `findUnique` GET /api/me/provider runs, deliberately — the two must
// not be able to answer differently — and it is also the shape /me/profile has
// used since it was rebuilt: the server holds the row, the client holds the
// draft.

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
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

  await ensureDbReady()
  // The SAME lookup GET /api/me/provider makes, so the switch's position and
  // the endpoint that writes it cannot come from two readings of one column.
  // A COMPANY provider has no row keyed on their user id and lands on the same
  // default the API's `profile?.available !== false` has always produced.
  const profile = await prisma.serviceProfile.findUnique({
    where: { userId: user.id },
    select: { available: true },
  })

  return (
    <div>
      {/* ⚠️ THE SUB IS THE CANVAS'S (2026-08-31, „Work Profile" → ACCOUNT). It
          read „ეს კლიენტს არ უჩანს", which says the same thing about the page
          in the passive; the owner's own line — „ის, რასაც კლიენტი არ ხედავს" —
          names the CONTENTS, which is what a sub-line under a room's title is
          for. Same fact, the owner's words. */}
      <PageHeader className="mb-6" title="ანგარიში" sub="ის, რასაც კლიენტი არ ხედავს" />
      <AccountClient email={user.email} phone={user.phone} available={profile?.available !== false} />
    </div>
  )
}
