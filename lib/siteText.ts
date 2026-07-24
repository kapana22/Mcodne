import { cache } from 'react'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { SITE_TEXT_DEFAULTS } from '@/lib/siteTextDefs'

// Resolve every editable text = code default overridden by any SiteText DB row.
// Wrapped in React `cache()` so the layout + any server component share ONE
// query per request. DB-unreachable → defaults (the site never breaks on copy).
export const getSiteTextMap = cache(async (): Promise<Record<string, string>> => {
  const map: Record<string, string> = { ...SITE_TEXT_DEFAULTS }
  try {
    await ensureDbReady()
    const rows = await prisma.siteText.findMany({ select: { key: true, value: true } })
    for (const r of rows) if (r.key in map) map[r.key] = r.value
  } catch { /* keep defaults */ }
  return map
})
