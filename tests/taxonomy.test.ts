/*
 * The taxonomy, stage 8 (restructuring v2 §3.2 / §3.6 / §8.7, 2026-08-19).
 *
 * Run: npx tsx --test tests/taxonomy.test.ts   (also in `npm test`)
 *
 * What was decided that day, pinned so it stays decided:
 *   A. every profession says what it CAN do (CONSULT, and for a short list WORK);
 *   B. a MEETING / PROJECT topic may name the professions that answer it,
 *      and never a LEARNING / SERVICE one — the two vocabularies touch, they do
 *      not merge (lib/requestTopics' header);
 *   C. routing mails by sphere ∪ profession, and the fallback is untouched;
 *   D. /experts/<slug> is a profession BEFORE it is an expert;
 *   E. /experts/<slug> is a trade BEFORE it is a profile, and a trade with
 *      fewer than TRADE_LANDING_MIN published masters is a door, never a list;
 *   F. /konsultacia and /categories 308 — executed against the real middleware;
 *   G. no live link to either retired address is left in the tree.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { NextRequest } from 'next/server'
import { middleware } from '../middleware'
import {
  ALL_PROFESSIONS, PROFESSION_CAN, professionCan, professionsThatCan,
} from '../lib/professions'
import { TOPIC_GROUPS, professionsOfTopic, topicById } from '../lib/requestTopics'
import { routeRequest, type RoutableProvider } from '../lib/requestRouting'
import { professions, professionBySlug } from '../lib/professionSeo'
import {
  LIVE_OFFER_GROUPS, OFFER_GROUPS, OFFER_TOPICS,
  TRADE_LANDING_MIN, resolveTrade, tradeTopicIds, countCovering,
} from '../lib/serviceProfile'
import { categoryPath } from '../lib/categoryRoutes'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const has = (p: string) => existsSync(join(ROOT, p))
/** Source with comments removed — a negative link assertion must not be
 *  satisfied by a comment that merely mentions the old address. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
const codeOf = (p: string) => strip(read(p))

/* ═══════════ A. what a profession can do ═══════════════════════════════ */

test('A. every profession sells SERVICES; consulting is the offer, not the base', () => {
  // ⚠️ THIS TEST ASSERTED THE OPPOSITE UNTIL 2026-08-20, and the assertion was
  // the old site written down: „every profession on an expert platform can
  // consult". Under THE PRODUCT MODEL rule 1 the base is the service, and
  // consulting is a switch a provider turns on where a paid conversation is
  // itself a product. Owner: „ყველამ სერვისი უნდა დაამატოს… და კონსულტაცია
  // ცალკე ფუნქცია ექნება."
  //
  // What that fixed: `სანტექნიკოსი` resolved to ['CONSULT','WORK'], so a plumber
  // was routed through a consultation wizard — calendar, tiers, session lengths
  // — for a product they do not sell. The old list's own comment said these
  // „sell a JOB and nothing else"; the code disagreed with the comment.
  for (const { job } of ALL_PROFESSIONS) {
    const can = PROFESSION_CAN[job]
    assert.ok(Array.isArray(can) && can.length > 0, `„${job}" has no capabilities`)
    assert.ok(can.includes('WORK'), `„${job}" cannot sell a service — that is the base, not an exception`)
    for (const c of can) assert.ok(c === 'CONSULT' || c === 'WORK', `„${job}": unknown capability ${c}`)
  }
  assert.equal(Object.keys(PROFESSION_CAN).length, ALL_PROFESSIONS.length, 'a profession is missing from PROFESSION_CAN')
  assert.equal(professionsThatCan('WORK').length, ALL_PROFESSIONS.length,
    'a profession lost WORK — every profession sells services')

  // The trades, and it stays SHORT. A profession is here only when a paid
  // conversation about the work is genuinely not something anyone buys; when in
  // doubt leave it out, because CONSULT is only ever an OFFER — one nobody takes
  // costs nothing, a missing one closes a door.
  const consultants = professionsThatCan('CONSULT')
  const workOnly = ALL_PROFESSIONS.map(p => p.job).filter(j => !consultants.includes(j))
  assert.ok(workOnly.length >= 1 && workOnly.length <= 8,
    `${workOnly.length} professions are WORK-only — the list was meant to be nameable in one breath`)
  assert.ok(workOnly.includes('სანტექნიკოსი') && workOnly.includes('ელექტრიკოსი'),
    'the trades can consult again — a plumber does not sell conversations')
  assert.ok(consultants.includes('ფსიქოლოგი') && consultants.includes('ადვოკატი') && consultants.includes('ბუღალტერი'),
    'a conversation profession lost its consultation offer')
  // An unknown word sells a service. Guessing „consultant" for anything we do
  // not recognise is precisely the default this file stopped having.
  assert.deepEqual(professionCan('no-such-job'), ['WORK'], 'an unknown job fell back to consulting again')

  const routing = codeOf('lib/requestRouting.ts') + codeOf('lib/requestJobs.ts')
  assert.doesNotMatch(routing, /PROFESSION_CAN|professionsThatCan/, 'routing started reading `can` — stage 9 work; document and test it there')
})

