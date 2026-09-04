/*
 * ONE-OFF BACKFILL for `ServiceProfile.published` (2026-09-04). A hand tool,
 * like scripts/sms-test.ts — not part of the gate, imported by nothing.
 *
 *   npx tsx scripts/republish-profiles.ts            # report only, writes nothing
 *   npx tsx scripts/republish-profiles.ts --write    # apply
 *
 * Owner, 2026-09-04: „სანამ სრულად არ შევსებს, ფოტოს არ დადებს, იქამდე არ
 * გამოჩნდეს პროფილზე."
 *
 * ⚠️ WHY A SCRIPT AND NOT A LINE IN lib/dbBoot. The rule lives in TypeScript
 * (lib/profileCompleteness → profileBlockers) and has to: /work prints the same
 * list of gaps to the provider, and the offer route refuses on the same list.
 * Restating it in SQL inside the migration would be two statements of one rule,
 * and two statements of one rule eventually disagree.
 *
 * Every write path recomputes the flag from here on (lib/profilePublish), so
 * this exists only for the rows that are already in the database and might
 * never be saved again.
 *
 * ⚠️ IT UNPUBLISHES 5, NOT 28 — measured before it was written. All 28 profiles
 * were `published` (the column defaults to true, so creating one published it),
 * and a first pass at the rule said all 28 were incomplete because 25 have
 * `photoUrl = null`. That reading was wrong: the catalogue falls back to the
 * account avatar (app/experts/_providers), so 24 of those 25 draw a face
 * perfectly well. Asked as „is there a face", 23 of 28 are complete.
 *
 * Idempotent — a second run writes nothing.
 */
import { prisma } from '../lib/prisma'
import { profileBlockers, faceFrom } from '../lib/profileCompleteness'

async function main() {
  const write = process.argv.includes('--write')
  const rows = await prisma.serviceProfile.findMany({
    select: {
      userId: true, published: true,
      photoUrl: true, about: true, services: true, areas: true, categoryId: true,
      user: { select: { fullName: true, avatarUrl: true } },
    },
  })

  let changed = 0
  for (const r of rows) {
    const missing = profileBlockers({ ...r, hasFace: faceFrom(r.photoUrl, r.user?.avatarUrl) })
    const next = missing.length === 0
    if (next === r.published) continue
    changed++
    const who = r.user?.fullName ?? r.userId ?? '?'
    console.log(`  ${next ? 'PUBLISH  ' : 'UNPUBLISH'} ${who}${missing.length ? '  — ' + missing.join(', ') : ''}`)
    if (write && r.userId) {
      await prisma.serviceProfile.update({ where: { userId: r.userId }, data: { published: next } })
    }
  }

  console.log(`\n${rows.length} profiles · ${changed} to change${write ? ' · WRITTEN' : ' · dry run, nothing written'}`)
  await prisma.$disconnect()
}

main()
