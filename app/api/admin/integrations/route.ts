import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { ensureDbReady } from '@/lib/dbBoot'
import { INTEGRATION_KEYS } from '@/lib/integrations'

const FIELD_KEY = {
  gaId: INTEGRATION_KEYS.ga,
  headerHtml: INTEGRATION_KEYS.header,
  footerHtml: INTEGRATION_KEYS.footer,
} as const
type Field = keyof typeof FIELD_KEY

// GET — current integration values for the admin editor.
export async function GET() {
  await requireRole('ADMIN')
  await ensureDbReady()
  const rows = await prisma.siteText.findMany({
    where: { key: { in: Object.values(FIELD_KEY) } },
    select: { key: true, value: true },
  })
  const byKey = new Map(rows.map(r => [r.key, r.value]))
  return NextResponse.json({
    gaId: byKey.get(FIELD_KEY.gaId) ?? '',
    headerHtml: byKey.get(FIELD_KEY.headerHtml) ?? '',
    footerHtml: byKey.get(FIELD_KEY.footerHtml) ?? '',
  })
}

// PATCH — set or clear one field. gaId is format-validated (G-XXXXXXXX). An
// empty value or re:true clears (deletes) the row → integration turns off.
const Body = z.object({
  field: z.enum(['gaId', 'headerHtml', 'footerHtml']),
  value: z.string().max(20000).optional(),
  reset: z.boolean().optional(),
})

export async function PATCH(req: Request) {
  await requireRole('ADMIN')
  await ensureDbReady()
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  const { field, reset } = parsed.data
  const value = (parsed.data.value ?? '').trim()
  const key = FIELD_KEY[field as Field]

  if (reset || value === '') {
    await prisma.siteText.deleteMany({ where: { key } })
    return NextResponse.json({ ok: true, cleared: true })
  }

  if (field === 'gaId' && !/^G-[A-Z0-9]{4,20}$/i.test(value)) {
    return NextResponse.json({ ok: false, error: 'BAD_GA_ID' }, { status: 400 })
  }

  await prisma.siteText.upsert({ where: { key }, update: { value }, create: { key, value } })
  return NextResponse.json({ ok: true })
}
