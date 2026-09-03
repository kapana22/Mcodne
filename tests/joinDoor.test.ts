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
import { PROFESSIONS, professionCan, sphereOfProfessions } from '../lib/professions'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const codeOf = (p: string) =>
  read(p).split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n').replace(/\/\*[\s\S]*?\*\//g, '')

test('the door offers ONE thing, so no order can put the consultation first', () => {
  /* ⚠️ THIS TEST USED TO PIN AN ORDER (2026-08-20): the door built a list of the
   * halves somebody could still apply for, and CONSULT was pushed first — a
   * statement about what this site is, made by a line nobody thought of as
   * copy. The list is gone with the second half; what it protected against is
   * now unrepresentable. */
  const page = codeOf('app/join/page.tsx')
  assert.doesNotMatch(page, /offer\.push|CAPABILITIES|'CONSULT'/, 'the door builds a list of halves again')
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
  // ⚠️ THE DERIVATION IS GONE WITH WHAT IT DERIVED (2026-08-24). The door read
  // `professionCan(job)` to turn the answer into capabilities; the profession
  // is now carried through as itself. What must not come back is the QUESTION,
  // and that is what the two assertions above pin.
  assert.doesNotMatch(door, /professionCan\(|Capability/, 'a capability axis came back to the first screen a provider sees')
})

test('there is ONE wizard, and the door opens it', () => {
  /* ⚠️ THIS TEST USED TO PIN A ROUTING BUG, TWICE (2026-08-21). The door chose
   * between two wizards, and the choice dead-ended one side or the other: first
   * `setStage(work ? 'master' : 'expert')` sent every profession into the trades
   * form (whose „რას აკეთებ" step offered eight groups of physical trades and
   * nothing else, with the submit disabled until one was ticked), then
   * `wizardFor` was written to answer the question properly.
   *
   * There is one form since 2026-08-24, so the question cannot be got wrong.
   * What replaces the assertion is the absence: no branch, no second stage. */
  const client = codeOf('app/join/JoinClient.tsx')
  assert.doesNotMatch(client, /wizardFor|'expert'/, 'the door chooses between two wizards again')
  // ⚠️ THERE IS NO SECOND STAGE TO OPEN SINCE 2026-08-31 — /join IS the form
  // („ერთ გვერდზე იყოს ყველაფერი"). `setStage('form')` was the old hand-off and
  // the thing it guaranteed — ONE form, opened directly, no wizard branch — is
  // now true by construction: the client renders `<ProviderApplyClient>` and
  // nothing else. That is what is asserted.
  assert.match(client, /<ProviderApplyClient/, 'the door stopped opening the one form')
  assert.throws(() => read('app/join/_expert/ApplyClient.tsx'), 'the consultation wizard came back')
})

test('neither door makes the applicant retype what they already answered', () => {
  // Both doors reached comfort parity on 2026-08-20; before that each had
  // exactly what the other lacked, which is the shape of a split nobody sees.
  const work = read('app/join/_provider/client.tsx')

  // A draft. Six blocks, a photo upload and an incoming call — on a phone that
  // is not an edge case — used to send this applicant back to „ვინ ხარ".
  assert.match(work, /localStorage\.setItem\(DRAFT_KEY/, 'the service door lost its draft again')
  assert.match(work, /localStorage\.removeItem\(DRAFT_KEY\)/, 'a submitted draft is left behind and refills the form')
  // Photos are deliberately NOT in the draft — base64 data URIs against a ~5MB
  // origin budget, and a quota error would drop the whole thing.
  const saved = /JSON\.stringify\(\{([\s\S]*?)\}\)/.exec(work)?.[1] ?? ''
  assert.doesNotMatch(saved, /photoUrl|workPhotos/, 'the draft stores megabytes of base64 — quota will drop it whole')

  // A search over the taxonomy. Nineteen spheres in a grid is nine rows of
  // reading before the one that is yours.
  assert.match(work, /type="search"/, 'the service form lost its search')
  assert.match(read('components/ProfessionPicker.tsx'), /type="search"/, 'the door has no search over its spheres')
})

test('„დარჩა" takes you there instead of naming it', () => {
  const work = codeOf('app/join/_provider/client.tsx')
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
  assert.match(codeOf('app/join/_provider/client.tsx'), /cities\.length > 1 && \(/,
    'the city block is unconditional again')
  assert.match(codeOf('app/join/_provider/client.tsx'), /if \(cs\.length === 1\) setAreas/,
    'the single city is no longer answered for them — the form cannot be submitted')
})

test('a hidden block does not leave a hole in the numbering', () => {
  // Hard-coded `n={3}` meant that hiding one block made the form count
  // „1 2 4 5 6 7" — which tells the applicant something is missing.
  const work = codeOf('app/join/_provider/client.tsx')
  assert.doesNotMatch(work, /<Block n=\{\d+\}/, 'a block number was typed by hand again')
  /* ⚠️ THE SOURCE OF THE NUMBER CHANGED ON 2026-09-02 AND THE RULE DID NOT.
     It was `n={++blockNo}` — a counter incremented in render order, which was
     the right answer while all three panels were on one page and one of them
     could stop rendering. The form is three SCREENS now (owner: „ანუ
     რეგისტრაციას 3 და რედაქტირებისას ერთი მთლიანი"), so exactly one panel is
     in the document at a time and a render-order counter would print „1" on
     every step.

     The replacement is stronger than the counter, not weaker: the number is the
     step's position in `STAGES`, and the rail across the top maps the same
     array — so a panel's numeral and its rail segment now read one source and
     cannot come apart, which is a thing the counter could not promise. */
  assert.match(work, /n=\{STAGES\.findIndex\(s => s\.id === '\w+'\) \+ 1\}/,
    'the blocks stopped numbering themselves from STAGES')
  assert.match(work, /STAGES\.map\(\(st, i\) =>/, 'the rail stopped reading the same table the panels do')
})

test('the three stages are three screens, and every one of them is reachable', () => {
  /* ⚠️ THE FAILURE THIS PINS IS SILENT (2026-09-02). `jumpTo` finds its target
     with `document.querySelector('[data-field=…]')` and returns on a miss — and
     with one panel rendered at a time, every field on another screen IS a miss.
     So „დარჩა: ფოტო" pressed from step 1, and any refusal naming a field the
     current screen does not hold, would do nothing at all and say nothing about
     it. `goToField` switches the step first; `stopOn` and the „დარჩა" links
     both go through it. */
  const work = codeOf('app/join/_provider/client.tsx')
  assert.match(work, /const \[step, setStep\] = useState<StageId>\('what'\)/,
    'the form stopped being three screens')
  for (const id of ['what', 'who', 'photos']) {
    assert.ok(work.includes(`{step === '${id}' && (`), `stage ${id} is no longer a screen of its own`)
  }
  assert.match(work, /const goToField = \(field: string\) => \{/, 'the cross-screen jump is gone')
  assert.match(work, /requestAnimationFrame\(\(\) => goToField\(field\)\)/,
    'a refusal stopped switching to the screen that owns the field')
  /* ⚠️ THE „დარჩა:" JUMP LINKS WERE ASSERTED HERE AND ARE GONE (2026-09-02,
     owner: „მინდა რომ ეს წაშალო — სწრაფი ლინკები"). They were the second
     caller of `goToField`; `stopOn` is the first and is still pinned above, so
     the cross-screen jump itself is covered.

     What replaced them is the rail, which reads the same `missing` list and
     ticks a finished step — asserted below, so „what is still outstanding" is
     still guaranteed to be on screen somewhere. This line is deleted rather
     than rewritten because a bar under the reader's thumb, competing with the
     one control that moves them forward, is not what a three-screen form needs
     it to be. */
  assert.doesNotMatch(work, /დარჩა:/, 'the quick-link bar came back')
  assert.match(work, /const done = !missing\.some\(m => st\.fields\.includes\(m\.field\)\)/,
    'the rail stopped reading the same „what is missing" list the form does')
  // ⚠️ A BARE <button> INSIDE A <form> SUBMITS. „შემდეგი" would have posted the
  // application from step one.
  assert.match(work, /type="button"\s+size="lg"\s+onClick=\{\(\) => setStep\(STAGES\[stepIndex \+ 1\]\.id\)\}/,
    'the forward control lost its type="button"')
  // The submit belongs to the LAST screen only — an application sent from step
  // one is one whose remaining questions the applicant never saw.
  assert.match(work, /stepIndex < STAGES\.length - 1 \? \(/,
    'the submit button is no longer confined to the last step')
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
  // One tap answers BOTH steps. ⚠️ 2026-08-21: the category stopped being a
  // control at all — `pick` derives it from the professions and reports it back
  // (the chip prints „სანტექნიკოსი · სახლის რემონტი"), so what is asserted here
  // is that the derivation still happens and still feeds `onSphere`, not the
  // shape of one onClick that no longer exists.
  assert.match(src, /onSphere\(slug \? nameOfSlug\(slug\) : ''\)/,
    'picking a profession no longer fills the category in')
  // And the derivation is real, not a name: the one word an applicant is sure
  // of resolves to the sphere our taxonomy needs.
  const [job] = PROFESSIONS['remonti'] ?? []
  assert.ok(job, 'the launch sphere lost its professions')
  assert.equal(sphereOfProfessions([job]), 'remonti',
    'a profession no longer resolves to its sphere — the picker has nothing to fill in')
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


test('the form offers no second half to switch to', () => {
  /* ⚠️ THERE WERE TWO FORMS AND TWO HAND-OFFS (2026-08-20), and the chain broke
   * the day the order was reversed — owner: „კონსულტაციის საკითხი სად წაიღე?".
   * Each success screen offered the other half, and neither could point at a
   * half already filed, which is why `filed` existed. One form, no hand-off,
   * and the „ჩართე კონსულტაციები" switch it fed is gone with the capability. */
  const master = codeOf('app/join/_provider/client.tsx')
  assert.doesNotMatch(master, /onContinueExpert/, 'the service form offers a second wizard again')
  // …and nothing on it asks for a consultation as a second axis.
  assert.doesNotMatch(master, /role="(checkbox|radio)"[\s\S]{0,200}კონსულტაცი/,
    'the consultation became a choice on the service form')
})

/* ═══════════ THE ORDER: THE QUESTION, THEN THE WALL (2026-08-20) ══════════ */

test('a guest gets ONE action into the flow, and it is the same word everywhere', () => {
  /* ⚠️ THIS TEST PINNED THE OPPOSITE UNTIL 2026-08-31, and the reversal is the
   * owner's („ეს გვერდი არ უნდა ყოფილიყო"). What it used to require was
   * `<GuestDoor />` — the profession question asked BEFORE sign-up — on the
   * argument that forced registration is the funnel's biggest leak and that
   * somebody who leaves at the wall leaves nothing behind.
   *
   * The argument was right and the implementation never delivered it. Measured
   * before removing it: the guest's answer is submitted NOWHERE — the
   * application body carries no `professions` — and its only effect downstream
   * was pre-filling the search box in the form's first stage. So the visitor
   * paid a whole screen and a „გაგრძელება" for a typed-in search term, then met
   * what looked like the same question again on the other side of the wall.
   * That doubling is what the owner saw.
   *
   * WHAT REPLACES IT is the thing that was actually being protected: a guest
   * must have ONE unmistakable way into the flow, it must carry them back here
   * afterwards, and it must be the same word the header, the footer and the
   * user menu use. A pitch with no action is the failure this test still
   * catches; the question is now asked once, in the form, where it is stored.
   *
   * `GuestDoor` and `DoorQuestion` stay on disk, rendered by nothing, so the
   * inversion is one line from returning the day the answer actually carries. */
  const pub = codeOf('app/join/_door/PublicDoor.tsx')
  assert.match(pub, /<Btn href="\/signup\?redirect=%2Fjoin"/, 'the public door lost its way into the flow')
  assert.match(pub, /\{JOIN_DOOR_LABEL\}/, 'the guest action stopped using the site\'s one word for it')
  assert.doesNotMatch(pub, /<GuestDoor/, 'the pre-wall question is back — it is asked in the form now')

  // …and the signed-in side still READS a guest answer if one was ever left
  // behind, so a draft written by an older build is not stranded.
  const signed = codeOf('app/join/JoinClient.tsx')
  assert.match(signed, /if \(!d\?\.asked\) return/, 'the signed-in door stopped reading a stored guest answer')
  assert.match(signed, /clearAsked\(\)/, 'the flag is never cleared — a stale answer would seed for ever')
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
  // ⚠️ THE DOOR SCREEN IS GONE (2026-08-31) — /join opens on the form. The
  // guarantee is untouched and now lives one file in: the page's own heading is
  // still `JOIN_DOOR_LABEL`, the exact string the header, the user menu and the
  // footer's action all click through, so the heading still confirms the click.
  assert.match(read('app/join/_provider/client.tsx'), /\{JOIN_DOOR_LABEL\}/,
    'the door heading drifted from the link that leads to it')
  assert.match(codeOf('app/join/_door/PublicDoor.tsx'), /\{JOIN_DOOR_LABEL\}/)
})

/* ⚠️ „the expensive answers are asked last, on both doors" WAS HERE AND IS GONE
   (2026-08-24). It pinned the consultation wizard's photo gate — „the photo is
   a wall in the middle of the form again" — on a form that no longer exists.
   The rule it stood for lives on the one form that does: cheap and identifying
   first, then the things that cost effort. */

test('nothing is asked twice that the account already answered', () => {
  // The service form gets the door's answer typed into its search, so the
  // person's own word („სანტექნიკოსი") finds their service rows.
  assert.match(codeOf('app/join/_provider/client.tsx'), /setQuery\(cur => \(cur\.trim\(\) \? cur : job\)\)/,
    'the service catalogue no longer starts from the profession they just named')
})
