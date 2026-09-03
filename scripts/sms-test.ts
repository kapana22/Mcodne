/*
 * One real SMS, to one number you name. Not part of the gate, not imported by
 * anything — a hand tool, like tests/blogLinks.check.ts.
 *
 *   npx tsx scripts/sms-test.ts 5XXXXXXXX            # dry run: prints, sends nothing
 *   SMS_MODE=send npx tsx scripts/sms-test.ts 5XXXXXXXX   # really sends, really costs
 *
 * SMS_MODE is read from the environment of THIS command, so the dry run is the
 * default and the live one has to be typed out.
 */
import { sendSms, smsDestination, smsParts } from '../lib/sms'

const to = process.argv[2]
const text = process.argv[3] ?? 'მცოდნე: სატესტო შეტყობინება. კოდი 4321'

if (!to) {
  console.error('usage: npx tsx scripts/sms-test.ts <number> [text]')
  process.exit(1)
}
if (!smsDestination(to)) {
  console.error(`✗ ${to} — sender.ge dials Georgian mobiles only (5XXXXXXXX)`)
  process.exit(1)
}

console.log(`→ ${smsDestination(to)} · ${smsParts(text)} part(s) · mode=${process.env.SMS_MODE ?? 'log (default)'}`)
console.log(`  „${text}"`)

sendSms({ key: 'test.manual', to, text }).then(r => {
  console.log(r.ok ? '✓' : '✗', r)
  process.exit(r.ok ? 0 : 1)
})
