// GET /api/me/company — „am I in a company, and what is on its balance?"
//
// The ONE question the booking flow asks. It answers `{ company: null }` for
// everybody who is not a member, which is everybody, so the flow's default
// behaviour is byte-for-byte what it was before this vertical existed.
//
// 404 — not 401, not an empty 200 — when the vertical is dark, for the same
// reason every other B2B surface does: an endpoint that answers differently
// depending on a feature nobody can see is how the feature leaks.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { ensureDbReady } from '@/lib/dbBoot'
import { canSpendAsMember } from '@/lib/b2b'

export async function GET() {
  const user = await getCurrentUser()
  // canSpendAsMember, NOT canSeeB2B — see the long note on that function. The
  // rollout stage gates who may SEE the vertical; spending is gated by being a
  // member, which is an allowlist an admin maintains by hand. Gating this on
  // the stage made the feature unusable at every stage it is ever in.
  if (!canSpendAsMember()) {
    return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  }
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

  await ensureDbReady()

  const member = await prisma.companyMember.findFirst({
    where: { userId: user.id },
    select: {
      role: true,
      company: { select: { id: true, name: true, balance: true, status: true } },
    },
  })

  // Nothing about other members, nothing about the ledger. This response is
  // read by a client component in the booking sheet: it gets the name to show,
  // the number to compare against a price, and nothing else.
  return NextResponse.json({
    ok: true,
    company: member
      ? {
          id: member.company.id,
          name: member.company.name,
          balance: member.company.balance,
          status: member.company.status,
          role: member.role,
        }
      : null,
  })
}
