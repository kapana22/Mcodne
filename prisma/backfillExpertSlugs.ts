// Backfill public slugs for expert profiles created before slugs existed.
//
//   npx tsx prisma/backfillExpertSlugs.ts
//
// Idempotent and additive: it only ever fills a NULL slug. An existing slug is
// never rewritten — see the permanence note in lib/expertSlug.ts (a changed
// slug breaks every link anyone shared and forces search engines to re-learn
// the URL). Safe to run against production; safe to re-run.
//
// New experts don't need this — approval assigns a slug
// (app/api/applications/[id]/route.ts). This is purely for the existing rows.
import { PrismaClient } from '@prisma/client'
import { ensureExpertSlug } from '../lib/expertSlug'

const prisma = new PrismaClient()

async function main() {
  const pending = await prisma.tutorProfile.findMany({
    where: { slug: null },
    select: { id: true, user: { select: { fullName: true } } },
    orderBy: { createdAt: 'asc' },
  })

  if (pending.length === 0) {
    console.log('ყველა პროფილს უკვე აქვს slug — არაფერი გასაკეთებელია.')
    return
  }

  console.log(`${pending.length} პროფილი slug-ის გარეშე:\n`)
  let ok = 0
  for (const p of pending) {
    const slug = await ensureExpertSlug(p.id)
    if (slug) {
      ok++
      console.log(`  ✓ ${(p.user?.fullName ?? '—').padEnd(24)} → /tutors/${slug}`)
    } else {
      // Not an error state: the id URL keeps working, so the profile is fine.
      console.log(`  · ${(p.user?.fullName ?? '—').padEnd(24)} → slug ვერ შეიქმნა (id-ით რჩება)`)
    }
  }
  console.log(`\nდასრულდა — ${ok}/${pending.length}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
