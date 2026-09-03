// THE ONE ONBOARDING DOOR — /join.
//
// Run: npx tsx tests/join.test.ts   (also in `npm run check`)
//
// WHAT THIS PINS. Two provider applications (/apply for experts, /apply/master
// for trades) became one door that asks „what do you do" and opens the form.
//
// ⚠️ AND ON 2026-08-24 IT BECAME ONE FORM AS WELL. Half of this file used to be
// about the two CAPABILITIES — their labels, `?can=` parsing, which wizard
// opened, the switch that offered the missing half, and the rule that the
// invitation and the switch may never be shown at once. The consultation
// product was removed; there is one thing to register, so all of it is gone
// rather than adapted. What survives is what still protects something: a stray
// '/apply' link is a 308 the visitor never notices until it is a 404, and an
// invitation shown to somebody who already sells is the bug §D pins.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { showJoinInvite } from '../lib/capabilities'
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

/* ═══════════ 1. the identity ═══════════════════════════════════════════ */

test('§A the supply side is decided in ONE place, from one row', () => {
  // ⚠️ THE READ MOVED TO lib/identity ON 2026-08-21 because `capabilitiesOf`
  // and `hatsOf` were deciding the SAME facts in two queries on the same
  // request. „So the two answers cannot drift" is a guarantee better kept by
  // there being one answer — and since 2026-08-24 there is one FACT behind it
  // too, because there is one profile table.
  const src = codeOf('lib/identity.ts')
  assert.equal((src.match(/prisma\.user\.findUnique/g) ?? []).length, 1, 'the identity is no longer one query')
  assert.match(src, /serviceProfile: \{ select: \{ id: true \} \}/, 'the provider fact no longer reads ServiceProfile')
  assert.match(src, /requestAccess:\s*\{\s*select:\s*\{\s*active:\s*true\s*\}\s*\}/, 'it no longer reads the allowlist')
  assert.match(
    src, /const provider = !!u\.serviceProfile && u\.requestAccess\?\.active === true/,
    'a ServiceProfile without an active RequestAccess must NOT count — that is somebody never let in',
  )
  assert.match(src, /if \(provider\) hats\.push\('PROVIDER'\)/, 'the hat is derived from something else')
  // The entry points survive for their callers, delegating rather than deciding.
  assert.match(codeOf('lib/capabilities.ts'), /identityOf\(userId\)\)\.provider/, 'isProvider decides for itself again')
  assert.match(codeOf('lib/hats.ts'), /identityOf\(userId\)\)\.hats/, 'hatsOf decides for itself again')
})

test('§B /api/me carries the one fact beside the hats, and lib/me types it', () => {
  const me = codeOf('app/api/me/route.ts')
  // One read, both vocabularies off it (lib/identity) — this route is hit on
  // nearly every page load and used to make two overlapping queries.
  assert.equal((me.match(/identityOf\(user\.id\)/g) ?? []).length, 1, '/api/me reads the identity twice again')
  assert.match(me, /hats: identity\.hats/)
  assert.match(me, /provider: identity\.provider/, '/api/me stopped saying whether this person sells anything')
  const lib = read('lib/me.ts')
  assert.match(lib, /provider\?: boolean/, 'the Me type lost `provider`')
  assert.match(lib, /provider: d\.provider === true/, 'fetchMe drops `provider` on the floor')
})

/* ═══════════ 2. the door ═══════════════════════════════════════════════ */

test('§C /join exists, /apply does not, and there is ONE form behind it', () => {
  for (const f of [
    'app/join/page.tsx', 'app/join/JoinClient.tsx',
    /* ⚠️ `GuestDoor.tsx` LEFT THIS LIST WITH THE FILE (2026-09-02). It was the
       signed-out „answer first, register second" screen; nothing has rendered
       it since /join became one page on both sides of the wall, and a file
       nobody imports is what CLAUDE.md calls a control that lies. Its argument
       is preserved in full in `_door/PublicDoor.tsx`, which is where the
       decision to undo it is recorded — so the reasoning survives and the dead
       code does not. `DoorQuestion` STAYS: JoinClient really imports it. */
    'app/join/_door/DoorQuestion.tsx', 'app/join/_door/PublicDoor.tsx',
    'app/join/_provider/client.tsx', 'app/join/_provider/_workPhotos.tsx',
    // Shared with /work/profile since the consultation wizard was deleted and
    // took the uploader and the sphere list with it.
    'app/join/_shared/_upload.tsx', 'app/join/_shared/useCategories.ts',
  ]) assert.ok(has(f), `${f} is missing`)
  assert.equal(has('app/apply'), false, 'app/apply is back — the old routes must 308 to /join, not render')
  assert.equal(has('app/join/_expert'), false, 'the consultation wizard came back')
  // ⚠️ `_master/_marketing.tsx` LEFT THE LIST ON 2026-08-24. It was the
  // signed-out face of `/join?can=WORK` — one of TWO pitches, because a
  // provider could sell either of two things and a page naming one lost the
  // other. `?can=` is ignored now, so that address rendered the bare door
  // anyway and the file was reachable from nothing. The door IS the pitch.
  assert.equal(has('app/join/_provider/_marketing.tsx'), false,
    'the second pitch came back — one product, one door, one page')
  // A private folder, so the form is not a route of its own.
  assert.equal(has('app/join/_provider/page.tsx'), false)
})

