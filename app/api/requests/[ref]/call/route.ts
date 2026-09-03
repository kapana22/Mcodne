// POST /api/requests/[ref]/call — the CLIENT opens a provider's number, and
// the provider pays for it.
//
// ⚠️ THIS IS THE SECOND DOOR ONTO THE ONE THING THE PLATFORM SELLS (2026-09-03).
// The first is /api/provider/requests/[id]/contact, where the chosen provider
// buys the client's details. This one is its mirror: the client presses
// „დარეკვა" on an offer and the provider is charged for it, having pressed
// nothing. Owner: „და ხელოსანს რომ ჩამოეჭრას დარეკვის ღილაკის დაჭერისას ცუდი
// იქნება?"
//
// ⚠️ IT IS THE SAME CHARGE, NOT A SECOND ONE, AND THAT IS THE WHOLE DESIGN.
// `chargeForContact` is keyed on `contactKey(requestId)`, unique per (provider,
// request) — so a client who rings and then accepts costs that provider 3₾
// once, and the accept path finds the unlock already held and charges nothing.
// One lead, one fee, whichever side opened it. It is also why this route calls
// that function rather than writing its own row: two spend paths with two keys
// is how somebody gets billed twice for one phone number.
//
// ⚠️ CHECKED AGAINST THE MARKET BEFORE BUILDING IT (2026-09-03). MyBuilder does
// exactly this — the homeowner shortlists, the tradesman is charged
// automatically, and their terms say plainly that winning the job is not
// required for the fee to be payable. Bark and Thumbtack charge the provider
// too, but before contact. Only Checkatrade lets a customer ring freely, and it
// takes a monthly subscription instead of a per-contact fee. The single thing
// all the per-contact sites are hated for is money taken for a client who then
// went silent — which `sweepSilentContacts` already refunds after
// CONTACT_REFUND_HOURS, and which this route's arrival made that sweep read the
// ACCEPT as evidence too (see lib/requestJobs).
//
// ⚠️ WHAT THIS ROUTE IS NOT ALLOWED TO DO IS FAIL IN THE CLIENT'S FACE FOR
// SOMEBODY ELSE'S REASON. A provider with an empty balance cannot be rung, and
// the client can neither know that nor fix it — so the BUTTON is not drawn for
// them at all (`callableProviders`, read by the room's loader). The refusals
// below are the race that check cannot close, not the normal path.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { normalizePublicRef } from '@/lib/requests'
import { requestsViewer } from '@/lib/requestsServer'
import { refBudgetSpent, noteRefMiss } from '@/lib/refGuard'
import { chargeForContact } from '@/lib/creditsServer'
import { contactCostTetri } from '@/lib/credits'
import { telHref, formatPhone } from '@/lib/phone'

const notFound = () => NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const viewer = await requestsViewer()
  if (!viewer.clientAllowed) return notFound()

  // ⚠️ THE REFERENCE IS THE WHOLE AUTHORISATION, exactly as it is for the
  // accept — and here it spends a stranger's money, so the same guess budget
  // applies. A client holding a real reference spends none of it.
  if (refBudgetSpent(req)) return notFound()

  const { ref: raw } = await params
  const ref = normalizePublicRef(raw)
  if (!ref) { noteRefMiss(req); return notFound() }

  const body = await req.json().catch(() => ({})) as { offerId?: unknown }
  const offerId = typeof body.offerId === 'string' ? body.offerId.trim() : ''
  if (!offerId) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  await ensureDbReady()

  /* The offer must be ON this request and still be a live one. SENT and
     ACCEPTED both qualify and nothing else does — the same pair the offer
     card draws its two channel buttons under. A DECLINED offer has no thread
     and no reason to be rung, and charging its provider would be charging for
     a conversation the client already ended. */
  const offer = await prisma.requestOffer.findFirst({
    where: {
      id: offerId,
      status: { in: ['SENT', 'ACCEPTED'] },
      request: { publicRef: ref },
    },
    select: {
      id: true,
      requestId: true,
      expertUserId: true,
      // `offerLimit` caps how many providers may be opened on one request;
      // the budget prices the contact (lib/credits → contactCostTetri).
      request: { select: { offerLimit: true, budgetMin: true, budgetMax: true } },
      // ⚠️ THE ONE COLUMN THIS ROUTE EXISTS TO RELEASE. It is selected here and
      // returned only on the branch a successful charge reaches — the rule
      // lib/requests set for the mirror direction: „a rule enforced by what is
      // FETCHED is a rule a future render cannot forget" has its limit at a
      // route, so the release is guarded by the `if` below instead.
      expertUser: { select: { phone: true } },
    },
  })
  // An offer that is not on THIS request is the same signal as a wrong code.
  if (!offer) { noteRefMiss(req); return notFound() }

  // A COMPANY offer has no user to bill — the ledger is keyed on a person, the
  // same refusal /api/provider/requests/[id]/contact makes in its own words.
  if (!offer.expertUserId) {
    return NextResponse.json({ ok: false, error: 'NO_PHONE' }, { status: 409 })
  }

  // No number on file: nothing to sell, so nothing is charged. The loader
  // already hides the button in this case; this is the race, not the path.
  const tel = telHref(offer.expertUser?.phone)
  if (!tel) return NextResponse.json({ ok: false, error: 'NO_PHONE' }, { status: 409 })

  /* ── THE CHARGE, WHICH IS ALSO BOTH GUARDS ────────────────────────────────
     Balance and the per-request cap are conditions inside the INSERT
     (lib/creditsServer → chargeForContact), not checks read before it. The cap
     is `offerLimit`: it bounds how many providers may be opened on one
     request, and it protects the CLIENT rather than the ledger — which is why
     it has no flag to switch off. A provider who already holds the unlock is
     answered `charged: false` and pays nothing. */
  const cost = contactCostTetri(offer.request.budgetMin, offer.request.budgetMax)
  const paid = await chargeForContact(offer.expertUserId, offer.requestId, offer.request.offerLimit, cost)
  if (!paid.ok) {
    // The provider's balance, or the request's own ceiling. Neither is the
    // client's doing and neither is worth naming to them — one code, and the
    // screen says the one true thing it can: write instead.
    return NextResponse.json({ ok: false, error: 'CANNOT_CALL' }, { status: 409 })
  }

  // ⚠️ THE NUMBER IS SHAPED BY `telHref`, NOT BY THIS ROUTE. A Georgian mobile
  // needs its +995 to dial from anywhere but a Georgian handset, and lib/phone
  // is the one place that knows it — the same function the card would have
  // called, moved to the only side that may hold the digits.
  /* ⚠️ BOTH FORMS, AND BOTH ARE NEEDED. `tel` dials; `phone` is what the card
     PRINTS. A number that is only ever a link is useless on a desktop, where
     `tel:` opens nothing and the reader wants to read the digits and pick up
     their own handset — and it is the desktop half of this screen that the
     two-column canvas exists for. */
  return NextResponse.json({ ok: true, tel, phone: formatPhone(offer.expertUser?.phone), charged: paid.charged })
}
