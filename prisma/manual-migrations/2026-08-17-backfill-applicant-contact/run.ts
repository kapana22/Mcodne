/* Carry every approved applicant's own answers back onto their account.
 *
 * WHY THIS EXISTS. Approval wrote `{ role: 'TUTOR' }` to the User and nothing
 * else, so `fullName` and `phone` — the two fields /apply validates hardest —
 * were collected and dropped. The route is fixed; this repairs the rows it
 * already produced. Measured 2026-08-17: 15 of 25 approved experts had given a
 * phone and carried `phone: null`, and one had given „ნიკა წოწორია" while the
 * account kept the Latin name Google supplied.
 *
 * SAME RULES AS THE ROUTE, deliberately — a backfill that decides differently
 * from the code is a second implementation:
 *   · NAME  — taken only when the application's name passes the strict Georgian
 *             rule AND the account's current name does not. Never downgrade.
 *   · PHONE — filled only when the account has none. A number set later in
 *             /settings is newer than the one on the application.
 *   · Both normalised through lib/phone, so the column cannot end up holding
 *             „+995 555 15 13 13" here and „555151313" everywhere else.
 *
 * Dry run:  npx tsx prisma/manual-migrations/2026-08-17-backfill-applicant-contact/run.ts
 * Apply:    …/run.ts --write
 */
import { PrismaClient } from '@prisma/client'
import { georgianNameError } from '../../../lib/georgianText'
import { normalizePhone, phoneFormatError } from '../../../lib/phone'

const p = new PrismaClient()
const WRITE = process.argv.includes('--write')

async function main() {
  const apps = await p.tutorApplication.findMany({
    where: { status: 'APPROVED' },
    select: {
      fullName: true, phone: true,
      user: { select: { id: true, email: true, fullName: true, phone: true } },
    },
  })

  let names = 0, phones = 0
  for (const a of apps) {
    const u = a.user
    if (!u) continue
    const data: { fullName?: string; phone?: string } = {}

    const appName = (a.fullName ?? '').trim()
    if (appName && !georgianNameError('სახელი', appName) && georgianNameError('სახელი', u.fullName ?? '')) {
      data.fullName = appName
    }

    const appPhone = (a.phone ?? '').trim()
    if (appPhone && !u.phone) {
      const n = normalizePhone(appPhone)
      if (n && !phoneFormatError(n, { required: true })) data.phone = n
    }

    if (!Object.keys(data).length) continue
    if (data.fullName) { names++; console.log(`name   ${u.email}  "${u.fullName}" → "${data.fullName}"`) }
    if (data.phone) { phones++; console.log(`phone  ${u.email}  ${JSON.stringify(u.phone)} → ${data.phone}   (app: ${appPhone})`) }
    if (WRITE) await p.user.update({ where: { id: u.id }, data })
  }

  console.log(`\n${names} name(s), ${phones} phone(s) ${WRITE ? 'written' : 'to write — dry run, pass --write'}`)
}
main().finally(() => p.$disconnect())
