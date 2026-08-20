/**
 * Create (or repair) the hidden diaspora Category.
 *
 *   npx tsx -r dotenv/config scripts/abroad-category.ts
 *
 * ⚠️ THERE IS NO SANDBOX DATABASE. `DATABASE_URL` points at PRODUCTION from a
 * local shell too, so running this writes to the live DB. That is intended —
 * this is the ONE row the /abroad vertical needs and there is nowhere else to
 * put it — but read the next paragraph before you run it.
 *
 * WHAT IT DOES, EXACTLY: upserts one Category row with `status: 'HIDDEN'`, and
 * nothing else. It creates no experts, moves no profiles, touches no bookings.
 * Re-running it is a no-op on an existing row apart from re-asserting the name
 * and its hidden status — it will NOT quietly re-hide a category an admin has
 * deliberately made live, because at that point the vertical is public and
 * nobody should be running this script anyway.
 *
 * WHY HIDDEN IS THE WHOLE MECHANISM, and why there is no new code behind it:
 * the platform already treats a hidden category as invisible in exactly the
 * places that matter — lib/categoryTree states the rule, lib/tutorsQuery and
 * app/sitemap.ts both apply it, /categories lists spheres only — while
 * app/experts/[id]/page.tsx never checks it, so a profile in it opens fine by
 * direct link. „Invisible in the catalog, reachable from /abroad" is therefore
 * a data state, not a feature.
 *
 * AFTER RUNNING: assign the diaspora experts to it from ადმინი, or by setting
 * TutorProfile.categoryId. Nothing else is needed — lib/abroad keys off the
 * slug and every surface reads it from there.
 */
import { prisma } from '../lib/prisma'
import { ABROAD_CATEGORY_SLUG } from '../lib/abroad'

async function main() {
  const existing = await prisma.category.findUnique({
    where: { slug: ABROAD_CATEGORY_SLUG },
    select: { id: true, status: true, _count: { select: { tutors: true } } },
  })

  if (existing?.status === 'VISIBLE') {
    // Someone made it public on purpose. Flipping it back from a script would
    // be an invisible outage of a live category — refuse and say so.
    console.log(
      `[abroad] „${ABROAD_CATEGORY_SLUG}" already exists and is LIVE (${existing._count.tutors} expert(s)).\n` +
      '         Refusing to re-hide it — use ადმინი → კატეგორიები if that is really what you want.',
    )
    return
  }

  const row = await prisma.category.upsert({
    where: { slug: ABROAD_CATEGORY_SLUG },
    update: { name: 'დიასპორა', isLive: false, status: 'HIDDEN' },
    create: {
      slug: ABROAD_CATEGORY_SLUG,
      name: 'დიასპორა',
      isLive: false,
      status: 'HIDDEN',
      // Diaspora work is one-off consultation, not a weekly schedule — the same
      // default every other category carries today.
      defaultServiceType: 'CONSULTATION',
      // Last in any admin ordering; it is not a browse destination.
      order: 900,
    },
    select: { id: true, slug: true, name: true, status: true },
  })

  console.log(
    `[abroad] ${existing ? 'updated' : 'created'} category ${row.slug} (${row.id}) — status=${row.status}\n` +
    '         Assign diaspora experts to it, then flip FEATURE_ABROAD in lib/flags.ts.',
  )
}

main()
  .catch(e => { console.error('[abroad] failed:', e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
