import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/mailer'
import { expertActivationEmail } from '@/lib/emailTemplates'
import { normalizePrefs } from '@/lib/notify'
import { isQuietHour } from '@/lib/postSession'
import { ensureDbReady } from '@/lib/dbBoot'
import { futureWindowSql } from '@/lib/bookability'

/**
 * ACTIVATION NUDGE — the approved expert who never finished setting up.
 *
 * WHY THIS EXISTS. A live audit of production on 2026-07-29 found that SEVEN of
 * the ten visible experts could not be booked at all: six had never added a
 * single availability window, and one had 54 windows but no service to sell.
 * Every one of them had passed moderation, so from their side the job looked
 * done — the profile was live, it just had nothing behind the booking button.
 * Nothing in the product ever told them. They were approved and then went
 * silent, and the marketplace quietly carried 70% dead inventory.
 *
 * So this is not a marketing drip. It is the missing half of approval: we tell
 * someone their profile is live, and this tells them when „live" is not yet
 * „bookable". The two blockers are checked independently because the fix is
 * different (add times vs. add a service) and an expert can have either.
 *
 * WHAT KEEPS IT FROM BECOMING SPAM
 *  - `service`: THREE nudges, ever (see STAGE_DAYS), then silence. An expert who
 *    ignores all three is an admin matter, and the „სისტემა" tab already counts
 *    them. `slots` is capped differently — see the 2026-08-03 note below.
 *  - At most ONE message per expert per tick, never a burst: only the LATEST due
 *    stage is sent, so someone approved weeks ago does not receive all three at
 *    once the first time this runs.
 *  - Quiet hours (22:00–08:00 Tbilisi) are shared with the review nudge, so a
 *    setup reminder never arrives at 03:00.
 *  - Fixing the blocker removes the expert from the candidate set immediately.
 *
 * EXACTLY-ONCE. Same mechanism as lib/postSession: the in-app Notification we
 * have to write anyway IS the stamp. Its id is deterministic
 * (`expert-setup:<blocker>:<key>:<tutorProfileId>`) and the insert is
 * `ON CONFLICT (id) DO NOTHING RETURNING id`, so the primary key arbitrates
 * between overlapping sweeps and only the winner emails. No schema change.
 */

/*
 * ── 2026-08-03: WHY „slots" IS NOT A SETUP STEP ─────────────────────────────
 *
 * Two things were wrong, and they compounded.
 *
 * FIRST, the candidate query counted `AvailabilitySlot` rows with NO date
 * filter — all-time, not upcoming. A window is only bookable until it passes,
 * so an expert whose whole published schedule had expired counted as „set up"
 * and dropped out of the candidate set permanently. Measured in production
 * this morning: 6 listed experts had zero upcoming windows, and 2 of them were
 * invisible to this module for exactly that reason — including the single
 * most-viewed profile on the site (42 windows published, all in the past, 33
 * profile views, 15% of all views on the marketplace, unbookable). The nudge
 * wrote off the expert who had engaged MOST. That is the perverse shape of the
 * bug: past effort bought permanent silence.
 *
 * SECOND, and the reason a one-line date fix is not enough: an empty calendar
 * is not a setup step you complete once. Windows expire BY NATURE, so every
 * expert who is bookable today enters this state eventually. Three nudges
 * counted from the approval date means an expert who lapses on day 40 is never
 * told — the schedule ran out before the problem existed.
 *
 * So the two blockers are now modelled differently, because they ARE different:
 *   • `service`  — a one-time setup step. STAGE_DAYS [1, 4, 14], then silence.
 *   • `slots`    — a recurring STATE. At most one message per LAPSE_BUCKET_DAYS
 *                  for as long as the profile is publicly listed with nothing
 *                  bookable behind it, and never marked „final" (a recurring
 *                  message must not promise it is the last one).
 *
 * Two ways out remain, both the expert's own: mute APPLICATION_STATUS, or pause
 * the listing (`available = false`), which removes them from the set entirely —
 * a paused expert is not dead inventory and is never chased.
 */

/** Days after the profile was created (= approved) at which each nudge is due. */
export const STAGE_DAYS = [1, 4, 14] as const

/**
 * How often the recurring „nothing bookable" message may repeat.
 *
 * Derived state, not stored state: the fortnight index is computed, the
 * deterministic notification id below dedupes within it, and it re-arms by
 * itself when the index moves on. No column, no cursor, nothing to migrate.
 */
export const LAPSE_BUCKET_DAYS = 14

