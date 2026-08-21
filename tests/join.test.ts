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
  assert.match(src, /requestAccess:\s+\{\s+select:\s+\{\s+active:\s+true\s+\}\s+\}/, 'WORK no longer reads the allowlist')
  // …and the two rules: the profile for CONSULT; profile AND active access for WORK.
  assert.match(src, /if \(u\.tutor\) out\.push\('CONSULT'\)/)
  assert.match(src, /if\s+\(u\.serviceProfile\s+&&\s+u\.requestAccess\?\.active\s+===\s+true\)\s+out\.push\('WORK'\)/,
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
  assert.match(me, /capabilities:\s+await\s+capabilitiesOf\(user\.id\)/, '/api/me stopped exposing capabilities')
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
  // ⚠️ THREE GUEST VIEWS SINCE 2026-08-20, and the BARE one is the door. The
  // two pitches each speak to one half and stay crawlable on `?can=`; the
  // address every link on the site points at asks the question instead of
  // putting the sign-up wall in front of it.
  assert.match(page, /if\s+\(wantsWorkOnly\(can\)\)\s+return\s+<MasterApplyMarketing\s+\/>/, 'the trades pitch is gone')
  assert.match(page, /if\s+\(wantsConsultOnly\(can\)\)\s+return\s+<ApplyMarketing\s+\/>/, 'the consultation pitch is gone')
  assert.match(page, /return <PublicDoor preset=\{can\} \/>/,
    'the bare address stopped being the door — a guest is behind the wall again')
  assert.match(page, /if\s+\(user\.role\s+===\s+ROLE\.ADMIN\)\s+redirect\('\/admin'\)/)
  // The supply switch gates the WORK half here — the page itself must never 404
  // with it, because the expert half lives behind the same URL.
  assert.match(page, /if\s+\(providersOn\(\)\s+&&\s+!have\.includes\('WORK'\)\)\s+offer\.push\('WORK'\)/,
    'the WORK half is no longer gated on providersOn()')
  assert.doesNotMatch(page, /notFound\(\)/, '/join 404s — that takes the expert half down with the trades half')
  assert.equal(isProviderPath('/join'), false, '/join is inside PROVIDER_PATH_PREFIXES — the middleware would 404 the expert door')
  assert.equal(isProviderPath('/apply/master'), false, 'the retired /apply/master prefix is still listed')
  assert.ok(!(PROVIDER_PATH_PREFIXES as readonly string[]).some(p => p.startsWith('/apply') || p.startsWith('/join')))
  // Both halves are offered only when still missing — reads capabilitiesOf.
  assert.match(page, /const have = await capabilitiesOf\(user\.id\)/)
  assert.match(page, /if\s+\(user\.role\s+!==\s+ROLE\.EXPERT\s+&&\s+!have\.includes\('CONSULT'\)\)\s+offer\.push\('CONSULT'\)/)
  // The provider workspace is never named by a LITERAL — that is the half of
  // this rule that protects something: a hardcoded '/provider' survives the
  // route moving and 404s somebody who just finished applying.
  assert.doesNotMatch(read('app/join/page.tsx'), /["'`]\/provider/)
  // ⚠️ THE MATCH ON `PROVIDER_ROUTE` WAS DROPPED (2026-08-21). It required the
  // page to MENTION the constant, and the page has nothing left to say with it:
  // when there is no half left to offer, every hat now goes to /work — one home
  // for both capabilities — instead of branching to the provider queue. The
  // constant is unused here because the branch is gone, which is the change
  // succeeding, not the rule breaking. What the rule was really guarding is the
  // line above.
})

test('§F the door: one question, the capability derived, the choice persists', () => {
  // ⚠️ TWO FILES SINCE 2026-08-20. The question moved into the leaf both doors
  // import (`_door/DoorQuestion`) so that a GUEST can answer it before the
  // wall; `JoinClient` kept what only a signed-in door can do — which wizard
  // opens, and the hand-off. The rules below are the door's, wherever the door
  // now keeps them.
  const door = codeOf('app/join/JoinClient.tsx') + codeOf('app/join/_door/DoorQuestion.tsx')
  assert.match(door, /<ProfessionPicker/, 'the door grew its own profession control instead of the shared one')
  assert.match(door, /useSpheres\(\)/, 'the door fetches spheres its own way — one fetch shape, one fallback')
  // ⚠️ THE TWO CAPABILITY TILES WERE REMOVED ON 2026-08-20 and the checkbox
  // assertions went with them (tests/joinDoor pins their absence). What a
  // person can sell follows from WHAT THEY DO — see `picked` in the door.
  assert.match(door, /const picked = useMemo<Capability\[\]>/, 'the capability is state again instead of a consequence')
  assert.match(door, /professionCan\(job\)/, 'the capability is no longer read from the profession table')
  assert.match(door, /disabled=\{picked\.length === 0\}/, 'a person who has answered nothing can continue')
  assert.match(door, /'mcodne:join'/, 'the choice is not persisted')
  assert.match(read('lib/signout.ts'), /'mcodne:join'/, 'sign-out leaves the door choice for the next person on a shared device')
  // Which wizard opens: the SERVICE form when they can do both (CLAUDE.md
  // rule 4), the expert wizard only when consulting is all they can do.
  assert.match(door, /setStage\(work \? 'master' : 'expert'\)/)
  // The expert wizard is seeded from the door and offered the master hand-off.
  assert.match(door, /seed=\{seed\}/)
  // ⚠️ PINNED AS A PROPERTY, NOT AS AN EXPRESSION (2026-08-20). This asserted
  // the literal `work ? () => setStage('master') : undefined` and broke the
  // moment the hand-off got smarter — it now also remembers which half has
  // already been FILED, so somebody who finished the expert form is not offered
  // it again. The rule that must hold is the rule, not the ternary that
  // happened to express it: the second form is offered when, and only when,
  // this applicant picked WORK.
  assert.match(door, /onContinueMaster=\{work/,
    'the expert wizard is no longer handed the WORK follow-up')
  assert.match(door, /setStage\('master'\)/,
    'the hand-off no longer moves the door to the master form')
  assert.match(door, /: undefined/,
    'the hand-off must be undefined when it does not apply — never a no-op function, which still draws the button')
  const expert = codeOf('app/join/_expert/ApplyClient.tsx')
  assert.match(expert, /გააგრძელე სერვისის ნაწილით/, 'the expert success screen lost the hand-off to the master form')
  assert.match(expert, /onContinueMaster \? \(/)
  /* ⚠️ `?can=` SEEDS THE DERIVATION, IT DOES NOT OVERRIDE IT (2026-08-20), and
   * the version this replaced was a shipped bug rather than a preference. The
   * header (desktop AND drawer) and the footer all pointed at
   * `/join?can=CONSULT`, and `picked` short-circuited on a preset — so a
   * სანტექნიკოსი who arrived by clicking the site's own navigation picked
   * „სანტექნიკოსი" in the control directly above the button, was told „შენს
   * პროფესიაზე კონსულტაციებს ჩაატარებ", and was dropped into the consultation
   * wizard with the service half unreachable. The derivation — the reason the
   * door exists — was dead for everybody who did not type the address by hand.
   *
   * A preset is now the answer only while there is no answer of their own. */
  assert.match(codeOf('app/join/page.tsx'), /preset=\{can\.filter\(c => offer\.includes\(c\)\)\}/)
  assert.doesNotMatch(door, /if \(preset\.length > 0\) return preset/,
    'a link that names a half beats the profession the applicant just picked')
  assert.match(door, /if\s+\(derived\.size\s+===\s+0\)\s+for\s+\(const\s+c\s+of\s+preset\)\s+derived\.add\(c\)/,
    'the preset stopped seeding — a `?can=` link now says nothing at all')
})
/* ═══════════ 3. the redirects ══════════════════════════════════════════ */

test('§G the middleware 308s /apply, /apply/master and /apply/* onto /join, query kept', () => {
  const mw = codeOf('middleware.ts')
  const block = mw.slice(mw.indexOf("req.nextUrl.pathname === '/apply'"), mw.indexOf('isRequestPath('))
  assert.ok(block.length > 0, 'the /apply block is gone from the middleware')
  assert.match(block, /req\.nextUrl\.pathname\s+===\s+'\/apply'\s+\|\|\s+req\.nextUrl\.pathname\.startsWith\('\/apply\/'\)/)
  assert.match(block, /url\.pathname = '\/join'/)
  assert.match(block, /wasMaster\s+=\s+req\.nextUrl\.pathname\s+===\s+'\/apply\/master'\s+\|\|\s+req\.nextUrl\.pathname\.startsWith\('\/apply\/master\/'\)/)
  assert.match(block, /if\s+\(wasMaster\s+&&\s+!url\.searchParams\.has\('can'\)\)\s+url\.searchParams\.set\('can',\s+'WORK'\)/)
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
  assert.match(signup, /const\s+joinIntent\s+=\s+!bookingIntent\s+&&\s+redirect\.startsWith\('\/join'\)/)
  assert.match(signup, /const\s+masterIntent\s+=\s+joinIntent\s+&&\s+\/\[\?&\]can=WORK\\b\/\.test\(redirect\)/,
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

  // ⚠️ IT MOVED OUT OF THE USER MENU ON 2026-08-21, and the reason is the
  // product model rather than a layout preference. The menu carried a permanent
  // „ჩართე სერვისები" row, and all 29 providers hold exactly ONE capability —
  // so every one of them was invited to switch on something they had already
  // been selling, when a consultation IS a service (CLAUDE.md rule 2). Owner:
  // „როცა უკვე სერვისი მაქვს არ გვინდა… პროფილში უნდა იყოს რედაქტირება."
  //
  // The switch is not gone; it is asked at the only moment it makes sense —
  // after what you already sell, at the bottom of /work/services. What the menu
  // owes a provider now is the way IN to that page.
  const services = codeOf('app/work/services/page.tsx')
  assert.match(services, /missingCapability\(caps\)/,
    'the services page stopped deriving the other half from the capabilities it already fetched')
  assert.match(services, /enableCapabilityHref\(missing\)/,
    'the invitation no longer links anywhere')

  const menu = codeOf('components/UserMenu.tsx')
  assert.doesNotMatch(menu, /CAPABILITY_ENABLE_LABEL/,
    'the „ჩართე…" row is back in the menu — it nags every provider who already sells something')
  assert.match(menu, /'\/work\/services'/,
    'the menu must still carry a provider to what they sell — that is what replaced the switch')
  assert.doesNotMatch(menu, /showApplyCta\(role\) *\|\| *missing/,
    'the old gate is back — it is exactly what hid the door in the first place')
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
