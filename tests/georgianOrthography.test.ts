// Lints OUR OWN Georgian copy in the source tree. Part of `npm run check`.
//
// Run: npx tsx tests/georgianOrthography.test.ts
//
// WHY THIS EXISTS. tests/georgianText.test.ts guards copy users TYPE IN. Nothing
// guarded the copy WE ship — and it had drifted three separate ways at once:
//
//   - „ვიდეო-კონსულტაცია" sat in app/layout.tsx as the site-wide og:description,
//     i.e. the sentence Facebook/LinkedIn print under every mcodne.ge share,
//     while lib/categorySeo.ts spelled the same word „ვიდეოკონსულტაცია".
//   - One feature carried THREE names: the profile heading said „ვიდეოგაცნობა",
//     the home page said „ვიდეოშესავალი", the help page told you to look for
//     „ვიდეო-ინტრო". A visitor following the help page looks for a label that
//     does not exist on the page it points at.
//   - „ბლოგი" in prisma/seedBlog.ts closed with an ASCII " instead of “.
//
// Every one of these is invisible to tsc and to the build: the page renders, the
// feature works, only the language is wrong. A human proofreader catches them
// once; this file catches them every time.
//
// ── THE ORTHOGRAPHY RULE, AND THE EVIDENCE FOR IT ─────────────────────────────
// Georgian writes a single-concept compound as ONE word. The hyphen is reserved
// for two-concept compounds (ცოლ-შვილი), appositional compounds whose first
// member is a TRUNCATED STEM (სახლ-მუზეუმი, წევრ-კორესპონდენტი), and
// reduplication (ნელ-ნელა).
//   — რთული სიტყვების (კომპოზიტების) მართლწერა, akhaliganatleba.ge
//
// An indeclinable borrowed prefix (ვიდეო, ვებ, ონლაინ, მიკრო) is NOT a truncated
// stem, so it attaches directly. The authority is the სასკოლო ორთოგრაფიული
// ლექსიკონი (არნ. ჩიქობავას ენათმეცნიერების ინსტიტუტი, 2011), searchable at
// nplg.gov.ge/saskolo — every headword below was read out of it:
//
//   ვიდეო + consonant — ვიდეოთამაში, ვიდეოკლიპი, ვიდეომასალა, ვიდეორგოლი,
//     ვიდეოჩანაწერი. All five solid; the dictionary hyphenates none of them.
//   ვებ — ვებგვერდი (also ka.wikipedia).
//   prefix-in-ო + VOWEL — ფოტოალბომი, ფოტოაპარატი, ფოტოასლი, ფოტოეტიუდი,
//     ფოტოეფექტი, მიკროავტობუსი, მიკროელემენტები. Solid. Note ფოტოასლი and
//     ფოტოხელოვნება: the second element is a native Georgian word, so these are
//     compounds Georgian BUILT, not loanwords imported whole — which is the
//     objection this list exists to answer.
//   ო + ო — **ფოტოობიექტივი**. Solid. This is the exact shape of ვიდეოოთახი and
//     it settles the question: there is NO double-vowel-clash hyphen exception.
//     18 call sites shipped „ვიდეო-ოთახი" on the belief that there is.
//
// Contrast the ONE hyphenated headword shape in the same dictionary —
// მედიკო-ბიოლოგიური — a genuinely TWO-concept compound. That is what the hyphen
// is for.
//
// ბიზნეს-გეგმა / ექსპერტ-კონსულტაცია / ქუქი-ფაილი KEEP their hyphens and are
// deliberately absent below: ბიზნეს, ექსპერტ, ქუქი are truncated stems (ბიზნესი
// minus its nominative -ი), which is exactly the სახლ-მუზეუმი pattern. Real
// Georgian sources write ბიზნეს-გეგმა hyphenated. Do not "fix" those.
//
// ── ADDING A RULE ─────────────────────────────────────────────────────────────
// Add it to BANNED with a `why` that cites the evidence, and add a case to the
// self-test at the bottom proving it does not fire on a legitimate word.
// A file can opt out of one rule with a `// georgian-lint-disable <id>` comment.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { COPY_RULES, checkGeorgianCopy, describeViolations, type CopyRule } from '../lib/georgianOrthography'
import { SITE_TEXTS } from '../lib/siteTextDefs'

const ROOT = join(import.meta.dirname, '..')
const DIRS = ['app', 'lib', 'components', 'prisma']

let passed = 0, failed = 0
const ok = (name: string, cond: boolean, detail = '') =>
  cond ? (passed++, console.log(`  ✓ ${name}`))
       : (failed++, console.log(`  ✗ ${name}${detail ? `\n${detail}` : ''}`))

/* ═══════════ the rules ═══════════════════════════════════════════════════ */

