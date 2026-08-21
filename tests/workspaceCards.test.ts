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
  for (const f of [
    'app/work/(provider)/requests/[id]/page.tsx',
    'app/me/requests/page.tsx',
    'app/me/_requests.tsx',
  ]) {
    assert.match(codeOf(f), /\{r\.headline\}/, `${f} still titles rows by category`)
  }
  // ⚠️ THE QUEUE CARD IS THE ONE SCREEN WITH ROOM FOR THE WHOLE PARAGRAPH, so
  // it prints the description ITSELF as the title rather than the shortened
  // headline — printing both put the same first sentence on the card twice.
  // The fallback is the same one `requestHeadline` applies: no description, no
  // title, so the category takes over.
  assert.match(codeOf('app/work/(provider)/requests/page.tsx'),
    /\{titled \? r\.description : r\.topicLabel\}/, 'the queue card stopped titling by what the client wrote')
  assert.match(codeOf('app/work/(provider)/requests/page.tsx'),
    /const titled = \(r\.description \?\? ''\)\.trim\(\) !== ''/, 'the untitled-card fallback is gone')
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
  'app/me/requests/page.tsx',
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
    // `.stagger` is a raw CSS animation helper, so it needs the variant too.
    for (const m of src.matchAll(/(\S*)stagger\b/g)) {
      assert.match(m[1], /motion-safe:$/, `${f}: .stagger is not motion-safe gated`)
    }
  }
})

test('the lists move and the controls do not', () => {
  // Entrances belong to the list. A control that fades in is a control the
  // person cannot press yet — CLAUDE.md is explicit, and it is the one motion
  // rule with a usability cost rather than a taste one.
  const q = codeOf('app/work/(provider)/requests/page.tsx')
  // 🔒 `motion-safe:` is the accessibility contract; the grid spacing is taste.
  assert.match(q, /grid-cols/, 'the queue is no longer a grid')
  assert.match(q, /motion-safe:/, 'the queue animates without a motion-safe guard')
  assert.match(q, /<Card\s+key=\{r\.id\}\s+className="flex\s+flex-col\s+h-full\s+hover-lift">/, 'the queue card lost hover-lift or equal height')
  assert.doesNotMatch(q, /<Btn[^>]*animate-/, 'an entrance was put on a button')
  const jobs = codeOf('app/work/jobs/_client.tsx')
  assert.match(jobs, /<div\s+key=\{tab\}\s+className="space-y-6\s+motion-safe:animate-fade-in-fast">/,
    'switching a filter no longer replays — an instant swap with no transition reads as „did that work?"')
})

/* ── D. The queue card, and the two words that changed ───────────────────── */

test('the provider queue leads with money and asks for an offer', () => {
  const q = codeOf('app/work/(provider)/requests/page.tsx')
  // The six-field <dl> wrapped unevenly and set the strongest fact on the card
  // in the same size as „ფორმატი: ონლაინ".
  assert.doesNotMatch(q, /<dl /, 'the six-field definition list is back')
  assert.doesNotMatch(q, /r\.extras/, 'the clarifiers are back on the triage card — they belong to the quote')
  // The amount at h3, the unit weaker beside it — the split is exact because
  // it is this kind's own unitLabel, not a guess at where the spaces fall.
  assert.match(q, /text-h3\s+font-bold\s+text-ink-900\s+tabular-nums">\{amount\}/, 'the budget stopped leading')
  assert.match(q, /const unit = KIND\[r\.kind\]\.unitLabel/, 'the unit is being guessed rather than read')
  // Places left is a decision, so it is a badge — and the last one is a warning.
  assert.match(q, /border-warning-300 text-warning-700' : 'border-brand-200 text-brand-700/, 'the places badge lost its two states')
  // ⚠️ THE 11px FLOOR. `text-micro` is for uppercase mtavruli and bare numerals
  // only; this badge is sentence-case mkhedruli, which turns to mush below
  // 12px. Caught by review after it shipped in the first pass of this card.
  assert.doesNotMatch(q, /rounded-pill border text-micro/, 'a sentence-case Georgian badge went under the 12px floor')
  // „ნახვა" is the name of a page; „შეთავაზება" is the reason they are here.
  assert.match(q, /შეთავაზება\s*\n?\s*<\/Btn>/, 'the queue action went back to naming a page')
  assert.doesNotMatch(q, /variant="secondary"[^>]*>\s*ნახვა/, 'the secondary „ნახვა" button is back')
})

test('the kind filter names what is bought, not who does it', () => {
  // „მასწავლებელი" sat in a row with three things somebody BUYS. Same mistake
  // as „ხელოსანი", one filter over.
  assert.match(codeOf('lib/requestTopics.ts'), /label: 'სწავლება'/)
  assert.doesNotMatch(codeOf('lib/requestTopics.ts'), /label: 'მასწავლებელი'/)
  // …and the workspace's two filter strips are one grammar now.
  const q = codeOf('app/work/(provider)/requests/page.tsx')
  assert.match(q, /border-b border-ink-200/, 'the request filter is not the workspace tab strip')
  assert.match(q, /-bottom-px h-\[2px\] bg-brand-500/, 'the active tab lost its underline')
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
