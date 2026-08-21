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
  // ⚠️ THE TILES ARE GONE (see the next test) BUT THE ORDER STILL DECIDES.
  // `offer` is what the door will honour from a derived capability, and it is
  // read in order everywhere it is consumed — including `?can=` and the „both"
  // branch. CONSULT was pushed first once: a statement about what this site is,
  // made by a line nobody thought of as copy.
  const page = codeOf('app/join/page.tsx')
  const w = page.indexOf("offer.push('WORK')")
  const c = page.indexOf("offer.push('CONSULT')")
  assert.ok(w > -1 && c > -1, 'a capability stopped being offered at the door')
  assert.ok(w < c, 'the consultation tile is built before the service tile — CLAUDE.md, THE HIERARCHY rule 4')
})

test('the door does not ask which half they are', () => {
  /* ⚠️ THE TILES ARE GONE AND MUST NOT COME BACK (2026-08-20). Owner, looking
   * at the two of them: „აქ არჩევანი საერთოდ არ უნდა იყოს და გაერთიანებული
   * უნდა იყოს — უბრალოდ შიგნით უნდა იყოს ჩაშენებული."
   *
   * Two failures in one control. It put the „კონსულტაცია / სერვისი" axis on
   * the first screen a provider ever sees — the one thing CLAUDE.md says must
   * never be primary — and it asked a question the site could already answer:
   * `PROFESSION_CAN` has known what each job sells since stage 8, and it is
   * the same table the request router reads. */
  const door = codeOf('app/join/JoinClient.tsx') + codeOf('app/join/_door/DoorQuestion.tsx')
  assert.doesNotMatch(door, /'ვასრულებ სერვისს'|'ვატარებ კონსულტაციას'|'ვარ ექსპერტი'/,
    'the capability tiles are back — the profession decides, CLAUDE.md rule 1')
  assert.doesNotMatch(door, /role="checkbox"[\s\S]{0,400}CAPABILITY_LABEL/,
    'a capability is being ticked again')
  // Derived, and from the ONE table that already holds the answer.
  assert.match(door, /professionCan\(job\)/, 'the capability is no longer derived from the profession')
  assert.match(door, /const picked = useMemo<Capability\[\]>/, 'the capability became state again — it is a consequence')
})

