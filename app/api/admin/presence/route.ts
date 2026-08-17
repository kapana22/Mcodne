// POST /api/admin/presence — „I am at the desk."
//
// The entire input to the „ონლაინ ვართ" badge a waiting client sees. An admin
// with the panel open beats every 40s; lib/requestThread decides how stale a
// beat may be before the badge goes dark.
//
// ⚠️ DELIBERATELY NOT BEHIND THE REQUESTS GATE. Presence is about a person, not
// about a subsystem: an operator is at the desk whether or not FEATURE_REQUESTS
// is on, and gating this would mean the first thing to break when the flag is
// toggled is the badge that tells clients somebody is there.
//
// No body, no response payload worth reading, no audit row — this fires hundreds
// of times a day per operator and an audit trail of „was present" is a table
// that grows forever to answer a question nobody asks.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { ensureDbReady } from '@/lib/dbBoot'

export async function POST() {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response

  await ensureDbReady()
  // updateMany, not update: an account deleted between the session check and
  // this line would make `update` throw, and a heartbeat is not worth a 500.
  await prisma.user.updateMany({
    where: { id: auth.user.id },
    data: { supportSeenAt: new Date() },
  }).catch(() => null)

  return NextResponse.json({ ok: true })
}