/**
 * Which fortnight SINCE THIS EXPERT WAS APPROVED we are in.
 *
 * Counted per-expert rather than off a shared calendar grid on purpose. A
 * global `floor(now / 14d)` has a boundary that every expert crosses on the
 * same instant, so anyone nudged the day before it would be nudged again the
 * day after — two messages 24h apart, then a fortnight of silence. Anchoring to
 * `createdAt` gives each expert their own boundary, which makes the minimum gap
 * between two messages a real 14 days and spreads the sends out as a bonus.
 */
export function lapseBucket(createdAt: Date, now: Date): number {
  const elapsed = now.getTime() - new Date(createdAt).getTime()
  return Math.floor(elapsed / (LAPSE_BUCKET_DAYS * 86_400_000))
}

/** What is missing. The message and the destination differ per blocker. */
export type Blocker = 'slots' | 'service'

// This is account-setup correspondence about their application's outcome, so it
// rides the APPLICATION_STATUS toggle rather than the booking one — an expert
// who muted booking traffic still needs to hear that their profile cannot take
// bookings at all.
const PREF_KEY = 'APPLICATION_STATUS' as const

const ID_PREFIX = 'expert-setup:'
/**
 * The exactly-once stamp. `key` is a STAGE for `service` and a fortnight BUCKET
 * for `slots`; the `b` prefix keeps the two number spaces apart so a bucket can
 * never collide with a stage — including with the `expert-setup:slots:1:…` and
 * `:4:…` ids already sitting in production from before 2026-08-03.
 */
export const activationNotificationId = (blocker: Blocker, key: number, tutorProfileId: string) =>
  `${ID_PREFIX}${blocker}:${blocker === 'slots' ? `b${key}` : key}:${tutorProfileId}`

export type ActivationCandidate = {
  tutorProfileId: string
  userId: string
  email: string | null
  fullName: string | null
  prefs: unknown
  createdAt: Date
  /**
   * UPCOMING windows only — `startAt > now()`. Deliberately named for it: the
   * field used to be `slotCount` and counted all of history, which is how an
   * expert with an entirely expired schedule passed as „set up" forever.
   */
  futureSlotCount: number
  serviceCount: number
  available: boolean
  suspended: boolean
}

export type PlannedNudge = {
  row: ActivationCandidate
  blocker: Blocker
  /** Stage (days) for `service`; fortnight bucket for `slots`. See the id builder. */
  key: number
  /** Last of the three `service` stages — say so, and stop. Never true for the
   *  recurring `slots` message, which has no last one to promise. */
  isFinal: boolean
}

/** Highest stage whose due-date has passed, or null if none has. */
export function dueStage(createdAt: Date, now: Date): { stage: number; isFinal: boolean } | null {
  const days = (now.getTime() - new Date(createdAt).getTime()) / 86_400_000
  if (!Number.isFinite(days)) return null
  let found: number | null = null
  for (const d of STAGE_DAYS) if (days >= d) found = d
  if (found === null) return null
  return { stage: found, isFinal: found === STAGE_DAYS[STAGE_DAYS.length - 1] }
}

/**
 * Pure selection — the authority on who gets nudged, so the rules are testable
 * without a database. The SQL below is a deliberately looser prefilter.
 */
export function selectActivationNudges(rows: ActivationCandidate[], now: Date): PlannedNudge[] {
  if (isQuietHour(now)) return []
  const out: PlannedNudge[] = []
  for (const r of rows) {
    // A suspended account is an admin decision — never chase it. A SELF-paused
    // expert is not chased either: they turned their listing off on purpose,
    // and „add your times" would be nagging someone who chose to stop.
    if (r.suspended || !r.available) continue
    if (!normalizePrefs(r.prefs)[PREF_KEY]) continue
    // The first stage doubles as a grace period for BOTH blockers: nobody is
    // chased on the day they are approved.
    const due = dueStage(r.createdAt, now)
    if (!due) continue
    // Order matters: with NO service, „add your times" is the wrong ask —
    // times are worthless until there is something to book. One message at a
    // time, naming the blocker that actually comes first.
    if (r.serviceCount === 0) {
      out.push({ row: r, blocker: 'service', key: due.stage, isFinal: due.isFinal })
    } else if (r.futureSlotCount === 0) {
      // Recurring, so the STAGE is not the key — the fortnight is. An expert
      // who lapses on day 40 is past every stage and would otherwise be
      // unreachable, which is the case this whole change exists for.
      out.push({ row: r, blocker: 'slots', key: lapseBucket(r.createdAt, now), isFinal: false })
    }
  }
  return out
}

