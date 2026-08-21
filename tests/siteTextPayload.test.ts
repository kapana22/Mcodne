// What travels to the browser on EVERY page, and what must not.
//
// app/layout resolves the public site-text map and hands it to
// <SiteTextProvider>, a client component — so whatever is in that map is
// serialized into the RSC payload of every single request. Measured against
// production on 2026-08-21: 252 keys, 37.8 KB, and on /privacy that payload was
// 69% of the document. Somebody reading the privacy policy was downloading the
// copy of /join and the home page with it.
//
// `seo.*` was the clearest waste: 30 keys, 6.6 KB, existing only to fill
// generateMetadata — which runs on the server. No client component has ever read
// one, and this file is what keeps that true.
//
// Run: npx tsx tests/siteTextPayload.test.ts

import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  SITE_TEXT_DEFAULTS, isRetiredSiteTextKey, isServerOnlySiteTextKey,
} from '../lib/siteTextDefs'

const ROOT = join(__dirname, '..')

/** Every source file under a set of roots, read as text. */
function* sources(dir: string): Generator<[string, string]> {
  for (const e of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, e)
    const abs = join(ROOT, rel)
    if (statSync(abs).isDirectory()) { yield* sources(rel); continue }
    if (/\.tsx?$/.test(e)) yield [rel, readFileSync(abs, 'utf8')]
  }
}

const publicKeys = Object.keys(SITE_TEXT_DEFAULTS)
  .filter(k => !isRetiredSiteTextKey(k) && !isServerOnlySiteTextKey(k))

test('the browser map carries no seo.* key', () => {
  const leaked = publicKeys.filter(k => k.startsWith('seo.'))
  assert.deepEqual(leaked, [], 'seo.* is back in the map the RSC payload ships to every page')
})

test('no client component reads a server-only key', () => {
  // The reason the exclusion is safe. If a client component ever needs one, the
  // fix is to pass it as a prop from the server — not to widen the map that
  // every page pays for.
  const offenders: string[] = []
  for (const [rel, src] of sources('app')) {
    if (!src.includes("'use client'")) continue
    if (/useSiteText\w*\(\s*['"`]seo\./.test(src) || /<SiteText\s+k=["'`]seo\./.test(src)) offenders.push(rel)
  }
  for (const [rel, src] of sources('components')) {
    if (!src.includes("'use client'")) continue
    if (/useSiteText\w*\(\s*['"`]seo\./.test(src) || /<SiteText\s+k=["'`]seo\./.test(src)) offenders.push(rel)
  }
  assert.deepEqual(offenders, [], 'a client component reads a seo.* key, which no longer travels — pass it as a prop instead')
})

test('seo.* is still resolvable on the SERVER', () => {
  // Excluded from the browser, NOT deleted. lib/pageSeo reads the full map.
  assert.ok(SITE_TEXT_DEFAULTS['seo.home.title'], 'the seo defaults were deleted rather than withheld')
  const pageSeo = readFileSync(join(ROOT, 'lib/pageSeo.ts'), 'utf8')
  assert.match(pageSeo, /getSiteTextMap\(\)/, 'lib/pageSeo switched to the public map — every page title would go blank')
  assert.doesNotMatch(pageSeo, /getPublicSiteTextMap/, 'lib/pageSeo reads the browser map, which no longer has seo.*')
})

test('the payload stays within sight of what was measured', () => {
  const bytes = Buffer.byteLength(
    JSON.stringify(Object.fromEntries(publicKeys.map(k => [k, SITE_TEXT_DEFAULTS[k]]))), 'utf8')
  // 31.2 KB after the seo.* cut. This is a CEILING, not a target — it exists so
  // that adding a whole page's copy to the global map is a decision somebody
  // makes on purpose rather than a diff nobody notices. Raise it deliberately.
  assert.ok(
    bytes < 40_000,
    `the map every page ships is now ${bytes.toLocaleString()} bytes. Either trim it, or mark the new prefix server-only, or raise this ceiling on purpose.`,
  )
})

test('the data cache is an optimisation, never a dependency', () => {
  // `unstable_cache` reaches for a store Next installs PER REQUEST. Called from
  // anywhere else — a test, a seed script, a cron entry point — it does not
  // degrade, it throws „Invariant: incrementalCache missing". Both readers were
  // wrapped in it on 2026-08-21 and tests/abroad.test.ts caught it within the
  // hour by rendering a landing page in plain Node.
  //
  // So both must fall back to the plain query. A caller that used to work and
  // now crashes is a worse trade than any number of round trips.
  for (const f of ['lib/siteText.ts', 'lib/integrations.ts']) {
    const src = readFileSync(join(ROOT, f), 'utf8')
    assert.match(src, /unstable_cache/, `${f} no longer caches — every page view pays a round trip again`)
    assert.match(
      src, /try\s*\{[\s\S]{0,200}Cached\(\)[\s\S]{0,120}\}\s*catch\s*\{[\s\S]{0,200}\}/,
      `${f} calls the cached reader without a fallback — it will throw outside a request`,
    )
  }
})

test('an admin save drops the tag, or the edit is invisible for an hour', () => {
  for (const [route, tag] of [
    ['app/api/admin/site-texts/route.ts', 'SITE_TEXT_TAG'],
    ['app/api/admin/integrations/route.ts', 'INTEGRATIONS_TAG'],
  ]) {
    const src = readFileSync(join(ROOT, route), 'utf8')
    assert.match(src, /revalidateTag/, `${route} writes copy but never busts the cache — the save would look like it did nothing`)
    assert.match(src, new RegExp(`revalidateTag\\(${tag}\\)`), `${route} busts some other tag`)
  }
})
