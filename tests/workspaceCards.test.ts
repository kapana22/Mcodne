/*
 * THE WORKSPACE'S LISTS — what a person reads, and what moves.
 *
 * Run:  npx tsx tests/workspaceCards.test.ts   (also in `npm run check`)
 *
 * WHY THIS FILE EXISTS. Five screens shipped within a few days of each other
 * and each invented its own answer to the same three questions. None of the
 * failures below is visible in a type check, a screenshot of ONE card, or a
 * diff:
 *
 *   · THE TITLE WAS THE CATEGORY. `topicLabel` headed every row, so a queue of
 *     four cleaning jobs was four cards reading „ბინის დალაგება" and the only
 *     way to tell them apart was to read the paragraph under each. It looks
 *     perfect in a screenshot of one card. It is unusable as a list.
 *   · THE STATUS WAS PROSE. An offer's „did I win" sat in a dot-separated
 *     `text-meta` row, so SENT, DECLINED and WITHDRAWN rendered identically
 *     while every other list in the same workspace used a pill.
 *   · MOTION WAS A LOCAL DECISION. The library is closed at eight tokens and
 *     `motion-safe:` is an accessibility contract, not a preference — a missing
 *     guard renders identically for everybody it does not harm.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { requestHeadline } from '../lib/requests'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const codeOf = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n')

/* ── A. The headline ─────────────────────────────────────────────────────── */

test('requestHeadline prefers the person\'s words and NEVER returns nothing', () => {
  // The floor is the whole reason the helper exists rather than a `??` at five
  // call sites: a card with no title is worse than a repeated one.
  assert.equal(requestHeadline('', 'ბინის დალაგება'), 'ბინის დალაგება')
  assert.equal(requestHeadline(null, 'სანტექნიკა'), 'სანტექნიკა')
  assert.equal(requestHeadline('   ', 'სანტექნიკა'), 'სანტექნიკა')
  // First sentence, without its full stop.
  assert.equal(
    requestHeadline('სამოთახიანი ბინა მესამე სართულზე. რემონტის შემდეგ დარჩა მტვერი.', 'დალაგება'),
    'სამოთახიანი ბინა მესამე სართულზე')
  // Short text survives whole, with no ellipsis bolted on.
  assert.equal(requestHeadline('ონკანი წვეთავს', 'სანტექნიკა'), 'ონკანი წვეთავს')
  // Long text breaks on a WORD, never mid-word, and says it was cut.
  const long = requestHeadline('ერთი ორი სამი ოთხი ხუთი ექვსი შვიდი რვა ცხრა ათი თერთმეტი თორმეტი ცამეტი თოთხმეტი', 'თემა')
  assert.ok(long.endsWith('…'), 'a truncated headline must say so')
  assert.ok(long.length <= 82, `the cap leaked: ${long.length}`)
  assert.ok(!/\s…$/.test(long), 'the cut left a dangling space')
  // Four requests on one topic must not produce four identical headings — the
  // failure this whole change exists to remove.
  const four = ['პირველი ბინა', 'მეორე ბინა', 'მესამე ბინა', 'მეოთხე ბინა']
    .map(d => requestHeadline(d, 'ბინის დალაგება'))
  assert.equal(new Set(four).size, 4, 'distinct requests produced identical titles')
})

