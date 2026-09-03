// POST /api/requests/[ref]/cancel — the client withdraws their own request.
//
// ⚠️ WHY THIS EXISTS (2026-09-01). There was no way out. Every other transition
// on a request had a door — a provider can withdraw an offer, an admin can
// close a row, the cron closes an abandoned one — and the CLIENT, the person
// who opened it, could only walk away and leave it standing. Filed by mistake,
// filed twice, or simply no longer needed: the row stayed live.
//
// That is not only a comfort problem, and this is the half that decided it:
// a live request COSTS PROVIDERS REAL MONEY. `CONTACT_COST_TETRI` is 1₾ and
// `CREDITS_ENFORCED` is true, so every provider who opens the contact pays for
// a client who is no longer coming. A dead row on the board is a bill somebody
// else keeps paying.
//
// ⚠️ ONLY WHILE NOBODY HAS OFFERED, and that bound is the admin panel's own.
// app/api/admin/requests/[id] refunds on close only when `offerCount === 0`;
// past that, providers have written real answers and the honest exit is to
// choose one or let it lapse, not to make the work disappear. So this route
// refuses once an offer exists rather than quietly deciding for them.
//
// ⚠️ CLAIMED, NOT CHECKED. `updateMany` carries the states we believe we are
// leaving; the database decides who got there first. Two tabs, or a cancel
// racing an incoming offer, cannot both win — the loser is told 409. Reading
// the status and then writing it would let a request be cancelled in the
// instant an offer lands, and the provider would have paid for nothing.
import { NextResponse, after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { normalizePublicRef, topicLabel } from '@/lib/requests'
import { requestsViewer } from '@/lib/requestsServer'
import { refBudgetSpent, noteRefMiss } from '@/lib/refGuard'
import { refundDeadRequest } from '@/lib/requestJobs'

const notFound = () => NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const viewer = await requestsViewer()
  if (!viewer.clientAllowed) return notFound()

  // The reference is a credential (CLAUDE.md → „the public reference is a
  // credential"), so wrong guesses are counted here exactly as they are on the
  // accept route. A client holding a real code spends nothing.
  if (refBudgetSpent(req)) return notFound()

  const { ref: raw } = await params
  const ref = normalizePublicRef(raw)
  if (!ref) { noteRefMiss(req); return notFound() }

  await ensureDbReady()

  // Read once, to answer 404 for a code that is not this person's and to learn
  // whether anybody has offered. The transition itself is claimed below.
  const row = await prisma.serviceRequest.findFirst({
    where: { publicRef: ref },
    select: { id: true, userId: true, status: true, offerCount: true, topic: true },
  })
  // ⚠️ NOT „does this row exist" BUT „is it yours". A signed-in stranger who
  // guesses a live code must get the same answer as a code that never existed —
  // anything else confirms the reference and turns 25 bits into a lookup.
  if (!row || !row.userId || row.userId !== viewer.user?.id) { noteRefMiss(req); return notFound() }

  if (row.offerCount > 0) {
    return NextResponse.json(
      { ok: false, error: 'HAS_OFFERS', message: 'შეთავაზება უკვე მოვიდა — აირჩიე ან დაელოდე.' },
      { status: 409 },
    )
  }

  // ── THE CLAIM ────────────────────────────────────────────────────────────
  const claimed = await prisma.serviceRequest.updateMany({
    where: { id: row.id, status: { in: ['NEW', 'VERIFIED'] }, offerCount: 0 },
    data: { status: 'CLOSED' },
  })
  if (claimed.count !== 1) {
    return NextResponse.json({ ok: false, error: 'ALREADY_DECIDED' }, { status: 409 })
  }

  // Nobody offered, so the only money on this row is contact spend — the same
  // case the admin close refunds. After the response: a refund that throws must
  // never cost the client their cancellation.
  after(() => refundDeadRequest(row.id, topicLabel(row.topic)))

  return NextResponse.json({ ok: true, status: 'CLOSED' })
}
