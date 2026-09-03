// /me/messages/o/[offerId] — A RESOLVER, NOT A SCREEN (2026-09-02).
//
// ⚠️ WHAT IT WAS, AND WHY IT STOPPED BEING IT. This rendered `ClientThreadPane`
// — one offer conversation, in the inbox's right-hand pane — while the SAME
// conversation was also drawn inside the request room (/request/<ref>, now also
// /me/r/<ref>), where it sits beside the offer's price and the „აირჩიე" button.
// Two screens for one thread. Owner, 2026-09-02: „10 ჯერ ერთი და იგივე რამის
// დახატვა და გამოტანა გადავიტანოთ და ერთი დიზაინ პატერნით ვიმუშაოთ."
//
// The room won, because it is the one that can answer the next question. A
// client reading „შემიძლია ხვალ" wants to accept, or compare it with the other
// two offers, and the pane had neither — it had a „მოთხოვნა" link back to the
// page that did.
//
// ⚠️ SO WHY DOES THE ADDRESS SURVIVE AT ALL? Because it is the one link that
// carries NO reference. CLAUDE.md §5: the `MC-` code is a credential, and the
// offer bell's own note spells out the consequence — „NO publicRef, NOT IN THE
// BODY AND NOT IN THE HREF". A notification row lives in the database for ever
// and renders in a bell; an inbox row is built by a shared builder that the
// PROVIDER's side also uses. Neither may hold the code. This address is how a
// secret-free link still reaches a room addressed by one: the lookup happens
// here, behind the session, and the reference never leaves the server until the
// redirect — see `clientThreadHref` in lib/inboxRows, which is still the only
// place that writes it.
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { requireUser } from '@/lib/auth'
import { clientRequestHref, requestsOn } from '@/lib/requests'

export const dynamic = 'force-dynamic'

export default async function ClientOfferThreadRoute({ params }: { params: Promise<{ offerId: string }> }) {
  const user = await requireUser()
  if (!requestsOn()) notFound()

  const { offerId } = await params
  await ensureDbReady()

  // OWNERSHIP IS IN THE `where` — the request is mine — so a guessed offer id
  // cannot return a row to compare against, the same rule /api/request-chat and
  // `clientInboxRows` both work by. This is what makes the redirect safe to
  // build from the reference it reads: only the owner ever gets one.
  const offer = await prisma.requestOffer.findFirst({
    where: { id: offerId, request: { userId: user.id } },
    select: { id: true, request: { select: { publicRef: true } } },
  })
  if (!offer) notFound()

  redirect(clientRequestHref(offer.request.publicRef, offer.id))
}
