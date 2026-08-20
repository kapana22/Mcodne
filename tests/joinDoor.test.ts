/*
 * THE PROVIDER'S DOOR — the rules it kept breaking, now asserted.
 *
 * Run:  npx tsx tests/joinDoor.test.ts   (also in `npm run check`)
 *
 * WHY THIS FILE EXISTS. On 2026-08-20 the hierarchy was written into CLAUDE.md
 * — service first, and the type belongs to what is OFFERED and never to what
 * kind of person somebody is — and then the single most important screen for a
 * provider was left violating both, for hours, while other things were fixed
 * around it. The owner found it, not a test. Owner: „რადგან არაფერს არ
 * მისწორებ რასაც გთხოვ. თუ წესს ეწინააღმდეგება და ჩაწერილია — წაშალე."
 *
 * A rule that lives only in a document is a rule somebody walks past. These
 * are the same rules, executable.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PROFESSIONS } from '../lib/professions'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const codeOf = (p: string) =>
  read(p).split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n').replace(/\/\*[\s\S]*?\*\//g, '')

test('the door offers the SERVICE first', () => {
  // This array is the order the tiles are drawn in, and the tiles are the first
  // thing anybody who wants to sell here reads. CONSULT was pushed first — a
  // statement about what this site is, made by a line nobody thought of as copy.
  const page = codeOf('app/join/page.tsx')
  const w = page.indexOf("offer.push('WORK')")
  const c = page.indexOf("offer.push('CONSULT')")
  assert.ok(w > -1 && c > -1, 'a capability stopped being offered at the door')
  assert.ok(w < c, 'the consultation tile is built before the service tile — CLAUDE.md, THE HIERARCHY rule 4')
})

test('both tiles name an OFFER, never a person', () => {
  // „ვარ ექსპერტი" beside „ვთავაზობ სერვისს" — one tile answering „who am I",
  // the other „what do I offer". That is the framing retired with „ხელოსანი".
  const tiles = codeOf('app/join/JoinClient.tsx')
  assert.doesNotMatch(tiles, /'ვარ ექსპერტი'/, 'a tile names an identity again — CLAUDE.md, THE HIERARCHY rule 5')
  assert.doesNotMatch(tiles, /t: 'ვარ /, 'a tile starts with „ვარ" — that is a person, not an offer')
  assert.match(tiles, /WORK: \{ t: 'ვასრულებ სერვისს'/)
  assert.match(tiles, /CONSULT: \{ t: 'ვატარებ კონსულტაციას'/)
  // …and the service tile is declared first, so a reader of this file sees the
  // same order the page draws.
  assert.ok(tiles.indexOf('WORK: {') < tiles.indexOf('CONSULT: {'), 'the tile map lists the consultation first')
})

test('neither door makes the applicant retype what they already answered', () => {
  // Both doors reached comfort parity on 2026-08-20; before that each had
  // exactly what the other lacked, which is the shape of a split nobody sees.
  const work = read('app/join/_master/client.tsx')
  const expertDraft = read('app/join/_expert/_draft.tsx')

  // A draft. Six blocks, a photo upload and an incoming call — on a phone that
  // is not an edge case — used to send this applicant back to „ვინ ხარ".
  assert.match(work, /localStorage\.setItem\(DRAFT_KEY/, 'the service door lost its draft again')
  assert.match(work, /localStorage\.removeItem\(DRAFT_KEY\)/, 'a submitted draft is left behind and refills the form')
  assert.match(expertDraft, /localStorage/, 'the expert door lost its draft')
  // Photos are deliberately NOT in the draft — base64 data URIs against a ~5MB
  // origin budget, and a quota error would drop the whole thing.
  const saved = /JSON\.stringify\(\{([\s\S]*?)\}\)/.exec(work)?.[1] ?? ''
  assert.doesNotMatch(saved, /photoUrl|workPhotos/, 'the draft stores megabytes of base64 — quota will drop it whole')

  // A search over the taxonomy. Nineteen spheres in a grid is nine rows of
  // reading before the one that is yours.
  assert.match(work, /type="search"/, 'the service door lost its search')
  assert.match(read('components/ProfessionPicker.tsx'), /type="search"/, 'the expert door has no search over its spheres')
})

test('„დარჩა" takes you there instead of naming it', () => {
  const work = codeOf('app/join/_master/client.tsx')
  assert.match(work, /const jumpTo = \(field: string\)/, 'the missing list went back to being words under a disabled button')
  assert.match(work, /scrollIntoView/)
  // Every entry has a target, or the button is a dead control. Two spellings
  // are legitimate: `data-field` straight on an input, or `field=` on a Block,
  // which forwards it to the Card as the same attribute.
  for (const f of ['fullName', 'phone', 'companyName', 'services', 'about']) {
    assert.match(work, new RegExp(`(data-)?field="${f}"`),
      `„${f}" is listed as missing but nothing on the page answers to it`)
  }
  // …and the Block prop really does become the attribute jumpTo queries.
  assert.match(work, /<Card className="mt-4" data-field=\{field\}>/, 'Block stopped forwarding its jump target')
})

test('no question is asked that has one answer', () => {
  // The rule the intake already follows, applied at the door: with one city
  // served, „სად მუშაობ" is the form performing a choice nobody has.
  assert.match(codeOf('app/join/_master/client.tsx'), /cities\.length > 1 && \(/,
    'the city block is unconditional again')
  assert.match(codeOf('app/join/_master/client.tsx'), /if \(cs\.length === 1\) setAreas/,
    'the single city is no longer answered for them — the form cannot be submitted')
})

test('a hidden block does not leave a hole in the numbering', () => {
  // Hard-coded `n={3}` meant that hiding one block made the form count
  // „1 2 4 5 6 7" — which tells the applicant something is missing.
  const work = codeOf('app/join/_master/client.tsx')
  assert.doesNotMatch(work, /<Block n=\{\d+\}/, 'a block number was typed by hand again')
  assert.match(work, /n=\{\+\+blockNo\}/, 'the blocks stopped numbering themselves')
})

test('the one word an applicant is certain of finds them', () => {
  /* ⚠️ THE WALL THE OWNER KEPT SENDING BACK. The picker asked two questions in
   * order — ① კატეგორია, ② პროფესია — and step ② printed „ჯერ კატეგორია
   * აირჩიე" until step ① was answered. The way past it was a search field
   * whose own placeholder invited a profession („მოძებნე — ბუღალტერია…") and
   * which searched SPHERE NAMES ONLY. So typing „ბუღალტერი" — the single word
   * that person is sure of — answered „ვერაფერი მოიძებნა", with a dead step
   * underneath. Owner, looking at exactly this screen: „ათასჯერ ვთქვი ამის
   * გამოსწორება და ისევ იგივეა."
   *
   * A person knows their job title. The category is OUR taxonomy's need. */
  const src = read('components/ProfessionPicker.tsx')
  assert.match(src, /ALL_PROFESSIONS/, 'the search reads spheres only again')
  assert.match(src, /jobHits/, 'the profession results are gone')
  // One tap answers BOTH steps — the whole point of the hit list.
  assert.match(src, /onClick=\{\(\) => \{\s*if \(cat\) onSphere\(cat\.name\)/,
    'picking a profession no longer fills the category in')
  assert.doesNotMatch(src, /ჯერ კატეგორია აირჩიე — მერე აქ მისი პროფესიები გამოჩნდება/,
    'step ② is a dead end again')
  // And the placeholder must not promise something the field cannot do.
  const ph = src.match(/placeholder="([^"]+)"/)
  assert.ok(ph && /პროფესია/.test(ph[1]), `the placeholder stopped saying it takes a profession: ${ph?.[1]}`)
})

test('every sphere the picker offers has professions behind it', () => {
  // A category with no professions is step ① answered and step ② empty — the
  // same dead end by another route. `design` and `career` were topic GROUPS
  // with no category at all (docs/TAXONOMY-AUDIT §P4): a client could ask for
  // „დიზაინი" and the catalogue had nobody to show.
  for (const slug of ['design', 'career', 'swavleba']) {
    assert.ok((PROFESSIONS[slug] ?? []).length >= 2, `${slug} is not a sphere with professions`)
  }
  // §P3 — one subject, one name. The category row and the topic group must not
  // disagree, or somebody searching one cannot find the other.
  const topics = read('lib/requestTopics.ts')
  assert.match(topics, /id: 'property', label: 'უძრავი ქონება'/, 'construction is filed in two places again')
  assert.doesNotMatch(topics, /categorySlug: 'hr'/, "'hr' is not a category — that group is `career`")
})
