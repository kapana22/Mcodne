/**
 * What makes an availability WINDOW valid — one source for POST, PATCH and the
 * schedule UI.
 *
 * The rules themselves are old; what is new (2026-08-07) is that they no longer
 * exist three times. POST stated them, the schedule page restated them in
 * Georgian before submitting, and PATCH — which did not exist at all — would
 * have been a fourth. The apply form had exactly this shape and it cost real
 * applicants: see lib/applyValidation.ts.
 *
 * A window is a RANGE the client picks a start inside (never a pre-sliced
 * session) — see lib/availability.ts. Nothing here slices anything.
 */

/** A window may be many hours, but a whole day in one row is a fat-fingered
 *  date, not a real shift. */
export const MAX_WINDOW_MS = 12 * 60 * 60 * 1000

export type WindowErrorCode = 'BAD_RANGE' | 'PAST_DATE' | 'TOO_LONG'

/**
 * Is this range publishable? Returns the CODE (the wire contract) or null.
 * `now` is injected so the caller — and the test — owns the clock.
 */
export function windowRangeError(
  startAt: Date,
  endAt: Date,
  now: Date = new Date(),
  opts?: {
    /**
     * The window's CURRENT start, when editing. A window that has already begun
     * must stay editable — „I'm running late, cut today's block to 15:00" is a
     * normal Tuesday, and refusing it would leave delete-and-retype as the only
     * move again, which is the whole thing we just removed. So a start in the
     * past is accepted as long as it is not being CHANGED; the end must still
     * be ahead of now, or the row publishes nothing at all.
     */
    keepStart?: Date
  },
): WindowErrorCode | null {
  if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) return 'BAD_RANGE'
  if (endAt <= startAt) return 'BAD_RANGE'
  const startUnchanged = !!opts?.keepStart && opts.keepStart.getTime() === startAt.getTime()
  if (!startUnchanged && startAt < now) return 'PAST_DATE'
  if (endAt <= now) return 'PAST_DATE'
  if (endAt.getTime() - startAt.getTime() > MAX_WINDOW_MS) return 'TOO_LONG'
  return null
}

/* ───────────────── weekly pattern → concrete windows ─────────────────
 *
 * One materializer, used by the weekly template on /tutor/schedule AND by
 * approval (which opens a new expert's calendar from the pattern they picked
 * during /apply). Written once because the Tbilisi arithmetic below is the part
 * everybody gets wrong: the platform is a fixed UTC+4 with no DST, and a server
 * running on UTC would otherwise publish every „10:00" as 14:00 Tbilisi.
 */

/** Asia/Tbilisi is a fixed UTC+4, no DST. */
const TB_OFFSET_MS = 4 * 60 * 60 * 1000

/** day: 0=Mon … 6=Sun — the schedule grid's convention. */
export type WeeklyBlock = { day: number; startHour: number; startMin?: number; endHour: number; endMin?: number }

/**
 * Expand `blocks` over the next `weeks` weeks into concrete UTC windows,
 * dropping anything already over. Returns them in chronological order; the
 * caller owns overlap-skipping and persistence.
 */
export function materializeWeekly(blocks: WeeklyBlock[], weeks: number, now: Date = new Date()): { startAt: Date; endAt: Date }[] {
  // „Now" in Tbilisi wall-clock, read via UTC getters (shift the instant by the
  // fixed offset, then interpret UTC fields as local fields).
  const nowTb = new Date(now.getTime() + TB_OFFSET_MS)
  const mondayTb = new Date(Date.UTC(nowTb.getUTCFullYear(), nowTb.getUTCMonth(), nowTb.getUTCDate()))
  mondayTb.setUTCDate(mondayTb.getUTCDate() - ((mondayTb.getUTCDay() + 6) % 7))

  // endHour = 24 legitimately rolls to next-day 00:00.
  const utcAt = (dayOffset: number, h: number, m: number) => {
    const d = new Date(mondayTb)
    d.setUTCDate(d.getUTCDate() + dayOffset)
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m) - TB_OFFSET_MS)
  }

  const out: { startAt: Date; endAt: Date }[] = []
  for (let w = 0; w < weeks; w++) {
    for (const b of blocks) {
      const startAt = utcAt(w * 7 + b.day, b.startHour, b.startMin ?? 0)
      const endAt = utcAt(w * 7 + b.day, b.endHour, b.endMin ?? 0)
      // A „Monday 10:00" pattern applied on Wednesday must not create rows for
      // the Monday that has already gone.
      if (endAt <= now) continue
      out.push({ startAt, endAt })
    }
  }
  return out.sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
}

/** The sentence the expert reads. Every code the API can answer with is here —
 *  a missing one is how „ვერ მოხერხდა" gets shown instead of a reason. */
export function windowErrorMessage(code: string | undefined): string {
  const map: Record<string, string> = {
    BAD_RANGE: 'დასრულების დრო დაწყებაზე გვიან უნდა იყოს.',
    PAST_DATE: 'დრო წარსულში ვერ იქნება.',
    TOO_LONG: 'შუალედი მეტისმეტად გრძელია — დაყავი მოკლე შუალედებად.',
    OVERLAP: 'ეს დრო უკვე გამოქვეყნებულია — შეცვალე საათი ან დაარედაქტირე არსებული შუალედი.',
    NO_PROFILE: 'ექსპერტის პროფილი არ არსებობს.',
    NOT_FOUND: 'ეს შუალედი აღარ არსებობს — განაახლე გვერდი.',
    FORBIDDEN: 'ამ შუალედის შეცვლის უფლება არ გაქვს.',
    INVALID: 'არასწორი თარიღი.',
  }
  return map[code ?? ''] ?? 'ვერ შევინახეთ — სცადე თავიდან.'
}
