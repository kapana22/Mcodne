import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { packagesFeatureExists } from '@/lib/packages'

// Admin-only switch for „may this expert sell teaching packages".
//
// Mirrors the sibling featured/ and verified/ routes exactly — same guard, same
// P2025 handling, same audit call — because this is the same kind of thing: an
// admin-curated boolean on TutorProfile.
//
// WHY IT IS AUDITED. This is the one control that decides whether a person can
// take a client's money for eight lessons at once. „Who turned this on, for
// whom, and when" has to be answerable later without guessing, and AuditLog is
// where every other admin action already answers it.

const Body = z.object({ packagesEnabled: z.boolean() })

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  const admin = auth.user

  // 404 rather than 403 while the vertical is off: a 403 confirms the endpoint
  // is there and worth coming back to. Nothing about this feature should be
  // discoverable before its owner turns it on.
  if (!packagesFeatureExists()) {
    return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  }

  const { id } = await ctx.params
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  let updated
  try {
    updated = await prisma.tutorProfile.update({
      where: { id },
      data: { packagesEnabled: parsed.data.packagesEnabled },
      select: { id: true, packagesEnabled: true },
    })
  } catch (e: any) {
    // P2025 = record to update not found → 404, not an unhandled 500.
    if (e?.code === 'P2025') return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
    throw e
  }

  await audit(admin.id, parsed.data.packagesEnabled ? 'tutor.packages.enable' : 'tutor.packages.disable', {
    targetType: 'TutorProfile',
    targetId: id,
  })

  return NextResponse.json({ ok: true, tutor: updated })
}
