// /tutor/schedule — the vocabulary this screen is written in: the Booking and
// Slot shapes, the Tbilisi-fixed date helpers every part formats with, and the
// grid constants.

import { KA_MONTHS_SHORT, KA_WEEKDAYS_SHORT } from '@/lib/kaDate'

export type Booking = {
  id: string
  topic: string
  startAt: string
  durationMin: number
  status: string
  student?: { fullName: string } | null
}
// A row is a WINDOW. The API still returns the legacy `booked` column, but it is
// deliberately NOT in this type: nothing writes it any more, so it lies in both
// directions (a window holding a fresh booking reads false; a row whose session
// ended months ago reads true forever). Everything this screen calls
// „დაჯავშნილი"/„თავისუფალი" is derived from the actual bookings instead.
export type Slot = { id: string; startAt: string; endAt: string }
// Mon-first (lib/kaDate is Sun-first, indexed by Date#getDay()). Derived, not
// re-typed, so the schedule can never drift from the shared Georgian labels.
export const DAY_LABELS = [...KA_WEEKDAYS_SHORT.slice(1), KA_WEEKDAYS_SHORT[0]]
// Default visible band; "ყველა საათი" expands to the full range. Hours the
// visible week actually occupies are always unioned in so nothing hides.
export const HOURS_DEFAULT: [number, number] = [8, 22]
// „ყველა საათი" shows the FULL 24h grid — a tutor must be able to publish any
// time (early morning, late night), not just a daytime band.
export const HOURS_FULL: [number, number] = [0, 24]

/* ─────────── The default a brand-new expert meets ───────────
 * ორშ–პარ 10:00–18:00, pre-filled into the weekly-template FIELDS (Mon=0).
 * Deliberately NOT written to the DB anywhere: an expert who never presses
 * „შექმნა" must not have times published in their name, or a client books a
 * window they were never actually free for. The pre-fill only removes the
 * blank-form tax — deselecting a day or moving the hours still works normally. */
export const PREFILL_DAYS: boolean[] = [true, true, true, true, true, false, false]
export const PREFILL_START_HOUR = 10
export const PREFILL_END_HOUR = 18
// Query param that lands straight in that pre-filled form (OpenTimeNudge CTA).
export const TEMPLATE_PARAM = 'template'

/* ─────────── Tbilisi wall-clock — the ONLY clock on this screen ───────────
 * Asia/Tbilisi is the platform's canonical zone: a FIXED UTC+4, no DST. The
 * availability API, the bulk template route and the client-facing pickers all
 * speak Tbilisi wall-clock, so this screen must too.
 *
 * INVARIANT — never call a browser-LOCAL getter/setter (getHours, getDate,
 * getDay, setHours, toDateString, toISOString-for-a-date) on a real instant in
 * this file. Doing so is what produced the bug this block replaces: the grid
 * bucketed + printed in the browser's timezone while the submit path
 * (`tbilisiInstant`) interpreted the very same value as Tbilisi, so a Berlin
 * expert who clicked the 10:00 cell published a slot that rendered at 08:00.
 * Every cell click, every render and every POST now goes through the helpers
 * below, so they cannot disagree.
 */
export const TB_OFFSET_MS = 4 * 60 * 60 * 1000

// A SHIFTED Date whose UTC getters read the Tbilisi wall-clock of `d`.
// Read-only helper: the returned value is NOT a real instant — never send it
// to the server, never call .toISOString() on it.
export function tbShift(d: Date) { return new Date(d.getTime() + TB_OFFSET_MS) }

// The real instant for a Tbilisi wall-clock date/time. Day/hour may overflow
// (Date.UTC normalises), so `day - 3` or `hour + 25` are both safe.
export function tbFrom(y: number, mo: number, day: number, h = 0, min = 0) {
  return new Date(Date.UTC(y, mo, day, h, min) - TB_OFFSET_MS)
}

// Tbilisi midnight (as a real instant) of the day containing `d`.
export function tbStartOfDay(d: Date) {
  const t = tbShift(d)
  return tbFrom(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())
}

// Tbilisi hour-of-day (0–23) — the grid's row bucket.
export function tbHour(d: Date) { return tbShift(d).getUTCHours() }
// Tbilisi day-of-month — the day-rail / column numbers.
export function tbDayNum(d: Date) { return tbShift(d).getUTCDate() }
// Tbilisi weekday, Mon=0 — matches DAY_LABELS.
export function tbWeekdayMon0(d: Date) { return (tbShift(d).getUTCDay() + 6) % 7 }

