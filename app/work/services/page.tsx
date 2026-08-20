// /work/services — „ჩემი სერვისები", the ONE page that answers „რას ვყიდი?".
//
// ⚠️ WHY THIS PAGE EXISTS: there were two of them (2026-08-19). The expert
// answered the question in a tab of /work/profile („სესიები" — the bookable
// consultation types) and the master answered it at /work/service-profile (the
// trades, the cities, the price, the switch). One question, two screens, in two
// halves of the same workspace — the split CLAUDE.md's product model says must
// not exist: this site sells SERVICES, and a consultation is one KIND of
// service, the one with a fixed price and a bookable time. Somebody who holds
// both capabilities had two places to keep their offer up to date and no page
// that showed them what they sell.
//
// ⚠️ OUTSIDE BOTH ROUTE GROUPS, AND THAT IS THE POINT. `app/work/(expert)`
// requires the EXPERT role and `app/work/(provider)` 404s anybody the requests
// allowlist does not name — neither is right for a page BOTH must open, and
// putting it in either one would lock out half the people it is for. So it
// sits directly under /work, inside the shell (app/work/layout.tsx, which is
// chrome and never a guard) and carries its own gate.
//
// ⚠️ THE GATE IS THE TWO OLD GATES, KEPT (never merged into one looser rule):
//   · signed in at all, else notFound()
//   · the consultation half draws for the CONSULT capability — a TutorProfile,
//     the same row the old tab needed to render.
//   · the trades half draws for `requestsViewer().providerAllowed` AND a
//     provider identity — literally what app/work/(provider)/layout.tsx and the
//     old service-profile page checked, in that order, so the supply-side
//     switch and the allowlist still decide.
//   · neither half → notFound(). 404 AND NEVER 403: a 403 tells a stranger the
//     page is real and worth coming back to, which is the one thing the 404
//     exists to deny (lib/requestsServer says it at length).
//
// A person with one capability therefore sees ONE half and no empty scaffolding
// for the other — nothing here offers to sell them the capability they do not
// have; that invitation is /join's job (lib/capabilities → missingCapability).

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { capabilitiesOf } from '@/lib/capabilities'
import { requestsViewer } from '@/lib/requestsServer'
import { PageHeader } from '@/components/PageHeader'
import { ConsultationsSection } from './_consultations'
import { ServiceProfileForm } from './_trades'

// Re-verify on every request, matching the two group layouts beside it: this
// page must never be served from a cached render that outlived the session, a
// capability or the allowlist row behind it.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'ჩემი სერვისები — მცოდნე',
  robots: { index: false, follow: false },
}

export default async function Page() {
  const user = await getCurrentUser()
  if (!user) notFound()

  const caps = await capabilitiesOf(user.id)
  const viewer = await requestsViewer()

  const showConsultations = caps.includes('CONSULT')
  // BOTH conditions, because they answer different questions: `providerAllowed`
  // is „may you open a provider surface at all" (the supply-side switch + the
  // allowlist, the old layout's check) and `provider` is „is there an identity
  // to hang a ServiceProfile on" (the old page's own check — an admin who is
  // not on the list has no row to fill in).
  const showTrades = viewer.providerAllowed && viewer.provider !== null

  if (!showConsultations && !showTrades) notFound()

  return (
    <div>
      <PageHeader className="mb-6" title="ჩემი სერვისები" />

      <div className="space-y-10">
        {/* ⚠️ TWO HEADINGS, NEVER TWO TABS. A tab bar here would read as two
            products — exactly the consultation-vs-service primary axis the
            product model forbids. These are two shapes of one answer, stacked,
            in the order the platform grew them. */}
        {showConsultations && (
          <section>
            <h2 className="font-display text-h3 font-bold text-ink-900">კონსულტაციები</h2>
            <p className="mt-1 mb-4 text-small text-ink-500 leading-snug">
              რას სთავაზობ — ფასი, ხანგრძლივობა და თავისუფალი დრო.
            </p>
            <ConsultationsSection />
          </section>
        )}

        {showTrades && (
          <section>
            <h2 className="font-display text-h3 font-bold text-ink-900">სამუშაოები</h2>
            <p className="mt-1 mb-4 text-small text-ink-500 leading-snug">
              აირჩიე, რას აკეთებ და რომელ ქალაქებში. მოთხოვნები მხოლოდ ამის მიხედვით მოგდის.
            </p>
            <ServiceProfileForm />
          </section>
        )}
      </div>
    </div>
  )
}