// The rules themselves live in lib/georgianOrthography.ts, NOT here — the admin
// CMS validator imports the same array, so the copy we write and the copy an
// admin types are judged by one list that cannot drift.
const BANNED = COPY_RULES
/** COPY_RULES entries are non-global on purpose; scanning needs its own /g clone. */
const globalOf = (r: CopyRule) => new RegExp(r.re.source, 'gu')
const fires = (id: string, s: string) =>
  new RegExp(COPY_RULES.find(r => r.id === id)!.re.source, 'u').test(s)

/* ═══════════ source scanning ═════════════════════════════════════════════ */

/**
 * Return each line with its comments removed.
 *
 * COMMENTS MUST GO, and that is the whole difficulty. This codebase comments
 * heavily and in prose, and that prose quotes the wrong spelling ON PURPOSE —
 * „ვიდეო-ინტრო" appears in a comment explaining why it was renamed, and there
 * are ~200 English-style „word" quotes in explanatory text. Linting comments
 * produces hundreds of hits, none of them shipped to a user, which is exactly
 * how a lint gets switched off.
 *
 * This is deliberately line-based rather than a real tokenizer. The first
 * version of this file walked the source character by character tracking string
 * state, and a regex literal — /[#*`>\-\[\]()]/ in app/blog/[slug]/page.tsx —
 * has a backtick inside its character class, which that walker read as the start
 * of a template literal. Everything after it desynchronised and the check
 * reported hits at lines that held unrelated code. A tokenizer that must also
 * understand regex literals and JSX is more machinery than this job needs.
 */
function codeLines(src: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = []
  let inBlock = false
  src.split('\n').forEach((raw, i) => {
    let s = raw
    if (inBlock) {
      const end = s.indexOf('*/')
      if (end === -1) return
      s = s.slice(end + 2); inBlock = false
    }
    // Block comments opened on this line, including JSX {/* … */}.
    for (;;) {
      const start = s.indexOf('/*')
      if (start === -1) break
      const end = s.indexOf('*/', start + 2)
      if (end === -1) { s = s.slice(0, start); inBlock = true; break }
      s = s.slice(0, start) + ' ' + s.slice(end + 2)
    }
    // Line comment. The lookbehind keeps `https://…` inside a string intact.
    s = s.replace(/(?<![:/])\/\/.*$/, '')
    if (s.trim()) out.push({ text: s, line: i + 1 })
  })
  return out
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next') continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(p)) out.push(p)
  }
  return out
}

// The rules file is excluded by construction: it SPELLS OUT every banned form in
// order to ban it, so scanning it flags „დაშბორდ", „ესქროუ" and the rest forever.
const SELF = join(ROOT, 'lib', 'georgianOrthography.ts')
const FILES = DIRS.flatMap(d => walk(join(ROOT, d))).filter(f => f !== SELF)
const GEORGIAN = /[ა-ჰ]/

/* ═══════════ 1. banned spellings and terminology ═════════════════════════ */

{
  type Hit = { file: string; line: number; rule: CopyRule; found: string }
  const hits: Hit[] = []

  for (const file of FILES) {
    const src = readFileSync(file, 'utf8')
    const disabled = new Set(
      [...src.matchAll(/georgian-lint-disable\s+([\w-]+)/g)].map(m => m[1]),
    )
    for (const chunk of codeLines(src)) {
      if (!GEORGIAN.test(chunk.text)) continue
      for (const rule of BANNED) {
        if (disabled.has(rule.id)) continue
        for (const m of chunk.text.matchAll(globalOf(rule))) {
          hits.push({ file: relative(ROOT, file), line: chunk.line, rule, found: m[0] })
        }
      }
    }
  }

  const detail = hits
    .map(h => `      ${h.file}:${h.line}  „${h.found}“ → ${h.rule.fix}\n        (${h.rule.why})`)
    .join('\n')
  ok(`no banned spelling or off-canon term in ${FILES.length} source files`, hits.length === 0, detail)
}

/* ═══════════ 2. no double space inside a Georgian string ═════════════════ */

{
  // Georgian on BOTH sides of the gap. Anything looser flags the column
  // alignment this codebase uses inside object literals, where the run of
  // spaces sits between a comma and the next key and means nothing.
  const bad: string[] = []
  for (const file of FILES) {
    for (const { text, line } of codeLines(readFileSync(file, 'utf8'))) {
      const m = text.match(/[ა-ჰ] {2,}[ა-ჰ]/)
      if (m) bad.push(`      ${relative(ROOT, file)}:${line}  …${m[0]}…`)
    }
  }
  ok('no double space between two Georgian words', bad.length === 0, bad.slice(0, 20).join('\n'))
}

