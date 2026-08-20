// THE ONE ONBOARDING DOOR — /join (restructuring v2 stage 4, 2026-08-19).
//
// Run: npx tsx tests/join.test.ts   (also in `npm run check`)
//
// WHAT THIS PINS. Two provider applications (/apply for experts, /apply/master
// for ხელოსანი) became one door that asks „what do you offer" and re-homes the
// person into the wizard that already existed. Every guarantee below is one
// that would break silently: a stray '/apply' link is a 308 the visitor never
// notices until it is a 404; a door that reads only one table offers somebody
// a half they already have; a middleware that drops the query string loses the
// `?can=` that pre-ticks the trades half.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { CAPABILITIES, CAPABILITY_LABEL, parseCapabilities, missingCapability, enableCapabilityHref, showJoinInvite } from '../lib/capabilities'
import { PROVIDER_PATH_PREFIXES, isProviderPath } from '../lib/requests'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const has = (p: string) => existsSync(join(ROOT, p))

/** The file with comments and imports removed — the same discipline as
 *  tests/requests.test.ts: these files quote their own history in prose. */
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

/* ═══════════ 1. the capabilities ═══════════════════════════════════════ */

test('§A two capabilities, and their words are the signup tiles’ words', () => {
  assert.deepEqual([...CAPABILITIES], ['CONSULT', 'WORK'])
  const signup = read('app/signin/_signup.tsx')
  for (const c of CAPABILITIES) {
    assert.ok(CAPABILITY_LABEL[c], `${c} has no label`)
    // The words live on the DOOR now, not on a signup tile: signup stopped
    // asking which kind of provider you are (2026-08-19), because one person can
    // be both. `/join` is where the two capabilities are named and ticked.
    assert.ok(codeOf('lib/capabilities.ts').includes(`'${CAPABILITY_LABEL[c]}'`),
      `${c}'s label is not defined where the door reads it`)
  }
  // `?can=` parsing: case-insensitive, comma-joined, unknown values dropped.
  assert.deepEqual(parseCapabilities('WORK'), ['WORK'])
  assert.deepEqual(parseCapabilities('consult'), ['CONSULT'])
  assert.deepEqual(parseCapabilities('WORK,CONSULT'), ['CONSULT', 'WORK'])
  assert.deepEqual(parseCapabilities(['WORK', 'x']), ['WORK'])
  assert.deepEqual(parseCapabilities('teach'), [])
  assert.deepEqual(parseCapabilities(undefined), [])
})

test('§B capabilitiesOf reads BOTH tables, the way hatsOf does', () => {
  const src = codeOf('lib/capabilities.ts')
  // One round trip, three selects on the User row.
  assert.equal((src.match(/prisma\.user\.findUnique/g) ?? []).length, 1, 'capabilitiesOf is not one query')
  assert.match(src, /tutor: \{ select: \{ id: true \} \}/, 'CONSULT no longer reads TutorProfile')
  assert.match(src, /serviceProfile: \{ select: \{ id: true \} \}/, 'WORK no longer reads ServiceProfile')
  assert.match(src, /requestAccess: \{ select: \{ active: true \} \}/, 'WORK no longer reads the allowlist')
  // …and the two rules: the profile for CONSULT; profile AND active access for WORK.
  assert.match(src, /if \(u\.tutor\) out\.push\('CONSULT'\)/)
  assert.match(src, /if \(u\.serviceProfile && u\.requestAccess\?\.active === true\) out\.push\('WORK'\)/,
    'a ServiceProfile without an active RequestAccess must NOT count as WORK — that is somebody never let in')
  // The same reads lib/hats makes, so the two answers cannot drift.
  const hats = codeOf('lib/hats.ts')
  for (const sel of ['tutor: { select: { id: true } }', 'serviceProfile: { select: { id: true } }']) {
    assert.ok(hats.includes(sel), `lib/hats no longer selects ${sel} — capabilitiesOf mirrors it`)
  }
})

test('§C /api/me carries capabilities beside hats, and lib/me types it', () => {
  const me = codeOf('app/api/me/route.ts')
  assert.match(me, /hats: await hatsOf\(user\.id\)/)
  assert.match(me, /capabilities: await capabilitiesOf\(user\.id\)/, '/api/me stopped exposing capabilities')
  const lib = read('lib/me.ts')
  assert.match(lib, /capabilities\?: \('CONSULT' \| 'WORK'\)\[\]/, 'the Me type lost `capabilities`')
  assert.match(lib, /capabilities: d\.capabilities \?\? \[\]/, 'fetchMe drops `capabilities` on the floor')
})