test('every list that shows a request titles it with the headline', () => {
  // Shaped once (providerRequestView / myRequests) and read everywhere, so a
  // card and the page it opens cannot call the same request two things.
  assert.match(codeOf('lib/requests.ts'), /headline: requestHeadline\(r\.description, topicLabel\(r\.topic\)\)/)
  assert.match(codeOf('lib/myRequests.ts'), /headline: requestHeadline\(r\.description/)
  // ⚠️ `app/me/requests/page.tsx` LEFT THIS LIST ON 2026-08-30 — it is a
  // redirect now; the rows it drew are `app/me/_requests.tsx`, which is still
  // here and still asserted.
  // ⚠️ THE QUEUE CARD JOINED THIS LIST (2026-09-01, the owner's design canvas →
  // „Expert Jobs"). It used to print the description ITSELF as the title, on
  // the argument that it was the one screen with room for the whole paragraph;
  // the canvas gives the card a photograph and a three-fact row, so the room is
  // gone and the title is `line-clamp-2` — which is what `requestHeadline`
  // already computes, and computing it twice in two places is how a card and
  // the page it opens start calling one request two things.
  //
  // The fallback rides along and is the whole reason to read the shared value
  // rather than `r.description`: no description, no title, so the category
  // takes over — a card with no title is worse than a repeated one.
  for (const f of [
    'app/work/(provider)/requests/page.tsx',
    'app/work/(provider)/requests/[id]/page.tsx',
    'app/me/_requests.tsx',
  ]) {
    assert.match(codeOf(f), /\{r\.headline\}/, `${f} still titles rows by category`)
  }
  // The offers row has room for the paragraph too, so it titles by the
  // description itself — and must not ALSO print it below, which is exactly
  // what the first pass of this redesign did on both list screens.
  const off = codeOf('app/work/(provider)/offers/page.tsx')
  assert.match(off, /\?\?\s*''\)\.trim\(\)\s+!==\s+''\s+\?\s+o\.request\.description\s+:\s+topicLabel\(o\.request\.topic\)/,
    'the offers row stopped titling by what the client wrote')
  assert.equal((off.match(/o\.request\.description/g) || []).length, 2,
    'the description is printed twice on one row (title + paragraph), or not at all')
})

/* ── B. One badge grammar, one file ──────────────────────────────────────── */

