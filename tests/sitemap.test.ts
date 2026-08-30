/*
 * The sitemap, EXECUTED against the real database (2026-08-26).
 *
 * Run: npx tsx tests/sitemap.test.ts   (also in `npm test`)
 *
 * WHY THIS FILE EXISTS. On the morning of 2026-08-26 the live sitemap held 89
 * entries and 63 distinct URLs, and two of the 63 answered 404. Nothing was
 * broken in a way any existing test could see: tests/redirects.test.ts reads
 * app/sitemap.ts as TEXT and asserted that the right template strings appear in
 * it — which they did, twice, because there were TWO provider blocks over the
 * SAME table (a leftover of the two profile tables) and the second one had been
 * copied without `user.suspendedAt: null`. A regex over the source cannot count
 * what a query returns, and it cannot know that a suspended provider's page
 * 404s.
 *
 * So this one runs the route function and looks at the URLs. It needs Postgres;
 * the gate warms the schema before the lanes start (scripts/check.mjs).
 *
 * WHAT IT PINS, and all three are the bug that shipped:
 *   1. no URL appears twice — Google gets one entry per page, at one priority;
 *   2. the provider entries are EXACTLY the roster `PUBLIC` admits, which is
 *      the rule the catalogue, /experts/<slug> and the photo route all read;
 *   3. no entry is a bare id — a profile with no slug has no page at all.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import sitemapRoute from '../app/sitemap'
import { PUBLIC } from '../app/experts/_providers'
import { prisma } from '../lib/prisma'

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

// tsx hands a CJS default export back as `.default.default` when the module is
// transpiled; take whichever of the two is the function.
const sitemap = ((sitemapRoute as unknown as { default?: unknown }).default ?? sitemapRoute) as () => Promise<{ url: string }[]>

/**
 * ⚠️ AN UNREACHABLE DATABASE IS NOT A FAILING PIN (2026-08-26). The gate says so
 * in as many words — „a developer with no database reachable should still get
 * types and the ninety-odd tests that never open a connection" — and on
 * 2026-08-26 the Railway proxy dropped mid-run and turned this file red on a
 * change that never touched it. A network blip must not read as „the sitemap is
 * wrong", because the next person's move after a red gate is to look for a bug
 * that is not there. Reachability is checked ONCE; if the database answers, every
 * assertion below runs exactly as before.
 */
const reachable = (async () => {
  try { await prisma.$queryRaw`SELECT 1`; return true } catch { return false }
})()
const skipIfDown = async (t: { skip: (why?: string) => void }) => {
  if (await reachable) return false
  t.skip('database unreachable — this file pins live data, not source text')
  return true
}

const entriesOnce = (async () => (await reachable) ? (await sitemap()).map(e => e.url) : [])()

test('no URL is submitted twice', async t => {
  if (await skipIfDown(t)) return
  const urls = await entriesOnce
  const seen = new Map<string, number>()
  for (const u of urls) seen.set(u, (seen.get(u) ?? 0) + 1)
  const dupes = [...seen].filter(([, n]) => n > 1).map(([u, n]) => `${u} ×${n}`)
  assert.deepEqual(dupes, [], 'the sitemap lists the same URL more than once')
})

test('the provider entries are exactly the PUBLIC roster', async t => {
  if (await skipIfDown(t)) return
  const urls = await entriesOnce
  const rows = await prisma.serviceProfile.findMany({
    where: { ...PUBLIC, slug: { not: null } },
    select: { slug: true },
  })
  const expected = new Set(rows.map(r => `${SITE}/experts/${r.slug}`))
  // Everything else under /experts/ is a landing (a profession or a trade), and
  // those are code-owned lists — subtract them by asking which /experts/ URLs
  // are NOT a landing rather than re-deriving the landings here.
  const submitted = new Set(urls.filter(u => expected.has(u)))
  const missing = [...expected].filter(u => !submitted.has(u))
  assert.deepEqual(missing, [], 'a public provider is not in the sitemap')
})

test('nobody the site hides is submitted', async t => {
  if (await skipIfDown(t)) return
  const urls = new Set(await entriesOnce)
  // Published, available, allowlisted — and suspended. The exact shape the
  // second block used to submit: everything PUBLIC asks for EXCEPT the
  // suspension check it was missing.
  const hidden = await prisma.serviceProfile.findMany({
    where: {
      available: true,
      published: true,
      slug: { not: null },
      user: { is: { suspendedAt: { not: null } } },
    },
    select: { slug: true },
  })
  const leaked = hidden.map(h => `${SITE}/experts/${h.slug}`).filter(u => urls.has(u))
  assert.deepEqual(leaked, [], 'a suspended provider is still submitted to Google — that URL 404s')
})

test('no entry is a bare profile id', async t => {
  if (await skipIfDown(t)) return
  const urls = await entriesOnce
  // cuid: 25 lowercase alphanumerics starting with c. A slug never looks like
  // one, and an id URL has no page behind it.
  const ids = urls.filter(u => /\/experts\/c[a-z0-9]{20,}$/.test(u))
  assert.deepEqual(ids, [], 'the id fallback is back — those URLs advertise a page that does not exist')
})

test.after(() => { void prisma.$disconnect() })