/* ═══════════ 2. the door ═══════════════════════════════════════════════ */

test('§D /join exists and /apply does not', () => {
  for (const f of [
    'app/join/page.tsx', 'app/join/JoinClient.tsx',
    'app/join/_expert/ApplyClient.tsx', 'app/join/_expert/ApplyMarketing.tsx', 'app/join/_expert/_draft.tsx',
    'app/join/_expert/_form.tsx', 'app/join/_expert/_steps.tsx', 'app/join/_expert/_upload.tsx',
    'app/join/_expert/applyFunnelEvents.ts',
    'app/join/_master/client.tsx', 'app/join/_master/_marketing.tsx', 'app/join/_master/_workPhotos.tsx',
  ]) assert.ok(has(f), `${f} is missing`)
  assert.equal(has('app/apply'), false, 'app/apply is back — the old routes must 308 to /join, not render')
  // Two private folders, so neither wizard is a route of its own.
  assert.equal(has('app/join/_expert/page.tsx'), false)
  assert.equal(has('app/join/_master/page.tsx'), false)
})

test('§E the page: guest → pitch, admin → /admin, and the WORK half is gated INSIDE it', () => {
  const page = codeOf('app/join/page.tsx')
  assert.match(page, /if \(!user\) return wantsWorkOnly\(can\) \? <MasterApplyMarketing \/> : <ApplyMarketing \/>/,
    'a guest no longer gets the crawlable pitch')
  assert.match(page, /if \(user\.role === ROLE\.ADMIN\) redirect\('\/admin'\)/)
  // The supply switch gates the WORK half here — the page itself must never 404
  // with it, because the expert half lives behind the same URL.
  assert.match(page, /if \(providersOn\(\) && !have\.includes\('WORK'\)\) offer\.push\('WORK'\)/,
    'the WORK half is no longer gated on providersOn()')
  assert.doesNotMatch(page, /notFound\(\)/, '/join 404s — that takes the expert half down with the trades half')
  assert.equal(isProviderPath('/join'), false, '/join is inside PROVIDER_PATH_PREFIXES — the middleware would 404 the expert door')
  assert.equal(isProviderPath('/apply/master'), false, 'the retired /apply/master prefix is still listed')
  assert.ok(!(PROVIDER_PATH_PREFIXES as readonly string[]).some(p => p.startsWith('/apply') || p.startsWith('/join')))
  // Both halves are offered only when still missing — reads capabilitiesOf.
  assert.match(page, /const have = await capabilitiesOf\(user\.id\)/)
  assert.match(page, /if \(user\.role !== ROLE\.EXPERT && !have\.includes\('CONSULT'\)\) offer\.push\('CONSULT'\)/)
  // The provider workspace is named through the subsystem's constant, never a literal.
  assert.doesNotMatch(read('app/join/page.tsx'), /["'`]\/provider/)
  assert.match(page, /PROVIDER_ROUTE/)
})

test('§F the door: shared picker + two tiles, nothing ticked cannot continue, choice persists', () => {
  const door = codeOf('app/join/JoinClient.tsx')
  assert.match(door, /<ProfessionPicker/, 'the door grew its own profession control instead of the shared one')
  assert.match(door, /useSpheres\(\)/, 'the door fetches spheres its own way — one fetch shape, one fallback')
  assert.match(door, /role="checkbox"/)
  assert.match(door, /aria-checked=\{on\}/)
  assert.match(door, /disabled=\{picked\.length === 0\}/, 'a person who ticks nothing can continue')
  assert.match(door, /'mcodne:join'/, 'the choice is not persisted')
  assert.match(read('lib/signout.ts'), /'mcodne:join'/, 'sign-out leaves the door choice for the next person on a shared device')
  // Which wizard opens: CONSULT first when both, the master form when WORK alone.
  assert.match(door, /setStage\(consult \? 'expert' : 'master'\)/)
  // The expert wizard is seeded from the door and offered the master hand-off.
  assert.match(door, /seed=\{seed\}/)
  assert.match(door, /onContinueMaster=\{work \? \(\) => setStage\('master'\) : undefined\}/)
  const expert = codeOf('app/join/_expert/ApplyClient.tsx')
  assert.match(expert, /გააგრძელე ხელოსნის ნაწილით/, 'the expert success screen lost the hand-off to the master form')
  assert.match(expert, /onContinueMaster \? \(/)
  // The `?can=` pre-tick, narrowed to what is actually offered.
  assert.match(codeOf('app/join/page.tsx'), /preset=\{can\.filter\(c => offer\.includes\(c\)\)\}/)
  assert.match(door, /useState<Capability\[\]>\(preset\)/)
})

/* ═══════════ 3. the redirects ══════════════════════════════════════════ */

test('§G the middleware 308s /apply, /apply/master and /apply/* onto /join, query kept', () => {
  const mw = codeOf('middleware.ts')
  const block = mw.slice(mw.indexOf("req.nextUrl.pathname === '/apply'"), mw.indexOf('isRequestPath('))
  assert.ok(block.length > 0, 'the /apply block is gone from the middleware')
  assert.match(block, /req\.nextUrl\.pathname === '\/apply' \|\| req\.nextUrl\.pathname\.startsWith\('\/apply\/'\)/)
  assert.match(block, /url\.pathname = '\/join'/)
  assert.match(block, /wasMaster = req\.nextUrl\.pathname === '\/apply\/master' \|\| req\.nextUrl\.pathname\.startsWith\('\/apply\/master\/'\)/)
  assert.match(block, /if \(wasMaster && !url\.searchParams\.has\('can'\)\) url\.searchParams\.set\('can', 'WORK'\)/)
  assert.match(block, /NextResponse\.redirect\(url, 308\)/, 'must be permanent AND method-preserving, like the /ask block')
  // The query string is preserved: the block clones the URL and never blanks `search`.
  assert.doesNotMatch(block, /url\.search = ''/)
  // It sits with the other 308s, BEFORE the requests gate — so tests/requests’
  // „no redirect inside the gate block" pin still holds.
  assert.ok(mw.indexOf("pathname === '/apply'") < mw.indexOf('isRequestPath('), 'the /apply redirect moved below the requests gate')
})

test('§H no live link to /apply remains anywhere in app, components or lib', () => {
  const offenders: string[] = []
  for (const f of sourceFiles()) {
    const rel = relative(ROOT, f)
    codeOf(rel).split('\n').forEach((line, i) => {
      // A quoted or query-encoded '/apply' — a link target, not the word.
      if (/["'`]\/apply(?![a-zA-Z_.-])/.test(line) || /%2Fapply/i.test(line) || /=\/apply(?![a-zA-Z_.-])/.test(line)) {
        offenders.push(`      ${rel}:${i + 1}  ${line.trim()}`)
      }
    })
  }
  assert.equal(offenders.length, 0, `something still points at the retired /apply routes:\n${offenders.join('\n')}`)
  // …and the sitemap/robots name the new door, not the old one.
  assert.match(read('app/sitemap.ts'), /path: '\/join'/)
  assert.doesNotMatch(codeOf('app/sitemap.ts'), /path: '\/apply'/)
  assert.match(read('app/robots.ts'), /'\/join'/)
})

/* ═══════════ 4. the hand-offs ══════════════════════════════════════════ */

test('§I signup hands off to /join, and reads the half back from `?can=`', () => {
  const signup = codeOf('app/signin/_signup.tsx')
  // The provider tile hands off WITHOUT a `?can=`: the door asks which halves,
  // and pre-ticking one here would answer a question the person has not seen.
  // („serve" survives only for somebody arriving on an existing ?can=WORK link.)
  assert.match(signup, /const dest = kind === 'serve' \? '\/join\?can=WORK' : '\/join'/,
    'the two signup tiles no longer hand off to the door with their half pre-ticked')
  assert.match(signup, /const joinIntent = !bookingIntent && redirect\.startsWith\('\/join'\)/)
  assert.match(signup, /const masterIntent = joinIntent && \/\[\?&\]can=WORK\\b\/\.test\(redirect\)/,
    'a plumber arriving from the trades pitch is read as an EXPERT again')
  assert.match(signup, /const applyIntent = joinIntent && !masterIntent/)
  // ⚠️ TWO TILES. „ვარ ექსპერტი" + „ვარ ხელოსანი" split one person into two
  // kinds at the door; the model says one provider with capabilities.
  assert.doesNotMatch(signup, /ვარ ხელოსანი/, 'the signup page forks by provider type again')
  assert.match(signup, /SIGNUP_TILES = \[[\s\S]{0,300}?\]/)
  assert.doesNotMatch(signup, /startsWith\('\/apply/)
  assert.match(codeOf('app/signin/_signin.tsx'), /redirect\.startsWith\('\/join'\)/)
  // The two pitches carry the person back to the right half after the account exists.
  assert.match(codeOf('app/join/_expert/ApplyMarketing.tsx'), /'\/signup\?redirect=%2Fjoin'/)
  assert.match(codeOf('app/join/_master/_marketing.tsx'), /'\/signup\?redirect=%2Fjoin%3Fcan%3DWORK'/)
  // Sign-in of a pending applicant lands on the door with their half ticked.
  const auth = codeOf('lib/auth.ts')
  assert.match(auth, /return '\/join\?can=CONSULT'/)
  assert.match(auth, /return '\/join\?can=WORK'/)
  // The notifications and mails that say „open your application" open the door.
  for (const f of ['app/api/applications/[id]/route.ts']) assert.match(codeOf(f), /href: '\/join\?can=CONSULT'/, `${f}`)
  for (const f of ['app/api/master-applications/route.ts', 'app/api/master-applications/[id]/route.ts']) {
    assert.match(codeOf(f), /href: '\/join\?can=WORK'/, `${f}`)
  }
  assert.match(codeOf('lib/emailTemplates.ts'), /\/join\?can=WORK/)
})

/* ═════ §J the other half is REACHABLE, not just implemented ═══════════════ */
test('§J a provider who holds one capability is offered the other one', () => {
  // The gap this closes: /join has always served the missing half, but every
  // link to it is gated by showApplyCta („no role, or a client"), so the one
  // group who would use the switch — people who are already providers — could
  // reach it only by typing the URL.
  assert.equal(missingCapability(['CONSULT']), 'WORK')
  assert.equal(missingCapability(['WORK']), 'CONSULT')
  assert.equal(missingCapability(['CONSULT', 'WORK']), null, 'somebody with both must not be invited again')
  assert.equal(missingCapability([]), null, 'a plain client belongs to the ordinary join door')
  assert.equal(missingCapability(undefined), null)
  assert.equal(enableCapabilityHref('WORK'), '/join?can=WORK')
  assert.equal(enableCapabilityHref('CONSULT'), '/join?can=CONSULT')

  // …and it is rendered where every space and every screen size can see it.
  const menu = codeOf('components/UserMenu.tsx')
  assert.match(menu, /missingCapability\(me\?\.capabilities\)/,
    'the user menu stopped deriving the switch from the capabilities it already fetches')
  assert.match(menu, /enableCapabilityHref\(missing\)/)
  assert.doesNotMatch(menu, /showApplyCta\(role\) *\|\| *missing/,
    'the switch must NOT be behind showApplyCta — that gate is exactly what hid it')
})

/* ═════ §K who sees which door ════════════════════════════════════════════ */
test('§K the invitation is for people who offer nothing; a provider gets the switch', () => {
  // The bug this closes: every „გახდი ექსპერტი" surface asked the ROLE, and an
  // approved master keeps role CLIENT — so a provider was invited to become
  // one, in the wrong words, right next to the switch that says the right ones.
  assert.equal(showJoinInvite(null, []), true, 'a guest is the audience for the invitation')
  assert.equal(showJoinInvite('STUDENT', []), true, 'a plain client too')
  assert.equal(showJoinInvite('STUDENT', ['WORK']), false, 'a master must not be told to become an expert')
  assert.equal(showJoinInvite('TUTOR', ['CONSULT']), false)
  assert.equal(showJoinInvite('STUDENT', ['CONSULT', 'WORK']), false)
  assert.equal(showJoinInvite('ADMIN', []), false, 'an admin is nobody’s applicant')
  // The two answers never overlap: nobody may see the invitation AND the switch.
  for (const caps of [[], ['CONSULT'], ['WORK'], ['CONSULT', 'WORK']] as const) {
    const invite = showJoinInvite('STUDENT', caps as any)
    const swtch = missingCapability(caps as any) !== null
    assert.ok(!(invite && swtch), `both doors shown at once for ${JSON.stringify(caps)}`)
  }
  // …and every surface asks capabilities, not the role.
  for (const f of ['components/ApplyCtaGate.tsx', 'components/UserMenu.tsx', 'components/PublicTopBar.tsx', 'components/HelpWidget.tsx', 'app/contact/ContactClient.tsx']) {
    assert.match(codeOf(f), /showJoinInvite\(/, `${f} still gates the join door on the role`)
    assert.doesNotMatch(codeOf(f), /showApplyCta\(/, `${f} still calls the role-based gate`)
  }
})
