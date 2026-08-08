/*
 * The editable-copy registry — the two ways it silently betrays its editor.
 *
 * Run with:  npx tsx tests/siteTexts.test.ts
 *
 * WHY. „ზოგი არ ინახება და ზოგი საერთოდ არ ჩანს" (owner, 2026-08-04). Both
 * complaints are about trust rather than about code, and both have the same
 * shape: the admin panel says one thing and the site does another. A CMS you
 * cannot trust is worse than no CMS, because you edit, you check, you find
 * nothing changed, and from then on you never quite believe any field.
 *
 * The two failures this pins:
 *
 *  1. A KEY THAT RENDERS NOWHERE. You type into it, you save, you get a green
 *     tick, and no page on the site is different — the field edits a void. That
 *     is the same class of defect as a settings toggle wired to nothing.
 *
 *  2. A RENAMED KEY. A SiteText row is keyed by the key STRING. Rename
 *     `home.how.step1.title` in code and the row holding the sentence someone
 *     wrote by hand is orphaned instantly and forever — the site reverts to the
 *     code default and nothing anywhere reports it. This is the one that
 *     destroys work rather than merely wasting it, so the key list below is a
 *     LEDGER: entries may be added, never renamed or removed while a row could
 *     still exist.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { SITE_TEXTS, SITE_TEXT_DEFAULTS, isKnownSiteTextKey } from '../lib/siteTextDefs'
import { ALL_TOPICS, HELP_LOCKED_ANSWER_IDS } from '../lib/helpTopics'
import { PAGE_SEO } from '../lib/pageSeoDefs'

/** Which file owns each page's metadata. */
const FILE_BY_PAGE: Record<string, string> = {
  home: 'app/page.tsx',
  tutors: 'app/tutors/page.tsx',
  apply: 'app/apply/page.tsx',
  help: 'app/help/page.tsx',
  about: 'app/about/page.tsx',
  blog: 'app/blog/page.tsx',
  categories: 'app/categories/page.tsx',
  konsultacia: 'app/konsultacia/page.tsx',
  contact: 'app/contact/page.tsx',
}

const ROOT = join(import.meta.dirname, '..')

/** Every .ts/.tsx in the app, minus the registry itself (it names every key by
 *  construction, so including it would make every key look "used"). */
const SOURCE = (() => {
  const files: string[] = []
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      if (e === 'node_modules' || e === '.next') continue
      const p = join(d, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.tsx?$/.test(p) && !p.includes('siteTextDefs')) files.push(p)
    }
  }
  for (const d of ['app', 'components', 'lib']) walk(join(ROOT, d))
  return files.map(f => readFileSync(f, 'utf8')).join('\n')
})()

/**
 * The literal heads of every interpolated key in the source, e.g. the
 * `` `abroad.card${n}.title` `` in the landing page yields "abroad.card", and
 * `` `help.faq.${id}.${part}` `` in lib/helpTopics yields "help.faq.".
 *
 * Needed because a generated key never appears in the source as a whole string.
 * The first version of this test looked for the run before the first DIGIT,
 * which happened to fit `card1/2/3` and silently missed every family keyed by a
 * word — it reported all 25 help-FAQ keys as dead while they were rendering
 * perfectly. Reading the template heads is the general form.
 */
