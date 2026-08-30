/*
 * The retired addresses, executed (stage 9, restructuring v2 §9, 2026-08-19).
 *
 * Run: npx tsx --test tests/redirects.test.ts   (also in `npm test`)
 *
 * Every URL the site once answered and no longer does is 308ed by the real
 * middleware — not by a copy of its regexes. This file runs `middleware()`
 * against `NextRequest` objects (the way tests/taxonomy.test.ts §F does) for
 * EVERY retired prefix and pins the exact target, then pins that the live
 * addresses next to them are NOT touched (a segment boundary is the whole
 * difference between /tutor → /work and /tutors staying put), and that the
 * sitemap advertises only final URLs.
 *
 * The other test files each pin their own block (spaces, expertsRoute,
 * taxonomy §F, archetypes for /ask); this is the one table that reads them
 * all at once, so a future „tidy" of the middleware order or a new prefix
 * that shadows an old one shows up in one place.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { middleware } from '../middleware'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
/** Source with comments removed — a negative assertion must not be satisfied
 *  (or failed) by a comment that merely mentions the old address. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
const codeOf = (p: string) => strip(read(p))

const ORIGIN = 'https://mcodne.ge'
const hit = (path: string) => middleware(new NextRequest(`${ORIGIN}${path}`))
const where = (path: string) => {
  const r = hit(path)
  return { status: r.status, to: r.headers.get('location') }
}
const redirected = (from: string, to: string) =>
  assert.deepEqual(where(from), { status: 308, to: `${ORIGIN}${to}` }, `${from} → ${to}`)
const untouched = (path: string) => {
  const r = hit(path)
  assert.equal(r.status, 200, `${path} was redirected/blocked (${r.status} → ${r.headers.get('location')})`)
  assert.equal(r.headers.get('location'), null, `${path} carries a location header`)
}

/* ═══════════ the table ═══════════════════════════════════════════════ */

const TABLE: [from: string, to: string][] = [
  // /apply → /join, the trades half pre-ticked, everything else the door itself
  ['/apply',                    '/join'],
  ['/apply/master',             '/join?can=WORK'],
  ['/apply/master/x',           '/join?can=WORK'],
  ['/apply/x',                  '/join'],
  ['/apply?redirect=%2Fme',     '/join?redirect=%2Fme'],
  // /ask → the catalogue's own search; ?cat= is the same slug as ?category=
  ['/ask',                      '/experts'],
  ['/ask?q=a&cat=b',            '/experts?q=a&category=b'],
  ['/ask?q=a',                  '/experts?q=a'],
  ['/ask/x',                    '/experts'],
  // THE CATALOGUE MOVED TO /experts (stage 10, 2026-08-19). „tutors" is a
  // banned word in this project's lexicon and may not sit in a URL; the trades
  // catalogue and the trades DOOR are gone into the same one list.
  ['/tutors',                   '/experts'],
  ['/tutors?category=x',        '/experts?category=x'],
  ['/tutors?q=a',               '/experts?q=a'],
  // …and the profile segment still moves segment-for-segment.
  ['/tutors/ana',               '/experts/ana'],
  ['/tutors/ana?intent=message','/experts/ana?intent=message'],
  ['/tutors/clx1234567890',     '/experts/clx1234567890'],
  // /masters kept its two parameters — they mean the same thing on the merged
  // list (lib/catalogItems → parseTrades/parseCities).
  ['/masters',                  '/experts'],
  ['/masters?trade=plumb&city=tbilisi', '/experts?trade=plumb&city=tbilisi'],
  ['/masters/x',                '/experts'],
  // ⚠️ THE WHOLE /services PREFIX (stage 11, 2026-08-19). The DOOR goes to the
  // catalogue; its CHILDREN keep their segment, because a provider profile and
  // a trade landing answer at /experts/<same> now — one namespace, one provider
  // (CLAUDE.md → THE PRODUCT MODEL). Sending a child to the bare catalogue
  // would throw away the segment every shared link and every crawler carries.
  ['/services',                 '/experts'],
  ['/services?utm_source=x',    '/experts?utm_source=x'],
  ['/services/nino-a1b2',       '/experts/nino-a1b2'],
  ['/services/nino-a1b2?utm_source=x', '/experts/nino-a1b2?utm_source=x'],
  ['/services/santeqnika',      '/experts/santeqnika'],
  ['/services/clx1234567890',   '/experts/clx1234567890'],
  ['/services/',                '/experts/'],
  // the two spaces
  ['/student',                  '/me'],
  ['/student/x',                '/me/x'],
  ['/student/bookings/1?review=1', '/me/bookings/1?review=1'],
  ['/tutor',                    '/work'],
  ['/tutor/x',                  '/work/x'],
  ['/tutor/schedule?tab=week',  '/work/schedule?tab=week'],
  ['/provider',                 '/work/requests'],
  ['/provider/x',               '/work/x'],
  ['/provider/offers/1',        '/work/offers/1'],
  // the profession landings moved into the expert address space
  ['/konsultacia',              '/experts'],
  ['/konsultacia/x',            '/experts/x'],
  ['/konsultacia/iuristi?utm_source=x', '/experts/iuristi?utm_source=x'],
  // the sphere pages became the catalogue's filter
  ['/categories',               '/experts'],
  ['/categories/tax',           '/experts?category=tax'],
  ['/categories/business/finance', '/experts?category=finance'],
]

