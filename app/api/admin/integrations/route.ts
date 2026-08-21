import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { ensureDbReady } from '@/lib/dbBoot'
import { INTEGRATION_KEYS, INTEGRATIONS_TAG } from '@/lib/integrations'

const FIELD_KEY = {
  gaId: INTEGRATION_KEYS.ga,
  headerHtml: INTEGRATION_KEYS.header,
  footerHtml: INTEGRATION_KEYS.footer,
} as const
type Field = keyof typeof FIELD_KEY

// GET — current integration values for the admin editor.
export async function GET() {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
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
    // components/Analytics.tsx falls back to NEXT_PUBLIC_GA_ID when the DB value
    // is empty — so clearing the field here does NOT necessarily turn GA off.
    // Surface the env id (a public measurement id, not a secret) so the panel
    // can say so instead of claiming „გამორთული".
    envGaId: (process.env.NEXT_PUBLIC_GA_ID ?? '').trim(),
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
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  const admin = auth.user
  await ensureDbReady()
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  const { field, reset } = parsed.data
  const value = (parsed.data.value ?? '').trim()
  const key = FIELD_KEY[field as Field]
  // headerHtml/footerHtml run raw HTML+JS on EVERY visitor's page — the single
  // most dangerous switch in the panel, so every set/clear is audited. The
  // payload itself can be 20k chars; we log its length + a short head so the
  // trail stays readable while still identifying WHAT was injected.
  const isCodeInjection = field === 'headerHtml' || field === 'footerHtml'

  if (reset || value === '') {
    await prisma.siteText.deleteMany({ where: { key } })
    await audit(admin.id, 'integration.clear', {
      targetType: 'SiteText',
      targetId: key,
      meta: { field, codeInjection: isCodeInjection },
    })
    // ⚠️ WITHOUT THIS THE SAVE APPEARS TO DO NOTHING for up to an hour. The
    // root layout reads these through a tagged data cache (lib/integrations),
    // which is what stopped every page in the site being dynamic; the tag is
    // the half that keeps an admin's change instant.
    revalidateTag(INTEGRATIONS_TAG)
    return NextResponse.json({ ok: true, cleared: true })
  }

  if (field === 'gaId' && !/^G-[A-Z0-9]{4,20}$/i.test(value)) {
    return NextResponse.json({ ok: false, error: 'BAD_GA_ID' }, { status: 400 })
  }

  await prisma.siteText.upsert({ where: { key }, update: { value }, create: { key, value } })
  await audit(admin.id, 'integration.set', {
    targetType: 'SiteText',
    targetId: key,
    meta: {
      field,
      codeInjection: isCodeInjection,
      length: value.length,
      // GA id is short and harmless to store verbatim; injected code is not.
      value: isCodeInjection ? `${value.slice(0, 200)}${value.length > 200 ? '…' : ''}` : value,
    },
  })
  revalidateTag(INTEGRATIONS_TAG)
  return NextResponse.json({ ok: true })
}
