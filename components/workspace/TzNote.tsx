'use client'
import { useEffect, useState } from 'react'
import { TBILISI, TZ_LABEL, userTimezone } from '@/lib/tz'

/* „თბილისის დროით" — shown ONLY to viewers whose browser sits in another zone.
   Every workspace session time is rendered in Tbilisi wall-clock (see
   ./sessionTime), which needs no caption for the ~all-Georgian audience but is
   a silent lie for anyone abroad. Same truthfulness rule as the booking
   picker's components/booking/TzLabels.tsx, inverted because that surface
   renders the VIEWER's zone and this one renders Tbilisi's.

   Client-only after mount: the server has no browser zone, so rendering the
   note during SSR would either hydrate-mismatch or caption the wrong people.
   Put ONE of these per surface (card header / page sub), never per row. */
export function TzNote({ className = 'text-meta text-ink-500' }: { className?: string }) {
  const [remote, setRemote] = useState(false)
  useEffect(() => { setRemote(userTimezone() !== TBILISI) }, [])
  if (!remote) return null
  return <span className={className}>{TZ_LABEL}</span>
}
