// POST /api/requests/[ref]/accept — the client picks an offer.
//
// THIS IS THE MOMENT THE PRODUCT EXISTS. Before it, neither side has the
// other's phone number; after it, both do. Everything else in this subsystem is
// arrangements around this one transition.
//
// ⚠️ IT IS CLAIMED, NOT CHECKED. „A status check you read before the write is
// not a guard" (CLAUDE.md) — two tabs open on the same request would otherwise
// both read VERIFIED and both accept, and the client would have promised the
// work to two providers, each of whom now has their phone number. The row is
// claimed with `updateMany({ where: { status: 'VERIFIED' } })` and a
// `count !== 1 → 409`, the pattern app/api/bookings/[id]/cancel established.

import { NextResponse, after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { normalizePublicRef, topicLabel } from '@/lib/requests'
import { requestsViewer } from '@/lib/requestsServer'
import { notifyMany } from '@/lib/notify'
import { sendMail } from '@/lib/mailer'
import { offerAcceptedProviderEmail } from '@/lib/emailTemplates'

const notFound = () => NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const viewer = await requestsViewer()
  if (!viewer.clientAllowed) return notFound()

  const { ref: raw } = await params
  // A garbage segment is answered without a query at all — the shape check is
  // free and the database round-trip is not.
  const ref = normalizePublicRef(raw)
  if (!ref) return notFound()

  const body = await req.json().catch(() => ({})) as { offerId?: unknown }
  const offerId = typeof body.offerId === 'string' ? body.offerId.trim() : ''
  if (!offerId) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  await ensureDbReady()

  // The offer must belong to THIS request and still be on the table. Read
  // first only to resolve the request id and to answer 404 for an offer that
  // was never here — the transition itself is claimed below, not decided here.
  const offer = await prisma.requestOffer.findFirst({
    where: { id: offerId, status: 'SENT', request: { publicRef: ref } },
    select: {
      id: true, requestId: true,
      expertUserId: true, companyId: true,
      request: { select: { publicRef: true, contactName: true, topic: true } },
    },
  })
  if (!offer) return notFound()

  // ── THE CLAIM ────────────────────────────────────────────────────────────
  // VERIFIED → MATCHED, conditionally. The `where` carries the state we believe
  // we are moving out of, so the database — not this process — decides who got
  // there first. A second tab arriving a millisecond later matches zero rows
  // and is told 409; it does not overwrite the first choice, and it does not
  // hand a second provider a phone number.
  const claimed = await prisma.serviceRequest.updateMany({
    where: { id: offer.requestId, status: 'VERIFIED' },
    data: { status: 'MATCHED' },
  })
  if (claimed.count !== 1) {
    return NextResponse.json({ ok: false, error: 'ALREADY_DECIDED' }, { status: 409 })
  }

  // The request is now MATCHED and no further accept can claim it, so these two
  // writes cannot race anybody. The chosen offer wins; every other offer still
  // on the table is declined in one statement — leaving them SENT would show
  // three providers a live offer on a request that is settled.
  await prisma.requestOffer.update({ where: { id: offer.id }, data: { status: 'ACCEPTED' } })
  await prisma.requestOffer.updateMany({
    where: { requestId: offer.requestId, status: 'SENT' },
    data: { status: 'DECLINED' },
  })

  // The provider learns they were chosen — and the notification is where they
  // find the client's details, because the page they land on is the only place
  // those are shown. Best-effort by design (lib/notify swallows its own
  // failures): a dead notification write must never undo an accepted offer.
  //
  // A COMPANY has no User to notify, so every active member is told. The
  // membership list is the company's inbox — there is no company account to
  // sign into, and picking one member would be picking one at random.
  const recipients = offer.expertUserId
    ? [offer.expertUserId]
    : (await prisma.companyMember.findMany({
        where: { companyId: offer.companyId ?? '' },
        select: { userId: true },
      })).map(m => m.userId)

  await notifyMany(recipients, {
    // GENERIC on purpose: NotifType's five opt-outable categories are all about
    // the booking product, and this is not that product. GENERIC is always
    // delivered (lib/notify), which is right — being chosen for paid work is
    // not marketing somebody may unsubscribe from.
    type: 'GENERIC',
    title: 'შენი შეთავაზება აირჩიეს',
    body: `${offer.request.contactName} — ${offer.request.publicRef}`,
    href: '/provider/offers',
  })

  // …and by MAIL, because being chosen is the moment the client starts waiting
  // and the provider is probably not on the site (the speed-to-lead numbers cut
  // both ways — a client who chose and heard nothing for a day books elsewhere).
  // The mail itself carries NO client contact: the page it links to does, so a
  // forwarded mail leaks nothing.
  // ⚠️ NO publicRef IN A PROVIDER'S MAIL (2026-08-17) — it is the client's
  // credential, and this route is the proof: it authorises on that string
  // alone. See app/provider/requests/[id]/page.
  const mail = offerAcceptedProviderEmail({
    topicLabel: topicLabel(offer.request.topic),
  })
  const emails = recipients.length
    ? (await prisma.user.findMany({ where: { id: { in: recipients } }, select: { email: true } })).map(u => u.email)
    : []
  after(async () => {
    for (const to of emails) {
      try { await sendMail({ to, ...mail }) } catch { /* best-effort per address */ }
    }
  })

  return NextResponse.json({ ok: true })
}
