// /me/r/[ref] — ONE OF THIS CLIENT'S REQUESTS, INSIDE THEIR OWN ROOM.
//
// ⚠️ THE JUMP THIS ADDRESS EXISTS TO END (2026-09-02). Owner, looking at their
// own request while signed in: „ესე დახტუნავს ძალიან… ვფიქრობ გაცილებით
// მარტივად რომ მოვაწყოთ და ბევრი ინფორმაციის გარეშე უფრო კარგი იქნება."
//
// /me draws the request list inside the client workspace — rail, top bar, bell,
// avatar, badges — and every row on it opened /request/<ref>, which wears the
// INTAKE'S chrome: a centred logo and nothing else, no rail, no way back except
// the browser's own button. One click took a signed-in person out of the room
// they live in and into what reads as a different site. Then the conversation
// they were having about that request ALSO had a second home at
// /me/messages/o/<offerId>. One errand, three chromes.
//
// So the screen itself is `app/request/[ref]/_room` — one component, drawn once
// — and the two addresses differ ONLY in who they let in and what they wrap it
// in. Read that file's header first; it is where the split is explained.
//
// ⚠️ THE OTHER ADDRESS IS NOT DEPRECATED. Most people who file a request never
// register, and for them the `MC-` reference in their email IS the account.
// /request/<ref> is still their door and still counts wrong guesses
// (lib/refGuard). This one is for somebody who already has a session.
//
// ── THE GUARD, AND WHY IT IS DIFFERENT ──────────────────────────────────────
// `loadRequestRoom(ref, user.id)` puts the ownership in the `where`, so this
// page can only ever return a request this account filed. That is a STRONGER
// door than the public one, not a weaker one, and it is why `refGuard`'s
// guess-budget is deliberately NOT applied here:
//
//   · with `userId` in the `where`, a guessed reference returns nothing even
//     when the code is real — there is no oracle to feed;
//   · and the budget is counted per IP, so a signed-in client who mistyped
//     their own bookmark twice would lock themselves out of their own room.
//
// The public page keeps it, because there the reference is the ONLY credential.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { Container } from '@/components/Container'
import { Icon } from '@/components/Icon'
import { normalizePublicRef, requestsOn } from '@/lib/requests'
import { loadRequestRoom, RequestRoom } from '@/app/request/[ref]/_room'

export const dynamic = 'force-dynamic'

// The room's own name, like every other /me screen — see app/me/layout for why
// this room had none until 2026-08-31.
export const metadata: Metadata = { title: 'მოთხოვნა — მცოდნე' }

export default async function ClientRequestRoom({ params, searchParams }: {
  params: Promise<{ ref: string }>
  /** `?o=<offerId>` — which conversation to arrive on. Written by
   *  `clientRequestHref`, followed by the bell and by every inbox row. */
  searchParams: Promise<{ o?: string }>
}) {
  const user = await requireUser()
  // 404 rather than a redirect, the same answer /me/messages gives with the
  // subsystem dark: an address a person may not use must answer exactly what an
  // unknown URL answers.
  if (!requestsOn()) notFound()

  const { ref: raw } = await params
  const ref = normalizePublicRef(raw)
  if (!ref) notFound()

  const data = await loadRequestRoom(ref, user.id)
  if (!data) notFound()

  // ⚠️ NOT VALIDATED HERE, AND IT DOES NOT NEED TO BE. The room only ever
  // compares this against ids it already holds — offers on a request the
  // `where` above proved is this user's — so a forged or stale `?o=` selects
  // nothing and the screen falls back to its own answer. Nothing is fetched
  // with it and nothing is rendered from it.
  const { o } = await searchParams

  return (
    /* ⚠️ `wide`, MATCHING THE PUBLIC PAGE'S `body="wide"`. The canvas draws the
       offers screen as two columns — the list on the left, the chosen offer and
       its conversation on the right — and OfferList wraps on its own CONTAINER
       rather than on the viewport, so a narrower column here would silently
       stack the composer under the whole offer list. That is the „hidden and
       lost" report, and the width is the fix, in both chromes.
       `wide` is Container's default; it is written out because it is a
       decision, not an omission. */
    <Container as="main" size="wide" className="flex-1 py-7 lg:py-8 pb-12">
      {/* THE WAY BACK, and the reason this is not just the public page with a
          rail beside it: a room you can only leave through the browser's back
          button is not a room. The rail's „მთავარი" also goes here, so this is
          a second door to one place — kept because it is where the eye already
          is when the answer is „this is not the request I meant". */}
      <Link
        href="/me"
        className="inline-flex items-center gap-1.5 h-10 -ml-1 px-1 text-small font-semibold text-ink-500 hover:text-ink-800 transition-colors duration-fast"
      >
        <Icon.back className="w-4 h-4" />
        ჩემი მოთხოვნები
      </Link>

      <div className="mt-2">
        <RequestRoom data={data} viewerUserId={user.id} selectedOfferId={o ?? null} />
      </div>
    </Container>
  )
}
