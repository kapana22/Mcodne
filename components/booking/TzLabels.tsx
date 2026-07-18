'use client'
// Honest timezone labels for the booking surfaces. Slot times everywhere are
// rendered with Date#getHours — the VIEWER's browser tz — so the labels must
// reflect that or they lie:
//   - Tbilisi visitors: show "GMT+4" (their local IS Tbilisi).
//   - Remote visitors: show "შენს დროზე" / their zone name — they see their
//     local wall-clock, not Tbilisi time.
// Client-only state so SSR/first paint stays stable (server assumes Tbilisi).
import React from 'react'
import { userTimezone, TBILISI } from '@/lib/tz'

/* Small hint chip next to the picker. */
export const TbilisiHint = () => {
  const [tz, setTz] = React.useState<string>(TBILISI)
  React.useEffect(() => { setTz(userTimezone()) }, [])
  if (tz === TBILISI) {
    return <span className="text-[11px] text-ink-400 tabular-nums">GMT+4</span>
  }
  return <span className="text-[11px] text-ink-400">შენს დროზე</span>
}

/* Longer variant for the Calendar footer strip. Same truthfulness rule as
   TbilisiHint — say "your zone" when the browser isn't Tbilisi. */
export const CalendarTzLabel = () => {
  const [tz, setTz] = React.useState<string>(TBILISI)
  React.useEffect(() => { setTz(userTimezone()) }, [])
  if (tz === TBILISI) {
    return <span>დროის ზონა: თბილისი (GMT+4)</span>
  }
  return <span>დროის ზონა: შენი ({tz})</span>
}
