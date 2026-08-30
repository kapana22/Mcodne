// THE EXPERT PROFILE'S OWN ADDRESS SPACE — /experts/[slug] (restructuring v2
// stage 5B, 2026-08-19).
//
// Run: npx tsx tests/expertsRoute.test.ts   (also in `npm run check`)
//
// WHAT THIS PINS. The profile that lived at /tutors/[id] moved to
// /experts/[slug]. It was two tables in two namespaces for one day —
// TutorProfile.slug under /experts, ServiceProfile.slug under /services — and
// stage 11 (2026-08-19) collapsed them into ONE: both answer at /experts/<slug>
// and a slug is unique across BOTH tables (lib/slugSpace), so the two still
// cannot shadow each other. The resolver's precedence lives in
// tests/oneNamespace.test.ts.
//
// ⚠️ AND THE CATALOGUE FOLLOWED IT (stage 10, 2026-08-19). It stayed at /tutors
// for one day; the owner's „ტუტორები რატო უნდა იყოს სახელად" ended that — a
// word this project's own lexicon bans may not sit in a URL. So `/tutors`,
// bare and with a segment, 308s into /experts, and app/tutors does not exist.
//
// Every guarantee below breaks silently otherwise: a card that still builds
// `/tutors/${slug}` is a 308 on every click (and the redirect downgrades the
// View Transitions photo morph to a full load); a sitemap that still lists
// /tutors/<slug> advertises 5000 redirects.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const has = (p: string) => existsSync(join(ROOT, p))

/** The file with comments and imports removed — these files quote their own
 *  history in prose, and prose is allowed to remember /tutors/[id]. */
const codeOf = (p: string) =>
  read(p)
    .split('\n')
    .filter(l => !/^\s*(\/\/|--)/.test(l) && !/^import\b/.test(l))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      if (e === 'node_modules' || e === '.next') continue
      const p = join(dir, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.tsx?$/.test(p)) out.push(p)
    }
  }
  for (const d of ['app', 'components', 'lib']) walk(join(ROOT, d))
  return out
}

/* ═══════════ 1. the route ═══════════════════════════════════════════════ */

test('§A the profile lives at app/experts/[slug] and nowhere else', () => {
  assert.ok(has('app/experts/[slug]/page.tsx'), 'app/experts/[slug]/page.tsx is missing')
  // ⚠️ THE CONSULTATION PROFILE AND ITS SEVEN PARTS WENT ON 2026-08-24 —
  // `client.tsx`, `_bits`, `_data`, `_hero`, `_reviews`, `_booking`, `_similar`
  // and `_sections`. What answers here is the PROVIDER profile, server-rendered,
  // and its parts are pinned by tests/oneNamespace.test.ts §A2.
  assert.ok(!has('app/experts/[slug]/client.tsx'), 'the consultation profile came back')
  for (const part of ['_providerData.ts', '_providerHero.tsx', '_providerBlocks.tsx', '_providerCta.tsx']) {
    assert.ok(has(`app/experts/[slug]/${part}`), `app/experts/[slug]/${part} is missing — CLAUDE.md's map names it`)
  }
  assert.ok(!has('app/tutors'), 'app/tutors is back — two routes for one profile means two canonicals')
  // …and the CATALOGUE is this segment's own page (stage 10), not a second app
  // folder that can drift from it.
  assert.ok(has('app/experts/page.tsx') && has('app/experts/client.tsx'), 'the catalogue left app/experts')
  assert.ok(!has('app/masters'), 'app/masters is back — there is one catalogue')
})