test('every retired URL 308s to its exact final address', () => {
  for (const [from, to] of TABLE) redirected(from, to)
})

test('a redirect is one hop: no target in the table is itself redirected', () => {
  for (const [, to] of TABLE) {
    const r = hit(to)
    assert.notEqual(r.status, 308, `${to} is redirected again (→ ${r.headers.get('location')}) — a retired URL must land in one hop`)
  }
})

test('the live addresses beside them are not touched (segment boundaries hold)', () => {
  for (const p of [
    '/api/tutor/x', '/api/student/x', '/api/tutors', '/api/tutors/stats',
    '/api/masters/x/photo',
    '/join', '/join?can=WORK', '/me', '/me/x', '/work', '/work/x',
    '/experts', '/experts/x', '/experts?type=WORK',
    // ⚠️ THE FOUR PAGES THAT NOW SHARE ONE SEGMENT (stage 11): the profession
    // landing, the trade landing, the expert profile and the provider profile.
    // /services/<x> used to be in THIS list — it moved into the table above.
    '/experts/iuristi', '/experts/santeqnika', '/experts/nino-a1b2?utm_source=x',
    // starts-with-the-letters is not the prefix
    '/tutorsx', '/mastersx', '/servicesx', '/studentx', '/applyx', '/askx',
    '/konsultaciax', '/categoriesx', '/providers',
  ]) untouched(p)
})

test('www → apex is the only host redirect, and it keeps path and query', () => {
  const r = middleware(new NextRequest('https://www.mcodne.ge/experts?q=a', { headers: { host: 'www.mcodne.ge' } }))
  assert.equal(r.status, 308)
  assert.equal(r.headers.get('location'), 'https://mcodne.ge/experts?q=a')
})

/* ═══════════ the sitemap lists only final URLs ═══════════════════════ */

test('the sitemap names no retired prefix and lists one catalogue', () => {
  const src = codeOf('app/sitemap.ts')
  for (const retired of ['/categories', '/konsultacia', '/apply', '/ask', '/student', '/tutor', '/provider', '/masters', '/services']) {
    assert.doesNotMatch(src, new RegExp(`['"\`]${retired.replace(/[/]/g, '\\/')}`), `sitemap still names ${retired}`)
  }
  // ⚠️ /services JOINED THE LIST ABOVE IN STAGE 11 — the door AND every child
  // 308 now, so the sitemap must not name the prefix at all (comments stripped;
  // prose is allowed to remember where a page used to live).
  assert.doesNotMatch(src, new RegExp("['\"`]/services"), 'sitemap still names /services')
  // ⚠️ THE ID FALLBACK IS GONE AND THIS PIN CHANGED WITH IT (2026-08-26). It
  // used to require `${t.slug || t.id}`, which is the opposite of what this
  // file is for: a profile with no slug has no page (ProviderRow.slug — „Null
  // = no page yet", the card is not a link), so the id URL advertised an
  // address nobody could reach. The behaviour is executed in
  // tests/sitemap.test.ts; what stays here is that no id fallback comes back.
  assert.match(src, /url:\s+`\$\{SITE_URL\}\/experts\/\$\{p\.slug\}`/)
  assert.doesNotMatch(src, /\|\|\s+\w+\.id\}`/, 'sitemap fell back to an id URL again')
  // The static list is exactly the final public doors — ONE catalogue entry.
  for (const p of ['/', '/experts', '/join', '/about', '/blog', '/contact', '/help']) {
    assert.match(src, new RegExp(`path: '${p.replace(/[/]/g, '\\/')}'`), `sitemap does not list ${p}`)
  }
  assert.equal((src.match(/path: '\/experts'/g) ?? []).length, 1,
    'the catalogue is listed more than once — three pages became one, and so must the entry')
  // The dynamic blocks — ONE namespace since stage 11: expert profiles,
  // provider profiles, profession landings and trade landings, all under
  // /experts/, plus the posts.
  // ⚠️ ONE PROVIDER BLOCK SINCE 2026-08-26, so `${p.slug}` now covers BOTH the
  // profession landings and the profiles — there were two blocks over the same
  // table and the second one submitted every provider a second time.
  assert.equal((src.match(/url: `\$\{SITE_URL\}\/experts\/\$\{p\.slug\}`/g) ?? []).length, 2,
    'expected exactly two /experts/<slug> builders — the providers and the profession landings')
  assert.doesNotMatch(src, /\$\{m\.slug\}/, 'the second provider block came back — every profile would be listed twice')
  assert.match(src, /url: `\$\{SITE_URL\}\/experts\/\$\{g\.id\}`/, 'no /experts/<trade> entries')
  assert.match(src, />= TRADE_LANDING_MIN/, 'trade landings are no longer counted at the bar')
  assert.match(src, /url: `\$\{SITE_URL\}\/blog\/\$\{p\.slug\}`/, 'no blog entries')
  // …and nothing that is a workspace or the intake.
  assert.doesNotMatch(src, /path: '\/(request|me|work|admin|signin|signup)/)
})
