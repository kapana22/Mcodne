// /work/jobs — ONE LIST OF THE WORK I HAVE. („სამუშაოები", 2026-08-19.)
//
// ⚠️ IT IS NOT UNDER (expert) OR (provider), AND THAT IS THE POINT. Those two
// route groups are two guards, and a person is not two people: an expert holds
// CONSULT, a master holds WORK, and the same account may hold both (CLAUDE.md,
// THE PRODUCT MODEL). A page that lives inside either group would hide half of
// somebody's own work behind the other group's gate — the (expert) layout even
// redirects a WORK-only account away, so an accepted quote would have been
// unreachable from the list that claims to hold it. So the guard is here, it is
// the UNION of the two halves, and somebody who has neither is sent to /me
// rather than shown an empty workspace.
//
// ⚠️ WHAT THE QUERY MAY NOT SELECT. No `phone`, no `email` — a list never
// prints a contact, and the one screen that does (/work/offers) reads it
// through `clientContactFor`. No base64 column either: `avatarUrl` and the
// master photos are stored as data URIs, and 100 of them in one page is
// megabytes (CLAUDE.md, trap 1). The client's NAME is legitimate here and only
// here, because every row in this query is an ACCEPTED offer — the exact case
// lib/requestChat opens the contact for — and lib/jobRows asks
// `clientContactFor` rather than re-deciding it.

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { requireUser } from '@/lib/auth'
import { capabilitiesOf } from '@/lib/capabilities'
import { providersOn } from '@/lib/requests'
import { requestsViewer } from '@/lib/requestsServer'
import { ROLE } from '@/lib/roles'
import type { QuoteJobInput } from '@/lib/jobRows'
import { PageHeader } from '@/components/PageHeader'
import { JobsClient } from './_client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'სამუშაოები — მცოდნე',
  robots: { index: false, follow: false },
}

export default async function Page() {
  const user = await requireUser()

  // The consultation half: an expert profile (or an admin looking).
  const caps = await capabilitiesOf(user.id)
  const showBookings = user.role === ROLE.PROVIDER || user.role === ROLE.ADMIN || caps.includes('CONSULT')

  // The job half. `providersOn()` first, so the supply switch being off costs
  // no query — and the viewer, never a role, decides who has an identity to
  // hang an offer on (lib/requestsServer).
  const viewer = providersOn() ? await requestsViewer() : null
  const provider = viewer?.provider ?? null

  // Neither half is theirs: this is not their workspace, and an empty list
  // would say „you have no work" to somebody who never could have any.
  if (!showBookings && !provider) redirect('/me')

  let quotes: QuoteJobInput[] = []
  if (provider) {
    await ensureDbReady()
    const rows = await prisma.requestOffer.findMany({
      // ACCEPTED + QUOTE is the whole definition of „work I agreed to do" on
      // this side: a SENT offer is a bid, an INVITED row is a conversation, and
      // a BOOKING-kind offer becomes a Booking (lib/offerLifecycle).
      where: {
        ...(provider.kind === 'EXPERT'
          ? { expertUserId: provider.userId }
          : { companyId: provider.companyId }),
        status: 'ACCEPTED',
        kind: 'QUOTE',
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: {
        id: true, status: true, priceGel: true, priceKind: true,
        doneAt: true, closedAt: true, updatedAt: true,
        request: { select: { topic: true, contactName: true } },
      },
    })
    quotes = rows.map(o => ({
      id: o.id,
      status: o.status,
      priceGel: o.priceGel,
      priceKind: o.priceKind,
      doneAt: o.doneAt ? o.doneAt.toISOString() : null,
      closedAt: o.closedAt ? o.closedAt.toISOString() : null,
      updatedAt: o.updatedAt.toISOString(),
      topic: o.request.topic,
      contactName: o.request.contactName,
    }))
  }

  return (
    <div>
      {/* Visible at every width, like /work/offers beside it. The bookings list
          this replaced hid its h1 on lg+ because the sidebar pill was already
          its literal text; the rail does not name this screen yet (the nav item
          is not this change's to move), so hiding it would leave the page
          untitled on desktop. */}
      <PageHeader
        className="mb-5"
        title="სამუშაოები"
        sub="დადასტურებული ჯავშნები და მიღებული შეთავაზებები — ერთ სიაში."
      />
      <JobsClient quotes={quotes} showBookings={showBookings} hasProvider={!!provider} />
    </div>
  )
}
