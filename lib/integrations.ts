import { cache } from 'react'
import { unstable_noStore as noStore } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'

// Admin-managed integrations (Google Analytics + raw header/footer code),
// stored as rows in the generic SiteText key/value table under `integration.*`
// keys. These keys are NOT in the site-text registry, so getSiteTextMap ignores
// them — the two systems share a table but never collide. React `cache()` →
// one query per request. DB-down → all empty (no injection), never crashes.

export type Integrations = { gaId: string; headerHtml: string; footerHtml: string }

const KEYS = { ga: 'integration.gaId', header: 'integration.headerHtml', footer: 'integration.footerHtml' } as const

export const getIntegrations = cache(async (): Promise<Integrations> => {
  // Read at REQUEST time, never baked into the static build — otherwise the GA
  // id set in the admin panel is lost if the DB is unreachable during `next
  // build` (root layout is otherwise static), and admin changes wouldn't apply
  // until the next deploy.
  noStore()
  const out: Integrations = { gaId: '', headerHtml: '', footerHtml: '' }
  try {
    await ensureDbReady()
    const rows = await prisma.siteText.findMany({
      where: { key: { in: [KEYS.ga, KEYS.header, KEYS.footer] } },
      select: { key: true, value: true },
    })
    for (const r of rows) {
      if (r.key === KEYS.ga) out.gaId = r.value
      else if (r.key === KEYS.header) out.headerHtml = r.value
      else if (r.key === KEYS.footer) out.footerHtml = r.value
    }
  } catch { /* keep empties */ }
  return out
})

export const INTEGRATION_KEYS = KEYS
