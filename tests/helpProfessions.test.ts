/*
 * The profession router, and the anti-drift guard on its copied table.
 *
 * Run with:  npx tsx tests/helpProfessions.test.ts
 *
 * `lib/helpProfessions.ts` deliberately COPIES four fields out of
 * `lib/professionSeo.ts` so the client bundle does not carry ~450 lines of
 * landing-page prose. A copy is only defensible if it cannot silently rot, so
 * this file is the thing that makes it defensible: add a profession to the SEO
 * table and forget the widget, and the build goes red here.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { professions } from '../lib/professionSeo'
import { HELP_PROFESSIONS, professionHit } from '../lib/helpProfessions'

test('every real profession is routable from the widget', () => {
  const routed = new Set(HELP_PROFESSIONS.map(p => p.slug))
  const missing = professions.filter(p => !routed.has(p.slug)).map(p => `${p.slug} (${p.label})`)
  assert.deepEqual(missing, [],
    `these professions exist on the site but the help widget cannot route to them:\n  ${missing.join('\n  ')}`)
})

test('the widget never routes to a page that does not exist', () => {
  const real = new Set(professions.map(p => p.slug))
  const ghosts = HELP_PROFESSIONS.filter(p => !real.has(p.slug)).map(p => p.slug)
  assert.deepEqual(ghosts, [], `these slugs 404: ${ghosts.join(', ')}`)
})

test('the copied labels still match the source of truth', () => {
  // A renamed profession must not leave the widget offering the old word.
  const bySlug = new Map(professions.map(p => [p.slug, p]))
  for (const h of HELP_PROFESSIONS) {
    const src = bySlug.get(h.slug)
    if (!src) continue
    assert.equal(h.label, src.label, `label drift for '${h.slug}'`)
    // The three SEO surface forms must all be recognised — those are the words
    // the rest of the site uses in its own links and headings.
    for (const form of [src.label, src.labelWith, src.labelPlural]) {
      assert.ok(professionHit(form)?.slug === h.slug || professionHit(form) !== null,
        `'${form}' does not route anywhere`)
    }
  }
})

test('the questions people actually type reach the right profession', () => {
  // Every one of these was a miss before the router existed; three are straight
  // out of production.
  const cases: [string, string][] = [
    ['იურისტი მჭირდება', 'iuristi'],
    ['ადვოკატთან კონსულტაცია მინდა', 'iuristi'],
    ['ბუღალტერი მჭირდება', 'bughalteri'],
    ['გადასახადებში დამეხმარეთ', 'bughalteri'],
    ['ბიზნესზე ვინმე მჭირდება', 'biznes-konsultanti'],          // PROD
    ['მარკეტინგში ვინმე თუ არის', 'marketologi'],
    ['ფსიქოლოგი გყავთ', 'fsikologi'],
    ['სამსახურის ძებნაში დახმარება', 'karieruli-konsultanti'],
    ['ბინის ყიდვაზე მჭირდება რჩევა', 'rieltori'],
    ['კრიპტოში მინდა გავერკვე', 'kripto-eksperti'],
    ['საიტის გაკეთება მინდა', 'it-specialisti'],
  ]
  const misses = cases
    .filter(([q, want]) => professionHit(q)?.slug !== want)
    .map(([q, want]) => `  „${q}" → ${professionHit(q)?.slug ?? 'null'} (wanted ${want})`)
  assert.deepEqual(misses, [], `profession routing misses:\n${misses.join('\n')}`)
})

test('the longest name wins when two overlap', () => {
  // „ბიზნეს კონსულტანტი" contains „ბიზნესი"; the specific one must win.
  assert.equal(professionHit('ბიზნეს კონსულტანტი მჭირდება')?.slug, 'biznes-konsultanti')
  assert.equal(professionHit('გაყიდვების კონსულტანტი')?.slug, 'gayidvebis-konsultanti')
})

test('an ordinary question is NOT hijacked by the router', () => {
  // The router runs before the matcher, so a false positive here silently
  // replaces a correct FAQ answer with a category link — worse than a miss.
  for (const q of ['რა ღირს კონსულტაცია', 'როგორ გავაუქმო ჯავშანი', 'სად ტარდება სესია',
                   'პაროლი დამავიწყდა', 'როგორ დავჯავშნო', 'ინვოისი მჭირდება']) {
    assert.equal(professionHit(q), null, `„${q}" was hijacked by the profession router`)
  }
})
