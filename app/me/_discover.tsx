'use client'
// /student — the „აღმოაჩინე“ suggestions row.

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { Eyebrow } from '@/components/Eyebrow'
import { Icon } from '@/components/Icon'
import { EmptyState } from '@/components/EmptyState'
import { VerifiedMark } from '@/components/Avatar'
import { displayHeadline } from '@/lib/headline'
import { primaryPriceLabel, TUTOR_DEFAULTS } from '@/components/booking/slots'
import { DiscoverTutor } from './_model'

export const Discover = ({ onOpen }: { onOpen: (t: DiscoverTutor) => void }) => {
  const [tutors, setTutors] = useState<DiscoverTutor[] | null>(null)
  // Distinct from an empty result — a failed request previously rendered as
  // "ამ კატეგორიაში ჯერ არ არის ექსპერტი", which is a lie on a network error.
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [cat, setCat] = useState<string>('all')

  useEffect(() => {
    let cancelled = false
    setTutors(null)
    setFailed(false)
    const params = new URLSearchParams({ limit: '18' })
    if (cat !== 'all') params.set('category', cat)
    ;(async () => {
      try {
        const res = await fetch(`/api/tutors?${params}`)
        if (!res.ok) throw new Error('tutors failed')
        const d = await res.json()
        if (!Array.isArray(d)) throw new Error('bad shape')
        if (cancelled) return
        setTutors(d.map((t: any) => ({
          id: t.id,
          name: t.user?.fullName ?? 'ექსპერტი',
          avatar: t.user?.avatarUrl ?? null,
          headline: t.headline ?? '',
          specialty: t.specialty ?? '',
          category: t.category?.name ?? '',
          rating: t.rating ?? 0,
          reviews: t.reviewsCount ?? 0,
          // FLAGSHIP price, via the shared helper — the raw profile `price` is
          // not a service anyone can buy, and printing it here made one expert
          // read ₾60 on this dashboard and ₾30 on /experts (measured 2026-07-31).
          priceLabel: primaryPriceLabel(
            Array.isArray(t.consultations) ? t.consultations : [],
            t.price ?? TUTOR_DEFAULTS.price,
            t.consultationDurationMin ?? TUTOR_DEFAULTS.durationMin,
          ).label,
          verified: t.verified ?? false,
        })))
      } catch {
        if (!cancelled) { setTutors([]); setFailed(true) }
      }
    })()
    return () => { cancelled = true }
  }, [cat, attempt])

  const CATS = [
    { slug: 'all', label: 'ყველა' },
    { slug: 'business', label: 'ბიზნესი' },
    { slug: 'finance', label: 'ფინანსები' },
    { slug: 'career', label: 'კარიერა' },
    { slug: 'marketing', label: 'მარკეტინგი' },
    { slug: 'law', label: 'სამართალი' },
    { slug: 'psychology', label: 'ფსიქოლოგია' },
  ]

  return (
    <section className="rounded-card border border-ink-200 bg-white overflow-hidden">
      <div className="px-5 sm:px-6 py-5 border-b border-ink-100 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Eyebrow tone="muted" className="mb-1.5">გამოცადე</Eyebrow>
          <h2 className="font-display text-body-lg sm:text-h3 font-bold text-ink-900 tracking-tight leading-tight">
            რეკომენდებული ექსპერტები
          </h2>
          <p className="text-small text-ink-500 mt-1.5 max-w-[480px] leading-relaxed">
            გადახედე და დაჯავშნე.
          </p>
        </div>
        <Link href="/experts" className="h-10 sm:h-9 px-3 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-800 font-display font-semibold text-meta inline-flex items-center gap-1.5 transition-colors duration-fast">
          ყველა ექსპერტი
        </Link>
      </div>

      {/* Category chips */}
      <div className="px-5 sm:px-6 py-3 border-b border-ink-100 flex items-center gap-1.5 overflow-x-auto scrollbar-hide rail-fade-end">
        {CATS.map(c => {
          const on = cat === c.slug
          return (
            <button
              key={c.slug}
              type="button"
              onClick={() => setCat(c.slug)}
              className={`shrink-0 h-10 sm:h-8 px-3.5 sm:px-3 rounded-pill font-display text-meta font-semibold transition-colors duration-fast ${
                on ? 'bg-brand-600 text-white' : 'bg-ink-50 text-ink-700 hover:bg-ink-100'
              }`}
            >
              {c.label}
            </button>
          )
        })}
      </div>

      {/* Grid */}
      {tutors === null ? (
        // Skeleton cards — same grid/cell shape as the loaded state below.
        <div aria-busy="true" className="p-5 sm:p-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="rounded-card border border-ink-200 bg-white p-4 motion-safe:animate-pulse">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full bg-ink-100 shrink-0" />
                <div className="flex-1 space-y-2 min-w-0">
                  <div className="h-3.5 w-2/3 bg-ink-100 rounded" />
                  <div className="h-3 w-1/2 bg-ink-100 rounded" />
                </div>
              </div>
              <div className="h-3 w-full bg-ink-100 rounded mb-2" />
              <div className="h-3 w-4/5 bg-ink-100 rounded" />
            </div>
          ))}
        </div>
      ) : failed ? (
        // Compact single-row failure notice — retryable, never hero-sized.
        <div role="alert" className="px-5 sm:px-6 py-3.5 flex items-center gap-3 flex-wrap">
          <Icon.warn className="w-4 h-4 text-ink-400 shrink-0" />
          <p className="flex-1 min-w-[220px] text-small text-ink-600">
            <span className="font-display font-semibold text-ink-800">ვერ ჩაიტვირთა</span> — სცადე ცოტა ხანში.
          </p>
          <button
            type="button"
            onClick={() => setAttempt(a => a + 1)}
            className="shrink-0 h-10 sm:h-8 px-3.5 sm:px-3 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-800 font-display font-semibold text-meta tracking-wide inline-flex items-center gap-1.5 transition-colors duration-fast"
          >
            <Icon.refresh className="w-3.5 h-3.5" />
            სცადე თავიდან
          </button>
        </div>
      ) : tutors.length === 0 ? (
        <EmptyState
          variant="inline"
          illustration="categoryComingSoon"
          icon={<Icon.search className="w-6 h-6" />}
          title="ამ კატეგორიაში ჯერ არ არის ექსპერტი"
          description="სცადე სხვა კატეგორია."
        />
      ) : (
        <div className="p-5 sm:p-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Cap the dashboard preview at 6 — full catalog lives behind
              the „ყველა ექსპერტი“ link above. */}
          {tutors.slice(0, 6).map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => onOpen(t)}
              className="text-left rounded-card border border-ink-200 hover:border-ink-300 hover:shadow-card transition-all duration-fast bg-white p-4 min-w-0"
            >
              <div className="flex items-center gap-3 mb-3">
                <img src={t.avatar || DEFAULT_AVATAR} alt={t.name} className="w-12 h-12 rounded-full object-cover ring-1 ring-ink-200 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <div className="font-display text-body font-bold text-ink-900 truncate">{t.name}</div>
                    {t.verified && <VerifiedMark size={12} />}
                  </div>
                  {/* The CATEGORY (already mapped above), not `specialty` —
                      that field is a frozen copy of the category name from
                      approval day and disagrees with the card after a rename.
                      Falls back to `specialty` only when there is no category
                      at all, and renders nothing when there is neither. */}
                  {(t.category || t.specialty) && (
                    <div className="text-meta text-brand-700 font-display font-semibold truncate">{t.category || t.specialty}</div>
                  )}
                </div>
              </div>
              {/* Normalised like every other headline render — the trailing
                  „- 7 წელი" and hand-typed „|" separators never reach the UI. */}
              <p className="text-meta text-ink-600 leading-snug line-clamp-2 min-h-[32px]">{displayHeadline(t.headline)}</p>
              <div className="mt-3 pt-3 border-t border-ink-100 flex items-baseline justify-between">
                <div className="inline-flex items-baseline gap-1.5">
                  {t.rating > 0 && (
                    <>
                      <Icon.star aria-hidden className="w-3 h-3 text-warning-500 self-center" />
                      <span role="img" aria-label={`${t.rating.toFixed(2)} 5-დან`} className="font-display text-meta font-bold text-ink-900 tabular-nums">{t.rating.toFixed(2)}</span>
                      <span className="font-mono text-meta text-ink-400 tabular-nums">({t.reviews})</span>
                    </>
                  )}
                </div>
                <span className="font-display text-small font-bold text-ink-900 tabular-nums">{t.priceLabel}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}