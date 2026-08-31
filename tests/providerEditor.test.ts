// ONE EDITOR FOR ONE ROW — /work/profile, „ჩემი გვერდი" (2026-08-30).
//
// Run: npx tsx tests/providerEditor.test.ts   (also in `npm test`)
//
// ⚠️ THIS FILE REPLACES `tests/servicesPage.test.ts`, WHICH PINNED THE SPLIT.
// That file was written on 2026-08-19 to hold ONE page for „რას ვყიდი?"
// (/work/services) beside another for „ვინ ვარ?" (/work/profile), and every
// section of it asserted that both existed. The split was real while they were
// two tables; `TutorProfile` was absorbed into `ServiceProfile` on 2026-08-24
// and the screens did not follow, so for six days one row had two editors.
//
// Owner, 2026-08-30: „ჩემი სერვისები / პროფილი — ეს ორი არის და შიგნით ერთი და
// იგივე ინფოს აკეთებს თითქოს და რატომ, თან არცერთი მხარე არაა კომფორტულად
// მოწყობილი."
//
// So the old file was not edited into agreement — its SUBJECT is gone. What it
// pinned that is still true (the gate, the one-hop redirect, no blob in a form
// payload, the search, the world-narrowing picker) is carried over below, and
// what it pinned about there being two of everything is replaced by the
// opposite assertion.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { middleware } from '../middleware'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const has = (p: string) => existsSync(join(ROOT, p))

/** Source with comments stripped — a comment quoting the old shape is history,
 *  a live line carrying it is the regression.
 *
 *  ⚠️ BLOCK COMMENTS FIRST, then the line ones. Stripping `//` lines first eats
 *  the ` */
/*  ` that closes a block and leaves a dangling opener, which the block regex
 *  then matches against the NEXT `*` + `/` in the file — swallowing a hundred
 *  lines of real code and failing assertions about code that is there. */
