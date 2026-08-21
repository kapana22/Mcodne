import { prisma } from '@/lib/prisma'
import { materializeWeekly, type WeeklyBlock } from '@/lib/availabilityRules'
import { ROLE } from '@/lib/roles'

/**
 * ROLLING HORIZON — keep a working expert's calendar from quietly running out.
 *
 * WHY THIS EXISTS. Approval materializes the weekly pattern the expert picked on
 * /apply into 8 weeks of concrete windows. Eight weeks later those windows are
 * simply gone, and an expert who never opened /tutor/schedule is back to the
 * state that killed 46% of booking attempts — „ამ ექსპერტს თავისუფალი დრო არ
 * აქვს" — with nothing anywhere saying so. A one-shot seed does not fix an
 * ongoing need; it postpones the same failure by two months.
 *
 * So each tick tops every active expert back up to HORIZON_WEEKS ahead.
 *
 * WHAT MAKES THIS SAFE — it publishes bookable hours in someone's name, so the
 * rules are deliberately conservative:
 *
 *   1. ONLY EXPERTS WHO STILL HAVE FUTURE WINDOWS. An empty calendar is a
 *      DECISION („სრულად წაშლა", or a vacation block) and must never be
 *      silently undone. This job maintains a horizon; it never resurrects one.
 *      An expert with nothing published is the activation nudge's job
 *      (lib/expertActivation), which asks them rather than acting for them.
 *   2. NEVER OVERLAPS what is already there. Anything the expert edited,
 *      shortened or deleted inside the horizon stays as they left it.
 *   3. ONLY FROM THEIR OWN PATTERN — `professionData.availability`, the answer
 *      they gave during onboarding. No pattern, no top-up.
 *   4. Suspended accounts are skipped, and nothing here can throw into the cron.
 *
 * Pinned by tests/availabilityTopUp.test.ts.
 */

/** How far ahead a working calendar is kept open. */
export const HORIZON_WEEKS = 8

/** The shape /apply stores (day indexes, Mon=0). */
export type StoredPattern = { days: number[]; startHour: number; endHour: number }

/** Read a usable pattern out of a profile's professionData, or null. */
export function readPattern(professionData: unknown): StoredPattern | null {
  const av = (professionData as any)?.availability
  if (!av) return null
  const days = Array.isArray(av.days)
    ? [...new Set(av.days.filter((d: unknown) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))] as number[]
    : []
  const startHour = Number(av.startHour)
  const endHour = Number(av.endHour)
  if (!days.length) return null
  if (!Number.isInteger(startHour) || !Number.isInteger(endHour)) return null
  if (startHour < 0 || endHour > 24 || endHour <= startHour) return null
  return { days, startHour, endHour }
}

/**
 * The windows to ADD for one expert: the pattern expanded across the horizon,
 * minus anything that would overlap a window they already have.
 *
 * Pure, so the decision can be tested without a database.
 */
export function missingWindows(
  pattern: StoredPattern,
  existing: { startAt: Date; endAt: Date }[],
  now: Date,
  weeks: number = HORIZON_WEEKS,
): { startAt: Date; endAt: Date }[] {
  const blocks: WeeklyBlock[] = pattern.days.map(day => ({
    day,
    startHour: pattern.startHour,
    endHour: pattern.endHour,
  }))
  // +1: materializeWeekly counts from THIS Monday, so the current (partly spent)
  // week must not eat one of the horizon's weeks.
  const wanted = materializeWeekly(blocks, weeks + 1, now)
  const clashes = (c: { startAt: Date; endAt: Date }, list: { startAt: Date; endAt: Date }[]) =>
    list.some(e => e.startAt < c.endAt && e.endAt > c.startAt)

  const out: { startAt: Date; endAt: Date }[] = []
  for (const c of wanted) {
    if (clashes(c, existing) || clashes(c, out)) continue
    out.push(c)
  }
  return out
}

export type TopUpResult = { experts: number; created: number }

/** Runs inside the cleanup cron. Contractually non-throwing. */
export async function topUpAvailability(now: Date = new Date()): Promise<TopUpResult> {
  const result: TopUpResult = { experts: 0, created: 0 }
  try {
    const horizonEnd = new Date(now.getTime() + HORIZON_WEEKS * 7 * 86_400_000)
    const profiles = await prisma.tutorProfile.findMany({
      where: { user: { role: ROLE.PROVIDER, suspendedAt: null } },
      select: { id: true, professionData: true },
    })

    for (const p of profiles) {
      const pattern = readPattern(p.professionData)
      if (!pattern) continue

      // Everything already published from now to the far edge of the horizon.
      const existing = await prisma.availabilitySlot.findMany({
        where: { tutorId: p.id, endAt: { gt: now }, startAt: { lt: horizonEnd } },
        select: { startAt: true, endAt: true },
      })
      // RULE 1: a calendar with nothing ahead is a decision, not a gap.
      if (existing.length === 0) continue

      const toCreate = missingWindows(pattern, existing, now)
      if (!toCreate.length) continue

      const res = await prisma.availabilitySlot.createMany({
        data: toCreate.map(w => ({ tutorId: p.id, startAt: w.startAt, endAt: w.endAt })),
        skipDuplicates: true,
      })
      if (res.count > 0) {
        result.experts++
        result.created += res.count
      }
    }
  } catch (e) {
    // Never break the cron. Visible in Railway logs like every other [server-error].
    console.error('[server-error] availability top-up', e)
  }
  return result
}