/* ═══════════ B. the two vocabularies touch, they do not merge ══════════ */

test('B. topic professions name real professions, only on MEETING / PROJECT topics', () => {
  const known = new Set(ALL_PROFESSIONS.map(p => p.job))
  let mapped = 0
  for (const g of TOPIC_GROUPS) {
    const cp = g.kinds.includes('MEETING') || g.kinds.includes('PROJECT')
    for (const t of g.topics) {
      const profs = t.professions ?? []
      if (!cp) {
        assert.equal(profs.length, 0, `${g.id}/${t.id} is a ${g.kinds.join('+')} topic and names professions — a school subject is not a profession, a trade is not an expert`)
        continue
      }
      for (const p of profs) assert.ok(known.has(p), `${t.id} names „${p}", which is not in lib/professions`)
      assert.equal(new Set(profs).size, profs.length, `${t.id} lists a profession twice`)
      if (profs.length) mapped++
    }
  }
  assert.ok(mapped >= 15, `only ${mapped} MEETING/PROJECT topics name a profession`)
  // The obvious ones, by name.
  assert.deepEqual(professionsOfTopic('accounting'), ['ბუღალტერი'])
  assert.ok(professionsOfTopic('contract').includes('იურისტი'))
  assert.ok(professionsOfTopic('psy-individual').includes('ფსიქოლოგი'))
  // …and nothing for a school subject, a trade, or an unknown id.
  assert.deepEqual(professionsOfTopic('math'), [])
  assert.deepEqual(professionsOfTopic('clean-flat'), [])
  assert.deepEqual(professionsOfTopic('no-such-topic'), [])
  assert.deepEqual(professionsOfTopic(null), [])
  // The header's rule survives in the file itself.
  assert.match(read('lib/requestTopics.ts'), /THIS IS NOT `Category`, AND IT MUST NEVER BECOME IT/)
})

/* ═══════════ C. routing: sphere ∪ profession, fallback unchanged ═══════ */

const P = (userId: string, o: Partial<RoutableProvider> = {}): RoutableProvider =>
  ({ userId, categoryId: null, ...o })

test('C1. TARGETED when the expert’s professions intersect the topic’s — case-insensitive, trimmed', () => {
  const providers = [
    P('acct', { categoryId: 'cat-other', professions: ['  ბუღალტერი '] }),   // filed elsewhere, IS the person
    P('lawyer', { categoryId: 'cat-law', professions: ['ადვოკატი'] }),
    P('member', { isCompanyMember: true }),
  ]
  // The request maps onto no sphere anybody is under, but its topic names the accountant.
  const r = routeRequest('cat-tax', providers, { topic: 'accounting', city: null })
  assert.equal(r.audience, 'TARGETED')
  assert.deepEqual(r.recipients, ['acct'])
})

