import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { SITE_TEXT_DEFAULTS, isRetiredSiteTextKey, isServerOnlySiteTextKey } from '@/lib/siteTextDefs'

// Resolve every editable text = code default overridden by any SiteText DB row.
// Wrapped in React `cache()` so the layout + any server component share ONE
// query per request. DB-unreachable → defaults (the site never breaks on copy).
/** The tag app/api/admin/site-texts busts the moment an admin saves a string. */
export const SITE_TEXT_TAG = 'site-text'

/**
 * ⚠️ CACHED ACROSS REQUESTS SINCE 2026-08-21, not just within one.
 *
 * React `cache()` alone deduped this to one query PER REQUEST, which is the
 * right thing and not enough: the root layout calls it, so every single page
 * view cost a round trip for 77 rows of copy that change a few times a month.
 * The data cache holds it between requests and `revalidateTag` drops it the
 * instant somebody edits a string in the admin panel, so the copy is no less
 * live than it was — it is simply no longer re-fetched for a visitor who
 * changed nothing.
 *
 * DB unreachable still means DEFAULTS, never a crash: a site that cannot reach
 * its database still renders its own words.
 */
const readSiteTextMap = async (): Promise<Record<string, string>> => {
  const map: Record<string, string> = { ...SITE_TEXT_DEFAULTS }
  try {
    await ensureDbReady()
    const rows = await prisma.siteText.findMany({ select: { key: true, value: true } })
    for (const r of rows) if (r.key in map) map[r.key] = r.value
  } catch { /* keep defaults */ }
  return map
}

const readSiteTextMapCached = unstable_cache(
  readSiteTextMap,
  ['site-text-v1'],
  { tags: [SITE_TEXT_TAG], revalidate: 3600 },
)

export const getSiteTextMap = cache(async (): Promise<Record<string, string>> => {
  // ⚠️ `unstable_cache` THROWS OUTSIDE A REQUEST — „Invariant: incrementalCache
  // missing". It reaches for a store Next installs per request, so the moment
  // this function is called from anywhere that is not a server render — a test
  // file, a seed script, a cron entry point — it does not degrade, it throws.
  // Found the same day it was introduced, by tests/abroad.test.ts rendering the
  // landing in plain Node.
  //
  // So the cache is an OPTIMISATION AND NOTHING ELSE: when it is available it
  // saves the round trip, and when it is not the query simply runs. The failure
  // mode of getting this wrong is a caller that used to work and now crashes,
  // which is a worse trade than any number of round trips.
  try {
    return await readSiteTextMapCached()
  } catch {
    return readSiteTextMap()
  }
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
