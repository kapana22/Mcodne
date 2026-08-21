// Removes the demo provider accounts and the orphaned tombstone profile.
// 2026-08-20 — owner: „დემო და წაშლილი პროფილები წაშალე."
//
//   npx tsx scripts/purge-demo-providers-2026-08-20.ts
//
// ⚠️ TWO DIFFERENT THINGS, DELETED DIFFERENTLY. Measured before writing this:
//
//   5 × [დემო] …@demo.mcodne.ge   published:0 — already out of the catalogue.
//       Zero offers, zero requests, zero messages, zero bookings. Nothing but
//       the account, its RequestAccess row and a few notifications. Deleted
//       WHOLE: profile, allowlist row, notifications, user.
//
//   1 × slug `mcodne`, owned by a TOMBSTONE user
//       (deleted-…@deleted.invalid, left behind by an account deletion)
//       published:1 — it was LIVE on /experts, which is the actual defect.
//       ⚠️ ITS USER IS NOT DELETED. That row carries 1 service request and 1
//       booking — somebody else's history on the other side of both. The
//       tombstone exists precisely so that history survives the deletion; it
//       is the ServiceProfile that should have gone with the account and did
//       not. So the PROFILE goes and the tombstone stays.
//
// Every step is guarded on „nothing real is attached" and the whole thing runs
// in one transaction: a half-purge would leave an allowlist row granting access
// to an account that no longer exists.
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const DEMO_EMAIL = '@demo.mcodne.ge'
const TOMBSTONE_SLUG = 'mcodne'

async function main() {
  // ⚠️ 30s, not the 5s default. This walks six tables in sequence and the first
  // run died on Prisma's interactive-transaction budget — which rolled the whole
  // thing back, correctly, but on the CLOCK rather than on anything being wrong.
  await prisma.$transaction(async tx => {
    // ── 1. the demo accounts, whole ──────────────────────────────────────
    const demos = await tx.user.findMany({
      where: { email: { contains: DEMO_EMAIL, mode: 'insensitive' } },
      select: { id: true, fullName: true },
    })
    const ids = demos.map(d => d.id)
    if (ids.length) {
      // The guard, re-asserted on the real rows rather than on the sentence
      // above: anything with history is NOT a demo any more, whatever it is
      // called, and must stop this file rather than be quietly destroyed.
      const [offers, reqs, msgs, bookings, tutors] = await Promise.all([
        tx.requestOffer.count({ where: { expertUserId: { in: ids } } }),
        tx.serviceRequest.count({ where: { userId: { in: ids } } }),
        tx.message.count({ where: { OR: [{ fromId: { in: ids } }, { toId: { in: ids } }] } }),
        tx.booking.count({ where: { OR: [{ studentId: { in: ids } }, { tutor: { userId: { in: ids } } }] } }),
        tx.tutorProfile.count({ where: { userId: { in: ids } } }),
      ])
      const held = offers + reqs + msgs + bookings + tutors
      if (held > 0) throw new Error(`a demo account has ${held} real row(s) attached — inspect before deleting`)

      await tx.serviceProfile.deleteMany({ where: { userId: { in: ids } } })
      await tx.requestAccess.deleteMany({ where: { userId: { in: ids } } })
      await tx.notification.deleteMany({ where: { userId: { in: ids } } })
      await tx.session.deleteMany({ where: { userId: { in: ids } } })
      await tx.user.deleteMany({ where: { id: { in: ids } } })
      console.log(`✓ ${demos.length} demo account(s) deleted: ${demos.map(d => d.fullName).join(', ')}`)
    } else {
      console.log('· no demo accounts left')
    }

    // ── 2. the tombstone's PROFILE only ─────────────────────────────────
    const ghost = await tx.serviceProfile.findFirst({
      where: { slug: TOMBSTONE_SLUG },
      select: { id: true, userId: true, user: { select: { email: true } } },
    })
    if (!ghost) { console.log('· no tombstone profile'); return }
    if (!ghost.user?.email?.includes('@deleted.invalid')) {
      throw new Error(`slug "${TOMBSTONE_SLUG}" belongs to a LIVE account (${ghost.user?.email}) — refusing`)
    }
    const offers = await tx.requestOffer.count({ where: { expertUserId: ghost.userId ?? '' } })
    if (offers > 0) throw new Error(`the tombstone profile holds ${offers} offer(s) — inspect first`)
    await tx.serviceProfile.delete({ where: { id: ghost.id } })
    console.log('✓ tombstone ServiceProfile deleted — the USER row stays (it carries a request and a booking)')
  }, { timeout: 30_000 })

  const left = await prisma.serviceProfile.count()
  console.log(`\nproviders remaining: ${left}`)
}

main().then(() => console.log('done')).catch(e => { console.error('FAILED — rolled back:', e.message); process.exit(1) }).finally(() => prisma.$disconnect())