test('C2. UNION with the sphere match — nobody the sphere reached before is lost', () => {
  const providers = [
    P('tax-filed', { categoryId: 'cat-tax', professions: ['აუდიტორი'] }),      // sphere match, wrong profession
    P('acct', { categoryId: 'cat-marketing', professions: ['ბუღალტერი'] }),    // profession match, other sphere
    P('nobody', { categoryId: 'cat-law', professions: ['ადვოკატი'] }),
    P('member', { isCompanyMember: true }),
  ]
  const r = routeRequest('cat-tax', providers, { topic: 'vat', city: null })
  assert.equal(r.audience, 'TARGETED')
  assert.deepEqual([...r.recipients].sort(), ['acct', 'tax-filed'])
})

test('C3. never a substring — „იურისტი" does not catch „კორპორატიული იურისტი"', () => {
  const providers = [P('corp', { professions: ['კორპორატიული იურისტი'] }), P('gen', { professions: ['იურისტი'] })]
  // `contract` names იურისტი and ადვოკატი — the corporate lawyer is a different entry.
  const r = routeRequest(null, providers, { topic: 'contract', city: null })
  assert.deepEqual(r.recipients, ['gen'])
  // `corp-law` names the corporate lawyer, and only them.
  assert.deepEqual(routeRequest(null, providers, { topic: 'corp-law', city: null }).recipients, ['corp'])
})

test('C4. the fallback is unchanged: no sphere and no profession → EVERYONE, incl. company members', () => {
  const providers = [
    P('a', { categoryId: 'cat-law', professions: ['ადვოკატი'] }),
    P('b', { categoryId: null, professions: [] }),
    P('member', { isCompanyMember: true }),
  ]
  // A school subject: no sphere, no professions.
  const r = routeRequest(null, providers, { topic: 'chemistry', city: null })
  assert.equal(r.audience, 'EVERYONE')
  assert.equal(r.recipients.length, 3)
  // A profession topic nobody claims and a sphere nobody is under → still everyone.
  const r2 = routeRequest('cat-nobody', providers, { topic: 'agronomy', city: null })
  assert.equal(r2.audience, 'EVERYONE')
  assert.equal(r2.recipients.length, 3)
  // No topic at all (the pre-stage-8 call shape) — sphere alone, as before.
  assert.deepEqual(routeRequest('cat-law', providers).recipients, ['a'])
  assert.equal(routeRequest(null, providers).audience, 'EVERYONE')
})

test('C5. the trades match still comes first, and a company member is never targeted by profession', () => {
  const providers = [
    P('plumber', { services: ['plumb-leak'], areas: ['TBILISI'] }),
    P('acct', { professions: ['ბუღალტერი'] }),
    P('member', { isCompanyMember: true, professions: ['ბუღალტერი'] }),
  ]
  assert.deepEqual(routeRequest(null, providers, { topic: 'plumb-leak', city: 'TBILISI' }).recipients, ['plumber'])
  assert.deepEqual(routeRequest(null, providers, { topic: 'accounting', city: null }).recipients, ['acct'])
})

