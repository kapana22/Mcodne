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

// ⚠️ TWO ACTIONS SINCE 2026-08-20, AND THE SECOND IS NOT A DUPLICATE. Owner:
// „მინდა რომ … გავუგზავნო სერვისი, მივწერო ან დავუკავშირდე — რამდენიმე ვარიანტი
// უნდა ქონდეს." Until today this card carried ONE button, and the expert rail
// argued (app/experts/[slug]/_booking, „THE SECOND VERB") that a message and a
// request are „the same intent". They are not, and the difference is the whole
// reason somebody bounces:
//
//   მიწერე            one question, one line, answered in a thread —
//                     „ამას აკეთებ?", „ხუთშაბათს თავისუფალი ხარ?"
//   გამოაგზავნე       a multi-step brief — topic, city, budget band, description
//   მოთხოვნა          — which opens offers and is how the job is actually let
//
// Making the brief the only door prices a one-line question at a whole wizard.
// That is interaction cost in the NN/g sense: the effort exceeds the value of
// the act, and the act does not happen. The request stays PRIMARY — it is what
// gets the work done and it needs no account, which is the intake's own design
// („no registration, anywhere") — and the question sits quietly beneath it.
//
// ⚠️ THE MESSAGE LINK IS OMITTED, NEVER DISABLED, when there is nobody to write
// to (a company profile — `messageHref` null). A greyed control still asks a
// question whose answer does not exist.

import { Btn } from '@/components/Btn'
import { Card } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { requestHrefFor } from './_providerData'

export function ProviderCta({ master }: {
  /** The profile these buttons belong to — its address, and whoever to write to. */
  master: { slug: string | null; id: string; messageHref: string | null }
}) {
  return (
    <Card>
      <Btn href={requestHrefFor(master)} variant="hero" size="lg" className="w-full">გამოაგზავნე მოთხოვნა</Btn>
      {master.messageHref && (
        <Btn href={master.messageHref} variant="secondary" size="lg" className="w-full mt-2.5">
          <Icon.chat className="w-4 h-4" /> მიწერე
        </Btn>
      )}
      {/* The terms at the decision point, in the owner's own words from the
          deleted trades door — the same action, so the same sentence. */}
      <p className="mt-3 text-small text-ink-500">
        უფასოა, და ნომერს მხოლოდ იმას ვაძლევთ, ვისაც შენ აირჩევ.
      </p>
    </Card>
  )
}