const codeOf = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(l => !/^\s*\/\//.test(l))
    .join('\n')

const EDITOR = 'app/work/profile/_editor.tsx'
const PAGE = 'app/work/profile/page.tsx'
const ACCOUNT = 'app/work/account/page.tsx'
const ACCOUNT_CLIENT = 'app/work/account/_client.tsx'
const API = 'app/api/provider/service-profile/route.ts'

const ORIGIN = 'https://mcodne.ge'
const where = (path: string) => {
  const res = middleware(new NextRequest(new URL(path, ORIGIN)))
  return { status: res.status, to: res.headers.get('location') ?? null }
}

/* ═══════════ A. one editor, and the old surfaces are gone ═══════════════ */

test('§A there is one editor for the row, and the second one is gone', () => {
  assert.ok(has(PAGE), 'the editor page is missing')
  assert.ok(has(EDITOR), 'the editor component is missing')

  // ⚠️ THE WHOLE OLD SCREEN, not just its page file: a leftover `_trades.tsx`
  // under a deleted route is a second copy of the services picker waiting to be
  // imported back in.
  for (const p of [
    'app/work/services/page.tsx',
    'app/work/services/_trades.tsx',
    'app/work/profile/_expertClient.tsx',
    'app/work/profile/_tabProfile.tsx',
    'app/work/profile/_tabAccount.tsx',
    'app/work/profile/_provider.tsx',
  ]) {
    assert.ok(!has(p), `${p} came back — the row has two editors again`)
  }

  // The three halves of the one editor, each a section rather than a screen.
  for (const p of ['_secIdentity.tsx', '_secServices.tsx', '_secPhotos.tsx']) {
    assert.ok(has(`app/work/profile/${p}`), `the ${p} section is missing`)
  }
})

/* ═══════════ B. the gate, on both pages ═════════════════════════════════ */

test('§B the gate: signed in, admitted, else notFound() — never a redirect', () => {
  for (const p of [PAGE, ACCOUNT]) {
    const src = codeOf(p)
    assert.match(src, /requestsViewer\(\)/, `${p} stopped asking the server-side gate`)
    assert.match(src, /providerAllowed/, `${p} stopped checking the allowlist`)
    assert.match(src, /viewer\.provider === null/, `${p} stopped requiring a provider identity`)
    assert.match(src, /notFound\(\)/, `${p} stopped answering with a 404`)
    // ⚠️ 404 AND NEVER 403 OR A REDIRECT — a redirect to /signin tells an
    // anonymous visitor the page is real, which is the one thing the 404 denies.
    assert.doesNotMatch(src, /redirect\(/, `${p} answers a stranger with a redirect`)
    assert.match(src, /force-dynamic/, `${p} may now be served from a render that outlived a session`)
  }
})

/* ═══════════ C. the retired addresses, in one hop each ══════════════════ */

test('§C both old addresses 308 to the editor, in ONE hop, and it is live', () => {
  for (const from of ['/work/services', '/work/service-profile']) {
    assert.deepEqual(where(from), { status: 308, to: `${ORIGIN}/work/profile` }, `${from} does not land on the editor`)
    // Prefix-plus-slash too: nothing ever lived under either, so a deeper path
    // is a typo and belongs on the page rather than on a 404.
    assert.deepEqual(where(`${from}/x`), { status: 308, to: `${ORIGIN}/work/profile` })
  }
  // ⚠️ ONE HOP. /work/service-profile used to 308 onto /work/services, which now
  // 308s onto /work/profile; naming only the first would build a chain.
  assert.equal(where('/work/profile').status, 200, '/work/profile is itself redirected or blocked')

  // Segment boundary: a name that merely starts with the same letters is not
  // the old address.
  assert.equal(where('/work/service-profiles').status, 200)

  // The 308s sit with the other permanent moves, ABOVE the feature gate — so an
  // old link redirects rather than 404ing when the supply side is off.
  const mw = read('middleware.ts')
  assert.ok(mw.indexOf("'/work/service-profile'") < mw.indexOf('isRequestPath('),
    'the editor 308s moved below the requests gate')
})

/* ═══════════ D. one save, one guard, one dirty flag ═════════════════════ */

test('§D the editor saves once — one request, one guard, one bar', () => {
  const src = codeOf(EDITOR)

  // ⚠️ THE COUNT IS THE POINT. Before the merge there were SIX save controls
  // across the two screens — the services bar, the profile-tab bar, the name
  // button, the visibility toggle, the password button and the work-photo bar
  // — and four of them wrote this one row.
  assert.equal((src.match(/useUnsavedGuard\(/g) ?? []).length, 1,
    'the editor runs more than one unsaved-changes guard')
  assert.equal((src.match(/method: 'PUT'/g) ?? []).length, 1,
    'the editor sends more than one write — one button must not be two requests')
  assert.equal((src.match(/'\/api\/provider\/service-profile'/g) ?? []).length, 2,
    'the editor no longer talks to exactly one endpoint (one GET, one PUT)')

  // ⚠️ NO SECOND WRITER OF THIS ROW FROM THIS SCREEN. `/api/me/provider` still
  // exists and is the account page's, but a PATCH from here would be the split
  // coming back inside one component.
  assert.doesNotMatch(src, /'\/api\/me\/provider'/,
    'the editor writes the row through a second endpoint again')

  // The one bar carries the one dirty flag, in the words the forms already used.
  assert.match(src, /შეუნახავი ცვლილებები/, 'the save bar stopped reporting unsaved work')
  assert.match(src, /შეინახე ცვლილებები/, 'the save button lost its label')

  // ⚠️ THE SECTIONS HOLD NO DRAFT OF THEIR OWN. A section that fetched or saved
  // would be a second editor one level down.
  for (const p of ['_secIdentity.tsx', '_secServices.tsx', '_secPhotos.tsx']) {
    const sec = codeOf(`app/work/profile/${p}`)
    assert.doesNotMatch(sec, /fetch\(/, `${p} fetches on its own — the editor owns the data`)
    assert.doesNotMatch(sec, /useUnsavedGuard/, `${p} runs its own guard`)
  }
})

/* ═══════════ E. one switch, and it says what it does ════════════════════ */

test('§E `available` has exactly one control, and it names both consequences', () => {
  const acc = codeOf(ACCOUNT_CLIENT)
  const editor = codeOf(EDITOR)

  // ⚠️ THE BUG THIS SECTION EXISTS FOR. The column was written from BOTH old
  // screens: a checkbox on /work/services that took effect on save, an instant
  // toggle on /work/profile. And the services copy claimed only that requests
  // stop coming, while `available:false` ALSO drops the profile out of the
  // catalogue (`PUBLIC`) and 404s /experts/<slug> (`VISIBLE`). Somebody pausing
  // their queue disappeared from the site and was told about the queue.
  assert.match(acc, /available: next/, 'the account page stopped writing the switch')

  // ⚠️ THE EDITOR MAY READ IT AND MUST NOT SEND IT. It reports the state („გვერდი
  // დამალულია — არც ძებნაში ჩანხარ…"), which is the half of the old banner worth
  // keeping; what it must never do is carry the column in a body. The guarantee
  // is structural rather than textual: the PUT body IS the draft, and `Draft`
  // has no such field, so there is nothing to send.
  assert.match(editor, /body: JSON\.stringify\(draft\)/,
    'the editor stopped sending the draft verbatim — a hand-built body can carry anything')
  // Scoped to `Draft` alone: `Loaded` carries the column deliberately, because
  // the editor REPORTS the state it must not write.
  const types = codeOf('app/work/profile/_types.ts')
  const draftType = types.slice(types.indexOf('export type Draft'), types.indexOf('export type Topic'))
  assert.doesNotMatch(draftType, /available/,
    '`available` is back on the draft — a save from the editor could flip somebody public')

  // Both halves in the copy, on the „off" side: search AND the request feed.
  const off = acc.slice(acc.indexOf('available === false'))
  assert.match(off, /ძებნაში/, 'the off-state copy stopped naming the catalogue')
  assert.match(off, /მოთხოვნები/, 'the off-state copy stopped naming the request feed')

  // ⚠️ AND THE ROW IS STILL READ BY BOTH. If either of these stops filtering on
  // it, the copy above becomes the lie the old copy was.
  assert.match(read('app/experts/_providers.ts'), /available: true/,
    'the catalogue stopped filtering on `available` — the switch now over-promises')
  assert.match(read('app/experts/[slug]/_providerData.ts'), /available: true/,
    'the public page stopped filtering on `available`')
})

/* ═══════════ F. the card is the draft, all of it ════════════════════════ */

test('§F the preview card is built from the draft, not from the stored row', () => {
  const src = codeOf(EDITOR)

  // ⚠️ WHAT WAS WRONG BEFORE. The same `ShopfrontCard` stood in the same sticky
  // corner of both old pages and each drew only its OWN half live: /work/profile
  // read the SAVED services and prices and passed no work photos at all — with
  // the uploader on that very page — while /work/services read the SAVED
  // headline. Half of each preview was last week's.
  const card = src.slice(src.indexOf('<ShopfrontCard'))
  for (const prop of ['name={draft.fullName}', 'headline={draft.headline', 'services={shopfront}', 'workPhotos={draft.workPhotos.length}']) {
    assert.ok(card.includes(prop), `the card stopped drawing ${prop} from the draft`)
  }
  assert.match(src, /const shopfront = draft\.services\.map/,
    'the card\'s service list stopped being built from the draft')
  assert.match(src, /price: draft\.priceList\[id\] \?\? null/,
    'the card\'s prices stopped being built from the draft')

  // The completeness checklist reads the draft too, and its anchors are in-page
  // now that there is one page to scroll.
  const score = read('lib/profileScore.ts')
  assert.doesNotMatch(score, /anchor: '\/work\//,
    'the completeness checklist navigates away from the form it is scoring')
})

/* ═══════════ G. no image column in a form payload ═══════════════════════ */

test('§G the editor payload carries no base64 column', () => {
  const api = codeOf(API)
  const select = api.slice(api.indexOf('findUnique'), api.indexOf('const workPhotoCount'))
  assert.doesNotMatch(select, /photoUrl: true/, 'the GET selects the base64 photo into its payload')
  assert.doesNotMatch(select, /workPhotos: true/, 'the GET selects six base64 images into its payload')
  // …the count, computed in SQL: six photos is about a megabyte.
  assert.match(api, /array_length\("workPhotos", 1\)/,
    'the GET stopped counting the work photos in SQL — it is selecting them')
  // And the stored ones are drawn one at a time through their own route.
  assert.match(codeOf('app/work/profile/_secPhotos.tsx'), /\/api\/providers\/\$\{profileId\}\/photo/,
    'the stored photo is no longer drawn through its own URL')
})

/* ═══════════ H. finding your own trade in a 148-topic vocabulary ════════ */

test('§H the editor searches the vocabulary instead of listing it', () => {
  const sec = codeOf('app/work/profile/_secServices.tsx')
  // ⚠️ IT SEARCHES `alt` TOO, AND THAT IS MOST OF ITS VALUE: the topics carry
  // the words people actually type („სანტექნიკოსი", „დამლაგებელი"). A search
  // over the printed label alone fails the exact person it is for.
  assert.match(sec, /t\.alt\.some/, 'the editor search stopped reading the alternate words')
  assert.match(sec, /const allTopics = data\.groups\.flatMap\(g => g\.topics\)/,
    'the editor search stopped reading every topic — „დალაგება" would stop being findable')
  assert.match(codeOf(API), /alt: t\.alt \?\? \[\]/,
    'the endpoint stopped sending the alternate words the search needs')
})

/* ═══════════ I. the picker leads with the provider's own world ══════════ */

test('§I the picker narrows to the world the provider is in', () => {
  /* Owner, 2026-08-30: „როდესაც დამლაგებლად დაამატა სერვისი, იმას ხომ არ ექნება
   * სურვილი ბუღალტრის სერვისი ჰქონდეს… ზედმეტ რაღაცებს აღარ უნდა თავაზობდეს."
   * Measured that day on the 28 live providers with any services: every one sits
   * inside a single vertical, 26 of 28 inside a single group. */
  const sec = codeOf('app/work/profile/_secServices.tsx')
  assert.match(sec, /const mine = new Set\(/, 'the editor stopped deriving the provider\'s own world')
  assert.doesNotMatch(sec, /setWorld|რომელ კატეგორიაშია/,
    'the editor asks a question the provider already answered by registering')
  // ⚠️ THE OTHER WORLD IS COLLAPSED, NEVER REMOVED — a cleaner who starts
  // teaching is a real person.
  assert.match(sec, /world:\$\{s\.v\}/, 'the other world stopped being reachable')

  // /join asks once and narrows; the editor never asks. Two mechanisms, one rule.
  const join = codeOf('app/join/_provider/client.tsx')
  assert.match(join, /const \[world, setWorld\]/, 'the registration form stopped asking which world')
})

/* ═══════════ J. the name is on the card, the password is not ════════════ */

test('§J what a client reads is in the editor; what they cannot is in the account', () => {
  const identity = codeOf('app/work/profile/_secIdentity.tsx')
  const acc = codeOf(ACCOUNT_CLIENT)

  // ⚠️ THE NAME IS THE LARGEST TEXT ON THE CARD and it used to be edited two
  // tabs away from the sentence printed under it, behind its own save button.
  assert.match(identity, /draft\.fullName/, 'the name left the card it labels')
  assert.doesNotMatch(acc, /fullName/, 'the name is being edited in two places again')

  // …and the password is not a profile field, so it is not on the editor.
  assert.doesNotMatch(codeOf(EDITOR), /password/i, 'the password came back to the public-profile editor')
  assert.match(acc, /\/api\/me\/password/, 'the account page stopped offering a password change')

  // The endpoint writes both tables in ONE transaction: a single button must
  // not be able to save the name and lose the page.
  assert.match(codeOf(API), /prisma\.\$transaction\(\[/,
    'the save stopped being atomic — the name and the row can now diverge')
})
