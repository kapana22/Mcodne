import { cache } from 'react'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { SITE_TEXT_DEFAULTS, isRetiredSiteTextKey, isServerOnlySiteTextKey } from '@/lib/siteTextDefs'

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

/**
 * The same map, minus retired keys — THE ONE THAT MAY CROSS INTO THE BROWSER.
 *
 * ⚠️ app/layout hands its result to `<SiteTextProvider>`, a client component,
 * which means whatever is in it is serialized into the RSC payload of every
 * page. Handing it the full map shipped the copy of pages that no longer
 * exist to every visitor and every crawler — see SITE_TEXT_PUBLIC_DEFAULTS for
 * what that looked like. Server code that genuinely wants a retired string
 * still calls `getSiteTextMap` directly.
 */
export const getPublicSiteTextMap = cache(async (): Promise<Record<string, string>> => {
  const full = await getSiteTextMap()
  const out: Record<string, string> = {}
  // Two independent reasons a key does not travel: it describes a page that no
  // longer exists (retired), or it is only ever read on the server (`seo.*`,
  // which fills generateMetadata). Neither is a secret — both stay available to
  // `getSiteTextMap` and to the admin panel; they simply are not the browser's
  // business, and the map is serialized into EVERY page's RSC payload.
  for (const [k, v] of Object.entries(full)) {
    if (isRetiredSiteTextKey(k) || isServerOnlySiteTextKey(k)) continue
    out[k] = v
  }
  return out
})