test('when they can do both, the SERVICE form opens first', () => {
  // A ბუღალტერი is CONSULT + WORK. The door used to send them into the
  // consultation wizard and offer the service afterwards, which is the
  // hierarchy upside down — CLAUDE.md rule 4: wherever both appear, the
  // service comes first.
  const door = codeOf('app/join/JoinClient.tsx') + codeOf('app/join/_door/DoorQuestion.tsx')
  assert.match(door, /setStage\(work \? 'master' : 'expert'\)/,
    'the consultation wizard opens first again for somebody who can do both')
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
  assert.match(work, /data-field=\{field\}/, 'Block stopped forwarding its jump target — the error summary cannot scroll to it')
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
  assert.match(src, /onClick=\{\(\)\s+=>\s+\{\s*if\s+\(cat\)\s+onSphere\(cat\.name\)/,
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
  // with no category at all (docs/archive/TAXONOMY-AUDIT §P4): a client could ask for
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


test('whichever form opens first, the other half still has a door', () => {
  /* ⚠️ THE CHAIN BROKE THE DAY IT WAS REVERSED (2026-08-20, caught by the
   * owner: „კონსულტაციის საკითხი სად წაიღე?"). The hand-off existed in ONE
   * direction — the expert wizard's success screen offered the service form —
   * so the moment the service form started opening first, a ბუღალტერი
   * (CONSULT + WORK) filed their service and the consultation half had no
   * door at all. Two forms, two hand-offs, and neither may point back at a
   * half that is already filed. */
  const door = codeOf('app/join/JoinClient.tsx') + codeOf('app/join/_door/DoorQuestion.tsx')
  assert.match(door, /onContinueMaster=\{work\s+&&\s+!filed\.includes\('WORK'\)/,
    'the expert wizard stopped offering the service half')
  assert.match(door, /onContinueExpert=\{consult\s+&&\s+!filed\.includes\('CONSULT'\)/,
    'the service form does not offer the consultation half — it is unreachable for anybody who can do both')
  const master = codeOf('app/join/_master/client.tsx')
  assert.match(master, /onContinueExpert \&\& \(/, 'the service success screen has no control for it')
  // …and it is OFFERED, never asked: no tick, no radio, no second axis.
  assert.doesNotMatch(master, /role="(checkbox|radio)"[\s\S]{0,200}კონსულტაცი/,
    'the consultation became a choice on the service form')
})


/* ═══════════ THE ORDER: THE QUESTION, THEN THE WALL (2026-08-20) ══════════ */

test('a guest is asked what they do BEFORE being asked to register', () => {
  /* ⚠️ THE WALL WAS THE FUNNEL'S BIGGEST LEAK AND IT WAS INVISIBLE. /join
   * showed a signed-out visitor a pitch whose only action was „create an
   * account", and the door's one question — the profession, from which every
   * capability, every route and every seeded field is derived — sat behind it.
   * Two costs: forced registration before any commitment is one of the
   * best-measured causes of abandonment there is, and somebody who leaves at
   * the wall leaves NOTHING behind, while somebody who leaves just after it
   * leaves an address that routes to nobody.
   *
   * The order is now: answer → account → form. */
  const pub = codeOf('app/join/_door/PublicDoor.tsx')
  assert.match(pub, /<GuestDoor/, 'the public door lost its question — it is a pitch behind a wall again')
  const guest = codeOf('app/join/_door/GuestDoor.tsx')
  assert.match(guest, /<DoorQuestion/, 'the guest half grew its own copy of the question')
  assert.match(guest, /\/signup\?redirect=%2Fjoin/, 'the answer no longer carries the visitor into signup')

  // …and the answer SURVIVES the round trip, or the first ask was a trick.
  const leaf = codeOf('app/join/_door/DoorQuestion.tsx')
  assert.match(leaf, /asked: true/, 'pressing continue no longer records that the question was answered')
  const signed = codeOf('app/join/JoinClient.tsx')
  assert.match(signed, /if \(!d\?\.asked\) return/, 'the signed-in door stopped reading the guest answer')
  assert.match(signed, /clearAsked\(\)/, 'the flag is never cleared — the door can no longer be reopened')
})

test('the site invites people to ONE address, in ONE word', () => {
  /* ⚠️ SIX LABELS AND THREE DESTINATIONS FOR ONE ACTION (measured 2026-08-20).
   * A label that does not reappear as the destination's heading reads as
   * „wrong page" and costs the click. Worse, two of the three destinations
   * carried `?can=CONSULT`, which pre-answered the door's question with the
   * half the hierarchy says comes second. */
  for (const f of ['components/PublicTopBar.tsx', 'components/Footer.tsx', 'components/UserMenu.tsx']) {
    const src = codeOf(f)
    assert.doesNotMatch(src, /["'`]\/join\?can=/, `${f} still pre-answers the door with ?can=`)
    assert.match(src, /JOIN_DOOR_HREF/, `${f} types the door's address instead of importing it`)
    assert.match(src, /JOIN_DOOR_LABEL/, `${f} types its own word for the door`)
  }
  // The heading confirms the click: the door prints the same constant.
  assert.match(codeOf('app/join/JoinClient.tsx'), /\{JOIN_DOOR_LABEL\}/, 'the door heading drifted from the link that leads to it')
  assert.match(codeOf('app/join/_door/PublicDoor.tsx'), /\{JOIN_DOOR_LABEL\}/)
})

test('the expensive answers are asked last, on both doors', () => {
  /* ⚠️ TWO DOORS, TWO OPPOSITE DOCTRINES, BOTH WRITTEN DOWN (fixed 2026-08-20).
   * The service form's own header says „cheap and identifying first… and only
   * then the things that cost effort — photo, work photos, prices", and it is
   * right. The consultation wizard required a PHOTO UPLOAD to leave step one —
   * on a phone, leaving the browser — before the applicant had seen what they
   * were being asked to price.
   *
   * The BAR is unchanged: no application is submitted without a photo. */
  const expert = codeOf('app/join/_expert/ApplyClient.tsx')
  assert.match(expert, /if \(final && !media\?\.photoUrl\)/, 'the photo is a wall in the middle of the form again')
  assert.match(expert, /validateStep\(1,\s+1,\s+true\)\s+\?\?\s+validateStep\(2,\s+1,\s+true\)/,
    'the final gate stopped running in `final` mode — an application can be submitted without a photo')
})

test('nothing is asked twice that the account already answered', () => {
  // Signup REQUIRES a phone; /api/me has always returned it; the form asked for
  // it again as a required field, about a minute later.
  const expert = codeOf('app/join/_expert/ApplyClient.tsx')
  assert.match(expert, /phone:\s+f\.phone\.trim\(\)\s+\?\s+f\.phone\s+:\s+\(d\.user\.phone\s+\?\?\s+''\)/,
    'the applicant retypes the phone number they gave at signup')
  // The service form gets the door's answer typed into its search, so the
  // person's own word („სანტექნიკოსი") finds their service rows.
  assert.match(codeOf('app/join/_master/client.tsx'), /setQuery\(cur => \(cur\.trim\(\) \? cur : job\)\)/,
    'the service catalogue no longer starts from the profession they just named')
})
