'use client'
import type { ReactNode } from 'react'
import { useMe } from '@/lib/me'
import { showApplyCta } from '@/lib/roleHome'

// Renders its children only for viewers who should see a "become an expert" /
// apply CTA — anonymous visitors and STUDENTs. A logged-in TUTOR/ADMIN gets
// nothing. Wrap any become-expert nav item, footer link, or marketing section
// in this so the whole surface gates uniformly (server pages included) and the
// "expert sees 'become an expert'" bug can't reappear per-surface.
export function ApplyCtaGate({ children }: { children: ReactNode }) {
  const { me } = useMe()
  if (!showApplyCta(me?.role)) return null
  return <>{children}</>
}

// Renders its children only for anonymous (signed-out) viewers. Use for
// "create account / დაწყება → /signup" CTAs, which are meaningless for anyone
// already signed in (student, tutor, or admin).
export function AnonOnly({ children }: { children: ReactNode }) {
  const { me } = useMe()
  if (me) return null
  return <>{children}</>
}
