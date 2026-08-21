// BACKFILL: pay everybody the profile bonus they had already earned.
//
// ⚠️ WHY THIS RUN EXISTS. `grantEarnedTasks` shipped 2026-08-20 wired to ONE
// screen — app/work/page.tsx — and that screen was the one a service provider
// was never routed to (lib/hats → HAT_HOME.MASTER pointed at the queue; the
// phone's tab bar had no route to the home at all). Measured on live data
// 2026-08-21, before this ran:
//
//     service providers with any grant   0 of 2
//     experts with any grant             3 of 27
//     one provider: 6 priced services, a photo, a work photo, an area
//                   — 85₾ of completed tasks, balance −5₾
//
// The routing is fixed in the same change; this pays the people whose profile
// was already finished while the door was shut. Nobody is granted anything they
// have not completed — it is the same `grantEarnedTasks`, run once per person.
//
// ⚠️ SAFE TO RE-RUN. The grant is idempotent by `@@unique([userId, grantKey])`,
// not by a check, so a second run writes nothing. It never charges and never
// removes; the only rows it can create are positive grants for completed tasks.
//
//   npx tsx scripts/credits-backfill-2026-08-21.ts          # report only
//   npx tsx scripts/credits-backfill-2026-08-21.ts --write  # grant
import { PrismaClient } from '@prisma/client'
import { grantEarnedTasks, profileFacts, balanceOf } from '../lib/creditsServer'
import { earnedTasks, completeness, gelLabel, CREDIT_TASKS } from '../lib/credits'

const prisma = new PrismaClient()
const WRITE = process.argv.includes('--write')

async function main() {
  // Everybody who holds either capability: an expert profile, or a service
  // profile the allowlist has actually admitted. The same two reads
  // `capabilitiesOf` makes — a ServiceProfile with no active RequestAccess is
  // somebody who filled in a form and was never let in, and they have no
  // workspace to spend a balance in.
  const people = await prisma.user.findMany({
    where: {
      OR: [
        { tutor: { isNot: null } },
        { AND: [{ serviceProfile: { isNot: null } }, { requestAccess: { active: true } }] },
      ],
    },
    select: { id: true, fullName: true, email: true },
    orderBy: { createdAt: 'asc' },
  })

  let paid = 0
  let totalTetri = 0
  for (const u of people) {
    const facts = await profileFacts(u.id)
    const done = earnedTasks(facts)
    const before = await balanceOf(u.id)
    const fresh = WRITE ? await grantEarnedTasks(u.id) : []
    const owed = WRITE
      ? fresh.reduce((n, t) => n + t.tetri, 0)
      : CREDIT_TASKS.filter(t => (done as string[]).includes(t.key)).reduce((n, t) => n + t.tetri, 0) - Math.max(0, before)

    if (WRITE && fresh.length > 0) { paid++; totalTetri += owed }
    const who = (u.fullName ?? u.email).padEnd(22)
    console.log(
      `${who} პროფილი ${String(completeness(facts)).padStart(3)}%  ` +
      `ბალანსი ${gelLabel(before).padStart(5)}` +
      (WRITE
        ? (fresh.length ? ` → ${gelLabel(before + owed)}  (+${fresh.map(f => f.key).join(', ')})` : '  —')
        : (owed > 0 ? `  owed ~${gelLabel(owed)}` : '  —')),
    )
  }

  console.log(
    `\n${people.length} providers · ` +
    (WRITE ? `${paid} granted · ${gelLabel(totalTetri)} written` : 'dry run — pass --write to grant'),
  )
}

main().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
