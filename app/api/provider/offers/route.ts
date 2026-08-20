// POST /api/provider/offers — a provider bids on a verified request.
//
// ⚠️ THE PLACE LIMIT IS THE WHOLE DIFFICULTY, and it cannot be enforced by
// counting. Three providers may submit inside the same second; each would count
// two existing offers, each would decide there is room, and the client would
// open a page with four offers on a request they were promised three of.
// „A status check you read before the write is not a guard" (CLAUDE.md).
//
// So the place is CLAIMED before the offer is written:
//
//   updateMany({ where: { status: 'VERIFIED', offerCount: { lt: offerLimit } },
//                data:  { offerCount: { increment: 1 } } })
//   count !== 1 → 409
//
// One statement, evaluated by Postgres against the row it is locking. The
// fourth caller matches zero rows and is told the request is full — it does not
// write and then discover the problem.
//
// THE COUNTER IS THEREFORE NOT DERIVABLE from the offers table and is not meant
// to be. `_count` cannot be claimed conditionally; a column can.

import { NextResponse, after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { chargeForOffer } from '@/lib/creditsServer'
import { ensureDbReady } from '@/lib/dbBoot'
import { RequestOfferInput, offerProviderError, kindOf, KIND, gel, offerPriceLabel, topicLabel } from '@/lib/requests'
import { requestsViewer } from '@/lib/requestsServer'
import { sendMail } from '@/lib/mailer'
import { offerArrivedClientEmail } from '@/lib/emailTemplates'
import { recordOfferEvent } from '@/lib/offerEvents'

const notFound = () => NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

export async function POST(req: Request) {
  const viewer = await requestsViewer()
  if (!viewer.providerAllowed) return notFound()

  // An ADMIN is allowed to SEE this subsystem and is not a provider in it. They
  // have no allowlist row, so `provider` is null and there is no identity to
  // attach an offer to — answered 404 rather than 403 for the same reason
  // everything else here is: it is the shape of „there is nothing for you at
  // this URL", which for an admin is simply true.
  const provider = viewer.provider
  if (!provider) return notFound()

  // THE SAME schema the provider's form validated with (lib/requests).
  const parsed = RequestOfferInput.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const expertUserId = provider.kind === 'EXPERT' ? provider.userId : null
  const companyId = provider.kind === 'COMPANY' ? provider.companyId : null

  // THE ONE PLACE „exactly one provider" is checked (lib/requests). The
  // identity is built two lines above and could not currently be wrong — which
  // is exactly when a rule stops being checked and starts being assumed.
  const shapeErr = offerProviderError({ providerKind: provider.kind, expertUserId, companyId })
  if (shapeErr) return NextResponse.json({ ok: false, error: shapeErr }, { status: 400 })

  await ensureDbReady()

  // ── Is the client already talking to me? ─────────────────────────────────
  // An INVITED row means they wrote first (see the invite route). Answering
  // with a price does not create a second offer — it TURNS THAT ROW into one,
  // because the unique index on (requestId, expertUserId) allows exactly one
  // and because the conversation already hanging on it must survive the
  // transition. The place against `offerLimit` is claimed here, at the moment a
  // price appears, and not when the client said hello.
  const invited = await prisma.requestOffer.findFirst({
    where: {
      requestId: parsed.data.requestId,
      status: 'INVITED',
      ...(expertUserId ? { expertUserId } : { companyId }),
    },
    select: { id: true },
  })

  // ── THE CLAIM ────────────────────────────────────────────────────────────
  // Status and place, in one conditional write. Note what is NOT here: no
  // findUnique, no `if (count < limit)`, no transaction wrapping a read. The
  // `where` IS the guard.
  const claimed = await prisma.serviceRequest.updateMany({
    where: {
      id: parsed.data.requestId,
      status: 'VERIFIED',
      offerCount: { lt: prisma.serviceRequest.fields.offerLimit },
    },
    data: { offerCount: { increment: 1 } },
  })
  if (claimed.count !== 1) {
    // One code for „not verified", „full" and „does not exist" alike. A
    // provider who may not bid learns only that they may not bid — telling them
    // WHICH of the three it was would be a way to enumerate requests they are
    // not allowed to see.
    return NextResponse.json({ ok: false, error: 'NOT_OPEN' }, { status: 409 })
  }

  // ── The offer itself ─────────────────────────────────────────────────────
  // From here the place is spoken for, so a failure must give it back. Anything
  // else leaks a place per failure and a request silently accepts two offers
  // instead of three.
  try {
    const data = {
      priceGel: parsed.data.priceGel,
      daysEstimate: parsed.data.daysEstimate ?? null,
      message: parsed.data.message.trim(),
    }
    const offer = invited
      // The conversation keeps its id, so every message already in it stays
      // attached and the client does not watch a thread vanish and reappear.
      ? await prisma.requestOffer.update({
          where: { id: invited.id },
          data: { ...data, status: 'SENT' },
          select: {
            id: true,
            expertUser: { select: { fullName: true } },
            company: { select: { name: true } },
            request: { select: { publicRef: true, topic: true, kind: true, email: true, offerCount: true } },
          },
        })
      : await prisma.requestOffer.create({
          data: {
            requestId: parsed.data.requestId,
            providerKind: provider.kind,
            expertUserId,
            companyId,
            ...data,
          },
          select: {
            id: true,
            expertUser: { select: { fullName: true } },
            company: { select: { name: true } },
            request: { select: { publicRef: true, topic: true, kind: true, email: true, offerCount: true } },
          },
        })

    // ── What it cost to answer ───────────────────────────────────────────
    //
    // ⚠️ CHARGED ON SENDING, NEVER ON SEEING (lib/credits → OFFER_COST_TETRI).
    // The provider read the whole request, decided, and spent on their own
    // decision — the model this industry is most criticised for is the other
    // one, where you pay to look and most leads never answer.
    //
    // ⚠️ BEST-EFFORT, AND DELIBERATELY SO WHILE `CREDITS_ENFORCED` IS FALSE.
    // The offer is the deliverable; a ledger write that fails must never lose
    // an answer the client is waiting for. When enforcement lands, the check
    // moves ABOVE the create and this becomes part of the same transaction —
    // charging for an offer that does not exist is the one direction that
    // cannot be allowed.
    //
    // ⚠️ ONLY AN INDIVIDUAL IS CHARGED. The ledger is keyed on a USER, and a
    // company offer is sent by an organisation — debiting whichever member
    // happened to press the button would take from a personal balance for a
    // company's lead. A company ledger is the fix when companies matter; until
    // then not charging is the honest half of the mistake, not the expensive one.
    if (expertUserId) {
      try { await chargeForOffer(prisma, expertUserId, offer.id) } catch { /* the offer is the deliverable */ }
    }

    // ── The clock every later event is measured against ──────────────────
    // SENT is what „how long did the client take to open it" subtracts from,
    // and that number is the health of the whole marketplace — see
    // lib/offerEvents → minutesToView. Recorded inline: an offer whose SENT is
    // missing has no measurable lifecycle at all.
    {
      const rec = await recordOfferEvent(offer.id, 'SENT', { providerKind: provider.kind })
      if (!rec.ok) console.error('[offerEvents] SENT not recorded', offer.id, rec.error)
    }

    // ── The client hears about it ────────────────────────────────────────
    // They usually have NO account: the emailed link is their only door back
    // to the page where offers live, and an offer nobody sees is an offer that
    // rots until the admin thinks to phone. Per offer, not first-only —
    // „compare and choose" is the product, and a person who accepts #1 having
    // never heard #3 arrived chose from a list we hid from them. Bounded by
    // offerLimit, so it cannot become a stream. Optional email → optional
    // mail; the admin's call covers the rest at this stage.
    //
    // Contact-rule note: the PROVIDER'S NAME is in this mail and that is not a
    // leak — the client's page already shows every offer's name; only phone
    // and email wait for acceptance.
    const to = offer.request.email
    if (to) {
      const mail = offerArrivedClientEmail({
        publicRef: offer.request.publicRef,
        topicLabel: topicLabel(offer.request.topic),
        // The unit comes from the vocabulary, never re-derived here — a price
        // with a guessed unit is a different number.
        // ⚠️ THROUGH `offerPriceLabel`, and the unit is appended only when the
        // number is a rate. „ვიზიტი 20₾ · სამუშაო ადგილზე ერთ ვიზიტზე" is what
        // the naive concatenation produced.
        priceLabel: parsed.data.priceKind === 'FIXED'
          ? `${offerPriceLabel(parsed.data.priceGel, 'FIXED')} ${KIND[kindOf(offer.request.kind)].unitLabel}`
          : offerPriceLabel(parsed.data.priceGel, parsed.data.priceKind),
        providerName: offer.expertUser?.fullName ?? offer.company?.name ?? 'ექსპერტი',
        offerCount: offer.request.offerCount,
      })
      after(async () => {
        try {
          await sendMail({ to, ...mail })
          // „We did our part" — the first thing an expert asks when nobody
          // opened their offer. Recorded only on an actual successful send, so
          // it never claims a delivery that did not happen.
          await recordOfferEvent(offer.id, 'DELIVERED', { channel: 'email' })
        } catch { /* mail is best-effort */ }
      })
    }

    return NextResponse.json({ ok: true, offerId: offer.id })
  } catch (e: any) {
    // GIVE THE PLACE BACK, in the same shape it was taken: a conditional
    // decrement, guarded by `gt: 0` so a double-release can never drive the
    // counter negative (which the database CHECK would refuse anyway, turning a
    // handled error into a 500).
    await prisma.serviceRequest.updateMany({
      where: { id: parsed.data.requestId, offerCount: { gt: 0 } },
      data: { offerCount: { decrement: 1 } },
    }).catch(() => {})

    // P2002 = one of the two unique indexes: this provider already has an offer
    // on this request. Its own code, because „you already answered this" is a
    // different thing from „it failed" and the panel should say so.
    if (e?.code === 'P2002') {
      return NextResponse.json({ ok: false, error: 'ALREADY_OFFERED' }, { status: 409 })
    }
    throw e
  }
}
