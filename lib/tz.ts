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