test('C6. the caller hands the professions over — the query selects them', () => {
  const jobs = read('lib/requestJobs.ts')
  // ⚠️ THIS ASSERTION USED TO REQUIRE THE BUG (2026-08-26). It read
  // `tutor: { select: { categoryId: true, professions: true } }` — the
  // consultation profile, DROPPED with TutorProfile on 2026-08-24. So the
  // query threw on every call, `routableProviders()` returned nothing to
  // nobody, and this file went green BECAUSE the dead select was still there:
  // a pin can hold a fix out as easily as it holds a regression back. The two
  // columns live on ServiceProfile now, and the rest of this test — the pure
  // routing above — is where the behaviour actually is.
  assert.doesNotMatch(jobs, /\btutor:\s*\{/, 'routableProviders selects a relation that no longer exists — the query throws')
  const svc = jobs.slice(jobs.indexOf('serviceProfile: {'), jobs.indexOf('prisma.companyMember'))
  for (const field of ['categoryId: true', 'professions: true', 'services: true', 'areas: true', 'available: true']) {
    assert.ok(svc.includes(field), `routableProviders no longer selects ServiceProfile.${field.split(':')[0]}`)
  }
  assert.match(jobs, /professions: svc\?\.professions \?\? \[\]/)
  assert.match(jobs, /routeRequest\(r\.categoryId,\s+providers,\s+\{\s+topic:\s+r\.topic,\s+city:\s+r\.city\s+\}\)/, 'the topic is no longer passed — the profession match needs it')
})

/* ═══════════ D. /experts/<slug>: the profession wins ═══════════════════ */

test('D. /experts resolves a profession slug BEFORE an expert, and no expert can be minted onto one', () => {
  const page = read('app/experts/[slug]/page.tsx')
  // In BOTH readers — metadata and the render — before the DB is asked.
  const meta = page.slice(page.indexOf('export async function generateMetadata'), page.indexOf('export default async function'))
  const render = page.slice(page.indexOf('export default async function'))
  for (const [name, src] of [['generateMetadata', meta], ['the page', render]] as const) {
    const prof = src.indexOf('professionBySlug[param]')
    // ⚠️ IT WAS `resolveExpert` UNTIL 2026-08-24 — the consultation profile,
    // third in the chain. The rule is the same one: a CODE-OWNED list resolves
    // before any generated slug, because a profession page must not be
    // shadowed by somebody's name.
    const expert = src.indexOf('resolveMaster(param)')
    assert.ok(prof >= 0 && expert >= 0, `${name}: one of the two resolvers is missing`)
    assert.ok(prof < expert, `${name}: the expert is resolved before the profession — a DB row could shadow a code-owned page`)
  }
  assert.match(render, /if\s+\(prof\)\s+return\s+<ProfessionLanding\s+p=\{prof\}\s+\/>/)
  assert.match(meta, /if \(prof\) return professionMetadata\(prof\)/)
  // BOTH generators reserve every profession slug — that is what makes the
  // precedence safe rather than merely documented. Stated once since stage 11
  // (2026-08-19), in the list they share: with one namespace a PROVIDER minted
  // onto „iuristi" would shadow the landing exactly as an expert would.
  const gen = read('lib/slugSpace.ts')
  assert.match(gen, /\.\.\.professions\.map\(p => p\.slug\)/, 'lib/slugSpace no longer reserves the profession slugs')
  for (const f of ['lib/masterSlug.ts']) {
    assert.match(read(f), /slugReserved|slugTaken/, `${f} no longer reads the shared reserved list`)
  }
  // The landing keeps its content and its structured data, at the new address.
  const part = read('app/experts/[slug]/_profession.tsx')
  for (const ld of ["'@type': 'Service'", "'@type': 'FAQPage'", "'@type': 'BreadcrumbList'"]) assert.match(part, new RegExp(ld.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(part, /export\s+const\s+professionPath\s+=\s+.*`\/experts\/\$\{p\.slug\}`/)
  assert.doesNotMatch(strip(part), /['"`]\/konsultacia/, 'the profession landing still links to /konsultacia')
  // ⚠️ THE HUB PAGE IS GONE (stage 10, 2026-08-19): the CATALOGUE took /experts,
  // because a hub of professions is a pre-filtered catalogue. What must survive
  // is the LANDINGS themselves and a site-wide way to crawl them — the sitemap
  // emits one entry per profession, so the whole set is reachable from any page.
  assert.equal(has('app/konsultacia'), false, 'app/konsultacia came back')
  assert.match(read('app/sitemap.ts'), /url: `\$\{SITE_URL\}\/experts\/\$\{p\.slug\}`/,
    'the profession landings left the sitemap — nothing crawls them now that the hub is gone')
  // …and the SEO registry rows keep their key, retired rather than deleted (a
  // SiteText DB row is keyed by the string `seo.konsultacia.*`).
  assert.match(read('lib/pageSeoDefs.ts'), /page: 'konsultacia',\n\s*retired: true,/)
  // Every profession slug is a plain latin segment that cannot collide with a route.
  for (const p of professions) {
    assert.match(p.slug, /^[a-z0-9-]+$/)
    assert.equal(professionBySlug[p.slug], p)
  }
})

/* ═══════════ E. /experts/<slug>: the trade wins, and the ≥3 rule ══════ */

test('E1. resolveTrade knows the live groups and their topics, and nothing else', () => {
  for (const g of LIVE_OFFER_GROUPS) {
    const r = resolveTrade(g.id)
    assert.ok(r && r.group.id === g.id && r.topic === null)
    assert.deepEqual(tradeTopicIds(r!), g.topics.map(t => t.id))
    for (const t of g.topics) {
      const rt = resolveTrade(t.id)
      assert.ok(rt && rt.group.id === g.id && rt.topic?.id === t.id)
      assert.deepEqual(tradeTopicIds(rt!), [t.id])
    }
  }
  // A group that is not open yet is not a landing — the URL falls through to the masters.
  const dark = OFFER_GROUPS.find(g => !LIVE_OFFER_GROUPS.includes(g))
  if (dark) assert.equal(resolveTrade(dark.id), null)
  assert.equal(resolveTrade('giorgi-maisuradze'), null)
  // ⚠️ „an EXPERT topic is not a trade" WAS ASSERTED HERE UNTIL 2026-08-24, and
  // it stopped being true on purpose: every live group is offerable, so a
  // professional topic resolves to a landing exactly as a trade does. What must
  // still NOT resolve is a person's slug.
})

test('E2. the ≥3 rule is three, counted once per master, and the page reads it', () => {
  assert.equal(TRADE_LANDING_MIN, 3)
  const rows = [
    { services: ['plumb-leak', 'plumb-install'] },  // one master, two topics of the group → counts ONCE
    { services: ['plumb-leak'] },
    { services: ['elec-wiring'] },
    { services: [] },
  ]
  const plumbing = resolveTrade('plumbing')!
  assert.equal(countCovering(rows, tradeTopicIds(plumbing)), 2)
  assert.equal(countCovering(rows, ['plumb-leak']), 2)
  assert.equal(countCovering(rows, ['elec-wiring']), 1)
  assert.equal(countCovering([], ['plumb-leak']), 0)

  // ⚠️ ONE NAMESPACE SINCE STAGE 11 (2026-08-19): the trade landing and the
  // provider profile answer at /experts/<slug>, in app/experts/[slug]/page.tsx,
  // beside the profession landing and the expert profile. The trade must still
  // be resolved BEFORE the profile — a fixed list in code cannot be shadowed by
  // a database row. The full four-step chain is pinned in
  // tests/oneNamespace.test.ts; this keeps the pair E is about.
  const page = read('app/experts/[slug]/page.tsx')
  const render = page.slice(page.indexOf('export default async function'))
  const meta = page.slice(page.indexOf('export async function generateMetadata'), page.indexOf('export default async function'))
  for (const [name, src] of [['generateMetadata', meta], ['the page', render]] as const) {
    const trade = src.indexOf('resolveTrade(param)')
    const master = src.indexOf('resolveMaster(param)')
    assert.ok(trade >= 0 && master >= 0, `${name}: one of the two resolvers is missing`)
    assert.ok(trade < master, `${name}: the provider profile is resolved before the trade`)
  }
  // At the bar → the catalogue's own query; below it → NO list query, the door.
  assert.match(render, /count\s+>=\s+TRADE_LANDING_MIN\s*\?\s*await\s+queryProviders\(/)
  assert.match(render, /: null/)
  const part = read('app/experts/[slug]/_tradeLanding.tsx')
  assert.match(part, /result: ProvidersResult \| null/)
  assert.match(part, /\{result && \(/, 'the list is not gated on the result — an empty grid would render below the bar')
  assert.match(part, /import\s+\{\s+ProviderCard\s+\}\s+from\s+'@\/app\/experts\/_providerCard'/, 'the trade landing draws its own card instead of the catalogue’s')
  assert.match(part, /REQUEST_HREF/)
  assert.doesNotMatch(strip(part), /["'`]\/request/, 'the CTA address is written by hand instead of REQUEST_HREF')
  // The count itself is the same VISIBLE rule as the profile.
  const data = read('app/experts/[slug]/_providerData.ts')
  assert.match(data, /where: VISIBLE, select: \{ services: true \}/)
  assert.match(data, /return countCovering\(rows, topicIds\)/)
  // …and the sitemap submits only trades at the bar, counted the same way.
  const sitemap = read('app/sitemap.ts')
  assert.match(sitemap, /countCovering\(rows,\s+g\.topics\.map\(t\s+=>\s+t\.id\)\)\s+>=\s+TRADE_LANDING_MIN/)
  assert.match(sitemap, /url: `\$\{SITE_URL\}\/experts\/\$\{g\.id\}`/)
  assert.doesNotMatch(strip(sitemap), /\/services\//, 'the sitemap still submits the retired namespace')
  // BOTH slug generators reserve every trade id — the same safety as D, and
  // since stage 11 it is stated once, in the shared list they both read.
  const gen = read('lib/slugSpace.ts')
  assert.match(gen, /\.\.\.OFFER_GROUPS\.map\(g => g\.id\)/)
  assert.match(gen, /\.\.\.OFFER_TOPICS\.map\(t => t\.id\)/)
  for (const f of ['lib/masterSlug.ts']) {
    assert.match(read(f), /from '\.\/slugSpace'/, `${f} no longer reads the shared reserved list`)
  }
  for (const t of OFFER_TOPICS) assert.match(t.id, /^[a-z0-9-]+$/)
})

/* ═══════════ F. the redirects, executed ════════════════════════════════ */

const hit = (path: string) => middleware(new NextRequest(`https://mcodne.ge${path}`))
const location = (path: string) => {
  const r = hit(path)
  return { status: r.status, to: r.headers.get('location') }
}

test('F1. /konsultacia → /experts, segment-for-segment, 308, query kept', () => {
  assert.deepEqual(location('/konsultacia'), { status: 308, to: 'https://mcodne.ge/experts' })
  assert.deepEqual(location('/konsultacia/iuristi'), { status: 308, to: 'https://mcodne.ge/experts/iuristi' })
  assert.deepEqual(location('/konsultacia/iuristi?utm_source=x'), { status: 308, to: 'https://mcodne.ge/experts/iuristi?utm_source=x' })
  // Every real profession lands on a URL the [slug] route resolves as a profession.
  for (const p of professions) assert.equal(location(`/konsultacia/${p.slug}`).to, `https://mcodne.ge/experts/${p.slug}`)
  // Segment-bounded: a path that merely starts with the letters is not caught.
  assert.equal(hit('/konsultaciax').status, 200)
})

test('F2. /categories → /experts, /categories/<slug> → /experts?category=<slug>, 308, query kept', () => {
  assert.deepEqual(location('/categories'), { status: 308, to: 'https://mcodne.ge/experts' })
  assert.deepEqual(location('/categories/tax'), { status: 308, to: 'https://mcodne.ge/experts?category=tax' })
  // The nested (absorbed) address names the child LAST — the child is the filter.
  assert.deepEqual(location('/categories/business/finance'), { status: 308, to: 'https://mcodne.ge/experts?category=finance' })
  // Other parameters survive; the path's slug wins over a stale ?category=.
  assert.equal(location('/categories/law?utm_source=x').to, 'https://mcodne.ge/experts?utm_source=x&category=law')
  assert.equal(location('/categories/law?category=old').to, 'https://mcodne.ge/experts?category=law')
  assert.equal(hit('/categoriesx').status, 200)
  // …and lands exactly where lib/categoryRoutes sends a category today.
  assert.equal(new URL(location('/categories/tax').to!).pathname + new URL(location('/categories/tax').to!).search,
    categoryPath({ slug: 'tax', status: 'VISIBLE', parent: null }))
  assert.equal(has('app/categories'), false, 'app/categories came back')
})

test('F3. the redirects sit with the other 308 blocks and do not touch their neighbours', () => {
  const mw = read('middleware.ts')
  const i = (s: string) => mw.indexOf(s)
  assert.ok(i("'/apply'") < i("'/konsultacia'") && i("'/konsultacia'") < i("'/categories'") && i("'/categories'") < i("'/tutors'"),
    'the new blocks are not placed with the other 308s (after /apply, before /tutors)')
  // The neighbours still behave. /tutors is itself retired since stage 10 —
  // bare and with a segment — while /experts and its children answer.
  assert.equal(location('/tutors/ana').to, 'https://mcodne.ge/experts/ana')
  assert.equal(location('/tutors').to, 'https://mcodne.ge/experts')
  assert.equal(hit('/experts').status, 200)
  assert.equal(hit('/experts/iuristi').status, 200)
  // …and the trade landing answers at its NEW address, while the old one 308s
  // segment-for-segment (stage 11).
  assert.equal(hit('/experts/santeqnika').status, 200)
  assert.equal(location('/services/santeqnika').to, 'https://mcodne.ge/experts/santeqnika')
})

/* ═══════════ G. no live link to a retired address ══════════════════════ */

test('G. nothing in app/, components/, lib/ links to /konsultacia or /categories any more', () => {
  const files: string[] = []
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.tsx?$/.test(p)) files.push(p)
    }
  }
  for (const d of ['app', 'components', 'lib']) walk(join(ROOT, d))
  const offenders: string[] = []
  for (const f of files) {
    const rel = relative(ROOT, f)
    // The middleware is the one place the old addresses may be spelled: it is
    // where they are redirected. lib/slugSpace reserves them as segments.
    if (rel === 'middleware.ts' || rel === 'lib/masterSlug.ts') continue
    codeOf(rel).split('\n').forEach((line, n) => {
      // A quoted address — a link target, not the word „categories" (the admin
      // API /api/admin/categories and /api/categories are not the page).
      if (/["'`]\/(konsultacia|categories)(["'`/?#]|$)/.test(line)) offenders.push(`${rel}:${n + 1}  ${line.trim()}`)
    })
  }
  assert.deepEqual(offenders, [], 'live links to a retired address (a 308 is for OLD links, not new ones)')
  // The sitemap and robots name neither.
  for (const f of ['app/sitemap.ts', 'app/robots.ts']) {
    assert.doesNotMatch(codeOf(f), /\/konsultacia|\/categories/, `${f} still names a retired address`)
  }
  assert.match(read('app/sitemap.ts'), /url: `\$\{SITE_URL\}\/experts\/\$\{p\.slug\}`/, 'the sitemap does not list /experts/<profession>')
  assert.match(read('app/sitemap.ts'), /\{ path: '\/experts'/, 'the sitemap does not list the /experts hub')
  // The old profession pages' words moved, not vanished: the pinned SiteText
  // keys stay under their historical stems.
  assert.match(read('lib/pageSeoDefs.ts'), /page: 'konsultacia'/)
  assert.match(read('lib/pageSeoDefs.ts'), /page: 'categories',\s*retired: true/)
})
