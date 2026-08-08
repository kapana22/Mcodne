/* Validation errors must POINT somewhere (app/apply/ApplyClient).
 *
 * The failure this guards against is silent and total: a validator names a
 * field (`fail('headline', …)`) that has no matching `data-field` anchor in the
 * markup. Nothing throws — the applicant just gets a red box at the bottom of
 * the form and no idea which field is wrong, which is exactly the state this
 * work set out to fix. A renamed field would reintroduce it invisibly.
 */
import { readFileSync, readdirSync } from 'node:fs'

let passed = 0, failed = 0
const check = (name: string, ok: boolean, why = '') => {
  if (ok) { passed++; console.log(`✓ ${name}`) }
  else { failed++; console.log(`✗ ${name}${why ? ` — ${why}` : ''}`) }
}

/* /apply is split across `app/apply/_*.tsx` — ApplyClient.tsx is only the
   container now. These assertions are about the FORM as a whole, so read the
   directory rather than a filename the next split would invalidate. */
const src = readdirSync(new URL('../app/apply/', import.meta.url))
  .filter(f => f.endsWith('.tsx'))
  .sort()
  .map(f => readFileSync(new URL(`../app/apply/${f}`, import.meta.url), 'utf8'))
  .join('\n')
const uniq = (re: RegExp) => [...new Set([...src.matchAll(re)].map(m => m[1]))].sort()

const named = uniq(/fail\('([A-Za-z]+)'/g)
const anchors = uniq(/data-field="([A-Za-z]+)"/g)

check('F1: validators actually name their fields', named.length >= 6, `found ${named.length}`)

const orphans = named.filter(f => !anchors.includes(f))
check('F2: every named field has a data-field anchor', orphans.length === 0,
  `no anchor for: ${orphans.join(', ')} — the error would render with nowhere to jump`)

check('F3: both error paths jump — submit AND the step gate',
  (src.match(/focusInvalidField\(\)/g) ?? []).length >= 2 && /onError=\{onStepError\}/.test(src),
  'the step gate („შემდეგი") is the path people hit most; text-only there defeats the point')

check('F4: the jump waits a frame',
  /requestAnimationFrame\([\s\S]{0,400}data-field/.test(src),
  'the error box renders in the same commit and shifts layout — measuring before paint scrolls to the wrong place')

// A field can now be TWO screens behind the error (the final gate re-checks
// every step, and the API can refuse a step-1 value at submit). Scrolling to an
// unmounted anchor is a no-op — the applicant reads „fix your name" on the
// review screen with no name field in sight, which is the same dead end the
// whole 2026-08-06 pass exists to remove.
check('F7: the jump can change step',
  /const needsJump = /.test(src) && /setStep\(target\)/.test(src) &&
  /requestAnimationFrame\(\(\) => requestAnimationFrame/.test(src),
  'a cross-step error must mount the right screen before it measures anything')

const stepBlock = src.match(/FIELD_STEP: Record<string, StepId> = \{([\s\S]*?)\}/)?.[1] ?? ''
const stepped = [...new Set([...stepBlock.matchAll(/([a-zA-Z]+):\s*[123]/g)].map(m => m[1]))]
const orphanSteps = named.filter(f => !stepped.includes(f))
check('F8: every named field is placed on a step (FIELD_STEP)', orphanSteps.length === 0,
  `not in FIELD_STEP: ${orphanSteps.join(', ')} — the jump would stay on the wrong screen`)

check('F5: focus does not fight the scroll',
  /focus\(\{ preventScroll: true \}\)/.test(src),
  'scrollIntoView already owns the movement; a second one lands a frame later as a jerk')

// Autofill: the reason this form was slow to fill in the first place.
const autofill = (src.match(/autoComplete="/g) ?? []).length
check('F6: the form is autofillable', autofill >= 5, `only ${autofill} autoComplete attributes`)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
