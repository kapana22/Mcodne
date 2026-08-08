'use client'
// /tutors/[id] — the profile payload shape and the two normalizers every
// section needs (language label, external URL).

import { safeHttpUrl } from '@/lib/safeUrl'
import { langLabel, toLangCode } from '@/lib/languages'

/* Local TopBar was orphan (never rendered) — page uses <PublicTopBar initialUser={initialUser} /> instead. Removed. */

/* ───── Breadcrumb ───── */
export type TutorDetail = {
  id: string
  headline?: string | null
  bio?: string | null
  specialty?: string | null
  yearsExp?: number | null
  rating?: number | null
  reviewsCount?: number | null
  sessionsCount?: number | null
  price?: number | null
  verified?: boolean
  responseHours?: number | null
  // MEASURED response time (lib/responseTime) — null when we don't have enough
  // answered conversations to say anything true. NEVER fall back to
  // `responseHours`: the expert types that into their own editor and we cannot
  // verify it, so rendering it would be a fabricated trust signal.
  responseTime?: { medianMin: number | null; sampleN: number | null; label: string } | null
  languages?: string[] | null
  videoUrl?: string | null
  linkedinUrl?: string | null
  websiteUrl?: string | null
  user: { id: string; fullName: string; avatarUrl?: string | null; bio?: string | null }
  category?: { id: string; slug: string; name: string; icon?: string | null } | null
}

// Same vocabulary as the browse cards (lib/languages) — this used to be a private
// abbreviation map („ქარ"/„ENG"), so the SAME expert read differently here than on
// their card, and any code outside ka/en/ru/tr rendered raw („DE").
export const toLangLabel = (v: string): string => langLabel(toLangCode(v) ?? v)

// Experts enter LinkedIn/website with or without a scheme ("linkedin.com/in/x").
// Prepend https:// when missing, then run the safe-scheme guard so a
// javascript:/data: value can never become a live href.
export function normExternalUrl(u?: string | null): string | undefined {
  if (!u) return undefined
  const t = u.trim()
  if (!t) return undefined
  return safeHttpUrl(/^https?:\/\//i.test(t) ? t : `https://${t}`)
}