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
import { ensureDbReady } from '@/lib/dbBoot'
import { RequestOfferInput, offerProviderError, kindOf, KIND, gel, offerPriceLabel, topicLabel } from '@/lib/requests'
import { validationIssueMessage } from '@/lib/validationMessages'
import { requestsViewer } from '@/lib/requestsServer'
import { sendMail } from '@/lib/mailer'
import { notifyMany } from '@/lib/notify'
import { offerArrivedClientEmail } from '@/lib/emailTemplates'
import { recordOfferEvent } from '@/lib/offerEvents'
import { sendSms } from '@/lib/sms'
import { offerArrivedSms } from '@/lib/smsTemplates'
import { providerUserIdsOf } from '@/lib/offerLifecycle'

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
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json({
      ok: false, error: 'INVALID',
      field: typeof issue?.path[0] === 'string' ? issue.path[0] : null,
      message: validationIssueMessage(issue),
    }, { status: 400 })
  }

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

  // ── WHO COUNTS AS „ME" ───────────────────────────────────────────────────
  // 🔒 NOBODY BIDS ON THEIR OWN REQUEST (2026-08-31). Owner: „მინდა რომ ვისაც
  // სერვისი აქვს იმას არ შეძლოს სერვისის დაკვეთა." Refusing them the INTAKE
  // (lib/requests → canFileRequest) only closes the front door; this is the
  // one that matters, because the whole chain hangs off it — bid on your own
  // request, accept it (you hold the reference), mark it done, and write
  // yourself five stars into `ServiceProfile.rating`, which is printed on every
  // card in the catalogue. The review end is closed too (lib/offerLifecycle →
  // reviewGate 'SELF'); this closes the end where it starts.
  //
  // TWO CASES THAT ARE ONE RULE. An EXPERT is one account. A COMPANY is all of
  // its members: a colleague answering a colleague's request is the same act
  // with a second login, and `providerUserIdsOf` is already the list the rest
  // of the subsystem means by „the provider".
  //
  // ⚠️ AND IT DOES NOT CLOSE ITSELF WHEN THE INTAKE DID. Requests filed before
  // today exist, and a company member could always file one — the front door
  // was never the only way a row gets an author.
  const selfIds = await providerUserIdsOf({ expertUserId, companyId })

  // ── THE CLAIM ────────────────────────────────────────────────────────────
  // Status, place AND authorship, in one conditional write. Note what is NOT
  // here: no findUnique, no `if (count < limit)`, no transaction wrapping a
  // read. The `where` IS the guard (CLAUDE.md rule 4) — and putting the
  // authorship test in it rather than in a read above means two tabs cannot
  // both pass a check and then both write.
  //
  // ⚠️ THE `OR` IS NOT TIDINESS, IT IS NULL SAFETY. `userId` is nullable and
  // MOST REQUESTS ARE ANONYMOUS — somebody who filled the form without an
  // account. In SQL `NULL NOT IN (…)` is NULL, which is not true, so a bare
  // `notIn` would have matched zero anonymous rows and silently refused every
  // offer on the majority of the queue. Written out, the two cases are
  // obviously both allowed.
  const claimed = await prisma.serviceRequest.updateMany({
    where: {
      id: parsed.data.requestId,
      status: 'VERIFIED',
      offerCount: { lt: prisma.serviceRequest.fields.offerLimit },
      ...(selfIds.length ? { OR: [{ userId: null }, { userId: { notIn: selfIds } }] } : {}),
    },
    data: { offerCount: { increment: 1 } },
  })
  if (claimed.count !== 1) {
    // One code for „not verified", „full", „does not exist" and now „it is
    // yours" alike. A provider who may not bid learns only that they may not
    // bid — telling them WHICH of the four it was would be a way to enumerate
    // requests they are not allowed to see.
    return NextResponse.json({ ok: false, error: 'NOT_OPEN' }, { status: 409 })
  }

  // ── The offer itself ─────────────────────────────────────────────────────
  // From here the place is spoken for, so a failure must give it back. Anything
  // else leaks a place per failure and a request silently accepts two offers
  // instead of three.
  try {
    const data = {
      priceGel: parsed.data.priceGel,
      /* ⚠️ THIS LINE WAS MISSING AND THE COLUMN WAS A LIE (fixed 2026-09-01).
       *
       * `priceKind` has been parsed, validated and defaulted by
       * `RequestOfferInput` since the field shipped, and it was read a hundred
       * lines below to word the notification mail — but it was never written.
       * Every FROM and every ON_SITE offer has been stored on the column's
       * `'FIXED'` default, so the client's own page rendered „80₾" through
       * `offerPriceLabel` for an offer whose mail had told them „80₾-დან", and
       * an on-site estimate came out as a flat price. The two screens disagreed
       * because only one of them was reading what the provider actually chose.
       *
       * Found while adding HOURLY: a third kind that is silently stored as the
       * first is the same bug with a new value, and worse — an hourly rate read
       * as a fixed total is a real misquote rather than a softened one.
       *
       * ⚠️ ROWS WRITTEN BEFORE TODAY CANNOT BE REPAIRED. Nothing recorded the
       * intended kind, so there is no source to backfill from; those offers stay
       * FIXED, which is at least what their own page has always said.
       */
      priceKind: parsed.data.priceKind,
      daysEstimate: parsed.data.daysEstimate ?? null,
      // What the price covers — the line the client's offer list compares on
      // (2026-09-01, the canvas). Required by the schema, so it is always a
      // real sentence by the time it gets here.
      priceIncludes: parsed.data.priceIncludes.trim(),
      message: parsed.data.message.trim(),
    }
    const SELECT = {
      id: true,
      expertUser: { select: { fullName: true } },
      company: { select: { name: true } },
      /* ⚠️ `phone` JOINED THIS SELECT ON 2026-09-03, and it is the ONE place in
         the provider's half of the subsystem where a client's number is read.
         It is never returned, never rendered and never reaches the provider —
         it is handed straight to `sendSms` inside an `after()`, because with
         the email field gone the text is the only way the client hears that
         this very offer arrived. The contact rule (lib/requests →
         clientIdentityOpen) is about what a PROVIDER may see; a notification
         the platform sends on their behalf is not that. */
      request: { select: { publicRef: true, topic: true, kind: true, email: true, phone: true, offerCount: true, userId: true } },
    } as const

    // ── The offer itself, and it is FREE ─────────────────────────────────
    //
    // ⚠️ SENDING AN OFFER COST 5₾ UNTIL 2026-08-21, AND THE CHARGE IS GONE —
    // the code with it, not switched off. The owner moved the price onto the
    // client's CONTACT (POST /api/provider/requests/[id]/contact, 1₾ once per
    // request), so what a provider pays for is the phone number and not the
    // answer. lib/credits carries the whole history, including the objection
    // that this reverses an earlier decision and why the price fell to a fifth
    // when it moved.
    //
    // ⚠️ WHAT THAT DELETED, AND WHY NOTHING REPLACES IT. The old charge needed a
    // counterweight — an offer nobody ever answered released its 5₾ back, swept
    // by the cron — because 28 of 32 requests got no offer at all and charging
    // for silence is what this design existed not to do. A free offer reaches
    // the same place one step earlier and with no bookkeeping: an unanswered
    // offer now costs its provider nothing, so there is nothing to give back.
    //
    // ⚠️ AND THE TRANSACTION WENT WITH IT. The offer and its charge had to be
    // one write („a charge without its offer is money taken for nothing"). With
    // no charge there is one statement again, which is the correct shape — a
    // `$transaction` wrapping a single write is a comment pretending to be a
    // guard.
    const offer = invited
      // The conversation keeps its id, so every message already in it stays
      // attached and the client does not watch a thread vanish and reappear.
      ? await prisma.requestOffer.update({
          where: { id: invited.id },
          data: { ...data, status: 'SENT' },
          select: SELECT,
        })
      : await prisma.requestOffer.create({
          data: {
            requestId: parsed.data.requestId,
            providerKind: provider.kind,
            expertUserId,
            companyId,
            ...data,
          },
          select: SELECT,
        })

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
    // ⚠️ THE BELL TOO, SINCE 2026-09-01. This route sent the mail and stopped
    // there, and the site has had a notification centre the whole time — the
    // header bell, /notifications, `lib/notify`. Being offered work is the one
    // event a client is waiting for, and it was the one event that never
    // reached it: somebody sitting on the site when an offer landed saw
    // nothing, and found out only by going to their mail. Every other party
    // already gets a bell (a provider is told when their offer is chosen, an
    // admin when a request arrives); the client was missed.
    //
    // GENERIC on purpose — the opt-outable categories all belong to the booking
    // product that was removed, and this is not marketing anybody should be
    // able to unsubscribe from.
    //
    // ⚠️ NO `publicRef`, NOT IN THE BODY AND NOT IN THE HREF. The reference is
    // a credential: it opens the request page, the private thread, and every
    // rival offer. `/me` is the client's own room behind their own session and
    // lists the request anyway, so the bell needs no secret to be useful.
    // Only an account can hold a notification — a guest who filed with an email
    // and never signed up still has the mail below, which is their door back.
    if (offer.request.userId) {
      after(async () => {
        try {
          await notifyMany([offer.request.userId as string], {
            type: 'GENERIC',
            title: 'ახალი შეთავაზება მოგივიდა',
            body: topicLabel(offer.request.topic),
            href: '/me',
          })
        } catch { /* the bell is best-effort; the mail below is the guarantee */ }
      })
    }

    const to = offer.request.email
    if (to) {
      const mail = await offerArrivedClientEmail({
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
        // The same sentence the client will read under this price on their own
        // page, sent with the mail that announces it — a mail that carried only
        // a number would make the client open the page to learn whether the
        // materials were in it.
        priceIncludes: parsed.data.priceIncludes.trim(),
        providerName: offer.expertUser?.fullName ?? offer.company?.name ?? 'ექსპერტი',
        offerCount: offer.request.offerCount,
      })
      after(async () => {
        try {
          await sendMail({ key: 'request.offerArrived.client', to, ...mail })
          // „We did our part" — the first thing an expert asks when nobody
          // opened their offer. Recorded only on an actual successful send, so
          // it never claims a delivery that did not happen.
          await recordOfferEvent(offer.id, 'DELIVERED', { channel: 'email' })
        } catch { /* mail is best-effort */ }
      })
    }

    /* ── AND BY SMS (2026-09-03) ───────────────────────────────────────────
       ⚠️ FOR MOST CLIENTS THIS IS THE ONLY WAY THEY LEARN. The intake stopped
       asking for an email that day, so `offer.request.email` is null on every
       request filed since — and „somebody answered" is the one event this
       product exists to deliver. The bell above only reaches a signed-in
       client; the letter only reaches an address; the number is what everybody
       leaves.

       ⚠️ THE `DELIVERED` EVENT IS RECORDED HERE TOO, with its own channel. The
       provider's question is „did it reach them", not „did an email reach
       them" — and with no address on the row the email branch never runs, so a
       mail-only stamp would read as „never delivered" on every request the new
       intake produces. */
    const smsTo = offer.request.phone
    if (smsTo) {
      const text = await offerArrivedSms(offer.request.publicRef)
      after(async () => {
        try {
          await sendSms({ key: 'request.offerArrived.client', to: smsTo, text })
          await recordOfferEvent(offer.id, 'DELIVERED', { channel: 'sms' })
        } catch { /* the text is best-effort, like the letter */ }
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
