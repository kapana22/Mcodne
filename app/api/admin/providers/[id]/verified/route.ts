import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { audit } from '@/lib/audit'

// Admin sets an expert's `verified` trust badge. Approval creates the profile
// with verified:false, so this is the ONLY path to the verified badge that
// surfaces publicly on cards + the profile. Mirrors the featured route.
const Body = z.object({ verified: z.boolean() })

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  const admin = auth.user
  const { id } = await ctx.params
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  let updated
  try {
    updated = await prisma.serviceProfile.update({
      where: { id },
      data: { verified: parsed.data.verified },
      select: { id: true, verified: true },
    })
  } catch (e: any) {
    // P2025 = record to update not found → 404, not an unhandled 500.
    if (e?.code === 'P2025') return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
    throw e
  }

  await audit(admin.id, parsed.data.verified ? 'provider.verify' : 'provider.unverify', {
    targetType: 'ServiceProfile',
    targetId: id,
  })

  return NextResponse.json({ ok: true, provider: updated })
}
