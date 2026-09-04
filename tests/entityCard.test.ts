// THE ONE CATALOGUE CARD — and the two views the reader picks between.
//
// Run: npx tsx tests/entityCard.test.ts   (also in `npm run check`)
//
// WHY THIS FILE EXISTS. The owner asked for the two catalogues to become one
// product: „სერვისები და ექპერტები უნდა გაერთიანდეს და პატარა გადასართავი
// ექნება. ექპერტები როგორც არიან იმ ქარდით წამოიღე სერვისებიც. და მიეც
// საშვალება მომხარებელს ორი ვარიანტი ქონდეს განლაგებისთვის." (2026-08-19)
//
// Three of the properties that answer areff invisible when they break:
//
//   · THE TWO CARDS DRIFT. tests/archetypes.test.ts already pins that both
//     import the shell. It cannot see that the master went back to a 64px
//     avatar while the expert kept a portrait — same imports, two products.
//     `layout="portrait"` on BOTH is the thing that has to be checked.
//   · A VIEW SILENTLY DISAPPEARS. `view` is optional with a `grid` default so
//     the shell compiled before the cards landed. That default also means a
//     card that quietly stops reading the prop still renders, still typechecks,
//     and simply ignores the toggle the reader just tapped.
//   · A BASE64 COLUMN COMES BACK. The master photo is a ROUTE (`m.photoSrc` →
//     /api/providers/[id]/photo). The image IS the column here — no object
//     storage — so naming `photoUrl` or `workPhotos` in a card is a page that
//     grows by megabytes and breaks nothing visible. app/experts/_providers.ts
//     carries the long version of this warning.
//
// Nothing here needs a browser: these are source-text pins, the same way the
// catalogue's other invariants are pinned.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PRICE_ON_REQUEST } from '../lib/requests'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const SHELL = 'components/EntityCard.tsx'
// ⚠️ THERE WERE TWO CARDS UNTIL 2026-08-24 — `app/experts/_card.tsx` (the
// consultation one) and this. This whole file existed to hold them to the same
// shell so the two catalogues could not drift into two products. One roster,
// one card; what is still worth pinning is that the card renders through the
// shared shell and keeps the geometry it inherited.
const MASTER = 'app/experts/_providerCard.tsx'
const CARDS = [MASTER]

/** Source with `//` and block comments stripped — for the negative assertions,
 *  which a prose mention of the forbidden word would otherwise fail. */
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

test('the catalogue renders through the ONE shell, in the geometry it inherited', () => {
  for (const f of CARDS) {
    assert.match(read(f), /from '@\/components\/EntityCard'/, `${f} no longer renders through EntityCard`)
    assert.match(read(f), /<EntityCard\b/, `${f} imports the shell but does not render it`)
    assert.match(
      code(f),
      /layout="portrait"/,
      `${f} is not on the portrait geometry — the two catalogues read as two products again (owner, 2026-08-19: „ექპერტები როგორც არიან იმ ქარდით წამოიღე სერვისებიც")`,
    )
  }
  // The master's old 64px avatar. If this comes back, so does the split.
  assert.doesNotMatch(code(MASTER), /layout="plate"/, 'the master card went back to the plate layout')
})

test('both cards take the reader’s view, and both default to the shipped grid', () => {
  assert.match(read(SHELL), /export type EntityView = 'grid' \| 'list'/, 'the shell no longer names the two views')
  assert.match(read(SHELL), /view = 'grid'/, 'EntityCard’s view must default to grid — every existing call site passes nothing')

  for (const f of CARDS) {
    assert.match(code(f), /view\?: EntityView/, `${f} does not accept the reader’s view`)
    assert.match(code(f), /view = 'grid'/, `${f}’s view must default to grid — the shell compiles before and after this card lands`)
    assert.match(code(f), /view=\{view\}/, `${f} accepts view but never passes it to EntityCard — the toggle would do nothing`)
  }
})

test('the list view is a ROW from sm up, and a stacked card below it', () => {
  const shell = read(SHELL)
  // The row itself, and the footer strip stood up as a right-hand rail.
  assert.match(shell, /sm:flex-row/, 'the list view no longer turns the card into a row')
  assert.match(shell, /sm:border-t-0 sm:border-l/, 'the footer divider must turn with the strip when it becomes a rail')
  assert.match(shell, /sm:w-\[240px\]/, 'the list rail lost its fixed width — the actions stop lining up between rows')
  assert.match(shell, /sm:justify-center/, 'the list rail must be vertically centred')
  // ⚠️ EVERY row class is `sm:`-prefixed. A four-column row on a 390px phone is
  // the defect this rule exists to prevent: below the breakpoint the list card
  // IS the grid card.
  for (const cls of ['flex-row', 'border-l', 'w-\\[240px\\]']) {
    const bare = new RegExp(`(?<![:\\w-])${cls}`)
    assert.doesNotMatch(code(SHELL), bare, `\`${cls}\` is unprefixed — the list row would squash onto a phone`)
  }
  // One line of bio in a row, two in a card — and two on the phone, where the
  // row is a card again.
  assert.match(shell, /line-clamp-\d/, 'the list bio no longer clamps at all — a long bio will break the row height')
})