test('§D the page: guest → the pitch WITH the question on it, admin → /admin', () => {
  const page = codeOf('app/join/page.tsx')
  // ⚠️ THREE GUEST VIEWS UNTIL 2026-08-24 — the door, and a crawlable pitch per
  // half on `?can=`. One thing to register, one pitch, and the question is on
  // it rather than behind the sign-up wall.
  assert.match(page, /if \(!user\) return <PublicDoor \/>/,
    'the bare address stopped being the door — a guest is behind the wall again')
  assert.doesNotMatch(page, /\?can=|CAPABILITIES|wantsWorkOnly/, 'the two-half door came back')
  assert.match(page, /if\s+\(user\.role\s+===\s+ROLE\.ADMIN\)\s+redirect\('\/admin'\)/)
  // Somebody who already sells goes to their workspace — /work is the only
  // screen that grants the profile bonus.
  assert.match(page, /if \(await isProvider\(user\.id\)\) redirect\('\/work'\)/,
    'a finished applicant is left on the door')
  // The page must never 404: it is the one public door for the supply side.
  assert.doesNotMatch(page, /notFound\(\)/, '/join 404s')
  assert.equal(isProviderPath('/join'), false, '/join is inside PROVIDER_PATH_PREFIXES — the middleware would 404 the door')
  assert.equal(isProviderPath('/apply/master'), false, 'the retired /apply/master prefix is still listed')
  assert.ok(!(PROVIDER_PATH_PREFIXES as readonly string[]).some(p => p.startsWith('/apply') || p.startsWith('/join')))
  // The provider workspace is never named by a LITERAL — a hardcoded
  // '/provider' survives the route moving and 404s somebody who just applied.
  assert.doesNotMatch(read('app/join/page.tsx'), /["'`]\/provider/)
})

test('§D2 somebody who has applied is shown the answer, not the form again', () => {
  /* ⚠️ MEASURED, 2026-09-01, and reported by the owner the same hour: „განცხადება
     გამოიგზავნა და ისევ იგივე ადგილას join-ზე დამაბრუნა და თითქოს არ გაიგზავნა".
     Two defects made one impression, and both are pinned here.

       · THE CONFIRMATION WAS OFF-SCREEN. Pressing „დასრულება" at scrollY 2 260
         shrank the document from 3 509px to 1 247px; the browser clamped the
         scroll to its new maximum of 415, which put 0 pixels of the card and
         821 of the 832 visible pixels of FOOTER on screen.
       · AND /join WAS STILL THE FORM AFTERWARDS — h1 „დაარეგისტრირე სერვისი"
         over 3 324px of pre-filled inputs, with „განაცხადი გამოგზავნილია" as
         one line inside it.

     A source scan is a weak instrument and this file already leans on one; what
     it can hold is that the two mechanisms exist at all. The property is: a
     SUBMITTED application decides the screen, and the server knows it before
     the first paint. */
  const page = codeOf('app/join/page.tsx')
  assert.match(page, /providerApplication\.findUnique/,
    'the page stopped reading the application — the first paint is a registration form again')
  assert.match(page, /initialStatus=\{/, 'the status is read and then not passed to the client')

  const form = codeOf('app/join/_provider/client.tsx')
  assert.match(form, /useState<string \| null>\(initialStatus\)/,
    'the form ignores what the server already knew and waits for its own fetch')
  // The confirmation branch must not be `done` alone: `done` is state, so it
  // survives nothing — not a reload, not a back button, not a second visit.
  assert.match(form, /if \(sent\) \{/, 'the confirmation branch is gated on something else')
  assert.match(form, /const sent = \(done \|\| status === 'SUBMITTED'\) && !editing/,
    'the confirmation is gated on submit-in-this-tab again')
  assert.match(form, /status === 'SUBMITTED'/, 'SUBMITTED stopped deciding the screen')
  assert.match(form, /window\.scrollTo\(\{ top: 0/,
    'the viewport is left where the tall form was — the card renders above the fold line')
  // NEEDS_REVISION and REJECTED exist to be acted on: they must still open the
  // form, with the reason above it.
  for (const st of ['NEEDS_REVISION', 'REJECTED']) {
    assert.match(form, new RegExp(`status === '${st}'`), `${st} lost its card`)
  }
  // And nobody is locked out of their own application.
  assert.match(form, /setEditing\(true\)/, 'there is no way back into a submitted application')
})

test('§E the door: one question, one form, and the answer persists', () => {
  // ⚠️ TWO FILES SINCE 2026-08-20. The question moved into the leaf both doors
  // import (`_door/DoorQuestion`) so that a GUEST can answer it before the
  // wall; `JoinClient` kept what only a signed-in door can do.
  const door = codeOf('app/join/JoinClient.tsx') + codeOf('app/join/_door/DoorQuestion.tsx')
  assert.match(door, /<ProfessionPicker/, 'the door grew its own profession control instead of the shared one')
  assert.match(door, /useCategories\(\)/, 'the door fetches spheres its own way — one fetch shape, one fallback')
  assert.match(door, /disabled=\{!answered\}/, 'a person who has answered nothing can continue')
  assert.match(door, /'mcodne:join'/, 'the choice is not persisted')
  assert.match(read('lib/signout.ts'), /'mcodne:join'/, 'sign-out leaves the door choice for the next person on a shared device')
  // One form, opened directly — no `wizardFor`, no second stage, no hand-off.
  // ⚠️ THERE IS NO SECOND STAGE TO OPEN SINCE 2026-08-31 — /join IS the form
  // („ერთ გვერდზე იყოს ყველაფერი"). `setStage('form')` was the old hand-off and
  // the thing it guaranteed — ONE form, opened directly, no wizard branch — is
  // now true by construction: the client renders `<ProviderApplyClient>` and
  // nothing else. That is what is asserted.
  assert.match(door, /<ProviderApplyClient/, 'the door stopped opening the one form')
  assert.doesNotMatch(door, /wizardFor|onContinueMaster|onContinueExpert/, 'the two-wizard hand-off came back')
  assert.match(door, /seed=\{seed\}/, 'the form is no longer seeded from the door’s answer')
})

/* ═══════════ 3. the redirects ══════════════════════════════════════════ */

test('§F the middleware 308s /apply, /apply/master and /apply/* onto /join, query kept', () => {
  const mw = codeOf('middleware.ts')
  const block = mw.slice(mw.indexOf("req.nextUrl.pathname === '/apply'"), mw.indexOf('isRequestPath('))
  assert.ok(block.length > 0, 'the /apply block is gone from the middleware')
  assert.match(block, /req\.nextUrl\.pathname\s+===\s+'\/apply'\s+\|\|\s+req\.nextUrl\.pathname\.startsWith\('\/apply\/'\)/)
  assert.match(block, /url\.pathname = '\/join'/)
  assert.match(block, /NextResponse\.redirect\(url, 308\)/, 'must be permanent AND method-preserving, like the /ask block')
  // The query string is preserved: the block clones the URL and never blanks `search`.
  assert.doesNotMatch(block, /url\.search = ''/)
  // It sits with the other 308s, BEFORE the requests gate — so tests/requests’
  // „no redirect inside the gate block" pin still holds.
  assert.ok(mw.indexOf("pathname === '/apply'") < mw.indexOf('isRequestPath('), 'the /apply redirect moved below the requests gate')
})

test('§G no live link to /apply remains anywhere in app, components or lib', () => {
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

/* ═══════════ 4. who is invited ═════════════════════════════════════════ */

test('§H the invitation is for people who sell nothing — never for a provider', () => {
  // The bug this closes: every „გახდი ექსპერტი" surface asked the ROLE, and an
  // approved provider could still be carrying role USER — so somebody already
  // listed was invited to become one.
  //
  // ⚠️ IT TOOK A LIST OF CAPABILITIES UNTIL 2026-08-24, and the pair rule that
  // went with it („nobody may see the invitation AND the switch") is gone with
  // the switch: there is no other half to enable.
  assert.equal(showJoinInvite(null, false), true, 'a guest is the audience for the invitation')
  assert.equal(showJoinInvite('USER', false), true, 'a plain client too')
  assert.equal(showJoinInvite('USER', undefined), true, 'an unresolved identity reads as demand')
  assert.equal(showJoinInvite('USER', true), false, 'a provider must not be told to become one')
  assert.equal(showJoinInvite('PROVIDER', true), false)
  assert.equal(showJoinInvite('ADMIN', false), false, 'an admin is nobody’s applicant')
  // …and every surface asks the shared rule, not the role.
  for (const f of ['components/ApplyCtaGate.tsx', 'components/UserMenu.tsx', 'components/PublicTopBar.tsx', 'components/HelpWidget.tsx', 'app/contact/ContactClient.tsx']) {
    assert.match(codeOf(f), /showJoinInvite\(/, `${f} still gates the join door on the role`)
    assert.doesNotMatch(codeOf(f), /showApplyCta\(/, `${f} still calls the role-based gate`)
  }
  // The menu carries a provider to what they SELL — that is what the „ჩართე
  // სერვისები" switch was replaced by when the capabilities collapsed.
  const menu = codeOf('components/UserMenu.tsx')
  assert.doesNotMatch(menu, /CAPABILITY_ENABLE_LABEL/, 'the „ჩართე…" row is back in the menu')
  // ⚠️ ONE EDITOR SINCE 2026-08-30 — it was /work/services („ჩემი სერვისები")
  // while the row had two editors. What this pins is unchanged: somebody who
  // already sells is offered the page where they edit it, never the invitation
  // to register again.
  assert.match(menu, /'\/work\/profile'/, 'the menu no longer carries a provider to what they sell')
})
