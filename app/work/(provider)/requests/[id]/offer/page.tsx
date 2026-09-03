// /provider/requests/[id]/offer — writing the answer.
//
// ⚠️ A SCREEN OF ITS OWN SINCE 2026-09-01 (the owner's design canvas → „Expert
// Jobs" screen 3). The form used to sit at the foot of the job page, under the
// request and under the contact card. The canvas separates them, and the reason
// is the same one that moved the money: reading a job and pricing a job are two
// decisions, and the second one is where a provider needs a narrow column, no
// competing facts, and the client's own words still available above the fold.
//
// ⚠️ IT REPEATS EVERY GATE THE JOB PAGE HAS, and none of them are „the layout
// already did it". lib/requestsServer: „Every route checks here as well…
// neither layer is load-bearing alone."

import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { providerRequestView } from '@/lib/requests'
import { requestsViewer } from '@/lib/requestsServer'
import { Btn } from '@/components/Btn'
import { Card } from '@/components/Card'
import { Eyebrow } from '@/components/Eyebrow'
import { Icon } from '@/components/Icon'
import { OfferForm } from '../OfferForm'

export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requestsViewer()
  if (!viewer.providerAllowed) notFound()
  const { id } = await params

  await ensureDbReady()

  const row = await prisma.serviceRequest.findUnique({
    where: { id },
    select: {
      // ⚠️ NOT publicRef — the client's credential, and no provider surface may
      // hold it. See lib/requests → ProviderRequestRow.
      id: true, kind: true, topic: true, description: true,
      budgetMin: true, budgetMax: true, budgetUnit: true,
      timing: true, format: true, city: true, status: true, details: true,
      offerCount: true, offerLimit: true, createdAt: true,
      category: { select: { id: true, name: true, slug: true } },
    },
  })
  if (!row) notFound()

  // ⚠️ ONLY A LIVE REQUEST HAS A FORM. A settled one is readable on the job
  // page by whoever bid on it; there is nothing to write here, and a form that
  // can only answer NOT_OPEN is worse than no form.
  if (row.status !== 'VERIFIED') redirect(`/work/requests/${row.id}`)

  const p = viewer.provider
  // An admin passes the segment gate by role and has no identity to hang an
  // offer on — POST /api/provider/offers answers 404. Sent back to the job,
  // where the shell already explains why there is no action for them.
  if (!p) redirect(`/work/requests/${row.id}`)

  // Already answered? One offer per provider per request is two unique indexes,
  // so this form could only ever fail with ALREADY_OFFERED. An INVITED row is
  // not an answer — see the job page for that argument.
  const mine = await prisma.requestOffer.findFirst({
    where: {
      requestId: row.id,
      status: { not: 'INVITED' },
      ...(p.kind === 'EXPERT' ? { expertUserId: p.userId } : { companyId: p.companyId }),
    },
    select: { id: true },
  })
  if (mine) redirect(`/work/requests/${row.id}`)

  const r = providerRequestView(row)

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-4">
      <div>
        <Btn href={`/work/requests/${r.id}`} variant="secondary" size="sm" iconLeft={<Icon.back className="h-4 w-4" />}>
          უკან
        </Btn>
      </div>

      <div>
        <h1 className="font-display text-h1 font-extrabold tracking-tight text-ink-900">შეთავაზება</h1>
        {/* The job, named the same way it is named everywhere else — see
            requestHeadline. A provider who opened two tabs must be able to tell
            which one they are pricing. */}
        <p className="mt-2 text-body-lg text-ink-600">{r.headline}</p>
      </div>

      {/* ⚠️ THE CLIENT'S OWN WORDS STAY ON SCREEN WHILE THE PRICE IS TYPED.
          The canvas puts only the title here; the sentence the number is an
          answer TO is the one thing a provider re-reads while quoting, and
          sending them back a page to find it is how a price gets named from
          memory. Muted and compact, so it stays reference rather than becoming
          the subject of a screen whose subject is the form. */}
      <Card className="bg-ink-50">
        <Eyebrow tone="muted">კლიენტის აღწერა</Eyebrow>
        <p className="mt-2 whitespace-pre-line text-body leading-relaxed text-ink-800">{r.description}</p>
        <p className="mt-3 text-meta text-ink-500">
          {r.budgetLabel} · {r.cityLabel}
        </p>
      </Card>

      <OfferForm
        requestId={r.id}
        kind={r.kind}
        budgetMin={row.budgetMin}
        budgetMax={row.budgetMax}
      />
    </div>
  )
}
