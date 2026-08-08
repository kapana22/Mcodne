'use client'
// Honest timezone labels for the booking surfaces. Slot times everywhere are
// rendered with Date#getHours — the VIEWER's browser tz — so the labels must
// reflect that or they lie:
//   - Tbilisi visitors: show "GMT+4" (their local IS Tbilisi).
//   - Remote visitors: show "შენს დროზე" / their zone name — they see their
//     local wall-clock, not Tbilisi time.
// Client-only state so SSR/first paint stays stable (server assumes Tbilisi).
import React from 'react'
import { userTimezone, TBILISI, tbilisiDeltaHours } from '@/lib/tz'

/* Small hint chip next to the picker. */
export const TbilisiHint = () => {
  const [tz, setTz] = React.useState<string>(TBILISI)
  React.useEffect(() => { setTz(userTimezone()) }, [])
  if (tz === TBILISI) {
    return <span className="text-meta text-ink-400 tabular-nums">GMT+4</span>
  }
  return <span className="text-meta text-ink-400">შენს დროზე</span>
}

/* Longer variant for the Calendar footer strip. Same truthfulness rule as
   TbilisiHint — say "your zone" when the browser isn't Tbilisi. */
export const CalendarTzLabel = () => {
  const [tz, setTz] = React.useState<string>(TBILISI)
  React.useEffect(() => { setTz(userTimezone()) }, [])
  if (tz === TBILISI) {
    return <span>დროის ზონა: თბილისი (UTC+4)</span>
  }
  return <span>დროის ზონა: შენი ({tz})</span>
}

/* ── The diaspora variant ────────────────────────────────────────────────────
   Everything already shown in this flow IS in the viewer's own zone (times come
   from Date#getHours), and CalendarTzLabel above says so — but it says it by
   naming an IANA string, which answers a question nobody asked. The reader this
   is for is 40–60, in Berlin or Athens, and the thing they actually need to
   know is what a Tbilisi expert's day looks like from where they are.

   Deliberately NOT wired into Calendar/DayTimeline: rendering it for everyone
   would change a surface every existing user sees, and this vertical must
   change nothing outside itself. BookingFlow mounts it only for a diaspora
   expert. Client-only state so SSR/first paint stays stable (server assumes
   Tbilisi and would render „0 hours", then flip). */
export const AbroadTzNote = ({ className = '' }: { className?: string }) => {
  const [state, setState] = React.useState<{ tz: string; delta: number } | null>(null)
  React.useEffect(() => { setState({ tz: userTimezone(), delta: tbilisiDeltaHours() }) }, [])
  // Nothing until we know, and nothing for a viewer already in Tbilisi: „the
  // times are in your zone" is noise when your zone is the only one involved.
  if (!state || state.tz === TBILISI || state.delta === 0) return null
  const ahead = state.delta > 0
  const h = Math.abs(state.delta)
  return (
    <p className={`text-meta text-ink-600 leading-snug ${className}`}>
      დროები შენი ქვეყნის საათითაა.{' '}
      <span className="text-ink-500">
        თბილისში {h} საათით {ahead ? 'მეტია' : 'ნაკლებია'}.
      </span>
    </p>
  )
}
