// /provider/service-profile — what this master does, and where.
//
// The container: the gate and the heading. Everything else is `_form`, which
// fetches its own data because the vocabulary and the saved row arrive from one
// endpoint and the form has to write back to the same place.
//
// ⚠️ ITS OWN GATE, not the segment layout's. The layout does check, and that is
// not enough: lib/requestsServer says in as many words that a single enforcement
// point is what c5bf125 had to fix on the two pages next door. A page that
// cannot be reached without the layout today can be reached without it tomorrow.

import { notFound } from 'next/navigation'
import { requestsViewer } from '@/lib/requestsServer'
import { PageHeader } from '@/components/PageHeader'
import { ServiceProfileForm } from './_form'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const viewer = await requestsViewer()
  // An admin who is not on the allowlist has no profile to fill in — there is
  // no identity to attach one to. Same answer an unknown URL gets.
  if (!viewer.provider) notFound()

  return (
    <>
      <PageHeader
        eyebrow="პროფილი"
        title="ჩემი სერვისები"
        sub="აირჩიე, რას აკეთებ და რომელ ქალაქებში. მოთხოვნები მხოლოდ ამის მიხედვით მოგდის."
      />
      <div className="mt-6">
        <ServiceProfileForm />
      </div>
    </>
  )
}
