/**
 * Retire two words from the one SiteText row still carrying them.
 *
 *   npx tsx scripts/lexicon-siteText-2026-08-21.ts          (dry run)
 *   npx tsx scripts/lexicon-siteText-2026-08-21.ts --apply   (writes)
 *
 * ⚠️ THIS WRITES TO PRODUCTION. There is no sandbox database; a local shell's
 * DATABASE_URL points at the live one. Dry run first, always.
 *
 * WHAT AND WHY. `apply.get.card1.body` is the first „რას იღებ" card on /join —
 * the public provider-recruitment page, i.e. the page whose whole job is to
 * turn a reader into supply. Found 2026-08-21 reading live on that page:
 *
 *   თითოეულ სერვისს ცალ-ცალკე მიუთითე ფასი — სტუდენტი ზუსტად შენ მიერ
 *   განსაზღვრულ ღირებულებას დაინახავს.
 *
 * „სტუდენტი" and „ღირებულება" are both on the retired list (CLAUDE.md → Words
 * that were retired; tests/lexicon.test.ts). They survived because that test
 * reads SOURCE, and `lib/siteTextDefs.ts` had ALREADY been corrected — the row
 * overrides the default, so the fixed default was never on screen. The gap is
 * now checked by tests/lexiconDb.check.ts.
 *
 * ⚠️ THIS IS NOT NEW COPY, and that matters — CLAUDE.md says the copy is the
 * owner's and nobody else authors it. The replacement below is the EXISTING
 * default from lib/siteTextDefs.ts, character for character. This script only
 * makes the database agree with the sentence the code already had.
 *
 * It therefore DELETES the override rather than writing a new value: with no
 * row, `lib/siteText` falls through to the default, and there is one place the
 * sentence lives again instead of two that can drift apart. The guard below
 * refuses to run if the default has meanwhile changed away from the wording
 * this script was written against.
 */
import { prisma } from '../lib/prisma'
import { SITE_TEXTS } from '../lib/siteTextDefs'

const KEY = 'apply.get.card1.body'

/** The default as it stood when this script was written. If it has changed,
 *  stop: somebody has edited the sentence and this script's reasoning is
 *  about a different one. */
const EXPECTED_DEFAULT =
  'თითოეულ სერვისს ცალ-ცალკე მიუთითე ფასი — მომხმარებელი ზუსტად შენს მიერ განსაზღვრულ ფასს დაინახავს.'

const RETIRED = [/სტუდენტ/, /ღირებულებ/]

async function main() {
  const apply = process.argv.includes('--apply')

  const def = SITE_TEXTS.find(d => d.key === KEY)
  if (!def) throw new Error(`${KEY} is not in lib/siteTextDefs — nothing to fall through to.`)
  if (def.default !== EXPECTED_DEFAULT) {
    throw new Error(
      `The default for ${KEY} has changed since this script was written.\n` +
      `  expected: ${EXPECTED_DEFAULT}\n` +
      `  found:    ${def.default}\n` +
      `Re-read it and decide deliberately; do not just update the constant.`,
    )
  }
  for (const re of RETIRED) {
    if (re.test(def.default)) throw new Error(`The default itself still contains ${re} — fix lib/siteTextDefs first.`)
  }

  const row = await prisma.siteText.findUnique({ where: { key: KEY } })
  if (!row) {
    console.log(`${KEY}: no override row — the default is already what renders. Nothing to do.`)
    return
  }

  const hits = RETIRED.filter(re => re.test(row.value))
  if (hits.length === 0) {
    console.log(`${KEY}: the row carries no retired word. Leaving it alone — it may be a deliberate edit.`)
    console.log(`  row: ${row.value}`)
    return
  }

  console.log(`${KEY}`)
  console.log(`  now (DB):    ${row.value}`)
  console.log(`  will render: ${def.default}`)
  console.log(`  retired words found: ${hits.map(h => h.source).join(', ')}`)

  if (!apply) {
    console.log('\nDRY RUN — pass --apply to delete the override.')
    return
  }

  await prisma.siteText.delete({ where: { key: KEY } })
  console.log('\n✓ override deleted — /join now renders the default.')
}

main()
  .catch(e => { console.error('\n✗', e.message); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