const TEMPLATE_HEADS = [...SOURCE.matchAll(/`([a-z][a-zA-Z0-9.]*?)\$\{/g)]
  .map(m => m[1])
  .filter(h => h.includes('.'))

test('every editable text actually renders somewhere', () => {
  const used = (key: string) =>
    SOURCE.includes(`"${key}"`) ||
    SOURCE.includes(`'${key}'`) ||
    TEMPLATE_HEADS.some(h => key.startsWith(h))
  const dead = SITE_TEXTS.filter(t => !used(t.key))
  assert.deepEqual(
    dead.map(t => `${t.key}  (${t.group} · ${t.label})`),
    [],
    'these fields are editable in the admin panel and change nothing on the site',
  )
})

test('the FAQ page and its Google structured data read ONE list', () => {
  // They were built from two expressions. An admin edit would then change the
  // visible answer while the FAQPage JSON-LD kept serving the old one — Google
  // treats that mismatch as a reason to drop the rich result, and nothing in
  // the app reports it. Same lesson as /apply.
  const page = readFileSync(join(ROOT, 'app/help/page.tsx'), 'utf8')
  assert.match(page, /const GROUPS = resolveGroups\(map\)/)
  assert.doesNotMatch(page, /import \{ GROUPS/, 'the page reads the static list again')

  // …and the widget must answer with the same words as the page.
  const widget = readFileSync(join(ROOT, 'components/HelpWidget.tsx'), 'utf8')
  assert.match(widget, /topicsForRoute\(pathname, siteTexts\)/, 'the widget answers with the code defaults while the page shows edited text')
})

test('an answer that quotes a constant is NOT editable', () => {
  // CANCEL_CUTOFF_HOURS, COMMISSION_PCT, SUPPORT_EMAIL and the PAYMENTS_LIVE
  // branches are read, never typed. A hand-written „24 საათი" becomes a lie the
  // day the constant moves, and it would be a lie in the one place people go to
  // check the cancellation rule. Their QUESTIONS stay editable.
  for (const id of HELP_LOCKED_ANSWER_IDS) {
    assert.ok(isKnownSiteTextKey(`help.faq.${id}.q`), `${id}: the question should still be editable`)
    assert.ok(
      !isKnownSiteTextKey(`help.faq.${id}.a`),
      `${id}: this answer interpolates a constant — an editable copy of it can go stale silently`,
    )
  }
  // Every OTHER answer must be editable, or the split is arbitrary.
  for (const t of ALL_TOPICS) {
    if (HELP_LOCKED_ANSWER_IDS.includes(t.id)) continue
    assert.ok(isKnownSiteTextKey(`help.faq.${t.id}.a`), `${t.id}: plain answer is not editable`)
  }
})

test('every public page takes its SEO text from the registry', () => {
  // The SERP title, the canonical and the OG card used to be three independent
  // literals in one hand-written object per page — which is how a page ends up
  // sharing a headline it no longer ranks under. One helper now builds all of
  // them, and a page that goes back to a static `metadata` object silently
  // stops being editable.
  for (const p of PAGE_SEO) {
    const file = FILE_BY_PAGE[p.page]
    const src = readFileSync(join(ROOT, file), 'utf8')
    assert.match(src, /export const generateMetadata = \(\) => pageMetadata\(/, `${file}: metadata is not built from the registry`)
    assert.doesNotMatch(src, /export const metadata: Metadata = \{/, `${file}: went back to a hardcoded metadata object`)
    // …and it must render per request, or the built HTML freezes whatever the
    // defaults were at BUILD time — when Railway's builder cannot reach the DB.
    assert.match(src, /export const dynamic = 'force-dynamic'/, `${file}: static render would bake stale SEO text`)
  }
})

test('the SEO description that quotes an address is NOT editable', () => {
  // /contact prints SUPPORT_EMAIL. Same rule as the FAQ answers: an address
  // typed by hand in a second place is an address that goes stale silently.
  const contact = PAGE_SEO.find(p => p.page === 'contact')!
  assert.equal(contact.lockedDescription, true)
  assert.ok(!isKnownSiteTextKey('seo.contact.description'))
  assert.ok(isKnownSiteTextKey('seo.contact.title'), 'the title should still be editable')
  // Every other page has all four.
  for (const p of PAGE_SEO) {
    if (p.lockedDescription) continue
    for (const part of ['title', 'description', 'ogTitle', 'ogDescription'] as const) {
      assert.ok(isKnownSiteTextKey(`seo.${p.page}.${part}`), `seo.${p.page}.${part} is missing`)
    }
  }
})

test('a label is never emptier than the thing it edits', () => {
  // A registry entry with no default is a field that renders as a blank space
  // on a live page the moment someone clears it and hits reset.
  for (const t of SITE_TEXTS) {
    assert.ok(t.default.trim().length > 0, `${t.key} has an empty default`)
    assert.ok(t.label.trim().length > 0, `${t.key} has no label — the admin sees a nameless box`)
    assert.ok(t.group.trim().length > 0, `${t.key} has no group`)
  }
})

test('keys are unique', () => {
  const seen = new Set<string>()
  for (const t of SITE_TEXTS) {
    assert.ok(!seen.has(t.key), `duplicate key ${t.key} — the later entry silently wins`)
    seen.add(t.key)
  }
  assert.equal(Object.keys(SITE_TEXT_DEFAULTS).length, SITE_TEXTS.length)
})

test('NO KEY MAY EVER BE RENAMED OR REMOVED', () => {
  // The ledger. Every key that has ever shipped is listed here, because a
  // production SiteText row may be holding hand-written copy under that exact
  // string. Renaming the key in code orphans the row: the site quietly falls
  // back to the code default and the person who wrote the sentence is never
  // told. Adding a key is free — just append it here too.
  const SHIPPED = [
    'home.hero.line1', 'home.hero.line2', 'home.hero.subtitle', 'home.hero.subtitleEmphasis',
    'home.categories.title', 'home.categories.subtitle',
    'home.experts.title',
    'home.how.subtitle',
    'home.how.step1.title', 'home.how.step1.desc',
    'home.how.step2.title', 'home.how.step2.desc',
    'home.why.card1.title', 'home.why.card1.body',
    'home.why.card2.title', 'home.why.card2.body',
    'home.why.card3.title', 'home.why.card3.body',
    'categories.hero.title', 'categories.hero.subtitle',
    'about.hero.title', 'about.hero.body', 'about.principles.title',
    'about.value1.title', 'about.value1.body', 'about.value2.title', 'about.value2.body',
    'about.value3.title', 'about.value3.body', 'about.value4.title', 'about.value4.body',
    'about.create.title', 'about.create.p1', 'about.create.p2',
    'about.cta.title', 'about.cta.body',
    'help.hero.title', 'help.contact.title', 'help.contact.sub',
    'footer.tagline',
  ]
  const missing = SHIPPED.filter(k => !isKnownSiteTextKey(k))
  assert.deepEqual(
    missing,
    [],
    'a key that has already shipped is gone from the registry — any admin-written text stored under it is now orphaned',
  )
})

test('the CMS saves what was typed — it never refuses it', () => {
  // Owner's instruction, 2026-08-04: „ხელით თუ დავწერ, ის აღარასდროს შეცვალო".
  // The route used to 400 on a copy-rule violation, so the text was dropped and
  // the panel looked like it had lost the work. The linter now advises and the
  // human decides — the row is written either way.
  const route = readFileSync(join(ROOT, 'app/api/admin/site-texts/route.ts'), 'utf8')
  assert.doesNotMatch(
    route,
    /error: 'GEORGIAN_COPY'/,
    'the CMS refuses admin-typed copy again — a refused save is a change to what they wrote',
  )
  assert.match(route, /const warnings = checkGeorgianCopy\(value\)/)
  // The warning must still reach the editor, or the rule silently disappears.
  assert.match(route, /warnings: warnings\.length \? describeViolations\(warnings\) : null/)
  // …and it has to land next to the field, not only in the page-level banner
  // that is off screen by the twentieth row.
  const ui = readFileSync(join(ROOT, 'app/admin/_texts.tsx'), 'utf8')
  assert.match(ui, /setNotes/)
  assert.match(ui, /role="status"/)
})
