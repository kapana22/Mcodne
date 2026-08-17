'use client'
// /tutors/[id] — „მსგავსი ექსპერტები“ at the foot of the profile.

import { useState, useEffect } from 'react'
import { Link } from 'next-view-transitions'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { fmtRating } from '@/lib/fmt'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { TUTOR_DEFAULTS, primaryPriceLabel } from '@/components/booking/slots'

/* ───── Similar experts — fetches real tutors in the same category ───── */
type SimilarTutor = {
  id: string
  slug: string | null
  name: string
  avatar: string | null
  specialty: string
  categoryName: string
  rating: number
  sessions: number
  /** Already formatted („₾60", „უფასო") — see the mapping below. */
  priceLabel: string
}

export const SimilarExperts = ({ excludeId, categorySlug, categoryName }: { excludeId?: string; categorySlug?: string | null; categoryName?: string | null }) => {
  const [tutors, setTutors] = useState<SimilarTutor[] | null>(null)

  useEffect(() => {
    // Fetch with limit=5 so we can drop the current tutor and still show 4.
    const params = new URLSearchParams({ limit: '5' })
    if (categorySlug) params.set('category', categorySlug)
    fetch(`/api/tutors?${params}`)
      .then(r => r.ok ? r.json() : [])
      .then((d: any[]) => {
        if (!Array.isArray(d)) { setTutors([]); return }
        const mapped = d
          .filter(t => t.id !== excludeId)
          .slice(0, 4)
          .map(t => ({
            id: t.id,
            // Slug, not the cuid: a cuid href 308s to the slug and the redirect
            // downgrades the navigation to a full load, which kills the photo
            // view-transition (CLAUDE.md, animation pass 2026-08-01).
            slug: t.slug ?? null,
            name: t.user?.fullName ?? 'ექსპერტი',
            avatar: t.user?.avatarUrl ?? null,
            specialty: t.specialty ?? '',
            categoryName: t.category?.name ?? '',
            rating: t.rating ?? 0,
            sessions: t.sessionsCount ?? 0,
            /* THE SHARED RULE, not the raw column. This tile rendered
               `₾{t.price}` — TutorProfile.price, the flat rate typed at /apply —
               while the expert's own card and their profile rail both resolve
               the FLAGSHIP service through primaryPriceLabel. Measured on
               production 2026-08-13: ლიზა ზუბაშვილი reads „₾60 · 60 წთ"
               everywhere and „₾20/სესია" here, because her flat rate is 20 and
               her real consultation is 60. That is the same „one expert, three
               prices" failure primaryPriceLabel was written to end (see its
               docblock) — this tile was simply never migrated to it. */
            priceLabel: primaryPriceLabel(
              t.consultations ?? [],
              t.price ?? 0,
              t.consultationDurationMin ?? TUTOR_DEFAULTS.durationMin,
            ).label,
          }))
        setTutors(mapped)
      })
      .catch(() => setTutors([]))
  }, [excludeId, categorySlug])

  // Hide below 2: a single tile renders at 1/4 width in the 4-col grid — a
  // lonely, broken-looking row on a small/cold category.
  if (tutors === null || tutors.length < 2) return null

  return (
    <section className="mt-14 lg:mt-16 pt-10 border-t border-ink-100">
      <div className="flex items-baseline justify-between gap-4 flex-wrap mb-6">
        <div>
          <Eyebrow className="mb-3">ასევე ნახე</Eyebrow>
          <h2 className="font-display text-h2 lg:text-h1 font-bold tracking-[-0.022em] text-ink-900 leading-tight">მსგავსი ექსპერტები</h2>
        </div>
        <Link href={`/tutors${categorySlug ? `?category=${categorySlug}` : ''}`} className="text-meta text-ink-600 hover:text-ink-900 font-display font-semibold inline-flex items-center gap-1 transition-colors duration-fast">
          {categoryName ? `ყველა · ${categoryName}` : 'ყველა ექსპერტი'}
          <Icon.chevR className="w-3 h-3" />
        </Link>
      </div>

      <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-3 overflow-x-auto sm:overflow-visible -mx-6 sm:mx-0 px-6 sm:px-0 pb-2 sm:pb-0 snap-x snap-mandatory sm:snap-none">
        {tutors.map(t => (
          <Link
            key={t.id}
            href={`/tutors/${t.slug || t.id}`}
            /* min-w-0: a grid item defaults to min-width:auto, so a long word
               inside would grow this track past its 1fr share instead of
               being clamped by it. */
            className="shrink-0 sm:shrink w-[260px] sm:w-auto min-w-0 text-left rounded-card border border-ink-200 bg-white hover:border-ink-300 hover-lift p-4 snap-start"
          >
            <div className="flex items-start gap-3">
              <img src={t.avatar || DEFAULT_AVATAR} alt="" width={60} height={60} loading="lazy" decoding="async" className="w-[60px] h-[60px] rounded-full object-cover shrink-0 ring-2 ring-ink-100" />
              <div className="min-w-0 flex-1">
                <div className="font-display text-body font-bold text-ink-900 tracking-tight truncate">{t.name}</div>
                <div className="text-meta text-ink-500 truncate mt-0.5">{t.specialty}</div>
                {t.categoryName && (
                  /* max-w-full + a truncating span: the chip's text is a flex
                     item with min-width:auto, i.e. it refuses to go below the
                     longest word („გადასახადები" = 114px at this size) and
                     pushed the pill outside the card. `truncate` sets
                     overflow:hidden, which is what makes that automatic
                     minimum resolve to 0 — the pill now clamps to its column
                     and ellipsises instead of spilling. */
                  <div className="mt-1.5 inline-flex max-w-full items-center gap-1 px-2 h-5 rounded-pill bg-brand-50 text-brand-800 font-display text-micro font-semibold uppercase">
                    <span className="truncate">{t.categoryName}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3.5 pt-3 border-t border-ink-100 flex items-center justify-between">
              <div className="inline-flex items-baseline gap-1 text-meta">
                {t.rating > 0 ? (
                  <>
                    <Icon.star className="w-3 h-3 text-warning-500 self-center" />
                    <span className="font-display font-bold text-ink-900 tabular-nums">{fmtRating(t.rating)}</span>
                    {t.sessions > 0 && <span className="text-ink-500 tabular-nums">· {t.sessions}</span>}
                  </>
                ) : (
                  <span className="text-ink-400 text-meta">ახალი</span>
                )}
              </div>
              <div className="font-display text-body font-bold text-ink-900 tabular-nums tracking-tight">{t.priceLabel}<span className="text-meta font-medium text-ink-500 tracking-normal">/ სესია</span></div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}