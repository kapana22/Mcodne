import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'

// Admin-managed integrations (Google Analytics + raw header/footer code),
// stored as rows in the generic SiteText key/value table under `integration.*`
// keys. These keys are NOT in the site-text registry, so getSiteTextMap ignores
// them — the two systems share a table but never collide. React `cache()` →
// one query per request. DB-down → all empty (no injection), never crashes.

type Integrations = { gaId: string; headerHtml: string; footerHtml: string }

const KEYS = { ga: 'integration.gaId', header: 'integration.headerHtml', footer: 'integration.footerHtml' } as const

/** The tag app/api/admin/integrations busts the moment an admin saves. */
export const INTEGRATIONS_TAG = 'integrations'

/**
 * ⚠️ THIS FUNCTION USED TO CALL `noStore()`, AND THAT MADE THE WHOLE SITE
 * DYNAMIC (fixed 2026-08-21).
 *
 * The reasoning behind it was sound and the cost was invisible. It is read by
 * the ROOT LAYOUT, so opting it out of the data cache opted out every page
 * underneath: `next build` marked all but /robots.txt as „server-rendered on
 * demand", and /privacy — a page with no data on it at all — paid a database
 * round trip and a full render on every visit. Measured on production the same
 * day: TTFB 0.585s on /privacy against 0.564s on the home page, which is the
 * shape of a site where nothing is cached and every page costs the same.
 *
 * What noStore() was protecting is real: the GA id must survive a build that
 * cannot reach the database, and an admin's change must apply without waiting
 * for a deploy. A CACHE WITH A TAG keeps both, and gives up nothing —
 * app/api/admin/integrations calls `revalidateTag` the instant it writes, so a
 * saved change is live on the next request rather than in an hour.
 *
 * The hour is only the backstop for a tag that somehow never fires.
 */
const readIntegrations = async (): Promise<Integrations> => {
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
}

const readIntegrationsCached = unstable_cache(
  readIntegrations,
  ['integrations-v1'],
  { tags: [INTEGRATIONS_TAG], revalidate: 3600 },
)

/** React `cache()` on top: one call per request even before the data cache.
 *
 *  ⚠️ The data cache is an OPTIMISATION, not a dependency — `unstable_cache`
 *  throws („Invariant: incrementalCache missing") anywhere that is not a server
 *  render, so a script or a test calling this must still get an answer. Same
 *  shape as lib/siteText, and for the same reason. */
export const getIntegrations = cache(async (): Promise<Integrations> => {
  try {
    return await readIntegrationsCached()
  } catch {
    return readIntegrations()
  }
})

export const INTEGRATION_KEYS = KEYS
