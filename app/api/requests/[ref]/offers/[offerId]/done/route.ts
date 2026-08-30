// POST /api/requests/[ref]/offers/[offerId]/done — „დასრულდა": the job is
// finished. Either side may say so, once (lib/offerLifecycle → markOfferDone).
//
// TWO CALLERS, TWO CREDENTIALS, ONE ROUTE:
//   the CLIENT   — possession of the reference, exactly as `accept` is
//                  authorised: `[ref]` must be this offer's request.
//   the PROVIDER — the session owns the offer (expert user, or a member of the
//                  company), like the offer-writing routes. The `[ref]` segment
//                  is NOT consulted for them and must never be required of them:
//                  it is the client's credential and a provider who had it could
//                  open the client's page. The provider's screen calls this
//                  path with a placeholder segment.
// Resolved in that order — the session first, then the reference — the same
// shape app/api/request-chat uses. Anyone else: 404, never 403.

import { NextResponse, after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { normalizePublicRef, topicLabel, PROVIDER_ROUTE } from '@/lib/requests'
import { requestsViewer, requestsNotFound } from '@/lib/requestsServer'
import { markOfferDone, providerUserIdsOf, type DoneBy } from '@/lib/offerLifecycle'
import { grantJobDone } from '@/lib/creditsServer'
import { notifyMany } from '@/lib/notify'
import { sendMail } from '@/lib/mailer'
import { offerDoneClientEmail, offerDoneProviderEmail } from '@/lib/emailTemplates'

export async function POST(_req: Request, { params }: { params: Promise<{ ref: string; offerId: string }> }) {
  const viewer = await requestsViewer()
  if (!viewer.clientAllowed) return requestsNotFound()

  const { ref: raw, offerId } = await params
  if (!offerId) return requestsNotFound()

  await ensureDbReady()

  const offer = await prisma.requestOffer.findUnique({
    where: { id: offerId },
    select: {
      id: true, expertUserId: true, companyId: true,
      // ⚠️ TOPIC, REF AND THE CLIENT'S EMAIL ONLY. The ref is compared, never
      // printed; the email is where the client's mail goes.
      request: { select: { publicRef: true, topic: true, email: true } },
    },
  })
  if (!offer) return requestsNotFound()

  // Who is speaking.
  let by: DoneBy | null = null
  if (viewer.provider) {
    const p = viewer.provider
    const owns = p.kind === 'EXPERT' ? offer.expertUserId === p.userId : offer.companyId === p.companyId
    if (owns) by = 'PROVIDER'
  }
  if (!by) {
    const ref = normalizePublicRef(raw)
    if (ref && ref === offer.request.publicRef) by = 'CLIENT'
  }
  if (!by) return requestsNotFound()

  // ── THE CLAIM ────────────────────────────────────────────────────────────
  // updateMany on { id, status: 'ACCEPTED', kind: 'QUOTE', doneAt: null };
  // count !== 1 → 409. A second tap, the other side a second later, an offer
  // that was never accepted — all the same answer, decided by the database.
  const r = await markOfferDone(offer.id, by)
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 409 })

  // ── What finishing the job paid for ──────────────────────────────────────
  //
  // ⚠️ INLINE AND NOT ONLY IN THE CRON, because a reward a person waits fifteen
  // minutes for is not a reward — the provider taps „დასრულდა" and the balance
  // in the top bar has moved by the time the page re-renders. lib/creditsServer
  // → runCreditJobs sweeps the same condition every tick as the backstop, and
  // both write the same `grantKey`, so whichever arrives second writes nothing.
  // That is the only reason it is safe to have two writers.
  //
  // ⚠️ AWAITED, NOT `after()`. It is one indexed insert on a table with a
  // hundred rows, and the response it delays is the one whose whole point is
  // that the number changed. Best-effort all the same: the stamp is the
  // deliverable and the sweep will pay it within the tick if this throws.
  //
  // ⚠️ AN INDIVIDUAL ONLY — the mirror of the charge (app/api/provider/offers).
  // A company's finished job has no personal balance to land in.
  if (offer.expertUserId) {
    try { await grantJobDone(offer.expertUserId, offer.id) } catch (e) { console.error('[credits] job grant failed', offer.id, e) }
  }

  // ── The other side hears about it ────────────────────────────────────────
  // Best-effort, after the response. The provider gets a bell and a mail (no
  // publicRef in either — see accept); the client, who usually has no account,
  // gets the mail with the link to their page, where the review lives.
  const topic = topicLabel(offer.request.topic)
  after(async () => {
    try {
      if (by === 'CLIENT') {
        const ids = await providerUserIdsOf(offer)
        await notifyMany(ids, {
          type: 'REQUEST_DONE',
          title: 'სამუშაო დასრულდა',
          body: topic,
          href: `${PROVIDER_ROUTE}/offers`,
        })
        const emails = ids.length
          ? (await prisma.user.findMany({ where: { id: { in: ids } }, select: { email: true } })).map(u => u.email)
          : []
        const mail = offerDoneProviderEmail({ topicLabel: topic })
        for (const to of emails) {
          try { await sendMail({ to, ...mail }) } catch { /* best-effort per address */ }
        }
      } else if (offer.request.email) {
        await sendMail({
          to: offer.request.email,
          ...offerDoneClientEmail({ publicRef: offer.request.publicRef, topicLabel: topic }),
        })
      }
    } catch { /* notification is best-effort; the stamp is written */ }
  })

  return NextResponse.json({ ok: true })
}
