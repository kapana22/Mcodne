/*
 * ONE NAMESPACE — /experts (restructuring v2 stage 11, 2026-08-19).
 *
 * Run: npx tsx tests/oneNamespace.test.ts   (also in `npm test`)
 *
 * WHAT THIS PINS, and why it is one file rather than a line in five others.
 *
 * Until today a provider lived in one of TWO address spaces. A TutorProfile
 * answered at /experts/<slug> beside the profession landings; a ServiceProfile
 * answered at /services/<slug> beside the trade landings. Two profile spaces
 * and two landing spaces say the site sells two products — and CLAUDE.md → THE
 * PRODUCT MODEL says the opposite in the owner's own words: „ექსპერტს აქვს
 * სერვისი რეალურად და პარალელურად აკეთებს კონსულტაციასაც." A consultation is
 * one KIND of service, so a person who sells one is not a different kind of
 * page.
 *
 * FOUR THINGS NOW ANSWER AT /experts/<slug>, and the ORDER between them is the
 * only thing standing between a code-owned page and a database row that could
 * shadow it. Precedence, slug uniqueness and the redirect are three halves of
 * one guarantee: break any one and the other two stop meaning anything, which
 * is exactly why they are asserted together here.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { NextRequest } from 'next/server'
import { middleware } from '../middleware'
import { professions } from '../lib/professionSeo'
import { SERVICE_GROUPS, SERVICE_TOPICS } from '../lib/serviceProfile'
import { RESERVED_SLUGS, slugReserved } from '../lib/slugSpace'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const has = (p: string) => existsSync(join(ROOT, p))
/** Source with comments and imports removed — these files quote their own
 *  history in prose, and prose is allowed to remember where a page used to be.
 *  A negative LINK assertion must never be satisfied (or failed) by it. */
