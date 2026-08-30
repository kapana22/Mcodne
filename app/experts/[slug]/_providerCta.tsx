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

// ⚠️ ONE ACTION AGAIN SINCE 2026-08-24. The second was „მიწერე" — a direct
// user-to-user thread — and the whole `Message` table went with the booking
// product on that day: the pair inbox existed to carry a booking's conversation,
// and a request already opens an addressed thread that does the same job with
// the client's brief attached. The note below is kept because the DISTINCTION
// it draws is real and will come back the day a plain „ask a question" thread
// does; what is not kept is a button to a screen that no longer exists.
//
// ⚠️ TWO ACTIONS BETWEEN 2026-08-20 AND THEN, AND THE SECOND WAS NOT A DUPLICATE. Owner:
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
import { requestHrefFor } from './_providerData'
import { SaveProviderBtn } from '@/components/SaveProviderBtn'

export function ProviderCta({ master }: {
  /** The profile this button belongs to — its address, nothing more. */
  master: { slug: string | null; id: string }
}) {
  return (
    <Card>
      {/* ⚠️ „დატოვე", NOT „გამოაგზავნე" (2026-08-21). Owner: „რეალურად
          მოთხოვნას უგზავნი და უტოვებ ლიდს, რომ დაუკავშირდე — ხომ მთელი იდეა
          ეგაა." „გამოაგზავნე მოთხოვნა" is tender language: it describes a brief
          going OUT to a market, which is what this button did until 2026-08-20
          and is not what it does now. It is addressed — `?to=<slug>`,
          `offerLimit: 1`, one INVITED thread — so what the visitor is doing is
          LEAVING their job with this one provider, who then comes back to them.
          „დატოვე" carries the return; „გამოაგზავნე" carries only the sending. */}
      <Btn href={requestHrefFor(master)} variant="hero" size="lg" className="w-full">დატოვე მოთხოვნა</Btn>
      {/* ⚠️ IT NOW SAYS WHERE THE REQUEST GOES (2026-08-21), which is the half
          the visitor could not see. The terms sentence is the owner's own, from
          the deleted trades door, and it answered „what does this cost me" —
          but nothing on this card answered „who reads it", and the honest
          answer became a strong one on 2026-08-20 without any screen saying so:
          a request written here is addressed to THIS provider and nobody else
          (app/api/requests → `offerLimit: 1`, and the provider queue's
          `OR: [{ offerLimit: { gt: 1 } }, …invited]` is what enforces it).
          Somebody who thinks they are posting to a market behaves like it —
          they write once, vaguely, and wait for quotes. Somebody who knows they
          are writing to one person writes to that person.
          ⚠️ THE THREE CLAIMS ARE EACH TRUE AND EACH CHECKED. „სხვას არ
          ეჩვენება" — the queue filter above. „პასუხს მიმოწერაში მიიღებ" —
          lib/requestInvite opens an INVITED thread and notifies them; it does
          NOT open the contact. „ნომერს … როცა შენ აირჩევ" — the masking rule in
          lib/requestChat, unchanged. Nothing here promises a phone call. */}
      <p className="mt-3 text-small text-ink-500">
        მოთხოვნა პირდაპირ ამ პროფილს მიდის და სხვას არ ეჩვენება — პასუხს
        მიმოწერაში მიიღებ. უფასოა, ნომერს კი მხოლოდ მაშინ ვაძლევთ, როცა შენ
        აირჩევ.
      </p>
      {/* ⚠️ THE SHORTLIST HAD NO WAY IN UNTIL 2026-08-26 — `POST /api/favorites`
          had no caller anywhere, while „შენახული" kept its slot in the bottom
          nav, the top bar and the client room. Secondary by construction: the
          request is the action, saving is the „not yet". It renders only for a
          signed-in client (see the component). */}
      <SaveProviderBtn providerId={master.id} />
    </Card>
  )
}