test('§B the page reads `slug`, resolves id OR slug, and 308s a cuid to /experts/<slug>', () => {
  const page = codeOf('app/experts/[slug]/page.tsx')
  assert.match(page, /type Params = \{ slug: string \}/)
  assert.match(page, /const \{ slug: param \} = await params/)
  assert.doesNotMatch(page, /const \{ id: param \}/, 'the param is still read as `id`')
  // /experts/<cuid> keeps working forever — a dozen links were built that way.
  assert.match(read('app/experts/[slug]/_providerData.ts'),
    /OR:\s+\[\{\s+slug:\s+param\s+\},\s+\{\s+id:\s+param\s+\}\]/,
    'the resolver stopped accepting the raw id')
  assert.match(page, /permanentRedirect\(`\$\{masterPath\(provider\)\}/)
  assert.doesNotMatch(page, /\/tutors\/\$\{/, 'the page still builds a /tutors/ profile URL')
})

/* ⚠️ „§C dual providers" WAS HERE AND IS GONE (2026-08-24). It pinned the link
   between somebody's TWO profiles — „სერვისის პროფილი" on the consultation
   page — and the rule that the select behind it must never touch a base64
   column. One profile, no cross-link; the blob rule is pinned where the query
   that could break it now lives (tests/catalog.test.ts). */

/* ═══════════ 2. the redirect ════════════════════════════════════════════ */

test('§D the middleware 308s /tutors AND /tutors/<segment> into /experts', () => {
  const mw = codeOf('middleware.ts')
  const start = mw.indexOf("req.nextUrl.pathname === '/tutors'")
  assert.ok(start > 0, 'the /tutors block is gone from the middleware')
  const block = mw.slice(start, mw.indexOf('isRequestPath('))
  // Both forms, one hop, one block — the bare address is the catalogue's old
  // one and must not fall through to a 404.
  assert.match(block, /req\.nextUrl\.pathname\s+===\s+'\/tutors'\s+\|\|\s+req\.nextUrl\.pathname\.startsWith\('\/tutors\/'\)/)
  assert.match(block, /'\/experts' \+ rest/)
  assert.match(block, /NextResponse\.redirect\(url, 308\)/, 'must be permanent AND method-preserving, like the other blocks')
  // The query string survives (?q=, ?category=, ?intent=message, ?rebook=1).
  assert.doesNotMatch(block, /url\.search = ''/)
  // It sits with the other 308s, BEFORE the requests gate.
  assert.ok(start < mw.indexOf('isRequestPath('), 'the /tutors redirect moved below the requests gate')
  // The /ask and /categories blocks land on the catalogue's FINAL address —
  // pointing them at /tutors would make every old link two hops.
  assert.match(mw, /url\.pathname = '\/experts'\n/)
  assert.doesNotMatch(mw, /url\.pathname = '\/tutors'/, 'a redirect still targets the retired catalogue address')
})

test('§D2 the redirect logic, executed: bare address and segment both move, query kept', () => {
  // The same predicate + rewrite the middleware runs, evaluated on real paths.
  const redirect = (pathname: string) => {
    if (pathname !== '/tutors' && !pathname.startsWith('/tutors/')) return null
    const rest = pathname.slice('/tutors'.length)
    return rest === '' || rest === '/' ? '/experts' : '/experts' + rest
  }
  assert.equal(redirect('/tutors'), '/experts')
  assert.equal(redirect('/tutors/'), '/experts')
  assert.equal(redirect('/tutors/ana-gagoshidze'), '/experts/ana-gagoshidze')
  assert.equal(redirect('/tutors/cms4yyus7000bns01yu8liwai'), '/experts/cms4yyus7000bns01yu8liwai')
  assert.equal(redirect('/tutorsx'), null)
  assert.equal(redirect('/work/profile'), null)
  assert.equal(redirect('/api/tutors/abc'), null)
  // Guard the middleware source against drift from this executable copy.
  const mw = codeOf('middleware.ts')
  assert.match(mw, /rest === '' \|\| rest === '\/' \? '\/experts' : '\/experts' \+ rest/)
})

/* ═══════════ 3. every link ═══════════════════════════════════════════════ */

test('§E no live /tutors or /masters URL remains in app, components or lib', () => {
  // ⚠️ WIDER THAN IT WAS (stage 10). It used to allow the BARE catalogue
  // address, because the catalogue answered there. It does not any more: both
  // /tutors and /masters are 308s, and „tutors" is a word this project's own
  // lexicon bans besides. A QUOTED address only — these files quote their own
  // history in prose, and prose is allowed to remember where a page used to be.
  const offenders: string[] = []
  const QUOTED = /['"`](\/tutors|\/masters)(['"`?/]|\$\{)/
  for (const f of sourceFiles()) {
    const rel = relative(ROOT, f)
    if (rel === 'middleware.ts') continue
    codeOf(rel).split('\n').forEach((line, i) => {
      if (!QUOTED.test(line)) return
      // The API keeps its own paths — a route file is not a screen.
      if (/\/api\/(tutors|masters|admin\/tutors)/.test(line)) return
      offenders.push(`      ${rel}:${i + 1}  ${line.trim()}`)
    })
  }
  assert.equal(offenders.length, 0, `something still links to a retired catalogue URL:\n${offenders.join('\n')}`)
})

test('§F the cards, sitemap, nav and JSON-LD name /experts/', () => {
  // The catalogue card, the home grid and the hero: slug first, under /experts/.
  // ⚠️ THE LIST FOLLOWS THE CARDS, NOT THE OTHER WAY ROUND. `ExpertGrid` was
  // replaced by `CatalogueGrid` on 2026-08-21 (it could only render the
  // consulting half of a merged catalogue), and the hero stopped carrying cards
  // at all in the same redesign — its entrance is a search field now. Both
  // edits move where the href is WRITTEN; neither weakens the rule.
  for (const f of ['components/home/CatalogueGrid.tsx']) {
    const src = codeOf(f)
    assert.match(src, /`\/experts\/\$\{[a-z]+\.(?:slug|urlSlug)\s+\|\|\s+[a-z]+\.id\}/, `${f}: the card href must be the SLUG when present, under /experts/`)
  }
  // The sitemap emits only the new address.
  //
  // ⚠️ AND ONLY THE SLUG SINCE 2026-08-26. The card above still falls back to
  // an id — correct, a card is a link the visitor already has in front of them
  // — but a SITEMAP is a submission, and a profile with no slug has no page at
  // all (ProviderRow.slug: „Null = no page yet"), so the fallback advertised an
  // address nobody could reach.
  const sitemap = codeOf('app/sitemap.ts')
  assert.match(sitemap, /url: `\$\{SITE_URL\}\/experts\/\$\{p\.slug\}`/)
  assert.doesNotMatch(sitemap, /\/tutors\/\$\{/)
  // robots allows the catalogue and everything under it; a redirecting URL does
  // not belong in an Allow, so the three retired doors are absent.
  const robots = read('app/robots.ts')
  assert.match(robots, /'\/experts'/); assert.match(robots, /'\/experts\/\*'/)
  assert.doesNotMatch(robots, /'\/tutors'/); assert.doesNotMatch(robots, /'\/masters'/)
  // ⚠️ NOT EVEN THE CHILDREN (stage 11). '/services/*' used to be listed here
  // because the trade landings and provider profiles answered under it; the
  // whole prefix 308s into /experts now, and a redirecting URL is not an Allow.
  // One Allow ('/experts/*') covers all four pages that share the segment.
  assert.doesNotMatch(robots, /'\/services/, 'robots still allows the retired /services prefix')
  // BottomNav treats the profile as a focused screen AND as the ექსპერტები section.
  const nav = read('components/BottomNav.tsx')
  assert.match(nav, /\/\^\\\/experts\\\/\[\^\/\]\+\$\/\.test\(path\)/)
  assert.doesNotMatch(nav, /\^\\\/tutors\\\/\[\^\/\]\+\$/)
  assert.match(nav, /startsWith\('\/experts'\)/)
  // The header's ONE item lights on every page under it by PREFIX, and since
  // stage 11 that is all four (/experts/<profession|trade|expert|provider>).
  // The SECTION_ALIAS that used to add '/services' is gone with the prefix.
  const bar = read('components/PublicTopBar.tsx')
  assert.match(bar, /activePath\s+===\s+href\s+\|\|\s+activePath\.startsWith\(href\s+\+\s+'\/'\)/)
  assert.doesNotMatch(codeOf('components/PublicTopBar.tsx'), /'\/services/,
    'the header still aliases the retired /services prefix')
  // Contextual help keys the profile on the deeper prefix and the catalogue on
  // the bare one — the deeper entry must come FIRST or it can never match.
  const help = codeOf('lib/helpTopics.ts')
  const deep = help.indexOf("{ prefix: '/experts/', lead:")
  const bare = help.indexOf("{ prefix: '/experts', lead:")
  assert.ok(deep > -1 && bare > -1, 'the catalogue or the profile lost its contextual help')
  assert.ok(bare > deep, 'the bare /experts help entry shadows the profile one')
  // Auth's „booking intent" reads the new prefix out of ?redirect=.
  for (const f of ['app/signin/_signin.tsx', 'app/signin/_signup.tsx']) {
    assert.match(codeOf(f), /redirect\.includes\('\/experts\/'\)/, `${f} still reads the old prefix out of ?redirect=`)
  }
})

/* ⚠️ „§G the View Transitions morph" AND „the profile fetches the API route that
   exists" WERE HERE AND ARE GONE (2026-08-24). The first pinned `vt-photo-<id>`
   on the consultation card and its profile — a shared-element transition between
   two files that no longer exist. The second pinned that the profile's own
   client fetch named a route that was really there (`/api/tutors/[id]`); the
   provider profile is server-rendered and fetches nothing, which is the same
   guarantee arriving by construction. */