const codeOf = (p: string) =>
  read(p)
    .split('\n')
    .filter(l => !/^\s*\/\//.test(l) && !/^import\b/.test(l))
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

const PAGE = 'app/experts/[slug]/page.tsx'

/* ═══════════ A. the resolver's precedence ═══════════════════════════════ */

test('§A four pages share /experts/[slug], resolved in ONE documented order', () => {
  const page = read(PAGE)
  // The order is stated in the file, not only performed by it — the next
  // person to add a fifth thing has to read what the four already are.
  assert.match(page, /THE PRECEDENCE, IN ORDER/, 'the resolver stopped documenting its own order')

  // BOTH readers — generateMetadata and the render — must agree, or a shared
  // link would unfurl as one page and open as another.
  const meta = page.slice(page.indexOf('export async function generateMetadata'), page.indexOf('export default async function'))
  const render = page.slice(page.indexOf('export default async function'), page.indexOf('function queryOf('))
  const STEPS: [label: string, marker: string][] = [
    ['the profession landing', 'professionBySlug[param]'],
    ['the trade landing', 'resolveTrade(param)'],
    ['the expert profile', 'resolveExpert(param)'],
    ['the provider profile', 'resolveMaster(param)'],
  ]
  for (const [name, src] of [['generateMetadata', meta], ['the page', render]] as const) {
    const at = STEPS.map(([label, marker]) => {
      const i = src.indexOf(marker)
      assert.ok(i >= 0, `${name}: ${label} is not resolved at all (${marker})`)
      return { label, i }
    })
    for (let k = 1; k < at.length; k++) {
      assert.ok(at[k - 1].i < at[k].i,
        `${name}: ${at[k].label} is resolved before ${at[k - 1].label} — the order is the guarantee`)
    }
  }
  // …and the chain ENDS in a 404, never in a blank 200.
  assert.match(render, /notFound\(\)/, 'the resolver lost its 404')

  // ⚠️ THE TWO CODE-OWNED LISTS COME FIRST because they are fixed lists in
  // source while both profile slugs are generated from people's names. That is
  // only safe because neither list can collide with the other.
  const profSlugs = new Set(professions.map(p => p.slug))
  const tradeIds = [...SERVICE_GROUPS.map(g => g.id), ...SERVICE_TOPICS.map(t => t.id)]
  assert.deepEqual(tradeIds.filter(id => profSlugs.has(id)), [],
    'a trade id and a profession slug name the same URL — the two landings would shadow each other')
})

test('§A2 each of the four is drawn by its own part, and the provider profile is server-rendered', () => {
  const page = read(PAGE)
  assert.match(page, /<ProfessionLanding p=\{prof\} \/>/)
  assert.match(page, /<TradeLanding trade=\{trade\}/)
  assert.match(page, /<ExpertProfilePage /)
  assert.match(page, /<ProviderHero p=\{p\} \/>/)
  for (const part of ['_profession.tsx', '_tradeLanding.tsx', 'client.tsx',
                      '_providerData.ts', '_providerHero.tsx', '_providerBlocks.tsx', '_providerCta.tsx']) {
    assert.ok(has(`app/experts/[slug]/${part}`), `app/experts/[slug]/${part} is missing`)
  }
  // The model stays a LEAF (CLAUDE.md): it may not import a sibling.
  assert.doesNotMatch(read('app/experts/[slug]/_providerData.ts'), /from '\.\//,
    '_providerData imports a sibling — the model must stay a leaf')
})

test('§A3 a provider profile is REACHABLE at /experts/<slug> — the branch is entered and returns', () => {
  const page = codeOf(PAGE)
  // Entered only when the expert table answered nothing (a slug is unique
  // across both tables, so at most one of the two can be here) …
  assert.match(page, /if\s+\(!resolved\)\s+\{\s*\n\s*const\s+provider\s+=\s+await\s+resolveMaster\(param\)/,
    'the provider branch is no longer reached from the resolver')
  // … and it RETURNS the profile rather than falling through to the 404.
  assert.match(page, /return providerProfile\(provider\)/, 'the provider branch resolves and then drops the row')
  // The id form 308s to the slug, carrying the query string.
  assert.match(page, /permanentRedirect\(`\$\{masterPath\(provider\)\}\$\{queryOf\(await\s+searchParams\)\}`\)/)
  // …and every address this profile prints for itself is under /experts.
  const data = read('app/experts/[slug]/_providerData.ts')
  assert.match(data, /export\s+const\s+masterPath\s+=\s+\(p:\s+\{\s+slug:\s+string\s+\|\s+null;\s+id:\s+string\s+\}\)\s+=>\s+`\/experts\/\$\{p\.slug\s+\|\|\s+p\.id\}`/)
  assert.match(data, /`\/experts\/\$\{expertSlug\}`/, 'the cross-link to the same person’s expert profile is gone')
  // The metadata half canonicalises to the same address, never the old one.
  assert.match(codeOf(PAGE), /alternates:\s+\{\s+canonical:\s+providerCanonical\s+\}/)
  assert.match(codeOf(PAGE), /const\s+providerCanonical\s+=\s+`\$\{SITE_URL\}\$\{masterPath\(pp\)\}`/)
})

/* ═══════════ B. a slug is unique across BOTH tables ═════════════════════ */

test('§B one shared helper answers „is this slug taken?" for both generators', () => {
  const space = read('lib/slugSpace.ts')
  // BOTH tables, in one function. Either half missing is a duplicate waiting.
  assert.match(space, /export\s+async\s+function\s+slugTaken\(slug:\s+string\):\s+Promise<boolean>/)
  assert.match(space, /prisma\.tutorProfile\.findFirst\(\{\s+where:\s+\{\s+slug\s+\}/, 'slugTaken does not look at TutorProfile')
  assert.match(space, /prisma\.serviceProfile\.findFirst\(\{\s+where:\s+\{\s+slug\s+\}/, 'slugTaken does not look at ServiceProfile')
  // A DB outage answers „taken" — the safe direction (the caller suffixes and
  // at worst a profile keeps its id URL). „free" would mint a duplicate.
  assert.match(space, /catch \{\n\s*return true\n\s*\}/, 'slugTaken fails open — an outage would mint duplicates')

  // BOTH generators ask it, and neither keeps a private list any more.
  for (const f of ['lib/expertSlug.ts', 'lib/masterSlug.ts']) {
    const src = read(f)
    assert.match(src, /import\s+\{\s+slugReserved,\s+slugTaken\s+\}\s+from\s+'\.\/slugSpace'/, `${f} does not use the shared helper`)
    assert.match(src, /if \(await slugTaken\(candidate\)\) continue/, `${f} writes a candidate without asking both tables`)
    assert.doesNotMatch(codeOf(f), /const RESERVED = new Set/, `${f} kept a private reserved list — there is one`)
    // …and a slug is still PERMANENT: an existing one is returned, never redone.
    assert.match(src, /if \(profile\.slug\) return profile\.slug/, `${f} may have started overwriting an existing slug`)
  }
})

test('§B2 the reserved list covers the route words, every profession and every trade', () => {
  // The three kinds, each for its own reason — see lib/slugSpace's header.
  for (const w of ['experts', 'admin', 'api', 'join', 'me', 'work', 'request', 'signin', 'settings']) {
    assert.ok(slugReserved(w), `„${w}" is a route word and must not be mintable as a slug`)
  }
  // The retired addresses are still addresses a person can type.
  for (const w of ['services', 'masters', 'tutors', 'categories', 'konsultacia', 'apply', 'ask']) {
    assert.ok(slugReserved(w), `„${w}" 308s somewhere — a profile minted onto it would be unreachable`)
  }
  for (const p of professions) assert.ok(slugReserved(p.slug), `the profession „${p.slug}" is not reserved`)
  for (const g of SERVICE_GROUPS) assert.ok(slugReserved(g.id), `the trade group „${g.id}" is not reserved`)
  // ⚠️ EVERY topic, not only the live groups': a trade we open next month must
  // not collide with a slug minted today.
  for (const t of SERVICE_TOPICS) assert.ok(slugReserved(t.id), `the trade topic „${t.id}" is not reserved`)
  assert.ok(!slugReserved('ana-gagoshidze'), 'a person’s name must still be mintable')
  assert.ok(RESERVED_SLUGS.size >= professions.length + SERVICE_GROUPS.length + SERVICE_TOPICS.length)
})

/* ═══════════ C. the second namespace is gone ════════════════════════════ */

const ORIGIN = 'https://mcodne.ge'
const hit = (path: string) => middleware(new NextRequest(`${ORIGIN}${path}`))
const where = (path: string) => {
  const r = hit(path)
  return { status: r.status, to: r.headers.get('location') }
}

test('§C app/services is not a route at all, and /services/<x> 308s segment-for-segment', () => {
  assert.ok(!has('app/services'), 'app/services is back — two profile spaces contradict the product model')
  // The door goes to the catalogue; every child KEEPS its segment, because the
  // page that answered it answers at /experts/<same> now.
  assert.deepEqual(where('/services'), { status: 308, to: `${ORIGIN}/experts` })
  for (const seg of ['nino-a1b2', 'santeqnika', 'plumbing', 'clx1234567890', 'ana-gagoshidze-2']) {
    assert.deepEqual(where(`/services/${seg}`), { status: 308, to: `${ORIGIN}/experts/${seg}` }, `/services/${seg}`)
  }
  // The query string survives — a shared link carries its intent there.
  assert.equal(where('/services/nino-a1b2?utm_source=x').to, `${ORIGIN}/experts/nino-a1b2?utm_source=x`)
  // One hop: the target itself is not redirected again.
  assert.equal(hit('/experts/nino-a1b2').status, 200)
  // Segment-bounded: starts-with-the-letters is not the prefix.
  assert.equal(hit('/servicesx').status, 200)
  // …and the WORKSPACE page of the same name is untouched — it is a screen, not
  // this namespace (/work/services, „რას ვყიდი?").
  assert.equal(hit('/work/services').status, 200)
})

test('§C2 no live /services link is left in app, components or lib', () => {
  // A QUOTED address only, comments stripped: these files quote their own
  // history in prose, and prose is allowed to remember a retired prefix.
  // /work/services is a different page and keeps its name.
  const offenders: string[] = []
  const QUOTED = /['"`](\/services)(['"`?/]|\$\{)/
  for (const f of sourceFiles()) {
    const rel = relative(ROOT, f)
    if (rel === 'middleware.ts') continue
    codeOf(rel).split('\n').forEach((line, i) => {
      if (!QUOTED.test(line)) return
      offenders.push(`      ${rel}:${i + 1}  ${line.trim()}`)
    })
  }
  assert.equal(offenders.length, 0, `something still links into the retired namespace:\n${offenders.join('\n')}`)
})

test('§C3 the sitemap and robots know one namespace', () => {
  const sitemap = codeOf('app/sitemap.ts')
  // Every dynamic block under /experts/: expert profiles, provider profiles,
  // trade landings, profession landings.
  assert.match(sitemap, /url:\s+`\$\{SITE_URL\}\/experts\/\$\{t\.slug\s+\|\|\s+t\.id\}`/, 'expert profiles left the sitemap')
  assert.match(sitemap, /url: `\$\{SITE_URL\}\/experts\/\$\{m\.slug\}`/, 'provider profiles left the sitemap')
  assert.match(sitemap, /url: `\$\{SITE_URL\}\/experts\/\$\{g\.id\}`/, 'trade landings left the sitemap')
  assert.match(sitemap, /url: `\$\{SITE_URL\}\/experts\/\$\{p\.slug\}`/, 'profession landings left the sitemap')
  assert.doesNotMatch(sitemap, /\/services/, 'the sitemap still names the retired namespace')
  // ONE Allow covers all four pages; a redirecting prefix is not an Allow.
  const robots = codeOf('app/robots.ts')
  assert.match(robots, /'\/experts\/\*'/)
  assert.doesNotMatch(robots, /'\/services/, 'robots still allows the retired namespace')
})
