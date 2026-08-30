'use client'
import type { ReactNode } from 'react'
import { useMe } from '@/lib/me'
import { showJoinInvite } from '@/lib/capabilities'

// Renders its children only for viewers who should see a "become a provider"
// invitation — people who offer NOTHING yet (guests and plain clients). Anyone
// who already holds a capability gets the „ჩართე…" switch instead (UserMenu,
// lib/capabilities → missingCapability); somebody with both, and every admin,
// gets neither. Wrap any join nav item, footer link or marketing section in
// this so the whole surface gates uniformly and the "a provider is invited to
// become one" bug cannot reappear per-surface.
export function ApplyCtaGate({ children }: { children: ReactNode }) {
  const { me } = useMe()
  if (!showJoinInvite(me?.role, me?.provider)) return null
  return <>{children}</>
}

// Renders its children only for anonymous (signed-out) viewers. Use for
// "create account / დაწყება → /signup" CTAs, which are meaningless for anyone
// already signed in (student, tutor, or admin).
function AnonOnly({ children }: { children: ReactNode }) {
  const { me } = useMe()
  if (me) return null
  return <>{children}</>
}
