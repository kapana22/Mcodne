/* Open a calendar for every listed expert who has none (owner, 2026-08-13).
 *
 * THE PROBLEM. 5 of 23 listed experts had no future free time, so their card was
 * a dead end: a client opens the profile and there is nothing to book. Four of
 * them never had a single window; the fifth's ran out on 7 August.
 *
 * WHY NOT lib/availabilityTopUp. That job maintains a ROLLING HORIZON and
 * deliberately refuses to resurrect an empty calendar (guard #1: „an empty
 * calendar is a DECISION"), and it expands the expert's OWN stored pattern
 * (guard #3) — which none of these five has. So it cannot help here by design,
 * and the owner's call is to open them anyway.
 *
 * WHAT MAKES THIS DEFENSIBLE rather than publishing hours in someone's name:
 *   · the pattern is DEFAULT_AVAIL (Mon–Fri 10:00–18:00) — the platform's own
 *     onboarding default, pre-filled for every applicant, not something invented
 *     for these five;
 *   · a booking lands as PREPARING and the EXPERT must accept it, so a client
 *     can never end up with a confirmed session nobody agreed to;
 *   · every one of them is TOLD, with a link to where they change it — the same
 *     thing approval does when it publishes a calendar on someone's behalf;
 *   · the pattern is STORED, so lib/availabilityTopUp takes over from here and
 *     keeps the horizon open indefinitely. „სამუდამოდ" needs no new machinery.
 *   · and it stays reversible by them: delete everything and the top-up job
 *     stops, exactly as guard #1 intends.
 *
 * Run: npx tsx prisma/manual-migrations/2026-08-13-open-empty-calendars/run.ts
 */
import { PrismaClient } from '@prisma/client'
import { materializeWeekly } from '../../../lib/availabilityRules'
import { HORIZON_WEEKS } from '../../../lib/availabilityTopUp'
import { notify } from '../../../lib/notify'

const p = new PrismaClient()
/** Mon–Fri as day indexes — the index form professionData stores. */
const PATTERN = { days: [0, 1, 2, 3, 4], startHour: 10, endHour: 18, weeks: HORIZON_WEEKS }

async function main() {
  const now = new Date()
  const listed = await p.tutorProfile.findMany({
    where: { available: true, user: { is: { suspendedAt: null } } },
    select: { id: true, slug: true, userId: true, professionData: true, _count: { select: { consultations: true } } },
  })

  let opened = 0
  for (const t of listed) {
    const future = await p.availabilitySlot.count({ where: { tutorId: t.id, endAt: { gt: now } } })
    if (future > 0) continue
    // A profile with no service cannot be booked whatever its calendar says —
    // opening time there would publish hours nobody can reach.
    if (t._count.consultations === 0) { console.log(`skip ${t.slug} — no service`); continue }

    const windows = materializeWeekly(
      PATTERN.days.map(day => ({ day, startHour: PATTERN.startHour, endHour: PATTERN.endHour })),
      PATTERN.weeks,
    )
    const res = await p.availabilitySlot.createMany({
      data: windows.map(w => ({ tutorId: t.id, startAt: w.startAt, endAt: w.endAt })),
      skipDuplicates: true,
    })

    // Store the pattern so the rolling top-up owns it from here. Never clobber
    // an answer they gave themselves.
    const pd = (t.professionData ?? {}) as Record<string, unknown>
    if (!pd.availability) {
      await p.tutorProfile.update({
        where: { id: t.id },
        data: { professionData: { ...pd, availability: PATTERN } as any },
      })
    }

    await notify(t.userId, {
      // GENERIC — always delivered (not one of the 5 opt-outable categories).
      // Publishing bookable hours in somebody's name is an ops signal they must
      // receive, not marketing they can have muted.
      type: 'GENERIC',
      title: 'შენი განრიგი გამოქვეყნდა',
      body: 'თავისუფალი დრო არ გქონდა და პროფილი დაუჯავშნელი იყო. გამოვაქვეყნეთ ორშაბათი–პარასკევი, 10:00–18:00 — შეამოწმე და შეცვალე, თუ არ გერგება.',
      href: '/tutor/schedule',
    }).catch(() => {})

    console.log(`opened ${t.slug} — ${res.count} window(s)`)
    opened++
  }
  console.log(`\ndone: ${opened} calendar(s) opened`)
}
main().finally(() => p.$disconnect())
