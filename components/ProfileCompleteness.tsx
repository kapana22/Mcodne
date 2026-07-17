'use client'
import { useMemo } from 'react'
import { Icon } from './Icon'

/* ProfileCompleteness — small, warm-tinted card that scores the tutor profile
   on nine fields + one "availability-toggled" signal, totalling 100%.

   The check anchors below are IDs that the /tutor/profile page attaches to
   its sections (see mounting site). Missing anchors fall back to hash "#"
   which is a no-op — never a broken link. */

export type ProfileForCompleteness = {
  headline?: string | null
  bio?: string | null
  specialty?: string | null
  price?: number | null
  languages?: string[] | null
} | null

export type ProfileCompletenessProps = {
  profile: ProfileForCompleteness
  certificates: number
  education: number
  experience: number
  avatarUrl?: string | null
  /** Optional visual variant. `card` = full section (used on profile page),
      `compact` = right-rail widget (used on dashboard). */
  variant?: 'card' | 'compact'
  /** When true, the card renders even at 100% — profile page always shows. */
  alwaysShow?: boolean
  className?: string
}

type CheckItem = {
  id: string
  label: string
  done: boolean
  weight: number
  anchor: string
}

const buildChecks = (
  profile: ProfileForCompleteness,
  certificates: number,
  education: number,
  experience: number,
  avatarUrl?: string | null,
): CheckItem[] => {
  const headline = (profile?.headline ?? '').trim()
  const bio = (profile?.bio ?? '').trim()
  const specialty = (profile?.specialty ?? '').trim()
  const price = Number(profile?.price ?? 0)
  const languages = Array.isArray(profile?.languages) ? profile!.languages! : []

  return [
    { id: 'headline',    label: 'დაწერე მოკლე სათაური (მინ. 20 სიმბოლო)', done: headline.length >= 20, weight: 12, anchor: '#section-public-profile' },
    { id: 'bio',         label: 'დაწერე ბიოგრაფია (მინ. 100 სიმბოლო)',      done: bio.length >= 100,     weight: 15, anchor: '#section-public-profile' },
    { id: 'specialty',   label: 'მიუთითე სპეციალობა',                       done: specialty.length > 0,  weight: 8,  anchor: '#section-public-profile' },
    { id: 'price',       label: 'დააფიქსირე საათობრივი ტარიფი',              done: price > 0,             weight: 10, anchor: '#section-public-profile' },
    { id: 'languages',   label: 'აირჩიე მინ. ერთი ენა',                     done: languages.length >= 1, weight: 10, anchor: '#section-public-profile' },
    { id: 'avatar',      label: 'ატვირთე პროფილის ფოტო',                    done: !!avatarUrl,           weight: 10, anchor: '#section-avatar' },
    { id: 'certificates',label: 'დაამატე მინ. ერთი სერტიფიკატი',            done: certificates >= 1,     weight: 10, anchor: '#section-certificates' },
    { id: 'education',   label: 'დაამატე განათლების ჩანაწერი',              done: education >= 1,        weight: 10, anchor: '#section-education' },
    { id: 'experience',  label: 'დაამატე სამუშაო გამოცდილება',              done: experience >= 1,       weight: 10, anchor: '#section-experience' },
  ]
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
  variant = 'card',
  alwaysShow = false,
  className = '',
}: ProfileCompletenessProps) {
  const checks = useMemo(
    () => buildChecks(profile, certificates, education, experience, avatarUrl),
    [profile, certificates, education, experience, avatarUrl],
  )

  const { percent, undone } = useMemo(() => {
    const total = checks.reduce((sum, c) => sum + (c.done ? c.weight : 0), 0)
    const remaining = checks.filter(c => !c.done)
    return { percent: Math.min(100, Math.max(0, total)), undone: remaining }
  }, [checks])

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
          <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.2em] text-brand-700">
            {label}
          </div>
          <div className={`font-display font-bold text-ink-900 tracking-tight mt-1 ${variant === 'compact' ? 'text-[14px]' : 'text-[16px]'}`}>
            {percent >= 100 ? 'პროფილი 100% სრულია' : `დარჩენილია ${undone.length} აქტივობა`}
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
                if (typeof window !== 'undefined' && item.anchor.startsWith('#')) {
                  e.preventDefault()
                  scrollToAnchor(item.anchor)
                  history.replaceState(null, '', item.anchor)
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
          სრული პროფილი უფრო მეტ კლიენტს იზიდავს — მოაწესრიგე დარჩენილი აქტივობა.
        </p>
      )}
    </section>
  )
}

export default ProfileCompleteness
