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
/**
 * How long the ROOT LAYOUT may wait for the copy before rendering the code's own
 * words instead.
 *
 * ⚠️ THE `catch` BELOW ONLY HELPS IF THE DATABASE SAYS NO. Measured on
 * 2026-08-27, with Railway's Postgres dropping connections: it does not say no,
 * it says nothing — `ensureDbReady()` sat there and every request to the
 * standalone build hung, home page included, until the client gave up. This
 * file's own promise („DB unreachable still means DEFAULTS, never a crash: a
 * site that cannot reach its database still renders its own words") was true
 * for a REFUSED connection and false for a silent one, which is the failure
 * mode that actually happens.
 *
 * Four seconds because this read is behind `unstable_cache` with a one-hour
 * window, so on a healthy deployment it happens a few times an hour and takes
 * milliseconds over the private network. When it does fire the visitor gets the
 * page with the defaults — which are correct copy, only possibly stale — rather
 * than a spinner and then a gateway error.
 */
const COPY_WAIT_MS = 4000

/**
 * The last map the database actually answered with, for this process.
 *
 * ⚠️ WHY NOT JUST FALL BACK TO THE DEFAULTS. Because the defaults are the copy
 * as it stood when the code shipped, and the owner edits this table — reverting
 * to them during an outage silently un-does every correction they have made.
 * The last GOOD answer is at worst stale by the length of the outage, and it is
 * the copy the visitor saw a minute ago.
 *
 * Also what keeps two reads in one process AGREEING. tests/abroad.test.ts
 * resolves its expectations with `getSiteTextMap()` and then renders the page,
 * which reads again; outside a request there is no React cache to dedupe them,
 * so one read timing out and the other not produced a page that genuinely did
 * not match its own copy. Remembering the answer removes the disagreement
 * instead of hiding it.
 */
let lastGood: Record<string, string> | null = null

/** The copy, or the best we already have, whichever arrives first. */
const withDeadline = (p: Promise<Record<string, string>>, ms: number): Promise<Record<string, string>> =>
  new Promise(resolve => {
    const timer = setTimeout(() => {
      console.warn(
        `[siteText] no answer in ${ms}ms — serving ${lastGood ? 'the last copy read' : 'default copy'}`,
      )
      resolve(lastGood ?? { ...SITE_TEXT_DEFAULTS })
    }, ms)
    p.then(
      v => { clearTimeout(timer); resolve(v) },
      () => { clearTimeout(timer); resolve(lastGood ?? { ...SITE_TEXT_DEFAULTS }) },
    )
  })

const readSiteTextMap = async (): Promise<Record<string, string>> => {
  const map: Record<string, string> = { ...SITE_TEXT_DEFAULTS }
  try {
    await ensureDbReady()
    const rows = await prisma.siteText.findMany({ select: { key: true, value: true } })
    for (const r of rows) if (r.key in map) map[r.key] = r.value
    lastGood = map
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
  // ⚠️ THE DEADLINE LIVES HERE AND NOWHERE ELSE (2026-08-27). It was briefly
  // inside `readSiteTextMap`, which bounded EVERY reader — and two readers in
  // one process can then disagree: one times out onto the fallback while the
  // other gets the rows, so a page and the copy it was checked against stop
  // matching (tests/abroad.test.ts caught exactly that, intermittently, which
  // is the worst way to find out). This is the function the ROOT LAYOUT awaits,
  // so it is the one that runs on every page and the only one whose stall takes
  // the whole site down. Everything else — metadata, a landing, a script —
  // keeps waiting for a real answer.
  const full = await withDeadline(getSiteTextMap(), COPY_WAIT_MS)
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
