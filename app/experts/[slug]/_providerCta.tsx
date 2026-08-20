// /experts/[slug] — the PROVIDER profile's one action: the intake (was
// app/services/[slug]/_cta until stage 11, 2026-08-19).
//
// ⚠️ THE CTA IS GATED, THE PAGE IS NOT. The page reads `requestsOn()` once and
// renders this only when the subsystem exists (lib/requests); on a deployment
// where it does not, the profile still stands — it is an indexable page and a
// URL that 404s teaches the crawler to distrust the file. Same rule as
// app/experts/page.tsx and ./_tradeLanding.tsx.
//
// It is a plain card with a button, not a booking rail: this provider has
// published no bookable time and no price the site can charge for — the ONE
// difference between the two profiles that share this segment, and it is about
// HOW YOU BUY, never about what kind of person somebody is. What the client does here is
// describe the job; the master answers through the requests subsystem, which is
// why the address comes from the model (`for=service` baked in).
//
// ⚠️ AND IT NOW CARRIES THIS MASTER (2026-08-19). Until today the button led to
// the same anonymous form the header opens — so somebody who had read this
// person's page, looked at their work photos and decided on THEM described the
// job to nobody in particular and waited to see who turned up. `requestHrefFor`
// adds `?to=<slug>`; the wizard names them in its chrome, skips the „რა
// გჭირდება" question their trades already answer, and the endpoint opens the
// INVITED thread with them the moment the request is written.

import { Btn } from '@/components/Btn'
import { Card } from '@/components/Card'
import { requestHrefFor } from './_providerData'

export function ProviderCta({ master }: {
  /** The profile this button belongs to — only its address is used. */
  master: { slug: string | null; id: string }
}) {
  return (
    <Card>
      <Btn href={requestHrefFor(master)} variant="hero" size="lg" className="w-full">გამოაგზავნე მოთხოვნა</Btn>
      {/* The terms at the decision point, in the owner's own words from the
          deleted trades door — the same action, so the same sentence. */}
      <p className="mt-3 text-small text-ink-500">
        უფასოა, და ნომერს მხოლოდ იმას ვაძლევთ, ვისაც შენ აირჩევ.
      </p>
    </Card>
  )
}
