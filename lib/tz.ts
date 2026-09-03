// Shared timezone helpers.
//
// All server-side rendering defaults to Asia/Tbilisi so SSR output is stable
// and matches the platform's canonical timezone. On the client we detect the
// user's actual browser tz; if it differs from Tbilisi we surface a small
// "თბილისის დროით" label next to the formatted value so remote users know
// which zone they're looking at.

import { KA_MONTHS_SHORT, KA_MONTHS_LONG, KA_WEEKDAYS_SHORT, KA_WEEKDAYS_LONG } from '@/lib/kaDate'

export const TBILISI = 'Asia/Tbilisi'
export const TZ_LABEL = 'თბილისის დროით'

/** Georgia is a fixed UTC+4 and observes no DST, so a constant shift is exact. */
export const TB_OFFSET_MS = 4 * 3_600_000

/**
 * Tbilisi wall-clock parts for an instant: ISO weekday (1 = Monday … 7 =
 * Sunday), hour, minute.
 *
 * ⚠️ USE THIS INSTEAD OF `getDay()` / `getHours()` IN SERVER CODE. Those read
 * whichever zone the PROCESS is in. Production sets `TZ=Asia/Tbilisi`, so they
 * currently agree with Tbilisi — by accident of an environment variable, not
 * because anything says so. That accident is unset in local dev today, and a
 * comparison that silently means a different hour on two machines is the kind
 * of bug that reads as „no free time" rather than as a bug.
 *
 * `lib/postSession → tbilisiHour` was the first place to need this and used the
 * same +4 trick privately; it now delegates here so the offset has one home.
 * For FORMATTING, don't reach for this — use `fmtDateTime(..., TBILISI)` below
 * or `components/workspace/sessionTime`.
 */
/**
 * The Tbilisi CALENDAR DAY of an instant, as „YYYY-MM-DD".
 *
 * ⚠️ IT EXISTS BECAUSE A CHART WAS BUCKETING BY UTC (2026-09-03). The admin's
 * help graph built its axis with `new Date().toISOString().slice(0, 10)` and
 * asked Postgres for `date_trunc('day', "at")` — both UTC, so the two AGREED
 * and nothing looked wrong. What they agreed on was the wrong day: Tbilisi is
 * UTC+4, so everything that happens between midnight and 04:00 local is filed
 * under the previous day.
 *
 * The same +4 shift `tbilisiParts` uses, and for the same stated reason — the
 * process's own zone is an accident of `TZ=Asia/Tbilisi` in production and is
 * unset in local dev, so a day boundary computed from `getDate()` means two
 * different things on two machines.
 *
 * ⚠️ THE SQL SIDE HAS TO MOVE WITH IT. A query still saying
 * `date_trunc('day', "at")` while the axis says Tbilisi produces an axis whose
 * keys match no row — the chart would go flat rather than shift. Both halves,
 * or neither.
 */
export function tbilisiDayKey(d: Date): string {
  return new Date(d.getTime() + TB_OFFSET_MS).toISOString().slice(0, 10)
}

export function tbilisiParts(d: Date): { isoDow: number; hour: number; minute: number } {
  const t = new Date(d.getTime() + TB_OFFSET_MS)
  const dow = t.getUTCDay()
  return { isoDow: dow === 0 ? 7 : dow, hour: t.getUTCHours(), minute: t.getUTCMinutes() }
}

// Best-effort browser tz detection. Server has no window so we fall back to
// Tbilisi — callers should re-format in an effect after mount if they want
// the local-machine value.
export function userTimezone(): string {
  if (typeof window === 'undefined') return TBILISI
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || TBILISI
  } catch {
    return TBILISI
  }
}

/**
 * How many hours AHEAD of the viewer Tbilisi is, at `at`. Berlin → 2, London →
 * 3, New York → 8, Tbilisi → 0. Negative would mean Tbilisi is behind (nowhere
 * a Georgian diaspora is large, but the sign is honest either way).
 *
 * WHY A DELTA AND NOT A ZONE NAME. „დროის ზონა: შენი (Europe/Berlin)" is
 * accurate and tells a reader nothing: they do not need to be told which zone
 * they live in, they need to know what a Tbilisi expert's day looks like from
 * where they are. „თბილისში 2 საათით მეტია" answers that in one glance, and it
 * is the whole question for someone booking across a border.
 *
 * Computed from wall-clock parts rather than getTimezoneOffset() so it is
 * correct on both sides of either zone's DST switch (Georgia has none; most of
 * the diaspora's zones do, which is exactly when a hardcoded „+2" starts
 * lying). Half-hour zones (India, Iran) round to the nearest hour — the label
 * is a rounded hint, and the actual times shown are always exact.
 */
export function tbilisiDeltaHours(at: Date = new Date()): number {
  try {
    const asUtc = (tz: string) => {
      const p = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).formatToParts(at)
      const g = (t: Intl.DateTimeFormatPartTypes) => Number(p.find(x => x.type === t)?.value)
      return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'))
    }
    return Math.round((asUtc(TBILISI) - asUtc(userTimezone())) / 3_600_000)
  } catch {
    return 0
  }
}

// Format an ISO timestamp in the requested tz (defaults to browser tz, or
// Tbilisi on server). Returns { local } — the formatted string — and
// { tzLabel } — either the Georgian Tbilisi label when the user's tz differs
// from Tbilisi, or an empty string.
export function fmtDateTime(
  iso: string,
  opts: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  },
  tz?: string,
): { local: string; tzLabel: string } {
  const zone = tz ?? userTimezone()
  let local: string
  try {
    // The runtime's ICU often lacks `ka-GE` data, so formatting with month /
    // weekday NAMES via Intl silently falls back to English ("Thu, 24 July").
    // Instead: extract the wall-clock parts in the target zone using `en-US`
    // (numeric fields only — always available), then compose the Georgian
    // month/weekday names manually from the shared lib/kaDate arrays.
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(iso))
    const get = (t: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === t)?.value ?? ''
    const year = Number(get('year'))
    const monthIdx = Number(get('month')) - 1
    const dayNum = Number(get('day'))
    // Weekday of that wall-clock date (Sunday = 0), independent of the
    // machine's own timezone.
    const dow = new Date(Date.UTC(year, monthIdx, dayNum)).getUTCDay()

    let dateStr = ''
    if (opts.day || opts.month) {
      const dayStr = opts.day === '2-digit' ? String(dayNum).padStart(2, '0') : String(dayNum)
      const monthStr = opts.month === 'short' ? KA_MONTHS_SHORT[monthIdx]
        : opts.month === 'long' ? KA_MONTHS_LONG[monthIdx]
        : String(monthIdx + 1)
      dateStr = `${dayStr} ${monthStr}`
      if (opts.year) dateStr += ` ${year}`
    }
    if (opts.weekday) {
      const wd = opts.weekday === 'long' ? KA_WEEKDAYS_LONG[dow] : KA_WEEKDAYS_SHORT[dow]
      dateStr = dateStr ? `${wd}, ${dateStr}` : wd
    }
    const timeStr = opts.hour != null || opts.minute != null ? `${get('hour')}:${get('minute')}` : ''
    local = dateStr && timeStr ? `${dateStr}, ${timeStr}` : dateStr || timeStr
    if (!local) local = iso
  } catch {
    // Node without full ICU can throw for some tz values — degrade to the
    // browser locale default so we never crash a render.
    try { local = new Date(iso).toLocaleString('ka-GE', opts) }
    catch { local = iso }
  }
  return { local, tzLabel: zone !== TBILISI ? TZ_LABEL : '' }
}
