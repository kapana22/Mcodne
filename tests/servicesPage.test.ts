// ONE PAGE FOR „რას ვყიდი?" — /work/services (2026-08-19).
//
// Run: npx tsx tests/servicesPage.test.ts   (also in `npm test`)
//
// The provider had TWO answers to one question: the „სესიები" tab of
// /work/profile (the bookable consultation types) and /work/service-profile
// (the trades, the cities, the price, the switch). Two screens, two halves of
// one workspace — the split CLAUDE.md's product model forbids, since this site
// sells SERVICES and a consultation is one KIND of service.
//
// This file pins the merge: one page holds both halves, each behind its own
// capability, the trades half keeps the 404 the old route answered with, the
// old address 308s (executed through the real middleware, like
// tests/redirects.test.ts), the profile page has no services tab left, and
// neither half's list endpoint drags a base64 column across the wire.

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
 *  a live line carrying it is the regression. */
// ⚠️ BLOCK COMMENTS FIRST, then the line ones. Stripping `//` lines first eats
// the ` */` that closes a `/** … */` block and leaves a dangling `/**`, which
// the block regex then matches against the NEXT `*/` in the file — swallowing
// a hundred lines of real code and failing assertions about code that is there.
const codeOf = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(l => !/^\s*\/\//.test(l))
    .join('\n')

const PAGE = 'app/work/services/page.tsx'

/* ═══════════ A. one page, outside both route groups ═════════════════════ */

test('§A the page exists, sits outside both guards, and the two old surfaces are gone', () => {
  // ⚠️ THE CONSULTATION HALF OF THIS PAGE WENT WITH THE PRODUCT (2026-08-24) —
  // `_consultations.tsx` held the bookable types, their prices, their session
  // lengths and the weekly availability behind them.
  for (const p of [PAGE, 'app/work/services/_trades.tsx']) {
    assert.ok(has(p), `${p} is missing`)
  }
  assert.ok(!has('app/work/services/_consultations.tsx'), 'the consultation half came back')
  // ⚠️ NOT IN A ROUTE GROUP. app/work/(expert) requires the EXPERT role and
  // app/work/(provider) 404s anybody the allowlist does not name — a page BOTH
  // must open cannot live in either, or half its audience is locked out.
  assert.ok(!has('app/work/(provider)/services'), 'the page moved into the provider group — its gate is not this page’s')
  // The two surfaces it replaced.
  assert.ok(!has('app/work/(provider)/service-profile'), 'the master still has a second page for what they sell')
  assert.ok(!has('app/work/profile/_tabServices.tsx'), 'the profile page still carries the services tab')
  // Re-verified per request, like the two group layouts beside it.
  assert.match(codeOf(PAGE), /export const dynamic = 'force-dynamic'/)
})

/* ═══════════ B. the gate ════════════════════════════════════════════════ */

test('§B the gate: signed in, admitted, else notFound() — never a redirect', () => {
  const src = codeOf(PAGE)
  assert.match(src, /const\s+user\s+=\s+await\s+getCurrentUser\(\)\s*\n\s*if\s+\(!user\)\s+notFound\(\)/,
    'a signed-out visitor no longer gets the 404')
  assert.match(src, /if\s+\(!viewer\.providerAllowed\s+\|\|\s+viewer\.provider === null\)\s+notFound\(\)/,
    'somebody with no provider identity is admitted to an empty page')
  // ⚠️ 404 AND NEVER 403 OR /signin. A redirect tells a stranger the page is
  // real and worth coming back to with an account — the one thing the 404
  // exists to deny (lib/requestsServer says it at length).
  assert.doesNotMatch(src, /redirect\(|requireRole\(|requireUser\(/,
    'the services page redirects — that tells a stranger the page is real')
})

test('§C one question, one form, and no tab bar to make it two products', () => {
  const src = codeOf(PAGE)
  // Literally the two checks the old route made: the layout's `providerAllowed`
  // (the supply-side switch + the allowlist) and the page's own `provider` (is
  // there an identity to hang a ServiceProfile on).
  assert.match(src, /const viewer = await requestsViewer\(\)/)
  // ⚠️ NEVER A TAB BAR. Two tabs here would read as two products — the
  // consultation-vs-service primary axis the product model forbids, arriving
  // through a layout choice.
  /* ⚠️ IT TAKES TWO PROPS SINCE 2026-08-29. The editor draws the card a client
     sees beside the form that writes it, and the name and the face are the two
     things only the SERVER knows — the endpoint deliberately never sends a
     base64 avatar into a form payload. */
  assert.match(src, /<ServiceProfileForm\b/)
  assert.match(src, /name=\{user\.fullName\}/, 'the preview card lost the provider\'s name')
  assert.doesNotMatch(src, /role="tab"|activeTab|TabPanel/, 'the page grew a tab bar')
  assert.doesNotMatch(src, /კონსულტაცი/, 'the consultation half came back to „ჩემი სერვისები"')
  // The page keeps the name both old surfaces used.
  assert.match(src, /title="ჩემი სერვისები"/)
})

/* ═══════════ D. the old address ═════════════════════════════════════════ */

const ORIGIN = 'https://mcodne.ge'
const where = (path: string) => {
  const r = middleware(new NextRequest(`${ORIGIN}${path}`))
  return { status: r.status, to: r.headers.get('location') }
}

test('§D /work/service-profile 308s to /work/services, in one hop, and lands on a live page', () => {
  assert.deepEqual(where('/work/service-profile'), { status: 308, to: `${ORIGIN}/work/services` })
  // Prefix-plus-slash too: nothing ever lived under it, so a deeper path is a
  // typo and belongs on the page rather than on a 404.
  assert.deepEqual(where('/work/service-profile/x'), { status: 308, to: `${ORIGIN}/work/services` })
  // …and the target is not itself redirected — a retired URL lands in one hop.
  assert.equal(where('/work/services').status, 200, '/work/services is redirected or blocked')
  // Segment boundary: a name that merely starts with the same letters is not
  // the old address.
  assert.equal(where('/work/service-profiles').status, 200)
  // The 308 sits with the other permanent moves, above the feature gate — so
  // an old link redirects rather than 404ing when the supply side is off.
  const mw = read('middleware.ts')
  assert.ok(mw.indexOf("'/work/service-profile'") < mw.indexOf('isRequestPath('),
    'the services 308 moved below the requests gate')
})

/* ═══════════ E. the profile page kept everything else ═══════════════════ */

test('§E /work/profile lost the services tab and nothing else', () => {
  // ⚠️ THE PAGE BECAME TWO FILES (2026-08-21). /work/profile moved out of the
  // `(expert)` group so BOTH halves could open it, so the route is now a server
  // gate (page.tsx) that renders the expert's editor — this file, unchanged —
  // and the master's own („ვინ ვარ" for the half that had no profile page at
  // all). Everything below is about the expert's half and still is.
  const src = codeOf('app/work/profile/_expertClient.tsx')
  assert.doesNotMatch(src, /ServicesTab|_tabServices/, 'the services tab is still mounted on the profile page')
  assert.match(src, /\{\['პროფილი',\s+'ანგარიში'\]\.map/,
    'the profile tab bar is not the two remaining tabs')
  // The three panels that stay, still imported and still mounted.
  /* ⚠️ `CredentialsTab` WAS PINNED HERE AND IS GONE (2026-08-29). Owner:
   * „რითი დაგიჯერებს აღარ გვჭირდება, ეს ხომ სერვისებს ყიდის." The tab held
   * certificates, education and experience — a résumé on a site that sells
   * services — and 4/8/5 of 29 live providers had filled the three lists. */
  for (const tab of ['ProfileTab', 'AccountTab']) {
    assert.match(src, new RegExp(`<${tab}\\b`), `${tab} left the profile page`)
  }
  assert.ok(!has('app/work/profile/_tabCredentials.tsx'), 'the credentials tab came back')
  for (const f of ['_tabProfile.tsx', '_tabAccount.tsx', '_parts.tsx', '_types.ts']) {
    assert.ok(has(`app/work/profile/${f}`), `${f} is missing`)
  }
  // The route itself: one gate, both halves, and neither editor optional for
  // the person who holds that capability.
  const page = codeOf('app/work/profile/page.tsx')
  assert.match(page, /<ExpertProfileEditor \/>/, 'the professional editor is no longer mounted by the route')
  assert.match(page, /<MasterProfileEditor \/>/, 'the photo half of the profile page is gone')
  assert.match(page, /if \(!viewer\.providerAllowed \|\| viewer\.provider === null\) notFound\(\)/,
    'the profile page stopped 404ing a stranger')
  assert.doesNotMatch(page, /status: 403|redirect\(/, 'the profile page answers with something other than 404')
  /* ⚠️ THIS ASSERTED THE SIGNPOST, AND THE SIGNPOST'S OWN CONDITION HAS BEEN
   * MET (2026-08-29). It read `href="/work/services"` on this page, under the
   * comment „until the rail carries the item, this link is the only trace of
   * the move a returning expert would see". The rail has carried it since
   * 2026-08-21, so what the assertion was really keeping alive was a second
   * copy of a nav row already on screen.
   *
   * What has to stay true is that there IS a way — so the rail is asserted
   * where the rail is, and the page is asserted not to duplicate it. */
  assert.match(read('components/tutor/navConfig.ts'), /href: '\/work\/services'/,
    'the rail lost „ჩემი სერვისები" — and the profile page no longer carries a spare link to it')
  assert.doesNotMatch(src, /href="\/work\/services"/,
    'the profile page duplicates a rail row again')
  /* ⚠️ NOTHING ON THIS PAGE DELETES ANYTHING ANY MORE (2026-08-29), so the
   * confirm paradigm went with the last rows that needed it. `PendingDelete`
   * had three kinds — cert, edu, exp — and all three were CV rows; the modal,
   * `DELETE_META` and `confirmDelete` had nothing left to guard.
   *
   * The rule this section is really about survives inverted: a destructive
   * action on this page must never be a bare click, so if one ever returns it
   * has to bring `<ConfirmModal>` back with it — never `confirm()`. */
  assert.doesNotMatch(src, /kind: 'cons'/, 'the profile page still deletes services')
  assert.doesNotMatch(codeOf('app/work/profile/_types.ts'), /'cons'/)
  assert.doesNotMatch(src, /\bconfirm\(/, 'a native confirm() appeared on the profile page')
  assert.doesNotMatch(codeOf('app/work/profile/_types.ts'), /PendingDelete/,
    'the delete machinery is back — bring <ConfirmModal> with it, and re-pin it here')
  // The anchors moved with the sections, so the reveal map must not claim them.
  assert.doesNotMatch(src, /'section-availability'|'section-consultations'/,
    'the profile page still maps anchors that live on /work/services')
  // ⚠️ THE TWO ANCHORS THEY MOVED TO WENT WITH THE CONSULTATION HALF
  // (2026-08-24) — „section-availability" was a weekly calendar and
  // „section-consultations" the bookable types.
})

test('§F the behaviour moved with it: same endpoint, same switch, same uploader', () => {
  const trades = codeOf('app/work/services/_trades.tsx')
  assert.match(trades, /fetch\('\/api\/provider\/service-profile',\s+\{\s+cache:\s+'no-store'\s+\}\)/)
  assert.match(trades, /method: 'PUT'/)
  // The provider's own switch, the gaps line, the cap — what „რას ვყიდი" owns.
  assert.match(trades, /ახალი მოთხოვნები მომდის/, 'the paused/available switch is gone')
  assert.match(trades, /data\.gaps\.length > 0/, 'the „ჯერ არ ხარ სიაში" line is gone')
  assert.match(trades, /MAX_SERVICES/, 'the services cap is gone')

  /* ⚠️ THE FACE AND THE SENTENCE LEFT THIS FORM (2026-08-21) — they are „ვინ
   * ვარ", and this page answers „რას ვყიდი". They were here because the trades
   * provider had no profile page; they are on /work/profile now, with the
   * photos of finished work. The same uploader, the same endpoint — only the
   * address changed. */
  assert.doesNotMatch(trades, /<PhotoUploader|<WorkPhotos/,
    'the identity fields are back inside „ჩემი სერვისები" — one page, two questions again')
  const master = codeOf('app/work/profile/_master.tsx')
  assert.match(master, /<WorkPhotos/, 'the work photos did not arrive on the profile page')
  assert.match(master, /fetch\('\/api\/provider\/service-profile'/,
    'the photo form writes through some other endpoint than the one that owns the row')

  /* ⚠️ AND THERE IS EXACTLY ONE FACE UPLOADER ON THE SITE (2026-08-29). This
   * used to assert the OPPOSITE of the line below — that `<PhotoUploader />`
   * had arrived here — because the 2026-08-21 move brought it over from the
   * services form. What that move did not notice is that /work/profile already
   * had a portrait control: the ავატარი block in the tabs above, writing
   * `User.avatarUrl`. So the page shipped two uploaders for one face, both
   * captioned as the picture a client sees, and only one of them was —
   * app/experts/_providers.ts prefers `ServiceProfile.photoUrl` and falls back
   * to the avatar. A provider could replace their photo in the block the
   * completeness checklist scores, be told „100%", and go on showing a
   * years-old face in the catalogue.
   *
   * One control now. `/api/uploads` drops `photoUrl` when a new avatar is
   * picked, which hands the catalogue to the fallback, and `profileFacts`
   * already paid the photo task for either column so nothing became
   * unearnable (pinned in tests/credits.test.ts). */
  assert.doesNotMatch(master, /<PhotoUploader/,
    'a second face uploader is back on /work/profile — the ავატარი block above it already sets that picture')
  assert.doesNotMatch(master, /\bphotoUrl\b/,
    'this form sends photoUrl again — it has no field for it, so what it sends is whatever the row held at mount')
  assert.match(codeOf('app/api/uploads/route.ts'), /serviceProfile\.updateMany/,
    'a new avatar no longer retires the old photoUrl — the catalogue is back to showing the stale face')
})

/* ═══════════ G. no base64 column crosses the wire ═══════════════════════ */

test('§G neither half ships an image column in a list payload', () => {
  // The photo is a base64 column of a few hundred kilobytes. The GET the trades
  // half opens with COUNTS it and sends a boolean; the bytes are drawn through
  // /api/masters/[id]/photo, which is what the public card uses too.
  const api = codeOf('app/api/provider/service-profile/route.ts')
  const select = api.slice(api.indexOf('findUnique'), api.indexOf('const workPhotoCount'))
  assert.doesNotMatch(select, /photoUrl: true/, 'the service-profile GET selects the base64 photo into its payload')
  /* ⚠️ THE `hasPhoto` BOOLEAN WAS ASSERTED HERE AND IT IS GONE (2026-08-29).
   * It stood in for the column so the face uploader could say „ფოტო
   * ატვირთულია" without shipping the bytes. There is one portrait control on
   * the site now — the ავატარი block, writing through /api/uploads — so the
   * boolean had no reader and its COUNT ran on every open of both forms.
   * What this section is really about is the rule underneath, and that is
   * asserted directly: no blob crosses the wire in a form payload. */
  assert.doesNotMatch(api, /\bhasPhoto\b/,
    'the dead photo boolean is back — nothing draws it and it costs a COUNT per form open')
  assert.match(codeOf('app/work/profile/_master.tsx'), /\/api\/masters\/\$\{data\.id\}\/photo/,
    'the stored photo is no longer drawn through its own URL')
  // …and the count, not the array: six base64 images is about a megabyte.
  assert.match(api, /array_length\("workPhotos", 1\)/,
    'the GET stopped counting the work photos in SQL — it is selecting them')
  const select2 = api.slice(api.indexOf('findUnique'), api.indexOf('const workPhotoCount'))
  assert.doesNotMatch(select2, /workPhotos: true/, 'the GET selects six base64 images into its payload')

})

/* ═══════════ H. finding your own trade in a 148-topic vocabulary ═════════ */

test('§H the editor searches the vocabulary instead of listing it', () => {
  /* ⚠️ WHAT THIS PINS, AND WHY IT NEEDED PINNING (2026-08-29).
   *
   * The picker was built on 2026-08-21 against 39 topics in 8 groups, and on
   * 2026-08-24 the taxonomy expansion put the WHOLE vocabulary behind it —
   * measured that day, 148 live topics in 28 groups. Nothing failed, because
   * nothing asserted anything about the shape of the list; the screen simply
   * became 28 folds deep, with the 8 household groups below the 20
   * professional ones and no field to type into. A plumber scrolled ~900px of
   * ეროვნული გამოცდები · ფრანგული · SMM to reach დალაგება.
   *
   * So what is asserted here is not a layout. It is that the editor keeps the
   * two things the SAME vocabulary already has on the two screens either side
   * of it — the client intake (app/request/_stepWhat.tsx) and the provider
   * intake (app/join/_master/client.tsx) — because that is the drift that let
   * this happen: the search box existed twice, over these exact topics, and the
   * one screen a provider returns to was the one without it. */
  const trades = codeOf('app/work/services/_trades.tsx')

  assert.match(trades, /type="search"/,
    'the services editor lost its search field — 28 folds is the only way back to your own trade')
  // `alt` is most of what the search is worth: 45 of the 148 live topics carry
  // 115 words people actually type („სანტექნიკოსი", „დამლაგებელი"). A search
  // over the printed label alone fails the person it is for.
  assert.match(trades, /t\.alt\.some/,
    'the search stopped reading the synonyms — it only matches our own wording now')
  assert.match(codeOf('app/api/provider/service-profile/route.ts'), /alt: t\.alt/,
    'the endpoint stopped sending `alt` — the editor has nothing to search but labels')

  // The chosen services carry their own price, on their own row. Two lists of
  // the same rows 200px apart is what this replaced.
  assert.doesNotMatch(trades, /რა ღირს თითოეული/,
    'the duplicate price list is back — the prices belong on the rows they price')

  /* ⚠️ THE TWO SECTION HEADINGS ARE THE CATALOGUE'S OWN, and this is the
   * assertion that stops them drifting. app/experts/_filters.tsx splits the
   * same `LIVE_OFFER_GROUPS` into „პროფესიული სერვისები" and „სერვისი", under
   * the owner's ruling on which leads. Two screens naming one split in two
   * vocabularies is how the split stops reading as a split. */
  const filters = codeOf('app/experts/_filters.tsx')
  for (const title of ['პროფესიული სერვისები', 'სერვისი']) {
    assert.ok(trades.includes(title), `the editor no longer names „${title}"`)
    assert.ok(filters.includes(title), `the catalogue no longer names „${title}" — the two split the same list differently`)
  }
  assert.match(codeOf('app/api/provider/service-profile/route.ts'), /vertical: groupIsService\(g\)/,
    'the vertical is computed some other way than the catalogue computes it')

  /* ⚠️ ONE CITY IS NOT A QUESTION. The intake dropped this block on 2026-08-20
   * („a block whose list holds a single chip is the form performing a choice
   * nobody has") and the editor kept drawing it — a card, a heading and a
   * helper sentence for one chip — while the gaps line above could still
   * demand „აირჩიე ქალაქი" with the PUT unable to hear an answer. */
  assert.match(trades, /data\.cities\.length > 1 &&/,
    'the one-chip city card is unconditional again')
  assert.match(codeOf('app/api/provider/service-profile/route.ts'), /CITIES\.length === 1/,
    'the PUT stopped filling the only city in — the block is hidden and nothing answers it')
})

/* ═══════════ I. the workspace's long forms behave like one product ═══════ */

test('§I every long workspace form guards unsaved work and saves the same way', () => {
  /* ⚠️ WHAT THIS PINS (2026-08-29). /work/services is the longest form in the
   * workspace — up to 16 services ticked out of 148, a price typed against each
   * — and it was the ONE form with no dirty tracking and no guard. Both forms on
   * /work/profile had `useUnsavedGuard` for a week. Ten minutes of work, one
   * stray click on the rail two inches to the left, and it was gone without a
   * word.
   *
   * The save affordance is pinned with it, because the two are one fix: the bar
   * is sticky so the control is where the work is, and the guard is what
   * catches the case where somebody leaves anyway. The bar is NOT a new
   * pattern — it is app/work/profile/_tabProfile.tsx's, ported with its copy,
   * so all three forms say the same words in the same place. */
  const FORMS = [
    'app/work/services/_trades.tsx',
    'app/work/profile/_master.tsx',
    'app/work/profile/_expertClient.tsx',
  ]
  for (const f of FORMS) {
    assert.match(codeOf(f), /useUnsavedGuard\(/,
      `${f} can lose somebody's work silently — every long form in this space guards it`)
  }

  // The two forms that own their own save button carry the shared bar. The
  // third (_expertClient) delegates its button to _tabProfile, which is where
  // the bar was written.
  for (const f of ['app/work/services/_trades.tsx', 'app/work/profile/_master.tsx', 'app/work/profile/_tabProfile.tsx']) {
    const src = codeOf(f)
    assert.match(src, /sticky bottom-0/, `${f} lost the sticky save bar — its button is below a long scroll again`)
    assert.match(src, /შეუნახავი ცვლილებები/, `${f} stopped saying whether there is unsaved work`)
    assert.match(src, /შენახულია ✓/, `${f} stopped confirming the save on the button itself`)
  }
})

test('§J the pause switch sits with the sentence that reports it', () => {
  /* ⚠️ THEY WERE ~1 500px APART (fixed 2026-08-29). „ახალი მოთხოვნები მომდის"
   * was a Card of its own at the bottom of /work/services; the line reporting
   * its state („დროებით გამორთულია — მოთხოვნები არ მოგდის") is the first thing
   * on the page. A state with its control a page away is a state you cannot act
   * on.
   *
   * ⚠️ AND IT MUST NOT BE INSIDE THE `gaps` BRANCH. Drawing the switch only in
   * the „ready" state takes the pause control away from exactly the person most
   * likely to want it — somebody whose list is empty because they are not
   * working right now. That was the first version of this change and this
   * assertion is why it did not ship. */
  const src = codeOf('app/work/services/_trades.tsx')
  const row = src.slice(src.indexOf('data.gaps.length > 0'), src.indexOf('<Card>'))
  assert.ok(row.includes('ახალი მოთხოვნები მომდის'),
    'the pause switch left the status row — its state and its control are apart again')
  assert.ok(row.includes("patch({ available:"),
    'the switch in the status row no longer writes `available`')
  // Exactly one switch on the page: the moved card must not come back beside it.
  assert.equal((src.match(/ახალი მოთხოვნები მომდის/g) ?? []).length, 1,
    'there are two pause switches on /work/services')
})

/* ═══════════ K. the shopfront stands beside the form that writes it ══════ */

test('§K both supply-side editors draw the card a client sees', () => {
  /* ⚠️ WHAT THIS PINS (2026-08-29). /work/profile's own subtitle is „როგორ
   * გხედავენ კლიენტები", and it kept that promise with a LINK: open a tab,
   * look, come back, forget what you changed. These two screens are the only
   * ones on the site whose entire output is a card somebody else reads, so the
   * card belongs on the screen.
   *
   * ⚠️ AND IT MUST READ THE DRAFT, NOT THE STORED ROW. A preview built from
   * `data.profile` would be one save behind — it would show the old price while
   * the field beside it holds the new one, which is worse than no preview at
   * all. On /work/services the source is `draft`; on /work/profile the headline
   * comes from `form`, which is what the person is typing. */
  const trades = codeOf('app/work/services/_trades.tsx')
  assert.match(trades, /<ShopfrontCard/, 'the services editor lost the client card')
  assert.match(trades, /const shopfront = draft\.services\.map/,
    'the preview is built from something other than the draft — it will lag the form')

  const profile = codeOf('app/work/profile/_expertClient.tsx')
  assert.match(profile, /<ShopfrontCard/, 'the profile editor lost the client card')
  assert.match(profile, /headline=\{form\.headline \|\| null\}/,
    'the card reads the saved headline instead of the one being typed')

  /* One component, two screens: two hand-built cards would drift, and the whole
     point is that both show the SAME thing a client sees. */
  assert.ok(has('app/work/_components/ShopfrontCard.tsx'), 'the shared card is gone')
  const card = codeOf('app/work/_components/ShopfrontCard.tsx')
  assert.match(card, /ფასს შემოგთავაზებს/,
    'an unpriced service renders blank again — a gap where the neighbour has a number reads as hiding it')
  // The card never fetches: it is fed what its host already holds.
  assert.doesNotMatch(card, /fetch\(/, 'the preview card grew its own request — that is a second source')
})

/* ═══════════ L. a cleaner is not offered an accountant's work ════════════ */

test('§L the picker narrows to the world the provider is in', () => {
  /* ⚠️ WHAT THIS PINS (2026-08-30). Owner: „როდესაც დამლაგებლად დაამატა
   * სერვისი, იმას ხომ არ ექნება სურვილი ბუღალტრის სერვისი ჰქონდეს…
   * რეგისტრაციისას ეს დეტალები კომფორტულად უნდა იყოს და ზედმეტ რაღაცებს აღარ
   * უნდა თავაზობდეს."
   *
   * Measured that day on the 28 live providers who have any services: EVERY one
   * sits inside a single vertical, and 26 of the 28 inside a single GROUP — 1.1
   * groups each. Both pickers were drawing 28 group headings, so 27 of them
   * were headings that person will never open, and some could not apply at all.
   *
   * TWO PLACES, TWO MECHANISMS, ONE RULE:
   *   · /join ASKS once („რომელ კატეგორიაშია შენი საქმე") and narrows.
   *   · /work/services NEVER asks — by then the stored services answer it — and
   *     leads with that world, folding the other behind one row.
   */
  const join = codeOf('app/join/_master/client.tsx')
  assert.match(join, /const \[world, setWorld\]/, 'the registration form stopped asking which world')
  assert.match(join, /groups\.filter\(g => !world \|\| !g\.vertical \|\| g\.vertical === world\)/,
    'the registration browse list stopped narrowing to the chosen world')
  assert.match(codeOf('app/api/master-applications/route.ts'), /vertical: groupIsService\(g\)/,
    'the application vocabulary stopped carrying the vertical — the form cannot narrow without it')

  const trades = codeOf('app/work/services/_trades.tsx')
  assert.match(trades, /const mine = new Set\(/, 'the editor stopped deriving the provider\'s own world')
  assert.doesNotMatch(trades, /setWorld|რომელ კატეგორიაშია/,
    'the editor asks a question the provider already answered by registering')

  /* ⚠️ AND THE OTHER WORLD IS COLLAPSED, NEVER REMOVED. A cleaner who starts
   * teaching is a real person; a picker that made that impossible would be
   * worse than one that scrolls. */
  assert.match(trades, /world:\$\{s\.v\}/, 'the other world stopped being reachable')

  /* ⚠️ SEARCH CROSSES BOTH, DELIBERATELY. lib/requestTopics is explicit about
   * why — „A separation that loses a request is worse than the confusion it
   * fixed" — so only the list somebody SCROLLS may narrow. */
  // The hit list is built from EVERY topic in both pickers — asserted on the
  // expression itself, not on the lines near it.
  assert.match(trades, /const allTopics = data\.groups\.flatMap\(g => g\.topics\)/,
    'the editor search stopped reading every topic — „დალაგება" would stop being findable')
  assert.match(join, /groups\s*\n?\s*\.flatMap\(g => g\.topics\)/,
    'the registration search stopped reading every topic')
})
