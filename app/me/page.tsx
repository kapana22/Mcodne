// /me — the client's home, RENDERED ON THE SERVER.
//
// ⚠️ IT WAS THE ONLY CLIENT-RENDERED PAGE IN THIS ROOM (rewritten 2026-08-30).
// Owner: „ხანდახან დილეი აქვს, ნახევარს ტვირთავს ხოლმე რაღაცებს და მერე ჩნდება
// ხოლმე — ესე არ უნდა ხდებოდეს."
//
// /me/requests, /me/favorites and /me/profile are all server components: their
// data is in the HTML and the page is right on the first paint. This one was
// `'use client'` and fired FIVE requests after mount — /api/me, /api/favorites,
// /api/me/requests, /api/providers, plus the rail's badges — behind a skeleton.
// So the one page a client LANDS on was the only one that made them wait, and
// it assembled in front of them, block by block.
//
// ⚠️ AND THE SESSION WAS READ TWICE. app/me/layout already resolves the user
// with `requireRole` for this whole segment; the page then asked /api/me for
// the same answer, to print a first name.
//
// ⚠️ AND IT WAS THREE QUARTERS A PREVIEW OF ITS OWN NAVIGATION (2026-08-30).
// The home drew the latest THREE requests with a „ყველა" link to /me/requests —
// the same rows — then a suggestion grid duplicating the catalogue one rail row
// below, then a strip summarising the saved page one row below that. So the
// rail lost „მოთხოვნები" and this screen became the flow itself: greeting, the
// one action, and every request in full. /me/requests redirects here.
//
// What is left client-side is only what genuinely cannot be server-rendered:
// the onboarding card, which reads localStorage to stay dismissed.

import { requireUser } from '@/lib/auth'
import { Container } from '@/components/Container'
import { requestsOn, REQUEST_ROUTE } from '@/lib/requests'
import { myRequests } from '@/lib/myRequests'
import { MyRequestsSection } from './_requests'
import { OnboardingTour, Welcome } from './_welcome'

export const dynamic = 'force-dynamic'

export default async function ClientHome() {
  const user = await requireUser()
  const on = requestsOn()

  // ⚠️ EVERY REQUEST, NOT THE LATEST THREE. `myRequests` caps itself at 50,
  // which is far past a list anybody scrolls and is the same call /me/requests
  // made before it became a redirect here.
  const rows = on ? await myRequests(user.id) : []

  return (
    <>
      <Welcome name={user.fullName} requestHref={on ? REQUEST_ROUTE : null} />
      <OnboardingTour
        userId={user.id}
        joinedAt={user.createdAt?.toISOString()}
        requestHref={on ? REQUEST_ROUTE : null}
      />
      <Container as="main" className="py-8 lg:py-10">
        {/* ⚠️ ONE BLOCK, AND NOTHING UNDER IT. A „გამოცადე" grid of six provider
            cards used to follow — the catalogue, drawn a second time, on the one
            screen whose job is the reader's own work — and then a strip of saved
            experts, which is a rail row of its own. Browsing belongs where
            browsing lives; an empty screen is not a problem to fill. */}
        <MyRequestsSection rows={rows} />
      </Container>
    </>
  )
}
