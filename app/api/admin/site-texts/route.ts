import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { ensureDbReady } from '@/lib/dbBoot'
import { SITE_TEXTS, isKnownSiteTextKey } from '@/lib/siteTextDefs'

// GET /api/admin/site-texts — the editable-text registry merged with current
// DB overrides, grouped-ready for the admin editor.
export async function GET() {
  await requireRole('ADMIN')
  await ensureDbReady()
  const rows = await prisma.siteText.findMany({ select: { key: true, value: true } })
  const overrides = new Map(rows.map(r => [r.key, r.value]))
  const items = SITE_TEXTS.map(t => ({
    key: t.key,
    group: t.group,
    label: t.label,
    multiline: !!t.multiline,
    default: t.default,
    value: overrides.get(t.key) ?? t.default,
    overridden: overrides.has(t.key),
  }))
  return NextResponse.json(items)
}

// PATCH /api/admin/site-texts — set a key's value, or reset it to the default.
// Only registry keys are accepted. Reset deletes the override row so the code
// default takes over again.
const Body = z.object({
  key: z.string().min(1),
  value: z.string().max(4000).optional(),
  reset: z.boolean().optional(),
})

export async function PATCH(req: Request) {
  const admin = await requireRole('ADMIN')
  await ensureDbReady()
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  const { key, value, reset } = parsed.data
  if (!isKnownSiteTextKey(key)) return NextResponse.json({ ok: false, error: 'UNKNOWN_KEY' }, { status: 400 })

  // Public-facing copy — audited so a changed headline/footer line is traceable
  // to an actor. Previous value comes along so the trail can reconstruct the diff.
  const before = await prisma.siteText.findUnique({ where: { key }, select: { value: true } })

  if (reset) {
    await prisma.siteText.deleteMany({ where: { key } })
    await audit(admin.id, 'siteText.reset', {
      targetType: 'SiteText',
      targetId: key,
      meta: { key, prevValue: before?.value?.slice(0, 300) ?? null },
    })
    return NextResponse.json({ ok: true, reset: true })
  }
  if (value === undefined) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  await prisma.siteText.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  })
  await audit(admin.id, 'siteText.set', {
    targetType: 'SiteText',
    targetId: key,
    meta: { key, value: value.slice(0, 300), prevValue: before?.value?.slice(0, 300) ?? null },
  })
  return NextResponse.json({ ok: true })
}