test('the card keeps the portrait, chips, meta, clamp and footer strip', () => {
  const m = read(MASTER)
  // The expert's own plate sizes, and the flat 80px list portrait.
  // The two catalogues must show a portrait of the SAME size as each other —
  // which is what EntityCard already guarantees by being the one shell. The
  // exact rem value was pinned here and broke on every portrait restyle.
  assert.match(m, /w-\d+ h-\d+/, 'the master card lost its portrait')
  // ROUND FOR A PERSON, ROUNDED-SQUARE FOR A FIRM — the one distinction the
  // master keeps that the expert has no use for.
  assert.match(m, /isCompany \? 'rounded-card' : 'rounded-full'/, 'the person/firm shape distinction was flattened')
  // The shared slots.
  assert.match(m, /chips=\{m\.services\}/)
  assert.match(m, /chipCap=\{CHIP_CAP\}/, 'the chip cap must come from the shell, not a local number')
  assert.match(m, /meta=\{m\.areas/)
  assert.match(m, /about=\{m\.about \?\? m\.headline\}/)
  // NO PRICE IN THE CATALOGUE. A card is where you BROWSE, and a browsing
  // client cannot know what a job costs before it is described — any number
  // here is invented, and an invented number is a lie the client discovers
  // later. The price belongs where something concrete is bought: a service the
  // provider priced on their profile, or a consultation's booking screen.
  // On the STRIPPED source: the footer's own comment explains at length why the
  // price left, and that explanation must stay readable without failing the pin.
  // ⚠️ THE PRICE IS BACK, AS A FLOOR (2026-08-20) — see the footer note in
  // _providerCard.tsx. What must never return is an EXACT number on a browse
  // card: „50₾" claims to be the price of a job nobody has looked at yet.
  // „50₾-დან" claims a minimum, which is the one thing that is always true,
  // and it is the form every comparable marketplace uses.
  assert.match(code(MASTER), /<EntityPrice>\{m\.priceValue\}₾-დან<\/EntityPrice>/, 'the floor price left the service card')
  /* ⚠️ THE WORD MOVED TO A CONSTANT AND CHANGED (2026-09-02). It was the
     literal „ფასს შემოგთავაზებს", spelled here and in four other files. Owner:
     „ეს სიტყვა რაღაც არაპროფესიონალურად ჟღერს… სხვა საიტები როგორ იყენებენ?" —
     and of six live marketplaces checked, none writes a SENTENCE in the price
     slot: it holds a figure or a verb on a control. This card already has the
     verb („მიიღე შეთავაზება"), so the slot said the same promise twice.

     The rule this line defends is unchanged and is the one worth pinning: the
     slot MUST NOT BE BLANK when there is no floor, or a card with no price
     reads as a card that failed to load. Pinned through the constant now, plus
     the constant being non-empty — which the literal could not check. */
  assert.match(code(MASTER), /<span[^>]*>\{PRICE_ON_REQUEST\}<\/span>/,
    'the no-floor slot stopped printing PRICE_ON_REQUEST — it would be blank')
  assert.ok(PRICE_ON_REQUEST.trim().length > 0, 'PRICE_ON_REQUEST is empty — the slot would be blank')
  assert.doesNotMatch(code(MASTER), /გამოძახება/, 'the price wording belongs to lib/serviceProfile → priceHint, never to the card')
})

test('the master photo is a ROUTE — no base64 column may be named in a card', () => {
  assert.match(read(MASTER), /src=\{m\.photoSrc\}/, 'the master photo must come from the photo route via m.photoSrc')
  for (const f of CARDS) {
    for (const col of ['photoUrl', 'workPhotos']) {
      assert.doesNotMatch(
        code(f),
        new RegExp(`\\b${col}\\b`),
        `${f} names the base64 column \`${col}\` — a list that selects one is a multi-megabyte page (app/experts/_providers.ts)`,
      )
    }
  }
})

test('the master card’s one action is the profile, and it is a real link', () => {
  const m = read(MASTER)
  // ONE namespace since stage 11 (2026-08-19) — both cards in one list build
  // the same prefix, so a reader is never sent into a second address space.
  assert.match(m, /`\/experts\/\$\{m\.slug\}`/, 'the master card must address /experts/<slug>')
  // ⚠️ THE ACTION IS „მიიღე შეთავაზება" AND IT IS `primary` SINCE 2026-08-31
  // (the owner's design canvas → Catalogue). It was a secondary „პროფილი", and
  // the change is not the colour: the WHOLE CARD already opens the profile
  // through EntityCard's overlay, so a second control saying „პროფილი" offered
  // the same destination twice. What is pinned is unchanged — one action, a
  // real <Btn href>, addressing /experts/<slug>.
  // ⚠️ THE SIZE WAS PINNED AS `sm` AND IS NOW „md OR BIGGER" (2026-09-04).
  // This assertion's own comment says what it is for — one action, a real
  // <Btn href>, addressing /experts/<slug> — and the size was never part of
  // that; it rode along in the regex and then failed a deliberate restyle
  // while the sentence above it stayed true.
  // It is not simply loosened, though. `sm` is `h-10 sm:h-9`, i.e. 36px from
  // the sm breakpoint up, and measured live on /experts this card's button was
  // 36 — four under the project's own tap floor, on the primary conversion
  // control of the catalogue, once per row. `md` (h-11) and `lg` (h-12) clear
  // 40 at every width; `sm` and anything below cannot. So the pin now carries
  // the rule that made the change rather than the value that happened to be
  // there when it was written.
  assert.match(m, /<Btn\s+href=\{href\}\s+variant="primary"\s+size="(md|lg)"/, 'the card action must be a <Btn href> at a size that clears the 40px tap floor at every width — `sm` is 36px on desktop')
  assert.match(m, /მიიღე შეთავაზება/)
  // ⚠️ THE BUTTON IS A SIBLING OF THE OVERLAY, NEVER A CHILD — EntityCard
  // renders `overlay` before the body, and the button opts above it with
  // `relative z-10`. Nesting a link inside a link is invalid HTML and the
  // browser resolves it by dropping one of them, silently.
  assert.match(m, /z-10/, 'the footer button must sit ABOVE the card-wide overlay link — without a raised z it is unclickable')
  assert.match(m, /tabIndex=\{-1\}/, 'the overlay must give up its tab stop — two stops to one address in every row')
  // ⚠️ NEVER an intake link on a card. tests/requests.test.ts inventories every
  // entry point to /request; a new one there needs an allowlist entry AND a
  // mechanism assertion, so it must never arrive by accident from a card.
  for (const f of CARDS) {
    assert.doesNotMatch(code(f), /['"`]\/request/, `${f} links to /request — a card must never be an entry point to the intake`)
  }
})

test('every tappable thing in either card stays at or above the 40px floor', () => {
  // The canon: h-9 / h-11 / h-12, icon buttons 40×40 or 36×36, and anything
  // tappable is ≥40px. <Btn> owns its own heights (`sm` is h-10 below sm,
  // h-9 from sm up — the blessed compact tier), so a card only has to prove it
  // hand-rolls nothing shorter.
  for (const f of CARDS) {
    // `=>` inside an inline handler is a `>` as far as a tag regex is
    // concerned, and it truncates the very tags this check is about. Neutralise
    // the arrows first, then read each opening tag as one string.
    const src = code(f).replace(/=>/g, '=@')
    for (const m of src.matchAll(/<[A-Za-z][^<>]*>/gs)) {
      const tag = m[0]
      if (!/href=|onClick=/.test(tag)) continue
      if (/<Btn\b/.test(tag)) continue // the primitive owns the height
      if (/tap-area/.test(tag)) continue // keeps its visual size, gains a ::before hit area
      const h = tag.match(/(?<![\w-])h-(\d+(?:\.\d+)?)/)
      if (!h) continue // no height of its own — inline link or a full-bleed overlay
      assert.ok(
        Number(h[1]) >= 10,
        `${f}: an interactive element sets h-${h[1]} (${Number(h[1]) * 4}px) — under the 40px tap floor`,
      )
    }
  }
  // ⚠️ THE PLAY BADGE WAS THE OTHER ASSERTION HERE — a 28px circle inside a
  // 40×40 button on the consultation card, which went on 2026-08-24 with the
  // intro video it opened.
})

/* ⚠️ „the expert card keeps every behaviour the merge was not about" WAS HERE
   AND IS GONE (2026-08-24): the shared-element photo transition, the hover
   video, the favourite heart and the booking button all belonged to a card that
   no longer exists. */

/* ⚠️ „the consultation is a benefit line, never a second product" WAS HERE AND
   IS GONE (2026-08-24). It pinned one muted line under the price — „კონსულტაციაც
   შეგიძლია" — and the three shapes it must never take: a badge beside the name,
   a second button in the footer, a heading. There is no second thing to
   mention, so the line went with it and the rule is unrepresentable. */
