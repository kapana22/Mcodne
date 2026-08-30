// /work/jobs — ONE LIST OF THE WORK I HAVE. („სამუშაოები", 2026-08-19.)
//
// ⚠️ IT IS NOT UNDER (provider), AND THAT IS STILL THE POINT. The route group
// is a guard for the QUEUE — the allowlist decides who may read other people's
// requests — and this page is about work somebody has already agreed to do. The
// guard is here, and somebody with no provider identity is sent to /me rather
// than shown an empty workspace.
//
// ⚠️ THE BOOKING HALF OF THIS LIST IS GONE (2026-08-24). It held two kinds of
// row: a confirmed consultation with a start time and a lifecycle the provider
// drove from here (accept, decline, cancel, complete, no-show, a video room),
// and an accepted QUOTE, which has none of that. One kind is left, and the
// SHAPE stays two-kinded on purpose — see lib/jobRows.
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
import { providersOn } from '@/lib/requests'
import { requestsViewer, openRequestCount } from '@/lib/requestsServer'
import type { QuoteJobInput } from '@/lib/jobRows'
import { PageHeader } from '@/components/PageHeader'
import { WorkTabs } from '@/app/work/_components/WorkTabs'
import { JobsClient } from './_client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'სამუშაოები — მცოდნე',
  robots: { index: false, follow: false },
}

export default async function Page() {
  const user = await requireUser()

  // `providersOn()` first, so the supply switch being off costs no query — and
  // the viewer, never a role, decides who has an identity to hang an offer on
  // (lib/requestsServer).
  const viewer = providersOn() ? await requestsViewer() : null
  const provider = viewer?.provider ?? null

  // Not their workspace: an empty list would say „you have no work" to somebody
  // who never could have any.
  if (!provider) redirect('/me')

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

  // The first stage's count — one helper, so the bar and the queue it links to
  // can never disagree (lib/requestsServer).
  const openRequests = await openRequestCount(user)

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
        sub="მიღებული შეთავაზებები — ერთ სიაში."
      />
      {/* ⚠️ ONE SCREEN, TWO STAGES (2026-08-21). „შეთავაზებები" stopped being a
          rail row of its own: a sent offer is what a job looks like before the
          client answers, and two destinations for one subject is part of what
          made the rail read as two products. The page did not move — see
          WorkTabs. Drawn only for somebody who can actually send an offer. */}
      <WorkTabs showOffers={!!provider} openRequests={openRequests} />
      <JobsClient quotes={quotes} />
    </div>
  )
}