const COPY: Record<Blocker, { title: string; body: string; href: string }> = {
  slots: {
    title: 'შენი პროფილი ჯავშანს ვერ იღებს',
    body: 'თავისუფალი დროები არ გაქვს მითითებული — სტუდენტი პროფილს ხედავს, მაგრამ დაჯავშნა არ შეუძლია.',
    href: '/tutor/schedule',
  },
  service: {
    title: 'შენი პროფილი ჯავშანს ვერ იღებს',
    body: 'სერვისი არ გაქვს დამატებული — ჯავშნის ღილაკს გასაყიდი არაფერი აქვს.',
    href: '/tutor/profile#section-services',
  },
}

export async function sendExpertActivationNudges(): Promise<{ experts: number; emails: number }> {
  await ensureDbReady()
  const now = new Date()

  // Prefilter. The counts are subqueries rather than joins so an expert with
  // 54 windows doesn't fan the row out 54 times. Rows already nudged at the
  // stage they're due for are NOT excluded here — the stage is computed in JS
  // from createdAt, so the id can't be known to SQL; the ON CONFLICT insert
  // below is what makes it exactly-once. The candidate set is small by
  // construction (experts with a missing setup step), so the LIMIT is slack.
  const rows = await prisma.$queryRawUnsafe<ActivationCandidate[]>(`
    SELECT tp.id                  AS "tutorProfileId",
           tp."userId"            AS "userId",
           u.email                AS "email",
           u."fullName"           AS "fullName",
           u."notificationPrefs"  AS "prefs",
           tp."createdAt"         AS "createdAt",
           tp.available           AS "available",
           (u."suspendedAt" IS NOT NULL) AS "suspended",
           -- The future-window filter is the whole fix: without it this counted
           -- EXPIRED windows as availability, so a lapsed expert looked set up
           -- forever. The predicate itself comes from lib/bookability so the
           -- nudge, the სისტემა tab and the ინსაითები tab cannot drift apart.
           -- (No backticks in here — this is a template literal.)
           (SELECT COUNT(*)::int FROM "AvailabilitySlot" s
             WHERE s."tutorId" = tp.id AND ${futureWindowSql('s')})      AS "futureSlotCount",
           (SELECT COUNT(*)::int FROM "Consultation" c WHERE c."tutorId" = tp.id)      AS "serviceCount"
      FROM "TutorProfile" tp
      JOIN "User" u ON u.id = tp."userId"
     WHERE u."suspendedAt" IS NULL
       AND tp.available = true
       AND COALESCE(u."notificationPrefs"->>'${PREF_KEY}', 'true') <> 'false'
       AND tp."createdAt" < NOW() - interval '${STAGE_DAYS[0]} days'
     LIMIT 500
  `)

  const planned = selectActivationNudges(rows, now)
  if (planned.length === 0) return { experts: 0, emails: 0 }

  // Claim + deliver the in-app half in ONE statement — the deterministic id is
  // the dedupe key, so a losing concurrent sweep gets nothing back and stays
  // silent. Raw SQL rather than notify(), which generates a random id and would
  // leave nothing to conflict on. The pref gate notify() applies is enforced
  // above, in both the SQL and selectActivationNudges.
  const claimed = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO "Notification" (id, "userId", "type", title, body, href)
     SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[])
       AS t(id, "userId", "type", title, body, href)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    planned.map(p => activationNotificationId(p.blocker, p.key, p.row.tutorProfileId)),
    planned.map(p => p.row.userId),
    planned.map(() => 'APPLICATION_STATUS'),
    planned.map(p => COPY[p.blocker].title),
    planned.map(p => COPY[p.blocker].body),
    planned.map(p => COPY[p.blocker].href),
  )
  const claimedIds = new Set(claimed.map(c => c.id))
  const toEmail = planned.filter(p => claimedIds.has(activationNotificationId(p.blocker, p.key, p.row.tutorProfileId)))

  let emails = 0
  for (const p of toEmail) {
    if (!p.row.email) continue
    const { subject, html } = expertActivationEmail({
      name: p.row.fullName || '',
      blocker: p.blocker,
      final: p.isFinal,
      href: COPY[p.blocker].href,
    })
    // sendMail RESOLVES with { ok: false } on a provider error — count only
    // what actually went out.
    await sendMail({ to: p.row.email, subject, html }).then(r => { if (r.ok) emails++ }).catch(() => {})
  }

  return { experts: toEmail.length, emails }
}