test('both status pills live in one file and share one shell', () => {
  // They were born apart — the client's in app/me/requests/_pill.tsx, the
  // provider's not at all — and that is exactly how the two halves drifted.
  const pills = codeOf('components/requests/StatusPills.tsx')
  assert.match(pills, /export function RequestStatusPill/)
  assert.match(pills, /export function OfferStatusPill/)
  assert.match(pills, /function Pill\(/, 'the two pills stopped sharing a shell — a tone change can land on one half')
  // The site's badge grammar: hairline border + coloured text, never a fill.
  assert.doesNotMatch(pills, /\bbg-(brand|warning|danger|ink)-\d00\b/, 'a pill grew a filled background')
  // ACCEPTED must not read like DECLINED.
  assert.match(pills, /ACCEPTED: 'border-brand-200 text-brand-700'/)
  assert.match(pills, /DECLINED: 'border-ink-200 text-ink-500'/)
  assert.match(pills, /SENT: 'border-ink-200 text-ink-700'/)
  // The old private copy is gone, not merely unused.
  assert.throws(() => read('app/me/requests/_pill.tsx'), 'the per-page pill is back')
  assert.match(codeOf('app/work/(provider)/offers/page.tsx'), /<OfferStatusPill/, 'the offer status is prose again')
})

/* ── C. Motion: the closed library, always guarded ───────────────────────── */

const TOKENS = ['fade-in', 'fade-in-fast', 'rise-in', 'slide-in-r', 'slide-in-b', 'scale-in', 'pulse-soft', 'shimmer', 'pulse', 'spin']
const SCREENS = [
  'app/work/(provider)/requests/page.tsx',
  'app/work/(provider)/offers/page.tsx',
  'app/work/(provider)/requests/[id]/page.tsx',
  'app/me/_requests.tsx',
  'app/work/jobs/_client.tsx',
  'components/requests/StatusPills.tsx',
]

test('no screen mints an animation, and every one is motion-safe gated', () => {
  for (const f of SCREENS) {
    const src = codeOf(f)
    for (const m of src.matchAll(/(\S*)animate-([a-z-]+)/g)) {
      assert.ok(TOKENS.includes(m[2]), `${f}: minted an animation: animate-${m[2]}`)
      assert.match(m[1], /motion-safe:$/, `${f}: an animation is not motion-safe gated: ${m[0]}`)
    }
    // ⚠️ AND `.stagger` IS THE EXACT OPPOSITE — THIS ASSERTION REQUIRED THE BUG
    // (2026-08-26). It read „a raw CSS animation helper, so it needs the
    // variant too" and demanded `motion-safe:stagger`. But `.stagger` is a
    // hand-written rule in globals.css, NOT a Tailwind utility, so Tailwind
    // cannot build a variant of it: `motion-safe:stagger` compiles to nothing
    // and the element wears a literal class name that no selector matches.
    // Measured in Chrome on 2026-08-21 (app/_home/hero.tsx says so, and fixed
    // itself) — `animationName` came back `none`. Nine call sites across /work
    // and /me were still writing the prefixed form and their entrance simply
    // did not run. The contract is kept by the STYLESHEET: `.stagger` lives
    // inside `@media (prefers-reduced-motion: no-preference)` (globals.css
    // §314), which is the browser answering the question rather than us.
    for (const m of src.matchAll(/(\S*)stagger\b/g)) {
      assert.doesNotMatch(m[1], /motion-safe:$/,
        `${f}: motion-safe:stagger compiles to nothing — write \`stagger\`, the CSS is already gated`)
    }
  }
})

test('the lists move and the controls do not', () => {
  // Entrances belong to the list. A control that fades in is a control the
  // person cannot press yet — CLAUDE.md is explicit, and it is the one motion
  // rule with a usability cost rather than a taste one.
  const q = codeOf('app/work/(provider)/requests/page.tsx')
  // 🔒 The entrance is the accessibility contract; the grid spacing is taste.
  //
  // ⚠️ AND THE TASTE HALF IS SPENT (2026-09-01, the owner's design canvas →
  // „Expert Jobs"). The queue is a single column of full-width rows now — a
  // photograph on the left, the job on the right — because the photo is what
  // lets a provider name a price without opening a conversation, and a
  // half-width grid cell had nowhere to put one. `grid-cols` pinned the OLD
  // shape, which the line above already said was not the thing worth pinning.
  // What replaces it is the container the entrance hangs on: a list, one child
  // per request, so the cascade below has something to cascade.
  assert.match(q, /className="[^"]*\bflex flex-col\b[^"]*\bstagger\b[^"]*"[\s\S]{0,80}?requests\.map/,
    'the queue list is no longer one column of rows carrying the entrance')
  // ⚠️ THIS READ `/motion-safe:/` UNTIL 2026-08-26, and the file's ONLY match
  // was `motion-safe:stagger` — the form that compiles to nothing (see above).
  // So the assertion passed on the string that guaranteed no animation ran.
  // What it means to check is that the LIST has the entrance; the reduced-motion
  // gate is in globals.css, where the browser can answer it.
  assert.match(q, /\bstagger\b/, 'the queue list lost its entrance')
  assert.doesNotMatch(q, /motion-safe:stagger/, 'motion-safe:stagger compiles to nothing')
  // ⚠️ IT WAS `<LeadCard>` FROM 2026-08-31 TO 2026-09-01, and it is a plain
  // `<Link>` again — the owner's newer canvas („Expert Jobs") redrew the card
  // as a photo row and `app/work/(provider)/_lead` has no importer left.
  //
  // Of the two things this line has always protected, one was answered by the
  // shape and one still needs asserting. `h-full` was equal height ACROSS A
  // GRID ROW; there is no row any more, so nothing can be ragged. The lift is
  // the live half: it is the only thing on the card that says the whole card is
  // pressable, so it is pinned to the element that IS the card — and that
  // element being a `<Link>` is the stronger form of the same promise, one tab
  // stop for one destination instead of a card with a button in it.
  assert.match(q, /<Link\s+key=\{r\.id\}[\s\S]{0,320}?hover-lift/, 'the queue card is no longer one link, or it lost hover-lift')
  assert.doesNotMatch(q, /<Btn[^>]*animate-/, 'an entrance was put on a button')
  const jobs = codeOf('app/work/jobs/_client.tsx')
  assert.match(jobs, /<div\s+key=\{tab\}\s+className="space-y-6\s+motion-safe:animate-fade-in-fast">/,
    'switching a filter no longer replays — an instant swap with no transition reads as „did that work?"')
})

