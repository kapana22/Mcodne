// The lexicon guard, run against the DATABASE.
//
// Run: npx tsx tests/lexiconDb.check.ts
//
// NOT a pure unit test — it reads the live DB (a local shell's DATABASE_URL
// points at PRODUCTION), which is why it is `.check.ts` and not `.test.ts`:
// scripts/check.mjs globs `*.test.ts` and deliberately misses this file, the
// same arrangement tests/blogLinks.check.ts uses. It only ever READS.
//
// WHY THIS EXISTS. tests/lexicon.test.ts is the list of words that must not
// come back, and it reads SOURCE. CLAUDE.md already names the hole this leaves:
//
//   „The copy is the owner's. Don't author or reword site text. Much of it
//    lives in the `SiteText` table and overrides `lib/siteTextDefs`, so no test
//    can see it: change the default AND the row."
//
// The half that gets forgotten is the row. Found on 2026-08-21 by reading the
// table instead of the file: `apply.get.card1.body` was live on /join — the
// public provider-recruitment page — reading
//
//   „…მიუთითე ფასი — სტუდენტი ზუსტად შენ მიერ განსაზღვრულ ღირებულებას დაინახავს."
//
// two retired words in one sentence, while `lib/siteTextDefs.ts` had already
// been corrected to „მომხმარებელი … ფასს". The default was fixed, the row was
// not, the row wins, and every source-reading test in the suite passed.
//
// So: same words, other half of the sentence's life. Run it after editing site
// texts in ადმინი → ტექსტები, and before a launch.
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * The rules, kept deliberately in step with tests/lexicon.test.ts § RULES.
 *
 * ⚠️ „ხელოსა?ნ" AND NOT „ხელოსან" — the plural drops the „ა" („ხელოსანი" →
 * „ხელოსნები"), and the source-side rule guarded only the singular for a day
 * because of it. Same trap here.
 *
 * A profession NAME is fine and the ban is on the ROLE word, so
 * „მასწავლებელი" is checked in the shape it appears as a label; a row that
 * legitimately names the job („ინგლისურის მასწავლებელი") is listed in ALLOW.
 */
const RULES: { word: RegExp; say: string }[] = [
  { word: /სტუდენტ/, say: '„სტუდენტი" → „კლიენტი"' },
  { word: /შემსრულებ/, say: 'contract language — use ექსპერტი or the profession' },
  { word: /ხელოსა?ნ/, say: 'a person-kind word — the model has one provider offering სერვისი' },
  { word: /დამკვეთ/, say: '„დამკვეთი" → „კლიენტი"' },
  { word: /სფერო/, say: '„სფერო" → „კატეგორია"' },
  { word: /ღირებულებ/, say: '„ღირებულება" → „ფასი"' },
  { word: /ვერიფიცირებ/, say: '„ვერიფიცირებული" → „გადამოწმებული"' },
  { word: /პირადი კაბინეტი/, say: 'retired' },
  { word: /მასტერ(?!კლას)/, say: 'retired („მასტერკლასი" is a different word)' },
  { word: /რეპეტიტორ/, say: 'retired' },
  { word: /ტუტორ/, say: 'retired' },
]

/**
 * Rows that legitimately carry a listed string. Per row and per reason, never
 * per pattern — „anything under seo." would silently bless the next slip.
 */
const ALLOW: { key: string; word: RegExp; why: string }[] = []

function excerpt(value: string, re: RegExp): string {
  const m = value.match(new RegExp(`.{0,70}${re.source}.{0,70}`))
  return (m?.[0] ?? value.slice(0, 140)).replace(/\s+/g, ' ').trim()
}

async function main() {
  const rows = await prisma.siteText.findMany({ select: { key: true, value: true } })
  console.log(`\nlexicon → SiteText: ${rows.length} rows\n`)

  let bad = 0
  for (const row of rows) {
    if (typeof row.value !== 'string' || !row.value) continue
    for (const rule of RULES) {
      if (!rule.word.test(row.value)) continue
      if (ALLOW.some(a => a.key === row.key && a.word.source === rule.word.source)) continue
      bad++
      console.log(`✗ ${row.key}`)
      console.log(`    ${rule.say}`)
      console.log(`    …${excerpt(row.value, rule.word)}…\n`)
    }
  }

  if (bad) {
    // Named here because the fix is NOT a code change and a reader who only
    // knows the source-side test will look in the wrong place for it.
    console.log(
      `${bad} retired word(s) live in the database.\n\n` +
      `These are DB rows, not source. Fix them in ადმინი → ტექსტები (or with a\n` +
      `one-off script under scripts/), and check lib/siteTextDefs.ts holds the\n` +
      `same corrected wording — a row deleted without a corrected default just\n` +
      `brings the old sentence back from the code.\n`,
    )
  } else {
    console.log('clean — no retired word is live in the site text.\n')
  }
  await prisma.$disconnect()
  process.exit(bad ? 1 : 0)
}

main().catch(async e => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
