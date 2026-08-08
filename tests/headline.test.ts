// Invariants for the headline display normaliser (lib/headline.ts).
//
// Run: npx tsx tests/headline.test.ts
//
// Every „before" string below is a REAL value from the production roster on
// 2026-07-31. The card renders the expert's years in their own row, so a
// headline that also carries them printed the same fact twice on one card.
import { displayHeadline, HEADLINE_MAX, HEADLINE_MIN } from '../lib/headline'

let passed = 0
let failed = 0
function eq(name: string, got: string, want: string) {
  if (got === want) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name} — got „${got}", want „${want}"`) }
}

/* ═══════════ real production rows ═══════════════════════════════════════ */

eq('strips „- N წელი"', displayHeadline('AI ინჟინერი - 7 წელი'), 'AI ინჟინერი')
eq('strips a bare „N წელი"', displayHeadline('გაყიდვების ექსპერტი 4 წელი'), 'გაყიდვების ექსპერტი')
eq('strips „- N წლიანი გამოცდილება"',
  displayHeadline('SMM•content creator - 1 წლიანი გამოცდილება'), 'SMM · content creator')
eq('normalises an ASCII pipe to a middot',
  displayHeadline('ფსიქოლოგი | ფსიქოლოგიური კონსულტანტი'), 'ფსიქოლოგი · ფსიქოლოგიური კონსულტანტი')
eq('leaves a clean headline alone',
  displayHeadline('პერსონალური გაყიდვების მენეჯერი'), 'პერსონალური გაყიდვების მენეჯერი')
eq('leaves a one-word headline alone', displayHeadline('მარკეტერი'), 'მარკეტერი')
eq('leaves Latin alone', displayHeadline('SEO expert'), 'SEO expert')
eq('leaves a non-duplicating headline alone',
  displayHeadline('ანალიტიკა და ქოუჩინგი'), 'ანალიტიკა და ქოუჩინგი')
eq('leaves an org name alone',
  displayHeadline('კიბერუსაფრთხოების ბიურო'), 'კიბერუსაფრთხოების ბიურო')

/* ═══════════ shapes we must NOT damage ══════════════════════════════════ */

// Anchored to the END on purpose: a duration that is the SUBJECT survives.
eq('a leading duration is content, not a suffix',
  displayHeadline('5 წლის გეგმა ბიზნესისთვის'), '5 წლის გეგმა ბიზნესისთვის')
eq('a mid-string duration survives',
  displayHeadline('10 წლის გამოცდილება ბანკინგში'), '10 წლის გამოცდილება ბანკინგში')
eq('„·" already in use is untouched',
  displayHeadline('ბიზნეს-სტრატეგი · ფინანსები'), 'ბიზნეს-სტრატეგი · ფინანსები')
eq('a hyphenated word keeps its hyphen',
  displayHeadline('ბიზნეს-სტრატეგი'), 'ბიზნეს-სტრატეგი')

/* ═══════════ empties ════════════════════════════════════════════════════ */

eq('null → empty', displayHeadline(null), '')
eq('undefined → empty', displayHeadline(undefined), '')
eq('whitespace → empty', displayHeadline('   '), '')
// A headline that was ONLY a years fragment leaves nothing — the card must then
// render no headline at all rather than a stray separator.
eq('years-only → empty', displayHeadline('7 წელი'), '')
eq('separator-only → empty', displayHeadline(' | '), '')

/* ═══════════ the shared cap ═════════════════════════════════════════════ */

if (HEADLINE_MIN < HEADLINE_MAX) { passed++; console.log('  ✓ MIN is below MAX') }
else { failed++; console.log('  ✗ MIN is below MAX') }
if (HEADLINE_MAX === 60) { passed++; console.log('  ✓ MAX is the measured 60') }
else { failed++; console.log(`  ✗ MAX is the measured 60 — got ${HEADLINE_MAX}`) }

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
