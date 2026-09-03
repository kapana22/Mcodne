/**
 * THE FIXTURE THE END-TO-END TEST RUNS AGAINST.
 *
 * ⚠️ IT REFUSES TO RUN ANYWHERE BUT A LOCAL DATABASE, and that guard is the
 * first thing in the file for a reason. `.env` on this project points at
 * PRODUCTION — `npx tsx` from the project root resolves it, so a seed that
 * merely assumed it was local would write test accounts into the live database
 * the first time somebody ran it without thinking. Two people have now been
 * caught out by that env resolution in one week; this file cannot be one of
 * them.
 *
 *   createdb mcodne && npx prisma db push
 *   DATABASE_URL=postgresql://…@localhost:5432/mcodne npx tsx prisma/seed-e2e.ts
 *
 * ⚠️ IDEMPOTENT BY UPSERT, NOT BY TRUNCATE. The e2e run creates its own request
 * every time and leaves it; wiping the database on each seed would mean a
 * developer poking at the site by hand loses their state whenever a test runs.
 *
 * What it makes:
 *   · a PROVIDER — ServiceProfile + an active RequestAccess row + a balance.
 *     `identityOf` calls somebody a provider only when it finds BOTH, so a
 *     fixture missing the allowlist row 404s on every /work screen and the
 *     failure reads as a routing bug.
 *   · a RIVAL provider, so „N უკვე უპასუხა" is a real number rather than 0.
 *   · nothing else. The test writes its own request through the real intake,
 *     because a request inserted by a seed has never been through the wizard
 *     and would not prove the wizard works.
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { TOPIC_GROUPS } from '../lib/requestTopics'
import { E2E } from '../e2e/accounts'

/**
 * ⚠️ THE GUARD RUNS IN `main()`, NOT AT MODULE SCOPE, and that is not a
 * weakening. At module scope it fired on IMPORT — and `e2e/flow.spec.ts`
 * imports `E2E` from this file for the two addresses, so merely naming a
 * constant killed the whole Playwright run with a message about seeding.
 * A guard belongs on the act it is guarding: nothing is written until `main()`
 * is called, and `main()` is only called when this file is executed directly.
 */
function refuseNonLocal(): void {
  const url = process.env.DATABASE_URL ?? ''
  if (/@(localhost|127\.0\.0\.1)[:/]/.test(url)) return
  console.error('REFUSING: DATABASE_URL is not a local database.\n' +
    '  This seed writes accounts. .env on this project points at PRODUCTION.\n' +
    '  Pass an explicit local URL:\n' +
    '    DATABASE_URL=postgresql://…@localhost:5432/mcodne npx tsx prisma/seed-e2e.ts')
  process.exit(1)
}

let prisma: PrismaClient

async function seedProvider(email: string, name: string, slug: string, services: string[], balanceTetri: number) {
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash: await bcrypt.hash(E2E.password, 10),
      fullName: name,
      role: 'PROVIDER',
      emailVerified: true,
    },
  })
  // ⚠️ BOTH HALVES. lib/identity → identityOf answers „is this a provider" from
  // a ServiceProfile AND an active RequestAccess row; one without the other is
  // the state 27 migrated accounts were in, and every /work screen 404s.
  await prisma.requestAccess.upsert({
    where: { userId: user.id },
    update: { active: true },
    create: { userId: user.id, kind: 'EXPERT', active: true, note: 'e2e fixture' },
  })
  await prisma.serviceProfile.upsert({
    where: { userId: user.id },
    update: { services, areas: ['TBILISI'], published: true, available: true },
    create: {
      userId: user.id, slug,
      services, professions: services, areas: ['TBILISI'],
      published: true, available: true, verified: true, yearsExp: 5,
      headline: name,
      about: 'ლოკალური ტესტისთვის შექმნილი პროფილი — არასდროს ხვდება პროდაქშენში.',
      priceFrom: 50,
    },
  })
  if (balanceTetri > 0) {
    // A grant key makes it idempotent the same way every other grant in the
    // ledger is — re-running the seed must not keep topping the balance up.
    await prisma.creditEntry.upsert({
      where: { userId_grantKey: { userId: user.id, grantKey: 'E2E_SEED' } },
      update: {},
      create: { userId: user.id, amountTetri: balanceTetri, reason: 'ADMIN_ADJUST: e2e fixture', grantKey: 'E2E_SEED' },
    })
  }
  return user
}

async function main() {
  refuseNonLocal()
  prisma = new PrismaClient()
  // A SERVICE group, because the whole commercial flow the test walks is a
  // service job — and because `photos` (the feed card's picture) is only asked
  // for on that kind.
  const group = TOPIC_GROUPS.find(g => g.kinds.includes('SERVICE'))
  if (!group) throw new Error('no SERVICE topic group — lib/requestTopics changed shape')
  const services = group.topics.slice(0, 4).map(t => t.id)

  await seedProvider(E2E.provider, 'ე2ე ექსპერტი', 'e2e-eksperti', services, E2E.balanceTetri)
  await seedProvider(E2E.rival, 'ე2ე მეორე', 'e2e-meore', services, E2E.balanceTetri)

  console.log(JSON.stringify({ seeded: [E2E.provider, E2E.rival], topic: services[0] }, null, 2))
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma?.$disconnect())
