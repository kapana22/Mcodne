// Writes the new hero copy into the SiteText table. 2026-08-21
//
//   npx tsx scripts/sitetext-hero-2026-08-21.ts
//
// ⚠️ WHY A SCRIPT AND NOT A DEFAULT. `lib/siteTextDefs` holds the DEFAULT for
// every key; the live site reads the `SiteText` ROW and falls back to the
// default only when the row is missing. Every key below already HAS a row, so
// changing the default moved nothing — this is the half that does. The same
// table is what the admin panel's „ტექსტები" tab edits, so writing it here also
// puts the new words in front of the owner for later editing; nothing is
// hidden in code.
//
// ⚠️ IT PRINTS THE OLD VALUE BEFORE EVERY WRITE. This is the owner's copy and
// CLAUDE.md's rule is that I do not rewrite it — this run is authorised
// (2026-08-21: „მინდა ბაზაში იყოს და პარალელურად ადმინ პანელშიც ჩაიწეროს"),
// and the previous text is echoed so it can be put back by hand from the same
// screen. Re-running is safe: it writes the same values.
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

/** key → the new value. The reasoning for each is in lib/siteTextDefs beside
 *  its default; the short version is that the headline moved from a question
 *  („რა გჭირდება?" — the tender framing) to a verb naming WHO you will meet,
 *  which is how every marketplace that reads as professional opens, and that
 *  „უფასო" left the page entirely. */
const COPY: Record<string, string> = {
  'home.hero.line1': 'იპოვე ექსპერტი,',
  'home.hero.line2': 'რომელიც გააკეთებს',
  'home.hero.subtitle': 'ბუღალტერი, იურისტი, ფსიქოლოგი, სანტექნიკოსი — თბილისში. ყველა პროფილი ხელით მოწმდება,',
  'home.hero.subtitleEmphasis': 'ფასი პროფილზევე წერია.',

  // ⚠️ THE REST OF „უფასო", REMOVED THE SAME DAY (2026-08-21). It survived one
  // round because two of these are HELP answers where the word states a fact
  // rather than sells one; the owner's call was to change them all („შეცვალე
  // როგორც დიზაინშია"). Each keeps the fact and loses the bargain tone:
  //   apply.hero.note   the reassurance was the price of applying; the thing an
  //                     applicant actually wants to know is how long it takes.
  //   help.faq.signup   same trade, in the answer that explains signing up.
  //   payment-safety    ⚠️ THIS ONE CARRIES A MATERIAL FACT — payments are not
  //                     live, so nothing is charged and no card is asked for.
  //                     The word goes, the FACT stays and is said plainly;
  //                     dropping it would leave somebody expecting a charge.
  //   seo.home          it repeated the retired headline („აღწერე რა გჭირდება")
  //                     AND ended „მოთხოვნა უფასოა" — this is the sentence
  //                     Google prints, so it was the last place the old
  //                     tender-first product was still being advertised.
  'apply.hero.note': 'რეგისტრაცია 2 წუთია · განაცხადს ინდივიდუალურად განვიხილავთ 24–48 საათში',
  'help.faq.signup.a': 'რეგისტრაცია 2 წუთია — გახსენი „დარეგისტრირდი“ და შედი Google-ით ან ელფოსტითა და პაროლით. ანგარიში მხოლოდ დაჯავშნისთვის გჭირდება; ექსპერტების დათვალიერება რეგისტრაციის გარეშეც შესაძლებელია.',
  'help.faq.payment-safety.a': 'ამ ეტაპზე გადახდა საიტზე არ ხდება და ბარათის მონაცემები არ გჭირდება. პლატფორმის სრულად ამოქმედების შემდეგ თანხა დაცულად შეინახება და ექსპერტს მხოლოდ სამუშაოს დასრულების შემდეგ გადაერიცხება.',
  'seo.home.description': 'იპოვე ექსპერტი, რომელიც გააკეთებს — ბუღალტერი, იურისტი, ფსიქოლოგი, სანტექნიკოსი და სხვ. ყველა პროფილი ხელით მოწმდება, ფასი პროფილზევე წერია. თბილისი.',
}

async function main() {
  for (const [key, value] of Object.entries(COPY)) {
    const before = await prisma.siteText.findUnique({ where: { key }, select: { value: true } })
    if (before?.value === value) { console.log(`· ${key} — already reads this`); continue }
    console.log(`✓ ${key}`)
    console.log(`    იყო:  ${before?.value ?? '(მწკრივი არ არსებობდა — ნაგულისხმევს კითხულობდა)'}`)
    console.log(`    არის: ${value}`)
    await prisma.siteText.upsert({ where: { key }, create: { key, value }, update: { value } })
  }

  // The guard that matters after this run: the word the owner banned must not
  // be in any LIVE row, not merely out of the source. `tests/lexicon` scans
  // source only and can never see this table.
  const free = await prisma.siteText.findMany({ where: { value: { contains: 'უფასო' } }, select: { key: true, value: true } })
  if (free.length) {
    console.log(`\n⚠️  „უფასო" კიდევ ${free.length} მწკრივშია — ესენი შენი გადასაწყვეტია:`)
    for (const r of free) console.log(`    ${r.key.padEnd(30)} ${r.value.replace(/\s+/g, ' ').slice(0, 70)}`)
  }
}

main().then(() => console.log('\ndone')).catch(e => { console.error('FAILED:', e.message); process.exit(1) }).finally(() => prisma.$disconnect())
