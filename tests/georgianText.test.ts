// Pins the „ქართულად უნდა ეწეროს" gate (lib/georgianText.ts).
//
// Run: npx tsx tests/georgianText.test.ts
//
// The whole risk of this validator is FALSE REJECTION: Georgian business copy
// is full of Latin brands and acronyms, and a gate that blocks „Google Ads-ის
// კამპანიები" would be wrong far more often than the drift it exists to stop.
// Most of these cases are therefore things that MUST pass.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { checkGeorgian, firstGeorgianMessage, isGeorgian } from '../lib/georgianText'

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

/* ─── THE REASON HAS TO REACH THE FIELD ──────────────────────────────────────
 *
 * A gate whose message never leaves the server is half a rule: the save is
 * refused and „შენახვა ვერ მოხერხდა" names neither the field nor the fix.
 * Five routes shipped exactly that way — the gate was added, the message was
 * not — and it is invisible from the outside, because the route DOES reject.
 * So: every route that states a language rule must also return the sentence.
 */
console.log('\nშეცდომის ტექსტი უნდა დაბრუნდეს')
ok('picks the Georgian message', firstGeorgianMessage({ issues: [
  { message: 'String must contain at least 2 character(s)' },
  { message: 'სახელი ქართულად ჩაწერე' },
] }) === 'სახელი ქართულად ჩაწერე')
ok('ignores zod English', firstGeorgianMessage({ issues: [{ message: 'Invalid input' }] }) === null)
ok('null on no issues', firstGeorgianMessage({ issues: [] }) === null)

{
  const routes: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name === 'route.ts') routes.push(p)
    }
  }
  walk('app/api')
  // `applyValidationFailure` is /apply's richer equivalent — it returns field +
  // message from the same rules, so a route using it already answers.
  const offenders = routes.filter(p => {
    const src = readFileSync(p, 'utf8')
    const gates = /georgianRefine|georgianNameRefine/.test(src)
    return gates && !/firstGeorgianMessage|applyValidationFailure/.test(src)
  })
  ok(`every gated route surfaces its message${offenders.length ? ` — ${offenders.join(', ')}` : ''}`, offenders.length === 0)
}

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed ? 1 : 0)