/* ── D. The queue card: three facts, one tab stop ────────────────────────── */

test('the provider queue card is a bounded set of facts, not the whole request', () => {
  const q = codeOf('app/work/(provider)/requests/page.tsx')
  // The six-field <dl> wrapped unevenly and set the strongest fact on the card
  // in the same size as „ფორმატი: ონლაინ".
  assert.doesNotMatch(q, /<dl /, 'the six-field definition list is back')

  /* ⚠️ THE CLARIFIERS ARE BACK ON THE CARD, DELIBERATELY (2026-09-01, the
     owner's design canvas → „Expert Jobs"), and the ban that stood here was
     aimed at the wrong noun. „they belong to the quote" was written against a
     card that printed the WHOLE `extras` bag — six answers at one weight,
     which is the same defect the <dl> above had, wearing different markup.
     The canvas asks for exactly three facts („ადგილი / მოცულობა / მასალა") and
     two of those three are clarifiers: they are what makes one cleaning job
     differ from the next, which is precisely what a triage card is for.

     So what is pinned is the BOUND, which is the thing that was ever at risk.
     The card takes at most two clarifiers and shows at most three facts in
     total, so a topic that asks the client eight questions produces the same
     card as one that asks none. */
  assert.match(q, /r\.extras\.slice\(0,\s*2\)/, 'the clarifier bag is spread onto the card uncapped again')
  assert.match(q, /\]\.slice\(0,\s*3\)/, 'the fact row lost its ceiling — a card is three facts, whatever the topic asks')

  /* ⚠️ THE MONEY STOPPED LEADING, AND THAT IS THE CANVAS'S CALL. It was set at
     `text-h3` with the unit beside it, because the card had nothing else with
     any weight on it. It has a photograph now — the one thing that lets a price
     be named without a conversation — so the budget is one of the three facts,
     at the same weight as the other two.

     What is still worth asserting is that it is THERE and that it is the SHAPED
     value: `budgetLabel` comes off `providerRequestView`, already carrying this
     kind's own unit, so the card cannot re-derive „₾ / სესია" and disagree with
     the page it opens. That is what `const unit = KIND[r.kind].unitLabel` used
     to protect, and reading the shaped string protects it without the split. */
  assert.match(q, /\{ k: 'ბიუჯეტი', v: r\.budgetLabel \}/, 'the budget left the card, or is being re-derived on it')

  // Places left is a decision, so it is a badge — and the last one is a warning.
  // Two states, and the last place is the warning — the colours moved into the
  // canvas's own hue table, so what is pinned is that the page still BRANCHES
  // on „is this the last place". Inline since 2026-09-01; the branch is the
  // rule, the local that held it was not.
  assert.match(q, /r\.placesLeft === 1\s*\?/, 'the places badge lost its two states')
  // ⚠️ THE 11px FLOOR. `text-micro` is for uppercase mtavruli and bare numerals
  // only; this badge is sentence-case mkhedruli, which turns to mush below
  // 12px. Caught by review after it shipped in the first pass of this card.
  //
  // ⚠️ WIDENED 2026-09-01: it read `rounded-pill border text-micro`, three
  // utilities in one order, and the canvas's pills are not all bordered — the
  // photo count is a filled `rounded-pill bg-ink-900/85`. The floor is about
  // the SIZE of Georgian text in a pill, so it is now asked of any pill.
  for (const m of q.matchAll(/className=\{?`?"?[^"`]*\brounded-pill\b[^"`]*"?`?\}?/g)) {
    assert.doesNotMatch(m[0], /\btext-micro\b/, 'a sentence-case Georgian badge went under the 12px floor')
  }

  /* ⚠️ „ნახვა" IS HONEST NOW, AND IT WAS NOT BEFORE (2026-09-01, the canvas).
     This line read „„ნახვა" is the name of a page; „შეთავაზება" is the reason
     they are here" — true while the card opened a screen with the offer form
     stacked on it, so calling the button „ნახვა" hid the only verb that
     mattered. The canvas moved the form to a screen of its own
     (`.../[id]/offer`), so the card now genuinely leads to a page you read
     before you answer, and naming it after the offer would promise a form that
     is one click further on.

     What replaces the word is the rule the word was standing in for: the card
     is ONE destination and ONE tab stop. The affordance is drawn inside the
     link and marked `aria-hidden`, so a keyboard reaches the card once — a
     real control nested in a card-wide link is two stops to the same place, and
     it is what the „ნახვა" button used to be. */
  assert.match(q, /aria-hidden\s*\n\s*className="[^"]*"\s*>\s*\n?\s*ნახვა/,
    'the card affordance is no longer decoration inside the link')
  // ⚠️ SCOPED WITH ITS OWN GUARDS, because a `doesNotMatch` over a slice that
  // came back empty is the assertion that passes for ever and means nothing.
  const from = q.search(/<Link\s+key=\{r\.id\}/)
  assert.ok(from > 0, 'the queue card is no longer <Link key={r.id}> — the assertion below has nothing to scope to')
  const to = q.indexOf('</Link>', from)
  assert.ok(to > from, 'the card link never closes — the slice below would be the rest of the file')
  const card = q.slice(from, to)
  assert.ok(card.length > 400, `the card link scoped to ${card.length} characters — that is not the card`)
  assert.doesNotMatch(card, /<Btn|<button/,
    'a control was nested inside the card link — the card is one destination and must be one tab stop')
})

test('the kind filter names what is bought, not who does it', () => {
  // „მასწავლებელი" sat in a row with three things somebody BUYS. Same mistake
  // as „ხელოსანი", one filter over.
  assert.match(codeOf('lib/requestTopics.ts'), /label: 'სწავლება'/)
  assert.doesNotMatch(codeOf('lib/requestTopics.ts'), /label: 'მასწავლებელი'/)
  // …and the workspace's two filter strips are one grammar now.
  const q = codeOf('app/work/(provider)/requests/page.tsx')
  // ⚠️ ONE STRIP, AND IT IS THE SHARED COMPONENT NOW. The assertion used to
  // read a hairline class, which only ever proved the two strips LOOKED alike;
  // the queue renders `<WorkTabs>` itself since 2026-08-31, so they cannot
  // differ at all. The canvas turned that strip into pills — a class pin would
  // have broken on the restyle while the guarantee held.
  assert.match(q, /<WorkTabs\b/, 'the request filter is not the workspace tab strip')
  // ⚠️ THE UNDERLINE BECAME A FILL (2026-08-31, the canvas's pills). What the
  // line protects is that the LIVE stage is visibly the live one, and the
  // marker now lives in the shared component rather than in this page — so it
  // is asserted there, once, for every screen that draws the strip.
  assert.match(codeOf('app/work/_components/WorkTabs.tsx'), /aria-selected=\{on\}/,
    'the stage strip stopped telling assistive tech which stage is live')
  assert.match(codeOf('app/work/_components/WorkTabs.tsx'), /on\s*\n?\s*\?\s*'border-ink-900 bg-ink-900 text-white'/,
    'the active stage lost its fill')
})

/* ── E. No system dialogs ────────────────────────────────────────────────── */

test('the workspace never opens a browser dialog', () => {
  // One directory over, the client half had already replaced these and said
  // why in a comment. A native confirm cannot say what is irreversible.
  for (const f of [
    'app/work/(provider)/offers/_actions.tsx',
    'app/work/(provider)/requests/page.tsx',
    'app/work/jobs/_client.tsx',
  ]) {
    assert.doesNotMatch(codeOf(f), /window\.(confirm|alert|prompt)\(/, `${f} opens a browser dialog`)
  }
  const actions = codeOf('app/work/(provider)/offers/_actions.tsx')
  assert.match(actions, /<ConfirmModal/, 'the offer actions lost their in-app confirm')
  // Both verbs are one-way, so both have to be asked.
  assert.equal((actions.match(/<ConfirmModal/g) || []).length, 2, 'one of the two irreversible verbs asks nothing')
})
