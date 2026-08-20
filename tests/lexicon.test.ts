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
  { word: /ხელოსან/, say: 'a person-kind word — the model has one provider offering სერვისი',
    // A SEARCH SYNONYM is not a label: somebody typing it must still find
    // furniture assembly, so lib/requestTopics keeps it inside `alt` only.
    allow: (f, l) => f === 'lib/requestTopics.ts' && /alt: \[/.test(l) },
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
  { word: /მასტერ(?!კლას)/, say: '„მასტერი" is salon jargon — „ხელოსანი"' },
  { word: /ვეძებ სპეციალისტს/, say: 'the signup tile says „ვეძებ ექსპერტს" — one widget, one word' },
]

test('the forbidden words do not appear in screen strings', () => {
  const offenders: string[] = []
  for (const f of FILES) {
    if (f.startsWith('lib/roles')) continue
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
    if (/\brole\s*(===|!==)\s*'(STUDENT|TUTOR)'/.test(src)) bad.push(`${f}: compares role to a raw 'STUDENT'/'TUTOR' string — use ROLE.CLIENT / ROLE.EXPERT`)
  }
  assert.deepEqual(bad, [])
  const roles = readFileSync(join(ROOT, 'lib/roles.ts'), 'utf8')
  assert.match(roles, /CLIENT: 'STUDENT'/); assert.match(roles, /EXPERT: 'TUTOR'/)
  assert.match(roles, /CLIENT: 'კლიენტი'/); assert.match(roles, /EXPERT: 'ექსპერტი'/); assert.match(roles, /MASTER: 'ექსპერტი'/)
  // …and it stays a pure leaf: a client component imports the words from it.
  assert.doesNotMatch(roles, /from '\.\/prisma'|@prisma\/client|from 'react'/)
  // The two screens the audit named read the shared label.
  assert.match(codeOf('components/UserMenu.tsx'), /isMaster \? HAT_LABEL\.MASTER : roleLabel\(role\)/)
  assert.match(codeOf('app/settings/_account.tsx'), /\{roleLabel\(me\.role\)\}/)
  assert.match(codeOf('app/admin/_users.tsx'), /roleLabelOf\(u\.role\)/)
})

test('one booking, one set of words on both screens', () => {
  // The client's bookings page is titled what the tab is called.
  assert.match(codeOf('app/me/bookings/page.tsx'), /title="ჯავშნები"/)
  // The expert's booking detail says „ფასი", like the hero on the client side.
  assert.match(codeOf('app/work/(expert)/bookings/[id]/page.tsx'), />ფასი<\/Eyebrow>/)
  // The categories page was retired in stage 8 (2026-08-19) and the header's
  // „კატეგორიები" item went in stage 9 (the bar names the two verticals only),
  // so the word is pinned where the site still says it: the home section's
  // eyebrow (SiteText default) and the catalogue's filter loading line.
  assert.match(codeOf('lib/siteTextDefs.ts'), /key: 'home\.categories\.eyebrow'[^\n]*default: 'კატეგორიები'/)
  // The catalogue's own line moved from the hero to the filter rail when the
  // refinements did (2026-08-19) — the hero no longer filters.
  assert.match(codeOf('app/experts/_filters.tsx'), /კატეგორიები/)
  for (const f of ['components/PublicTopBar.tsx', 'lib/siteTextDefs.ts', 'app/experts/_hero.tsx', 'app/experts/_filters.tsx']) {
    assert.doesNotMatch(codeOf(f), /სფეროები/, `${f} says „სფეროები"`)
  }
  // The user menu's switcher uses one phrase pattern for every space.
  const menu = codeOf('components/UserMenu.tsx')
  assert.doesNotMatch(menu, /label: '[^']*სივრცე'/, 'a space label is written by hand in the menu — use SPACE_LABEL')
})
