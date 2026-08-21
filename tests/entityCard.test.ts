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
//     /api/masters/[id]/photo). The image IS the column here — no object
//     storage — so naming `photoUrl` or `workPhotos` in a card is a page that
//     grows by megabytes and breaks nothing visible. app/experts/_masterData.ts
//     carries the long version of this warning.
//
// Nothing here needs a browser: these are source-text pins, the same way the
// catalogue's other invariants are pinned.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const SHELL = 'components/EntityCard.tsx'
const EXPERT = 'app/experts/_card.tsx'
const MASTER = 'app/experts/_masterCard.tsx'
const CARDS = [EXPERT, MASTER]

/** Source with `//` and block comments stripped — for the negative assertions,
 *  which a prose mention of the forbidden word would otherwise fail. */
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

test('both catalogues render through the ONE shell, in the SAME geometry', () => {
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

test('the master card is the expert card: portrait, chips, meta, clamp, footer strip', () => {
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
  assert.match(m, /about=\{m\.about\}/)
  // NO PRICE IN THE CATALOGUE. A card is where you BROWSE, and a browsing
  // client cannot know what a job costs before it is described — any number
  // here is invented, and an invented number is a lie the client discovers
  // later. The price belongs where something concrete is bought: a service the
  // provider priced on their profile, or a consultation's booking screen.
  // On the STRIPPED source: the footer's own comment explains at length why the
  // price left, and that explanation must stay readable without failing the pin.
  // ⚠️ THE PRICE IS BACK, AS A FLOOR (2026-08-20) — see the footer note in
  // _masterCard.tsx. What must never return is an EXACT number on a browse
  // card: „50₾" claims to be the price of a job nobody has looked at yet.
  // „50₾-დან" claims a minimum, which is the one thing that is always true,
  // and it is the form every comparable marketplace uses.
  assert.match(code(MASTER), /<EntityPrice>\{m\.priceValue\}₾-დან<\/EntityPrice>/, 'the floor price left the service card')
  assert.match(code(MASTER), /ფასს შემოგთავაზებს/, 'the no-floor sentence is gone — the slot would be blank')
  // ⚠️ AND ON THE EXPERT CARD THE WORD IS NO LONGER WELDED ON (2026-08-20,
  // second pass). It used to read `{flagship.label}-დან`, i.e. „-დან" appended
  // to the FLAGSHIP tier — the most expensive thing the expert sells — so the
  // one claim the word makes was false wherever it mattered. Measured that
  // morning: 24 visible experts, 11 with 2+ paid tiers, 10 of them overstating
  // their own floor („₾100-დან" against a ₾25 tier). `offerPriceLabel` is the
  // ONE place the suffix is added and it adds it only to a real floor with a
  // real range behind it; the card may not re-implement that decision.
  assert.match(code(EXPERT), /<EntityPrice>\{offerPriceLabel\(offer\)\}<\/EntityPrice>/, 'the consultation card stopped reading the shared price resolver')
  assert.doesNotMatch(code(EXPERT), /\}-დან/, 'the expert card appended „-დან" itself — that word belongs to offerPriceLabel, which only gives it to a genuine floor')
  // The second half of the line names the SHAPE. A service („დეკლარაციის
  // შევსება") has no clock, and printing `.minutes` there fell through to the
  // profile-level default — advertising „· 60 წთ" for something with neither a
  // duration nor a calendar.
  assert.match(code(EXPERT), /· \{offer\.suffix\}/, 'the expert card went back to printing a duration a service does not have')
  assert.doesNotMatch(code(MASTER), /გამოძახება/, 'the price wording belongs to lib/serviceProfile → priceHint, never to the card')
})

test('the master photo is a ROUTE — no base64 column may be named in a card', () => {
  assert.match(read(MASTER), /src=\{m\.photoSrc\}/, 'the master photo must come from the photo route via m.photoSrc')
  for (const f of CARDS) {
    for (const col of ['photoUrl', 'workPhotos']) {
      assert.doesNotMatch(
        code(f),
        new RegExp(`\\b${col}\\b`),
        `${f} names the base64 column \`${col}\` — a list that selects one is a multi-megabyte page (app/experts/_masterData.ts)`,
      )
    }
  }
})

test('the master card’s one action is the profile, and it is a real link', () => {
  const m = read(MASTER)
  // ONE namespace since stage 11 (2026-08-19) — both cards in one list build
  // the same prefix, so a reader is never sent into a second address space.
  assert.match(m, /`\/experts\/\$\{m\.slug\}`/, 'the master card must address /experts/<slug>')
  assert.match(m, /<Btn\s+href=\{href\}\s+variant="secondary"\s+size="sm"/, 'the „პროფილი" action must be a <Btn href>, not a hand-built control')
  assert.match(m, /პროფილი/)
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
  // The expert's play badge: a 28px circle inside a 40×40 button, in BOTH views.
  // 🔒 40×40, however it is spelled.
  assert.match(read(EXPERT), /(w-10 h-10|size-10|min-w-10)/, 'the play button lost its 40×40 hit area')
})

test('the expert card keeps every behaviour the merge was not about', () => {
  const t = read(EXPERT)
  assert.match(t, /viewTransitionName: `vt-photo-\$\{t\.id\}`/, 'the shared-element photo morph is gone')
  assert.match(t, /\/experts\/\$\{t\.slug \|\| t\.id\}/, 'the card must prefer the slug — a cuid href 308s and kills the morph')
  assert.match(t, /youtube-nocookie\.com\/embed/, 'the hover video is gone')
  assert.match(t, /Icon\.heartFilled/, 'the favourite control is gone')
  assert.match(t, /superExpert/, 'the SUPER badge is gone')
  assert.match(t, /<NewExpertSignals/, 'the new-expert signals are gone')
  assert.match(t, /შესვლა და ჯავშანი/, 'the signed-out booking label is gone')
  // ⚠️ ONE ACTION PER BROWSE CARD (2026-08-20). This used to pin the „მიწერე"
  // + „დაჯავშნე" pair and the responsive grid that carried it. Both are gone:
  // the service half of the same catalogue has always shown a single button,
  // and so does every marketplace that lists people (Upwork's consultation
  // card, Base44, Braintrust, Airtasker, Fiverr). Two shapes in one list is
  // the loudest reason the two halves read as two products.
  //
  // The message path is NOT lost and this pins that too: an expert with no
  // published time still gets it as their one action, and the profile this
  // card opens carries ?intent=message for everyone else.
  assert.doesNotMatch(t, /aria-label="მიწერე ექსპერტს"/, 'the browse card grew a second action again')
  assert.doesNotMatch(t, /grid-cols-\[auto_1fr\]/, 'the two-button grid is back')
  assert.match(t, /intent=message/, 'the message path left the card entirely — it must survive as the slot-less branch')
  // The favourite button clears the 240px rail in a row — the two numbers are
  // written down in both files precisely because nothing else ties them.
  assert.match(t, /sm:right-\[248px\]/, 'the favourite button must clear the list rail — in the card’s own corner it sits on the price')
  assert.match(read(SHELL), /sm:right-\[248px\]/, 'EntityCard must record that the rail width is measured from elsewhere')
})

test('the consultation is a benefit line, never a second product', () => {
  // ⚠️ THE HIERARCHY, ENFORCED WHERE IT IS EASIEST TO BREAK (2026-08-20). The
  // site sells SERVICES; a consultation is what you can do BEFORE committing to
  // one. Owner: „უბრალოდ ბენეფიტია, რომ კონსულტაციაც გვაქვს."
  //
  // On a card that means exactly one muted line. The three shapes it must never
  // take are the three that would make it a product again: a badge beside the
  // name, a second button in the footer, or a heading. Each of those has been
  // on this card at some point.
  const m = code(MASTER)
  assert.match(m, /alsoConsults && \(/, 'the benefit line is unconditional or gone')
  assert.match(m, /კონსულტაციაც შეგიძლია/, 'the benefit line lost its words')
  assert.match(m, /text-meta text-ink-500">კონსულტაციაც/, 'the benefit line grew past text-meta — it is a line, not a claim')
  // It is drawn from the PERSON holding both halves, never from a type field.
  assert.match(code('app/experts/client.tsx'), /alsoConsults=\{it\.kinds\.includes\('CONSULT'\)\}/,
    'the benefit line stopped following who actually takes consultations')
  // …and it never becomes an action: the line and the card's ONE button are
  // siblings, so what must not exist is a control INSIDE the line's own span.
  const start = m.indexOf('{alsoConsults && (')
  const line = m.slice(start, m.indexOf('</span>', m.indexOf('კონსულტაციაც შეგიძლია')))
  assert.doesNotMatch(line, /<Btn|<button|href=/, 'the benefit line grew a control')
})
