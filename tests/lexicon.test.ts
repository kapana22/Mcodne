// One thing, one name — the lexicon guard (restructuring v2 §2.2, 2026-08-18).
//
// The site had been calling the same person „სტუდენტი" on one screen and
// „კლიენტი" on the next, the same page „კატეგორიები" in the menu and „სფეროები"
// in its own h1, the same badge „ვერიფიცირებული" two lines above „დადასტურებული".
// This file is the list of words that must not come back, and the mechanism
// that keeps the role words in ONE place (lib/roles → HAT_LABEL / roleLabel).
//
// It reads SOURCE with comments stripped: a comment quoting the old word as
// history („„სტუდენტი" IS GONE") is fine and useful; a string literal carrying
// it is the regression. Allowlists are per file and per reason, never per
// pattern — „anything under lib/" would silently bless the next slip.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { VERTICAL_LABEL } from '../lib/requestTopics'

const ROOT = join(__dirname, '..')
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}
const FILES = ['app', 'lib', 'components'].flatMap(d => walk(join(ROOT, d))).map(p => relative(ROOT, p))
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
const codeOf = (f: string) => stripComments(readFileSync(join(ROOT, f), 'utf8'))

type Rule = { word: RegExp; say: string; allow?: (file: string, line: string) => boolean }
const RULES: Rule[] = [
  { word: /სტუდენტ/, say: '„სტუდენტი" → „კლიენტი" (16 categories, one of them is learning; the person is a client)',
    // The LEARNING vocabulary keeps its own words (§3.2): a topic named
    // „სტუდენტი" is who is being taught, not who is buying.
    allow: (f, l) => f === 'lib/requestTopics.ts' && /id: 'student'/.test(l) },
  { word: /შემსრულებ/, say: 'contract language — use ექსპერტი or the profession' },
  // ⚠️ RETIRED 2026-08-19. It names a KIND OF PERSON, and the model says there is
  // one provider who offers services (CLAUDE.md → THE PRODUCT MODEL). Owner:
  // the word should not be mentioned at all.
  // ⚠️ „ხელოსა?ნ" AND NOT „ხელოსან" — THE PLURAL DROPS THE „ა" (2026-08-20).
  // „ხელოსანი" is ხ-ე-ლ-ო-ს-ა-ნ-ი; „ხელოსნები" is ხ-ე-ლ-ო-ს-ნ-ე-ბ-ი. The old
  // pattern therefore matched only the singular, and the admin's own tab sat
  // there reading „ხელოსნები" through every sweep of this file — the owner
  // found it, this test did not. A Georgian stem that loses a vowel in the
  // plural has to be written to match both, or the rule guards half the word.
  //
  // AND THE `alt` EXEMPTION IS GONE with it. A search synonym is not printed,
  // which is exactly how it survived — but the instruction was „არსად", and
  // the data is somewhere. „ავეჯის აწყობა" is found by its own name.
  { word: /ხელოსა?ნ/, say: 'a person-kind word — the model has one provider offering სერვისი' },
  { word: /დამკვეთ/, say: '„დამკვეთი" is contract language — „კლიენტი" or the second person' },
  { word: /სფერო/, say: '„სფერო" → „კატეგორია" on screens (the menu already says კატეგორიები)',
    // Prose where the word means „a field of work", not the UI concept, and
    // SEO copy written around search phrases. Each named, none by pattern.
    allow: (f, l) =>
      // ⚠️ categorySeo.ts LOST ITS BLANKET PASS (2026-08-19). It was allowed as
      // a whole file, and under that cover `fallbackSeo()` was writing
      // „„<name>“ სფეროში…" for every category without its own SEO record —
      // text that renders on a real screen (app/experts/[slug]/_profession).
      // An allowance wide enough to hide a screen string is not an exception,
      // it is a hole. What survives is the career copy, where „სფერო" means a
      // field of WORK („ახალ სფეროში გადასვლა") and no other word will do.
      (f === 'lib/categorySeo.ts' && /კარიერ/.test(l))
      || ['lib/professionSeo.ts', 'lib/askFraming.ts', 'lib/helpSearch.ts'].includes(f)
      || (f === 'lib/pageSeoDefs.ts' && /პროფესიული სფერო/.test(l))
      || (f === 'lib/requestTopics.ts' && /სფერო: …/.test(l))
      || (f === 'lib/siteTextDefs.ts' && /შენს სფეროში/.test(l)) },
  { word: /ღირებულებ/, say: '„ღირებულება" → „ფასი" (one booking had both words on two screens)',
    allow: (f) => ['lib/categorySeo.ts', 'lib/helpSearch.ts'].includes(f) },
  { word: /ვერიფიცირებ/, say: '„ვერიფიცირებული" → „გადამოწმებული"' },
  { word: /პირადი კაბინეტი/, say: '„პირადი კაბინეტი" is a calque — „ჩემი სივრცე"' },
  { word: /მასტერ(?!კლას)/, say: '„მასტერი" is salon jargon — say „ექსპერტი", or name the service' },
  { word: /ვეძებ სპეციალისტს/, say: 'the signup tile says „ვეძებ ექსპერტს" — one widget, one word' },
]

