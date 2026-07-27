'use client'
import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from './Icon'
import { Eyebrow } from '@/components/Eyebrow'
import {
  buildProfileChecks,
  profilePercent,
  type ProfileForCompleteness,
} from '@/lib/profileScore'

/* ProfileCompleteness — small, warm-tinted card that scores the tutor profile
   on ten fields, totalling 100%. Scoring lives in lib/profileScore.ts so
   /api/tutor/nav-badges (sidebar hint) computes the identical percent
   server-side.

   Most check anchors are #IDs that the /tutor/profile page attaches to its
   sections — clicking scrolls in-page. The „availability" check anchors to a
   full ROUTE (/tutor/schedule), so a non-"#" anchor navigates there instead.
   Missing #anchors fall back to hash "#" which is a no-op — never a broken link. */

export type { ProfileForCompleteness }

export type ProfileCompletenessProps = {
  profile: ProfileForCompleteness
  certificates: number
  education: number
  experience: number
  avatarUrl?: string | null
  /** Count of upcoming (future) availability slots — drives the „თავისუფალი
      დრო" check. Booking is slot-gated, so 0 slots = unbookable. */
  slotCount?: number
  /** Optional visual variant. `card` = full section (used on profile page),
      `compact` = right-rail widget (used on dashboard). */
  variant?: 'card' | 'compact'
  /** When true, the card renders even at 100% — profile page always shows. */
  alwaysShow?: boolean
  className?: string
}

const scrollToAnchor = (anchor: string) => {
  if (typeof window === 'undefined' || !anchor.startsWith('#')) return
  const id = anchor.slice(1)
  const el = document.getElementById(id)
  if (!el) return
  // Ask any collapsed container (mobile accordion groups on /tutor/profile)
  // to reveal this section first — scrollIntoView is a no-op on a
  // display:none target. Scroll on the next frame so layout has settled.
  window.dispatchEvent(new CustomEvent('mcodne:reveal-section', { detail: id }))
  const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  requestAnimationFrame(() => {
    el.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' })
  })
}

export function ProfileCompleteness({
  profile,
  certificates,
  education,
  experience,
  avatarUrl,
  slotCount = 0,
  variant = 'card',
  alwaysShow = false,
  className = '',
}: ProfileCompletenessProps) {
  const router = useRouter()
  const checks = useMemo(
    () => buildProfileChecks(profile, certificates, education, experience, avatarUrl, slotCount),
    [profile, certificates, education, experience, avatarUrl, slotCount],
  )

  const { percent, undone } = useMemo(
    () => ({ percent: profilePercent(checks), undone: checks.filter(c => !c.done) }),
    [checks],
  )

  // Hide compact variant once profile is fully polished — dashboard shouldn't
  // nag when there's nothing to fix.
  if (!alwaysShow && percent >= 100 && variant === 'compact') return null

  const shownItems = undone.length > 0
    ? undone.slice(0, 5)
    : checks.slice(0, 3) // if none undone, show first 3 as "all-done" recap
  const label = variant === 'compact' ? 'პროფილის სისრულე' : 'პროფილის სისრულე'

  return (
    <section
      aria-label="პროფილის სისრულის ინდიკატორი"
      className={`rounded-card border border-brand-200 bg-brand-50/40 ${variant === 'compact' ? 'p-4' : 'p-5 sm:p-6'} ${className}`}
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Eyebrow>
            {label}
          </Eyebrow>
          <div className={`font-display font-bold text-ink-900 tracking-tight mt-1 ${variant === 'compact' ? 'text-[14px]' : 'text-[16px]'}`}>
            {percent >= 100 ? 'პროფილი 100% სრულია' : `დარჩენილია ${undone.length} ნაბიჯი`}
          </div>
        </div>
        <div className="font-display font-bold text-brand-700 tabular-nums leading-none text-[22px]">
          {percent}%
        </div>
      </div>

      {/* Progress bar */}
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`პროფილი შევსებულია ${percent} პროცენტით`}
        className="mt-3 h-2 w-full rounded-pill bg-white border border-brand-100 overflow-hidden"
      >
        <div
          className="h-full rounded-pill bg-gradient-to-r from-brand-500 to-brand-400 motion-safe:transition-[width] motion-safe:duration-slow motion-safe:ease-out-quart"
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Checklist */}
      <ul className={`mt-4 space-y-1.5 ${variant === 'compact' ? 'text-[12px]' : 'text-[12.5px]'}`}>
        {shownItems.map(item => (
          <li key={item.id}>
            <a
              href={item.anchor}
              onClick={e => {
                if (typeof window === 'undefined') return
                if (item.anchor.startsWith('#')) {
                  // In-page section: scroll instead of jumping the hash.
                  e.preventDefault()
                  scrollToAnchor(item.anchor)
                  history.replaceState(null, '', item.anchor)
                } else {
                  // Full route (e.g. /tutor/schedule): SPA-navigate there.
                  e.preventDefault()
                  router.push(item.anchor)
                }
              }}
              aria-label={item.done ? `დასრულებულია: ${item.label}` : `დაუსრულებელი: ${item.label} — გადადი შესაბამის სექციაზე`}
              className={`group flex items-start gap-2 rounded-btn px-2 py-1.5 -mx-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                item.done ? 'text-ink-500 hover:bg-white/60' : 'text-ink-900 hover:bg-white/80'
              }`}
            >
              <span
                aria-hidden="true"
                className={`mt-0.5 inline-flex items-center justify-center shrink-0 w-4 h-4 rounded-full border ${
                  item.done
                    ? 'bg-brand-500 border-brand-500 text-white'
                    : 'bg-white border-ink-300 text-transparent group-hover:border-brand-400'
                }`}
              >
                {item.done && <Icon.check className="w-2.5 h-2.5" />}
              </span>
              <span className={`flex-1 leading-snug ${item.done ? 'line-through' : 'font-display font-semibold'}`}>
                {item.label}
              </span>
              {!item.done && (
                <span className="font-mono text-[10px] tabular-nums text-brand-700 shrink-0 mt-0.5">+{item.weight}%</span>
              )}
            </a>
          </li>
        ))}
      </ul>

      {percent < 100 && variant === 'card' && (
        <p className="mt-4 text-[11.5px] text-ink-500 leading-snug">
          სრული პროფილი მეტ სტუდენტს იზიდავს.
        </p>
      )}
    </section>
  )
}

export default ProfileCompleteness