/* ═══════════ 3. the linter's own self-test ═══════════════════════════════
 * A lint that fires on correct words gets disabled within a week, so the
 * patterns are pinned against the exact words they must NOT touch.
 */
{
  const clean = (s: string) => checkGeorgianCopy(s).length === 0

  console.log('\n  — must NOT fire —')
  ok('ბიზნეს-გეგმა (truncated stem — hyphen is correct)', clean('ბიზნეს-გეგმა და ბიზნეს-სტრატეგია'))
  ok('ექსპერტ-კონსულტაცია / ქუქი-ფაილი (same pattern)', clean('ექსპერტ-კონსულტაციის ქუქი-ფაილები'))
  ok('ვიდეოსესია / ვიდეოოთახი / ვიდეოგაცნობა (already correct)',
    clean('ვიდეოსესია, ვიდეოოთახი, ვიდეოგაცნობა'))
  ok('a correctly closed „…“ quote', clean('გვერდზე „ექსპერტები“ გაფილტრე კატეგორიით'))
  ok('ვებგვერდი (already correct)', !fires('web-hyphen', 'ვებგვერდი / ბლოგი'))
  ok('„ჩატვირთვა" is not „ჩატი"', !fires('term-chat', 'ფაილის ჩატვირთვა დასრულდა'))
  ok('„ჩატარდება" is not „ჩატი"', !fires('term-chat', 'შეხვედრა ონლაინ ჩატარდება'))
  ok('„ონლაინ კონსულტაცია" (two words is fine — only the hyphen is banned)',
    !fires('online-hyphen', 'ონლაინ კონსულტაცია ექსპერტთან'))

  console.log('\n  — must fire —')
  ok('ვიდეო-ოთახი', fires('video-hyphen', 'შედი ვიდეო-ოთახში'))
  ok('ვიდეო-კონსულტაცია', fires('video-hyphen', 'დაჯავშნე ვიდეო-კონსულტაცია'))
  ok('ვებ-გვერდი', fires('web-hyphen', 'ვებ-გვერდი / ბლოგი'))
  ok('ვიდეოშესავალი', fires('term-video-intro', 'გადახედე ვიდეოშესავალს'))
  ok('ვიდეო-ინტრო', fires('term-video-intro', 'ნახავ ვიდეო-ინტროს') || fires('video-hyphen', 'ნახავ ვიდეო-ინტროს'))
  ok('ტუტორი', fires('term-tutor', 'აირჩიე ტუტორი'))
  ok('ჩატი', fires('term-chat', 'გახსენი ჩატი ექსპერტთან'))
  ok('სლოტი', fires('term-slot', 'აირჩიე თავისუფალი სლოტი'))
  ok('ASCII " closing a „', fires('ascii-close-quote', 'მიანიჭე „გადამოწმებული"'))
}

/* ═══════════ 4. the CMS door uses the SAME rules ═════════════════════════
 * The source lint passed on all 333 files while the live site served
 * „ვიდეო-სესია" and „ვიდეოშესავალს" on every page: those three strings were
 * SiteText rows in the database, written through ადმინი → ტექსტები, and a DB
 * override beats the default in lib/siteTextDefs.ts. Linting only the files
 * guards the smaller half of the copy. app/api/admin/site-texts PATCH now runs
 * checkGeorgianCopy on every save, and both doors import one array — these pins
 * exist so nobody re-forks the rules into the route.
 */
{
  const exact = (s: string) => checkGeorgianCopy(s).map(v => v.id).join(',')
  ok('the CMS validator rejects the three strings that were actually live',
    exact('შეადარე ექსპერტები და დაჯავშნე ვიდეო-სესია.') === 'video-hyphen' &&
    exact('რეგისტრაცია, არჩევა, ვიდეო-სესია.') === 'video-hyphen' &&
    exact('გადახედე პროფილებს, შეფასებებსა და ვიდეოშესავალს.') === 'term-video-intro')
  ok('their corrected forms save cleanly',
    checkGeorgianCopy('შეადარე ექსპერტები და დაჯავშნე ვიდეოსესია.').length === 0 &&
    checkGeorgianCopy('გადახედე პროფილებს, შეფასებებსა და ვიდეოგაცნობას.').length === 0)
  ok('the validator reports what to write instead, not just a rejection',
    checkGeorgianCopy('ვიდეო-სესია')[0]?.fix.includes('ვიდეოსესია') === true)
  ok('every default in lib/siteTextDefs.ts already passes the CMS gate',
    SITE_TEXTS.every(t => checkGeorgianCopy(t.default).length === 0),
    SITE_TEXTS.filter(t => checkGeorgianCopy(t.default).length)
      .map(t => `      ${t.key}: ${describeViolations(checkGeorgianCopy(t.default))}`).join('\n'))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed ? 1 : 0)