test('the forbidden words do not appear in screen strings', () => {
  const offenders: string[] = []
  for (const f of FILES) {
    // ⚠️ lib/roles IS SCANNED SINCE 2026-08-20 — it used to be skipped, and it
    // is the file that DEFINES every role and space label. „ხელოსნის სივრცე"
    // therefore sat in the live avatar menu through every sweep of this test,
    // exempted by the one line that was meant to stop the rule tripping over
    // its own vocabulary. It does not need the exemption: the words it holds
    // are the APPROVED ones, so if a forbidden word appears there it is a real
    // regression, and a more serious one than anywhere else.
    const lines = codeOf(f).split('\n')
    lines.forEach((line, i) => {
      for (const r of RULES) {
        if (!r.word.test(line)) continue
        if (r.allow?.(f, line)) continue
        offenders.push(`  ${f}:${i + 1}  [${r.say}]  ${line.trim().slice(0, 120)}`)
      }
    })
  }
  assert.equal(offenders.length, 0, `lexicon regressions:\n${offenders.join('\n')}`)
})

test('the role words come from lib/roles, never a hand-typed ternary', () => {
  // A `role === X ? 'ექსპერტი' : … 'სტუდენტი'` written by hand is how three
  // screens ended up with three nouns for one person.
  const bad: string[] = []
  for (const f of FILES) {
    if (f.startsWith('lib/roles')) continue
    const src = codeOf(f)
    if (/ROLE\.(EXPERT|CLIENT|ADMIN)\s*\?\s*'(ექსპერტი|კლიენტი|ადმინი|სტუდენტი)'/.test(src)) bad.push(`${f}: role ternary spells the label by hand`)
    if (/\brole\s*(===|!==)\s*'(STUDENT|TUTOR)'/.test(src)) bad.push(`${f}: compares role to a raw 'USER'/'PROVIDER' string — use ROLE.USER / ROLE.PROVIDER`)
  }
  assert.deepEqual(bad, [])
  const roles = readFileSync(join(ROOT, 'lib/roles.ts'), 'utf8')
  assert.match(roles, /USER: 'USER'/); assert.match(roles, /PROVIDER: 'PROVIDER'/)
  assert.match(roles, /CLIENT: 'კლიენტი'/); assert.match(roles, /PROVIDER: 'ექსპერტი'/)
  // …and it stays a pure leaf: a client component imports the words from it.
  assert.doesNotMatch(roles, /from '\.\/prisma'|@prisma\/client|from 'react'/)
  // The two screens the audit named read the shared label.
  assert.match(codeOf('components/UserMenu.tsx'), /sellsHere \? HAT_LABEL\.PROVIDER : roleLabel\(role\)/)
  assert.match(codeOf('app/settings/_account.tsx'), /\{roleLabel\(me\.role\)\}/)
  assert.match(codeOf('app/admin/_users.tsx'), /roleLabelOf\(u\.role\)/)
})

test('one word per thing, on every screen that says it', () => {
  // ⚠️ THE TWO BOOKING SCREENS THIS OPENED WITH WENT WITH THE PRODUCT
  // (2026-08-24): „ჯავშნები" on the client's list and „ფასი" on the expert's
  // booking detail. What the test is FOR — one word per thing, wherever it is
  // said — is what the rest of it still checks.
  // The categories page was retired in stage 8 (2026-08-19) and the header's
  // „კატეგორიები" item went in stage 9 (the bar names the two verticals only),
  // so the word is pinned where the site still says it: the home section's
  // eyebrow (SiteText default) and the catalogue's filter loading line.
  assert.match(codeOf('lib/siteTextDefs.ts'), /key: 'home\.categories\.eyebrow'[^\n]*default: 'კატეგორიები'/)
  // ⚠️ THE RAIL STOPPED SAYING „კატეგორია" (2026-08-20) and then stopped saying
  // the two names in its own source (2026-09-01), and both are the change
  // rather than a regression. It named the two things the site sells —
  // „პროფესიული სერვისები" and „ყოველდღიური სერვისები" — as two headings; the
  // owner made them a SWITCH („ეს მინდა იყოს გადამრთველი, რომ არევა არ მოხდეს
  // ამათი"), and the two words moved into lib/requestTopics → VERTICAL_LABEL
  // because four surfaces held four spellings of them: /join said „სერვისი
  // სახლში", /work/profile said „სერვისი", this rail said „ყოველდღიური
  // სერვისები" and the intake door's own label said „სერვისები" — the name of
  // everything the site sells, used as the name of half of it.
  //
  // So the WORDS are pinned where they now live, and every screen that says
  // them is pinned to the constant rather than to a literal — which is the
  // whole of „one word per thing, on every screen that says it".
  assert.equal(VERTICAL_LABEL.EXPERT, 'პროფესიული')
  assert.equal(VERTICAL_LABEL.SERVICE, 'ყოველდღიური')
  for (const f of [
    'app/experts/_filters.tsx',        // the catalogue's switch
    'app/join/_provider/client.tsx',   // the door a provider registers through
    'app/work/profile/_secServices.tsx', // the provider's own service editor
  ]) {
    assert.match(codeOf(f), /VERTICAL_LABEL\./, `${f} names a side by hand instead of reading VERTICAL_LABEL`)
    assert.doesNotMatch(codeOf(f), /'(პროფესიული|ყოველდღიური) სერვისები'/,
      `${f} writes one of the two names as a literal — it will drift`)
  }
  for (const f of ['components/PublicTopBar.tsx', 'lib/siteTextDefs.ts', 'app/experts/_hero.tsx', 'app/experts/_filters.tsx']) {
    assert.doesNotMatch(codeOf(f), /სფეროები/, `${f} says „სფეროები"`)
  }
  // The user menu's switcher uses one phrase pattern for every space.
  const menu = codeOf('components/UserMenu.tsx')
  assert.doesNotMatch(menu, /label: '[^']*სივრცე'/, 'a space label is written by hand in the menu — use SPACE_LABEL')
})