// Monday 00:00 Tbilisi (real instant) of the week containing `d`.
export function startOfWeek(d: Date) {
  const t = tbShift(d)
  return tbFrom(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - tbWeekdayMon0(d))
}

// Tbilisi has no DST, so a day is always exactly 24h and plain ms arithmetic
// keeps every derived boundary anchored to Tbilisi midnight. (`setDate` would
// re-anchor to the BROWSER's local day and reintroduce the drift.)
export function addDays(d: Date, n: number) { return new Date(d.getTime() + n * 86_400_000) }

// Georgian month names come from lib/kaDate (single source — a local copy here
// had drifted to „სექტ." while the shared list says „სექ.").
export function fmtRangeLabel(weekStart: Date) {
  const a = tbShift(weekStart)
  const b = tbShift(addDays(weekStart, 6))
  return `${a.getUTCDate()} ${KA_MONTHS_SHORT[a.getUTCMonth()]} — ${b.getUTCDate()} ${KA_MONTHS_SHORT[b.getUTCMonth()]}`
}

// "YYYY-MM-DDTHH:MM" in TBILISI wall-clock — exactly the string `tbilisiInstant`
// reads back, so <input type="datetime-local"> round-trips with zero drift.
export function tbInputValue(d: Date) {
  const t = tbShift(d)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`
}

// "YYYY-MM-DD" in Tbilisi — for <input type="date"> `min`. `toISOString()` here
// is UTC, which between 00:00 and 04:00 Tbilisi still reads YESTERDAY and let
// the expert block off a past date.
export function tbDateValue(d: Date) { return tbInputValue(d).slice(0, 10) }
/** „HH:MM" in Tbilisi wall-clock — the other half of what the picker holds. */
export function tbTimeValue(d: Date) { return tbInputValue(d).slice(11, 16) }

// Interpret a datetime-local "YYYY-MM-DDTHH:MM" value as Tbilisi wall-clock and
// return the real UTC instant — MIRRORS the bulk route's `slotUtc`, so „10:00"
// means 10:00 Tbilisi regardless of the tutor's browser timezone. Using
// `new Date(local)` instead would anchor the value to the browser's tz, drifting
// manually-added slots away from the weekly-template ones for any tutor ≠ +4.
export function tbilisiInstant(local: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local)
  if (!m) return null
  const [, y, mo, d, h, min] = m
  return tbFrom(+y, +mo - 1, +d, +h, +min)
}

// Slot/booking times always render in Tbilisi — the same clock the grid rows,
// the add form and the client-facing picker use.
export function fmtTime(iso: string) {
  const t = tbShift(new Date(iso))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`
}

// „ორშ · 21 ივლ. · 10:00–13:00" — names the exact window in a confirm dialog,
// which is otherwise a modal asking about an unidentified row.
export function fmtSlotRange(startIso: string, endIso: string) {
  const d = new Date(startIso)
  const t = tbShift(d)
  return `${DAY_LABELS[tbWeekdayMon0(d)]} · ${t.getUTCDate()} ${KA_MONTHS_SHORT[t.getUTCMonth()]} · ${fmtTime(startIso)}–${fmtTime(endIso)}`
}

/* ─────────── Free time is a DURATION, not a row count ───────────
 * A stored row is a WINDOW („ორშ 10:00–13:00"), and how many sessions fit in it
 * depends on the service the client picks (see lib/availability.ts). So this
 * screen never says „3 თავისუფალი დრო" about three rows — it reports how much
 * free time there is. */
export function fmtDur(min: number) {
  if (min <= 0) return '0 წთ'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} წთ`
  if (m === 0) return `${h} სთ`
  return `${h} სთ ${m} წთ`
}

// Minutes of `list` that fall inside [from, to) — the ONE overlap sum behind the
// header chip (whole future) and the day rail (a single day), so they can't drift.
export function overlapMinutes(list: { start: Date; end: Date }[], from: number, to: number) {
  let ms = 0
  for (const iv of list) {
    const s = Math.max(iv.start.getTime(), from)
    const e = Math.min(iv.end.getTime(), to)
    if (e > s) ms += e - s
  }
  return Math.round(ms / 60_000)
}
