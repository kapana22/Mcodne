// Pins the „ქართულად უნდა ეწეროს" gate (lib/georgianText.ts).
//
// Run: npx tsx tests/georgianText.test.ts
//
// The whole risk of this validator is FALSE REJECTION: Georgian business copy
// is full of Latin brands and acronyms, and a gate that blocks „Google Ads-ის
// კამპანიები" would be wrong far more often than the drift it exists to stop.
// Most of these cases are therefore things that MUST pass.
import { checkGeorgian, isGeorgian } from '../lib/georgianText'

let passed = 0, failed = 0
const ok = (name: string, cond: boolean) => { cond ? (passed++, console.log(`  ✓ ${name}`)) : (failed++, console.log(`  ✗ ${name}`)) }

console.log('\nგეორგიან-გეიტი — უნდა გაატაროს')
ok('plain Georgian', isGeorgian('ბიზნეს-სტრატეგია მცირე კომპანიებისთვის'))
ok('Georgian + Latin brand', isGeorgian('Google Ads-ისა და Meta-ს კამპანიების მართვა'))
ok('Georgian + acronyms', isGeorgian('SEO და HR პროცესების გამართვა კომპანიაში'))
ok('Georgian name', isGeorgian('მათე ივანიაძე'))
ok('mtavruli (caps)', isGeorgian('ᲛᲐᲗᲔ ᲘᲕᲐᲜᲘᲐᲫᲔ'))
ok('short token „SEO"', isGeorgian('SEO'))
ok('short token „IT"', isGeorgian('IT'))
ok('category „HR"', isGeorgian('HR'))
ok('empty passes (required-ness is separate)', isGeorgian(''))
ok('null passes', isGeorgian(null))
ok('numbers and punctuation only', isGeorgian('2026 — 100%'))
ok('email inside Georgian text', isGeorgian('დამიკავშირდი მისამართზე hi@mcodne.ge ნებისმიერ დროს'))

console.log('\nუნდა შეაჩეროს')
ok('Latin-only name', !isGeorgian('Marietta Dzvelaia'))
ok('Latin-only headline', !isGeorgian('SEO expert and marketing consultant'))
ok('Latin sentence', !isGeorgian('I help startups grow their revenue'))
ok('Russian sentence', !isGeorgian('Помогаю компаниям расти и развиваться'))
ok('mostly Latin with one Georgian word', !isGeorgian('Business consultant with international experience და'))

console.log('\nმიზეზები')
{
  const c = checkGeorgian('Marietta Dzvelaia')
  ok('no-georgian reason', !c.ok && c.reason === 'no-georgian')
}
{
  const c = checkGeorgian('Business consultant with experience და')
  ok('mostly-foreign reason', !c.ok && c.reason === 'mostly-foreign')
}
{
  // The exact rows found in production 2026-08-02 — the reason this exists.
  ok('prod: „Mate Ivaniadze" blocked', !isGeorgian('Mate Ivaniadze'))
  ok('prod: „luka kapanadze" blocked', !isGeorgian('luka kapanadze'))
  ok('prod: „SEO expert" blocked', !isGeorgian('SEO expert'))
  ok('prod: specialty „IT" allowed (a real category name)', isGeorgian('IT'))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed ? 1 : 0)
