// /work/services — „ჩემი სერვისები", the ONE page that answers „რას ვყიდი?".
//
// ⚠️ WHY THIS PAGE EXISTS: there were two of them (2026-08-19). The expert
// answered the question in a tab of /work/profile („სესიები" — the bookable
// consultation types) and the trades provider answered it at
// /work/service-profile. One question, two screens, in two halves of the same
// workspace. On 2026-08-24 the consultation half went with its product, so what
// is left is the page that always did the work: what you sell, where, and for
// how much.
//
// ⚠️ OUTSIDE BOTH ROUTE GROUPS, AND THAT IS STILL THE POINT. It sits directly
// under /work, inside the shell (app/work/layout.tsx, which is chrome and never
// a guard) and carries its own gate:
//   · signed in at all, else notFound()
//   · `requestsViewer().providerAllowed` AND a provider identity — literally
//     what app/work/(provider)/layout.tsx and the old service-profile page
//     checked, in that order, so the supply-side switch and the allowlist still
//     decide.
//   · neither → notFound(). 404 AND NEVER 403: a 403 tells a stranger the page
//     is real and worth coming back to, which is the one thing the 404 exists
//     to deny (lib/requestsServer says it at length).

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { requestsViewer } from '@/lib/requestsServer'
import { PageHeader } from '@/components/PageHeader'
import { Icon } from '@/components/Icon'
import { ConfirmServicesNote } from '../_components/ConfirmServicesNote'
import { prisma } from '@/lib/prisma'
import { ServiceProfileForm } from './_trades'

// Re-verify on every request: this page must never be served from a cached
// render that outlived the session or the allowlist row behind it.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'ჩემი სერვისები — მცოდნე',
  robots: { index: false, follow: false },
}

export default async function Page() {
  const user = await getCurrentUser()
  if (!user) notFound()

  const viewer = await requestsViewer()
  // BOTH conditions, because they answer different questions: `providerAllowed`
  // is „may you open a provider surface at all" (the supply-side switch + the
  // allowlist) and `provider` is „is there an identity to hang a ServiceProfile
  // on" (an admin who is not on the list has no row to fill in).
  if (!viewer.providerAllowed || viewer.provider === null) notFound()

  // Have they ever saved this list, or did the migration fill it in for them?
  // One column, one boolean — see prisma/schema → servicesConfirmedAt.
  const row = await prisma.serviceProfile.findUnique({
    where: { userId: user.id },
    select: { servicesConfirmedAt: true, id: true },
  })
  const unconfirmed = row !== null && row.servicesConfirmedAt === null

  return (
    <div>
      {/* ⚠️ „ნახე შენი პროფილი" WAS ONLY ON THE OTHER PAGE (2026-08-29).
          /work/profile has carried it since it was written, and this is the
          screen where the things a client actually READS on the card are typed
          — the services and the price beside each one. A form whose whole
          output is a public card, with no way to look at that card, asks
          somebody to edit blind. Same link, same target, same new tab. */}
      <PageHeader
        className="mb-6"
        title="ჩემი სერვისები"
        actions={row && (
          <a
            href={`/experts/${row.id}?preview=1`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-800 font-display font-semibold text-small transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <Icon.external className="w-3.5 h-3.5" />
            ნახე შენი პროფილი
          </a>
        )}
      />
      {/* Above the form, because it explains why the form is not already right.
          It goes on save, not on dismiss — pressing save IS having looked. */}
      {unconfirmed && <div className="mb-5"><ConfirmServicesNote /></div>}
      <section>
        {/* ⚠️ A SUB-LINE STOOD HERE AND SAID EVERYTHING TWICE (removed
            2026-08-29). It read „აირჩიე, რას აკეთებ და რომელ ქალაქებში.
            მოთხოვნები მხოლოდ ამის მიხედვით მოგდის", and by the time a reader
            reached it the form had already said both halves better:

              · „აირჩიე, რას აკეთებ" is the first card's own heading, „რას
                აკეთებ", one element below;
              · „მოთხოვნები მხოლოდ ამის მიხედვით მოგდის" is the banner directly
                under it — which says the same thing AND knows whether it is
                currently true („ჯერ არ ხარ სიაში…" / „დროებით გამორთულია…").
              · and the city clause named a block that is no longer drawn.

            This is the same defect the banner itself was fixed for on
            2026-08-21 („the warning restated the form it was sitting on top
            of"), one level up: three sentences introducing a screen that
            introduces itself. */}
        <ServiceProfileForm name={user.fullName} avatarUrl={user.avatarUrl} />
      </section>
    </div>
  )
}
