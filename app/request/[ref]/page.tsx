// /request/[ref] — the request room for somebody WITHOUT an account.
//
// REACHED BY REFERENCE, and the reference is the key. It is minted from crypto
// randomness (lib/requests → makePublicRef) rather than being a sequence,
// because it is the only thing between a stranger and this page — which carries
// what the client wrote (a description, a budget, a city) and every
// conversation they are having about it.
//
// ⚠️ THE PROVIDER'S PHONE IS BACK ON THIS PAGE (2026-09-03), AND THE CLIENT'S
// IS NOT. It was taken off on 2026-08-21 („მოდი ამ ეტაპზე იყოს მიწერა და ჩათში
// გარკვნენ") and the owner reversed that: every offer now carries a „მიწერა"
// and a „დარეკვა" button and the client picks the channel. The rule, the owner
// quotes and the pricing question it leaves open all live in lib/requests →
// ProviderContact, not here.
//
// ⚠️ THE SCREEN MOVED OUT OF THIS FILE ON 2026-09-02 and this page kept the
// GUARD. Everything below the `notFound()`s is `./_room` now, because the
// signed-in owner reads the same room at /me/r/<ref> inside their own
// workspace — see the header there for the owner quote that asked for it. What
// is left here is the one thing that is genuinely this address's own: a client
// with no session, holding nothing but an `MC-` code.
//
// ⚠️ THIS ADDRESS IS NOT DEPRECATED AND MUST NOT BECOME A REDIRECT. Most people
// who file a request never register — the reference in their email IS their
// account — and `lib/inboxRows → clientThreadHref` is where the signed-in half
// is decided. Two doors, one room.
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { normalizePublicRef } from '@/lib/requests'
import { requestsViewer } from '@/lib/requestsServer'
import { refBudgetSpent, noteRefMiss } from '@/lib/refGuard'
import { RequestShell } from '../_shell'
import { loadRequestRoom, RequestRoom } from './_room'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'მოთხოვნა — მცოდნე',
  robots: { index: false, follow: false },
}

export default async function Page({ params }: { params: Promise<{ ref: string }> }) {
  const viewer = await requestsViewer()
  if (!viewer.clientAllowed) notFound()

  // ⚠️ THE REFERENCE IS THE ONLY CREDENTIAL ON THIS PAGE, and the page carries
  // what somebody wrote about their home and their money — so wrong guesses are
  // counted and an address that has spent its budget gets the same 404 as an
  // empty code (lib/refGuard). A client holding a real reference never spends
  // any of it.
  const req = { headers: await headers() }
  if (refBudgetSpent(req)) notFound()

  const { ref: raw } = await params
  // A garbage segment is answered without a query at all — the shape check is
  // free and the database round-trip is not.
  const ref = normalizePublicRef(raw)
  if (!ref) { noteRefMiss(req); notFound() }

  // `null` owner: the reference alone authorises here, which is the whole
  // meaning of this address. /me/r/[ref] passes a user id instead.
  const data = await loadRequestRoom(ref, null)
  if (!data) { noteRefMiss(req); notFound() }

  return (
    // The same chrome the wizard uses — this page is the other half of the same
    // errand, and it must not suddenly look like a page of the site.
    /* ⚠️ WIDE, UNLIKE EVERY OTHER SCREEN IN THIS RUN. The intake is a form and
       reads at 560; this is the room the client lands in afterwards, and the
       canvas draws it as two columns — the offers on the left, the chosen one
       and the conversation on the right. At `narrow` those two stack and the
       message box ends up under the whole offer list, which is exactly the
       „hidden and lost" the owner reported. The panes wrap on their own below
       the breakpoint, so a phone still gets one column. */
    /* ⚠️ `privacyLine={false}` STOOD HERE AND THE PROP IS GONE (2026-09-04).
       This screen had to switch the shell's „ნომერს არავის ვაძლევთ" line off,
       because the „დარეკვა" button on every offer card contradicts its second
       half. The line has now been removed from the shell for every screen —
       owner: „წაშალე საერთოდ ეს ზედმეტი ინფო" — so there is nothing left to
       switch off and the override went with it. */
    <RequestShell body="wide">
      <RequestRoom data={data} viewerUserId={viewer.user?.id ?? null} />
    </RequestShell>
  )
}
