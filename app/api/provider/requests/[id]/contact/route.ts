// POST /api/provider/requests/[id]/contact — the provider buys the client's
// name and number.
//
// ⚠️ THIS IS THE ONE THING A BALANCE BUYS, and it is the whole product on one
// endpoint. lib/requests → clientIdentityOpen wrote the reason down before
// there was anything to charge: „the contact IS the lead. Handing it over
// automatically the moment a client chooses means the platform gives away, for
// free, the only thing it has to sell. Whatever it eventually costs, it has to
// be opened by a deliberate act that can carry a price — never printed on
// arrival." This is that act.
//
// ⚠️ IT HAPPENS BEFORE THE OFFER, NOT AFTER IT (owner, 2026-08-21). The
// provider reads the job — free — decides it is worth a call, pays 1₾, and may
// then phone, or bid, or do nothing. Nothing here requires an offer to exist
// and nothing here creates one; a contact released only after the client had
// already chosen you would be charging for a door that is already open.
//
// ⚠️ THE PHONE NUMBER IS NOT SELECTED UNTIL IT IS PAID FOR. The charge runs
// first and the columns are fetched inside the branch that only a successful
// unlock reaches — the rule lib/requests set when it took phone and email out
// of `ProviderRequestRow`: a rule enforced by what is FETCHED is a rule a
// future render cannot forget.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { requestsViewer } from '@/lib/requestsServer'
import { CLIENT_CONTACT_SELECT, clientContactView } from '@/lib/requests'
import { chargeForContact, balanceOf } from '@/lib/creditsServer'

// One code for every „there is nothing for you at this URL" — not verified, not
// yours, not there. Telling a provider WHICH would be a way to enumerate
// requests they are not allowed to see, the same reasoning the offers route
// answers NOT_OPEN with.
const notFound = () => NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requestsViewer()
  if (!viewer.providerAllowed) return notFound()

  // An ADMIN may SEE this subsystem and is not a provider in it — no allowlist
  // row, so no identity to bill. 404 rather than 403, for the same reason
  // everything else here is: for an admin it is simply true that there is
  // nothing at this URL for them.
  const provider = viewer.provider
  if (!provider) return notFound()

  // ⚠️ A COMPANY CANNOT UNLOCK, AND THAT IS A REFUSAL RATHER THAN A FREE PASS.
  // The ledger is keyed on a USER. Charging whichever member pressed the button
  // would take a lead's price out of a personal balance for an organisation's
  // lead; NOT charging would hand the one thing this platform sells to a
  // company for nothing, which is the expensive half of that mistake rather
  // than the honest half — for a free offer it cost us nothing, for a contact
  // it is the product. So they are told plainly and nobody is billed wrongly.
  // Measured 2026-08-21: no company holds active request access, so this
  // refuses nobody today. A company ledger is the fix when companies matter.
  if (provider.kind !== 'EXPERT') {
    return NextResponse.json({ ok: false, error: 'COMPANY_UNSUPPORTED' }, { status: 409 })
  }
  const userId = provider.userId

  const { id } = await params
  await ensureDbReady()

  // ⚠️ NO CONTACT COLUMNS IN THIS READ. It resolves two things and nothing
  // else: may this provider be shown the request at all, and what is the
  // request's own ceiling on how many people may call this client.
  const row = await prisma.serviceRequest.findUnique({
    where: { id },
    select: { id: true, status: true, offerLimit: true },
  })
  if (!row) return notFound()

  // ⚠️ ONLY A LIVE REQUEST. A settled or dead one is readable by a provider who
  // bid on it (see the detail page), and its contact is not for sale: the
  // client has either chosen somebody or gone away, and selling their number
  // afterwards is selling a lead that no longer exists. MATCHED is included in
  // that — the winner already has the thread.
  if (row.status !== 'VERIFIED') return notFound()

  // ── THE CHARGE, WHICH IS ALSO BOTH GUARDS ────────────────────────────────
  // Balance and cap are conditions inside the INSERT (lib/creditsServer →
  // chargeForContact), not checks read before it: neither has a row to claim,
  // so the statement carries them and Postgres decides. A provider who already
  // paid comes back `charged: false` and is billed nothing.
  const unlock = await chargeForContact(userId, row.id, row.offerLimit)
  if (!unlock.ok) {
    return NextResponse.json(
      { ok: false, error: unlock.error, offerLimit: row.offerLimit },
      // 402 for „you cannot afford it", 409 for „somebody else took the last
      // place". Two different problems with two different answers: one is fixed
      // by a balance, the other can never be fixed at all.
      { status: unlock.error === 'NO_BALANCE' ? 402 : 409 },
    )
  }

  // ── ONLY NOW ARE THE COLUMNS FETCHED ─────────────────────────────────────
  // Unreachable unless the ledger row exists. `findUniqueOrThrow` because by
  // this point the request was read a moment ago and a miss is a bug worth a
  // 500, not a 404 to paper over.
  const contactRow = await prisma.serviceRequest.findUniqueOrThrow({
    where: { id: row.id },
    select: CLIENT_CONTACT_SELECT,
  })

  return NextResponse.json({
    ok: true,
    // False when they already held it — the panel uses this to avoid announcing
    // a charge that did not happen.
    charged: unlock.charged,
    contact: clientContactView(contactRow),
    // So the pill and the strip do not have to be told separately that the
    // number moved.
    balanceTetri: await balanceOf(userId),
  })
}
