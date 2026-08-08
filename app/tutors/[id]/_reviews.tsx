'use client'
// /tutors/[id] — the reviews block (list, one article, relative dates).

import { useState } from 'react'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { fmtKaDate, KA_MONTHS_SHORT_DOT } from '@/lib/kaDate'
import { CountUp } from '@/components/CountUp'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { Stars } from './_bits'

/* ───── Reviews ───── */
type ReviewItem = {
  id: string
  rating: number
  body: string
  createdAt: string
  // Expert's public reply to the review (Review.tutorResponse) — shipped by
  // /api/tutors/[id] alongside its timestamp.
  tutorResponse?: string | null
  respondedAt?: string | null
  // The API already nulls `student` for anonymous reviews; the flag is kept as
  // client-side defense so an identity never renders even if a payload slips.
  anonymous?: boolean
  // null = anonymous review — the API strips the reviewer's identity.
  student: { id: string; fullName: string; avatarUrl?: string | null } | null
}

const REV_MONTHS = KA_MONTHS_SHORT_DOT
const timeAgoGe = (iso: string) => {
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (days < 1) return 'დღეს'
  if (days < 7) return `${days} დღის წინ`
  if (days < 30) return `${Math.floor(days / 7)} კვირის წინ`
  if (days < 365) return `${Math.floor(days / 30)} თვის წინ`
  return `${d.getDate()} ${REV_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

// One review card — used by both the featured block and the main list, so the
// anonymity rule and the expert-reply block can never drift between the two.
const ReviewArticle = ({ r }: { r: ReviewItem }) => {
  // Defense-in-depth: honor the anonymous flag even if a payload ever ships an
  // identity alongside it (the API already nulls `student` server-side).
  const anon = r.anonymous || !r.student
  const respondedDate = r.respondedAt ? new Date(r.respondedAt) : null
  return (
    <article className="py-6 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3 mb-3">
        {!anon && r.student?.avatarUrl ? (
          <img src={r.student.avatarUrl} alt="" width={40} height={40} loading="lazy" decoding="async" className="w-10 h-10 rounded-full object-cover shrink-0" />
        ) : (
          <img src={DEFAULT_AVATAR} alt="" width={40} height={40} loading="lazy" decoding="async" className="w-10 h-10 rounded-full object-cover shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-display text-body font-bold text-ink-900 leading-tight truncate">{anon ? 'ანონიმური სტუდენტი' : r.student?.fullName ?? 'ანონიმური სტუდენტი'}</div>
          <div className="mt-0.5 inline-flex items-center gap-2 text-meta text-ink-500">
            <Stars n={Math.round(r.rating)} />
            <span>·</span>
            <span>{timeAgoGe(r.createdAt)}</span>
          </div>
        </div>
      </div>
      <p className="text-body text-ink-700 leading-[1.6] max-w-[680px] whitespace-pre-wrap">{r.body}</p>
      {/* Expert's public reply — quoted sub-block, visually nested. */}
      {r.tutorResponse && (
        <div className="mt-4 border-l-2 border-ink-200 pl-3 max-w-[680px]">
          <div className="text-meta text-ink-500">
            <span className="font-display font-semibold text-ink-700">ექსპერტის პასუხი</span>
            {respondedDate && !isNaN(respondedDate.getTime()) && <span> · {fmtKaDate(respondedDate, { year: true })}</span>}
          </div>
          <p className="mt-1 text-small text-ink-600 leading-[1.6] whitespace-pre-wrap">{r.tutorResponse}</p>
        </div>
      )}
    </article>
  )
}

export const Reviews = ({ reviews, rating, total, verified, expertFeatured, loading = false }: { reviews: ReviewItem[]; rating: number; total: number; verified: boolean; expertFeatured: boolean; loading?: boolean }) => {
  const dist = [5, 4, 3, 2, 1].map(s => ({
    s,
    n: reviews.filter(r => Math.round(r.rating) === s).length,
  }))
  // The rating/total are SSR-seeded scalars but the review ROWS only arrive with
  // the client fetch — so between the two the histogram would draw „5★ 0 / 4★ 0…"
  // right next to a real „4.9 · 127 შეფასებიდან" and read as a fake rating.
  // No rows + a nonzero total = distribution simply not known yet.
  const distUnknown = reviews.length === 0 && total > 0
  const [showAll, setShowAll] = useState(false)
  // Outcome-rich highlights (DESIGN_FIX_PROMPT 2.5, display half): the 1–2
  // longest real ≥4★ reviews with enough substance surface above the
  // distribution chart. Heuristic only — real review bodies, never seeded.
  const featured = [...reviews]
    .filter(r => r.rating >= 4 && (r.body?.trim().length ?? 0) >= 120)
    .sort((a, b) => b.body.length - a.body.length)
    .slice(0, 2)
  const featuredIds = new Set(featured.map(r => r.id))
  const rest = reviews.filter(r => !featuredIds.has(r.id))
  const shown = showAll ? rest : rest.slice(0, 6)

  return (
    <section id="reviews" className="mt-14 lg:mt-16 pt-10 border-t border-ink-100 scroll-mt-24">
      <Eyebrow className="mb-3">შეფასებები</Eyebrow>
      <h2 className="font-display text-h2 lg:text-h1 font-bold tracking-[-0.022em] text-ink-900 leading-tight">
        {total > 0 ? 'რას ამბობენ სტუდენტები' : 'ჯერ არ არის შეფასება'}
      </h2>

      {total === 0 ? (
        <p className="mt-3 text-body text-ink-500 max-w-[520px]">ჯერ არავის შეუფასებია — იყავი პირველი.</p>
      ) : (
        <>
          {/* Featured outcome stories — above the star math, because on a
              marketplace where almost everyone shows ~5.0 the substance of a
              review differentiates more than the number. */}
          {featured.length > 0 && (
            <div className="mt-7 grid sm:grid-cols-2 gap-3">
              {featured.map(r => (
                <div key={r.id} className="rounded-card border border-ink-200 bg-white p-5">
                  <ReviewArticle r={r} />
                </div>
              ))}
            </div>
          )}

          <div className="mt-7 rounded-card border border-ink-200 bg-ink-50/50 p-5 sm:p-6 grid sm:grid-cols-[auto_1fr] gap-6 sm:gap-10 items-center">
            <div className="flex items-baseline gap-4 pb-5 sm:pb-0 sm:pr-8 sm:border-r border-b sm:border-b-0 border-ink-200">
              <span className="font-display text-hero font-bold text-ink-900 tabular-nums leading-none tracking-tight motion-safe:animate-scale-in">
                {/* decimals=1 — same precision as fmtRating everywhere else. */}
                <CountUp value={rating} decimals={1} />
              </span>
              <div>
                <Stars n={Math.round(rating)} />
                <div className="mt-1.5 text-meta text-ink-500 tabular-nums">
                  <CountUp value={total} /> შეფასებიდან
                </div>
                {verified && rating >= 4.8 && expertFeatured && (
                  <Eyebrow className="mt-1">Super expert</Eyebrow>
                )}
              </div>
            </div>
            <div className="space-y-2">
              {distUnknown ? (
                loading ? (
                  // Neutral placeholder bars — same rows/heights as the real
                  // histogram, so nothing jumps when the rows land.
                  <div className="space-y-2 motion-safe:animate-pulse" aria-busy="true">
                    {[5, 4, 3, 2, 1].map(s => (
                      <div key={s} className="grid grid-cols-[24px_1fr_40px] items-center gap-3">
                        <span className="h-3 rounded bg-ink-100" />
                        <span className="h-2 rounded-pill bg-ink-100" />
                        <span className="h-3 rounded bg-ink-100" />
                      </div>
                    ))}
                    <span className="sr-only">შეფასებები იტვირთება…</span>
                  </div>
                ) : (
                  <p className="text-meta text-ink-500 leading-snug">შეფასებების განაწილება ვერ ჩაიტვირთა.</p>
                )
              ) : dist.map(d => {
                const pct = reviews.length > 0 ? (d.n / reviews.length) * 100 : 0
                return (
                  <div key={d.s} className="grid grid-cols-[24px_1fr_40px] items-center gap-3 text-meta">
                    <span className="font-display font-semibold tabular-nums text-ink-700 inline-flex items-center gap-1">
                      {d.s}
                      <Icon.star className="w-3 h-3 text-warning-500" />
                    </span>
                    <div className="h-2 bg-white ring-1 ring-ink-100 rounded-pill overflow-hidden">
                      <div className="h-full bg-warning-500 rounded-pill motion-safe:transition-[width] motion-safe:duration-slow motion-safe:ease-out-quart" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-ink-500 tabular-nums text-right font-display font-medium">
                      <CountUp value={d.n} />
                    </span>
                  </div>
                )
              })}
              {/* The bars are computed from the LOADED reviews (API returns the
                  latest 8) while the big number/total are lifetime aggregates —
                  without this caption the two visibly disagree and read as a
                  fake rating. */}
              {reviews.length > 0 && reviews.length < total && (
                <div className="pt-1 text-meta text-ink-400">ბოლო {reviews.length} შეფასების მიხედვით</div>
              )}
            </div>
          </div>

          <div className="mt-10 divide-y divide-ink-100">
            {distUnknown && loading
              ? [0, 1, 2].map(i => (
                  <div key={i} className="py-6 first:pt-0 last:pb-0 motion-safe:animate-pulse" aria-hidden>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-ink-100 shrink-0" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="h-3.5 w-32 rounded bg-ink-100" />
                        <div className="h-3 w-24 rounded bg-ink-100" />
                      </div>
                    </div>
                    <div className="h-3 w-full max-w-[680px] rounded bg-ink-100" />
                    <div className="mt-2 h-3 w-3/5 max-w-[400px] rounded bg-ink-100" />
                  </div>
                ))
              : shown.map(r => <ReviewArticle key={r.id} r={r} />)}
          </div>

          {rest.length > 6 && !showAll && (
            <div className="mt-8">
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="h-11 px-5 rounded-btn border border-ink-200 hover:border-ink-300 hover:bg-ink-50 text-ink-800 font-display font-semibold text-small tracking-wide inline-flex items-center gap-2 transition-colors duration-fast"
              >
                ნახე ყველა {rest.length} შეფასება
                <Icon.chevD className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}