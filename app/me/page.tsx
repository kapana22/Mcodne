// /me — the client's home, RENDERED ON THE SERVER, and it IS their request list.
//
// ⚠️ IT WAS THE ONLY CLIENT-RENDERED PAGE IN THIS ROOM (rewritten 2026-08-30).
// Owner: „ხანდახან დილეი აქვს, ნახევარს ტვირთავს ხოლმე რაღაცებს და მერე ჩნდება
// ხოლმე — ესე არ უნდა ხდებოდეს."
//
// /me/favorites and /me/profile are server components too: their data is in the
// HTML and the page is right on the first paint. This one was `'use client'`
// and fired FIVE requests after mount — /api/me, /api/favorites,
// /api/me/requests, /api/providers, plus the rail's badges — behind a skeleton.
// So the one page a client LANDS on was the only one that made them wait, and
// it assembled in front of them, block by block.
//
// ⚠️ AND IT WAS THREE QUARTERS A PREVIEW OF ITS OWN NAVIGATION (2026-08-30).
// The home drew the latest THREE requests with a „ყველა" link to /me/requests —
// the same rows — then a suggestion grid duplicating the catalogue one rail row
// below, then a strip summarising the saved page one row below that. So the
// rail lost „მოთხოვნები" and this screen became the flow itself. /me/requests
// redirects here.
//
// ⚠️ THE GREETING BAND IS GONE (2026-08-31, the owner's „Client Space" canvas).
// A full-bleed white section carried „გამარჯობა, <name>." over a sentence and
// the intake button, above the list. The canvas opens the screen on the list's
// own title instead, and it is the better call for a room somebody comes back
// to: „გამარჯობა" is the first-visit sentence being paid for on every visit,
// the name is in the avatar 40px up and to the right, and the one action the
// band carried is now permanent — the rail's „ახალი მოთხოვნა" and the card at
// the end of the list, both of which are on screen whichever /me screen you are
// on. See app/me/_welcome for what survived.

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'ჩემი მოთხოვნები — მცოდნე' }

import { requireUser } from '@/lib/auth'
import { Container } from '@/components/Container'
import { PageHeader } from '@/components/PageHeader'
import { requestsOn, REQUEST_ROUTE } from '@/lib/requests'
import { sellsHere } from '@/lib/requestsServer'
import { myRequests } from '@/lib/myRequests'
import { MyRequestsSection } from './_requests'
import { OnboardingTour } from './_welcome'

export const dynamic = 'force-dynamic'

export default async function ClientHome() {
  const user = await requireUser()
  const on = requestsOn()

  // ⚠️ EVERY REQUEST, NOT THE LATEST THREE. `myRequests` caps itself at 50,
  // which is far past a list anybody scrolls and is the same call /me/requests
  // made before it became a redirect here.
  const rows = on ? await myRequests(user.id) : []

  // 🔒 THE SAME QUESTION THE RAIL ABOVE THIS PAGE ALREADY ASKS (2026-09-01).
  // app/me/layout.tsx computes `newRequestHref` as „the subsystem is on AND
  // this person does not sell here" — owner, 2026-08-31: a seller does not
  // order — and drops the rail's „ახალი მოთხოვნა" for anybody it refuses. This
  // page did not ask the second half: it handed `REQUEST_ROUTE` to the tour and
  // to the dashed card on the strength of the flag alone. Measured on the local
  // database today, signed in as a provider: the rail correctly had no intake
  // button and the card under the empty list still read „რა გჭირდება? …
  // [დაწერე]" — and /request answers that person with a 307 back to /work
  // (`mayFile` in lib/requestsServer is the authoritative refusal). One screen,
  // two answers to „may I ask for something here", and the visible one was the
  // wrong one.
  //
  // A layout cannot hand a prop down to its page, so the question is asked
  // twice; `sellsHere` is one indexed lookup that short-circuits for everybody
  // who is not on the allowlist, and asking it the same way in both places is
  // what stops the two disagreeing again.
  const requestHref = on && !(await sellsHere(user.id)) ? REQUEST_ROUTE : null

  return (
    <Container as="main" size="content" className="flex-1 py-7 lg:py-8 pb-12">
      <PageHeader
        className="mb-5"
        title="ჩემი მოთხოვნები"
        // 🔒 The sub describes a list; with no list it would be describing
        // nothing. The dashed card below says what to do instead.
        sub={rows.length > 0 ? 'შეთავაზებები ერთ სიაშია' : undefined}
      />

      <OnboardingTour
        userId={user.id}
        joinedAt={user.createdAt?.toISOString()}
        requestHref={requestHref}
        hasRequests={rows.length > 0}
      />

      {/* ⚠️ ONE BLOCK, AND NOTHING UNDER IT. A „გამოცადე" grid of six provider
          cards used to follow — the catalogue, drawn a second time, on the one
          screen whose job is the reader's own work — and then a strip of saved
          experts, which is a rail row of its own. Browsing belongs where
          browsing lives; an empty screen is not a problem to fill. */}
      <MyRequestsSection rows={rows} requestHref={requestHref} />
    </Container>
  )
}
