'use client'
import React, { Suspense, useEffect, useState } from 'react'
import { Container } from '@/components/Container'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { PublicTopBar } from '@/components/PublicTopBar'
import type { Me } from '@/lib/me'
import { Footer as SharedFooter } from '@/components/Footer'
import { frameQuestion } from '@/lib/askFraming'
import { fmtKaDate, fmtKaTime } from '@/lib/kaDate'
import { fmtRating } from '@/lib/fmt'
import { displayHeadline } from '@/lib/headline'
import { primaryPriceLabel } from '@/components/booking/slots'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { Illustration } from '@/components/Illustration'

type Expert = {
  id: string
  name: string
  cat: string
  headline: string
  rating: number
  reviews: number
  // Already-resolved FLAGSHIP price label („₾80" / „უფასო") and that tier's real
  // length. Not a raw number: the label has to be able to say „უფასო" for a
  // free flagship, which a `number` cannot.
  priceLabel: string
  durationMin: number
  verified: boolean
  photo: string
  nextSlotAt: string | null
}

function initialsAvatar(_name: string): string {
  return DEFAULT_AVATAR
}


function AskInner({ initialUser }: { initialUser?: Me | null }) {
  const params = useSearchParams()
  const router = useRouter()
  const q = (params?.get('q') ?? '').trim()
  const detected = frameQuestion(q)
  // An explicit `?cat=` WINS over keyword detection. Measured 2026-07-31: the
  // home page's curated questions („როგორ გავზარდო გაყიდვები…", „…შფოთვას
  // სამსახურში?") each belong to a sphere that HAS experts, yet arriving here
  // they detected nothing and rendered „ვერავინ ვიპოვე" — a hand-picked link
  // dead-ending on an empty page. A caller that already knows the sphere must
  // not have its answer thrown away and re-guessed from prose.
  const catParam = (params?.get('cat') ?? '').trim()
  const framing = catParam && catParam !== detected.categorySlug
    ? { ...detected, categorySlug: catParam }
    : detected

  // `null` = still loading · `[]` = genuinely nobody · `'failed'` = the request
  // broke. The third state is not pedantry: without it a 500 and a real empty
  // result rendered the SAME „ზუსტი დამთხვევა ვერ ვიპოვე", so a server hiccup
  // told the visitor this marketplace has no marketing experts. Measured
  // 2026-07-31 by faking a 500 — indistinguishable from the honest empty state.
  const [experts, setExperts] = useState<Expert[] | 'failed' | null>(null)
  const [draft, setDraft] = useState('')
  // Bumped by the „სცადე თავიდან" button to re-run the fetch effect.
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    setExperts(null)
    // Gather the "sources": experts for the detected category. A full natural-
    // language question never substring-matches a short bio, so we match by the
    // detected category (reliable) rather than passing the whole question as `q`.
    // No category detected → surface the top experts overall.
    const url = new URLSearchParams({ limit: '6' })
    if (framing.categorySlug) url.set('category', framing.categorySlug)
    fetch(`/api/tutors?${url.toString()}`)
      // Throw on a non-OK response instead of substituting [] — an HTTP 500 is
      // not "no results", and the two must not render the same thing.
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then((rows: any[]) => {
        if (cancelled || !Array.isArray(rows)) return
        setExperts(rows.slice(0, 6).map(t => ({
          id: t.id,
          name: t?.user?.fullName ?? 'ექსპერტი',
          // Real category or nothing — see app/tutors/_data.tsx.
          cat: t?.category?.name ?? '',
          headline: t?.headline ?? '',
          rating: typeof t?.rating === 'number' ? t.rating : 0,
          reviews: t?.reviewsCount ?? 0,
          // FLAGSHIP price + its real length, from the shared helper — the same
          // one /tutors and the profile rail read. This used to print the raw
          // profile-level `price`, which is not a service anybody can buy: on
          // 2026-07-31 one live expert read ₾60 here and ₾30 on /tutors. The
          // fallback stays 80 (canonical) for a profile with no tiers at all.
          ...(() => {
            const f = primaryPriceLabel(
              Array.isArray(t?.consultations) ? t.consultations : [],
              t?.price ?? 80,
              t?.consultationDurationMin ?? 60,
            )
            return { priceLabel: f.label, durationMin: f.minutes }
          })(),
          verified: !!t?.verified,
          photo: t?.user?.avatarUrl ?? initialsAvatar(t?.user?.fullName ?? ''),
          nextSlotAt: t?.nextSlotAt ?? null,
        })))
      })
      .catch(() => { if (!cancelled) setExperts('failed') })
    return () => { cancelled = true }
  }, [q, framing.categorySlug, reload])

  // The follow-up composer is pinned to the bottom of the viewport, and /ask
  // renders neither BottomNav nor a fixed CTA bar — so without a signal the
  // cookie banner (fixed, bottom) lands directly ON the input and a first-time
  // mobile visitor cannot ask a follow-up at all. Same fix as the full-screen
  // chat composer (components/chat/BookingChat.tsx).
  // Value „lift" (not „1"): the bar is `sticky`, i.e. already in flow — it wants
  // the banner lifted but NOT the body bottom-reserve that `1` adds
  // (see app/globals.css, data-mobile-cta value contract).
  useEffect(() => {
    document.body.setAttribute('data-mobile-cta', 'lift')
    return () => { document.body.removeAttribute('data-mobile-cta') }
  }, [])

  const goAsk = (question: string) => {
    const v = question.trim()
    if (!v) return
    router.push(`/ask?q=${encodeURIComponent(v)}`)
  }

  return (
    <div className="font-sans bg-white text-ink-900 antialiased min-h-screen flex flex-col">
      <PublicTopBar initialUser={initialUser} />

      <Container as="main" size="content" className="flex-1 w-full py-8 lg:py-12">
        {/* Question header (the "thread" title) */}
        {/* Hidden below sm — same rule as /tutors and /tutors/[id]. */}
        <div className="hidden sm:flex items-center gap-1.5 text-meta text-ink-500 mb-4">
          <Link href="/" className="hover:text-ink-800">მთავარი</Link>
          <span className="text-ink-300">/</span>
          <span className="font-display font-semibold text-ink-700">კითხვა</span>
        </div>
        <h1 className="font-display text-h1 sm:text-display font-bold text-ink-900 tracking-[-0.02em]">
          {q || 'დასვი შენი კითხვა'}
        </h1>

        {/* Only the EMPTY start state. Once a question exists the page is a
            result — the reader wants the framing and the matched experts, and a
            drawing above them would push the answer below the fold on a phone. */}
        {!q && (
          <div className="mt-6 flex flex-col items-center text-center">
            <Illustration name="askExpert" alt="" />
            <div className="mt-3 font-display text-body-lg font-bold text-ink-900 tracking-tight">
              მოკლედ აღწერე, რაში გჭირდება დახმარება
            </div>
            <p className="mt-1.5 text-small text-ink-500 max-w-[420px] leading-relaxed">
              კითხვით შეგირჩევთ ყველაზე შესაბამის ექსპერტს.
            </p>
          </div>
        )}

        {/* Curated framing (the "answer" analog — no AI, curated) */}
        <div className="mt-6 rounded-card border border-ink-200 bg-ink-50/40 p-5 sm:p-6">
          <div className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-pill bg-brand-50 text-brand-700 font-display text-meta font-semibold mb-3">
            <Icon.spark className="w-3 h-3" />
            {framing.categoryLabel}
          </div>
          <p className="text-body text-ink-700 leading-[1.6]">{framing.intro}</p>
          <div className="mt-4 pt-4 border-t border-ink-200">
            <Eyebrow tone="muted" className="mb-2.5 inline-flex items-center gap-1.5">
              <Icon.doc className="w-3.5 h-3.5" /> სესიამდე მოამზადე
            </Eyebrow>
            <ul className="space-y-1.5">
              {framing.prepare.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-small text-ink-700">
                  <span className="mt-0.5 w-4 h-4 rounded-full bg-brand-100 text-brand-700 inline-flex items-center justify-center shrink-0"><Icon.check className="w-3 h-3" /></span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Matched experts (the "sources") */}
        <section className="mt-8">
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <h2 className="font-display text-body-lg font-bold text-ink-900 tracking-tight inline-flex items-center gap-2">
              <Icon.users className="w-4 h-4 text-brand-600" /> შესაფერისი ექსპერტები
            </h2>
            <Link href={framing.categorySlug ? `/categories/${framing.categorySlug}` : '/tutors'} className="text-small text-brand-700 hover:text-brand-800 font-display font-semibold">ყველა</Link>
          </div>

          {experts === 'failed' ? (
            /* Honest: say the list did not load, and offer the one action that
               can fix it. Mirrors the profile's slot loader, which has had this
               distinction from the start. */
            <div className="rounded-card border border-dashed border-ink-200 bg-ink-50/40 p-8 text-center">
              <div className="font-display text-body font-bold text-ink-900">ექსპერტები ვერ ჩაიტვირთა</div>
              <p className="text-small text-ink-500 mt-1">ქსელის დროებითი ხარვეზი — სცადე თავიდან.</p>
              <button
                type="button"
                onClick={() => setReload(n => n + 1)}
                className="mt-4 inline-flex items-center gap-1.5 h-11 px-4 rounded-btn bg-white border border-ink-200 hover:border-ink-300 text-ink-800 font-display font-semibold text-small transition-colors duration-fast"
              >
                <Icon.refresh className="w-4 h-4" /> სცადე თავიდან
              </button>
            </div>
          ) : experts === null ? (
            <div className="grid sm:grid-cols-2 gap-3">
              {[0, 1, 2, 3].map(i => <div key={i} className="h-[112px] rounded-card border border-ink-200 bg-ink-50/60 motion-safe:animate-pulse" />)}
            </div>
          ) : experts.length === 0 ? (
            <div className="rounded-card border border-dashed border-ink-200 bg-ink-50/40 p-8 text-center">
              <div className="font-display text-body font-bold text-ink-900">ზუსტი დამთხვევა ვერ ვიპოვე</div>
              <p className="text-small text-ink-500 mt-1">გადახედე ყველა ექსპერტს ან დასვი კითხვა სხვანაირად.</p>
              <Link href="/tutors" className="mt-4 inline-flex items-center gap-1.5 h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-display font-semibold text-body transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2">ყველა ექსპერტი</Link>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {/* `min-w-0` on the GRID ITEM below, not just on its text column.
                  A grid item defaults to `min-width: auto`, so its min-content —
                  driven by the `truncate` (white-space: nowrap) text inside —
                  made this card 462px wide in a 342px track on a phone. The page
                  itself didn't scroll (an ancestor clips), so the name and role
                  were cut off mid-word with no ellipsis: truncate was working
                  perfectly inside a box that was itself off-screen. */}
              {experts.map(e => (
                <Link key={e.id} href={`/tutors/${(e as any).slug || e.id}`} className="group min-w-0 rounded-card border border-ink-200 bg-white hover:border-ink-300 hover:shadow-card p-4 flex gap-3.5 transition-all duration-fast">
                  {/* Round + 56 → 64 (2026-08-05), matching every other expert
                      photo on the site; this was one of two surviving squares. */}
                  <img src={e.photo} alt={e.name} className="w-16 h-16 rounded-full object-cover shrink-0 ring-1 ring-inset ring-ink-900/[0.06]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-display text-body font-bold text-ink-900 truncate">{e.name}</span>
                      {e.verified && (
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-brand-600 text-white shrink-0" title="გადამოწმებული"><Icon.check className="w-2 h-2" /></span>
                      )}
                    </div>
                    {/* `displayHeadline` — same normaliser every other surface
                        uses, so „AI ინჟინერი - 7 წელი" and „ფსიქოლოგი | …" don't
                        reach this row raw. Category leads (ours), the expert's
                        own words qualify it. */}
                    {/* `cat` may be '' (no category) — join only what exists,
                        so the line never opens or closes on a stray „ · ". */}
                    <div className="text-meta text-ink-600 truncate">{[e.cat, displayHeadline(e.headline)].filter(Boolean).join(' · ')}</div>
                    <div className="mt-2 flex items-center gap-2.5 text-meta text-ink-500">
                      {/* „★ 0.0" is not a rating, it is the absence of one — and
                          on a young marketplace almost every card carried it, so
                          the strongest signal on the page was „nobody rates these
                          people". Same rule the profile now follows: an absent
                          fact is absent. The separator goes with it, or it would
                          dangle in front of the price. */}
                      {e.rating > 0 && (
                        <>
                          <span role="img" aria-label={`${fmtRating(e.rating)} 5-დან`} className="inline-flex items-center gap-1 text-warning-600"><Icon.star aria-hidden className="w-3 h-3" /><span className="font-display font-bold text-ink-900 tabular-nums">{fmtRating(e.rating)}</span></span>
                          <span className="text-ink-300">·</span>
                        </>
                      )}
                      {/* Price AND its length — a bare „₾80" has no unit, and
                          /tutors prints „₾80 · 60 წთ სესია" for the same expert.
                          Two surfaces, one sentence. */}
                      <span className="font-display font-bold text-ink-900 tabular-nums">{e.priceLabel}</span>
                      <span className="text-ink-500 tabular-nums">· {e.durationMin} წთ</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Related follow-up questions */}
        <section className="mt-8">
          <h2 className="font-display text-body-lg font-bold text-ink-900 tracking-tight mb-3">დაკავშირებული კითხვები</h2>
          <div className="space-y-2">
            {framing.related.map((r, i) => (
              <button key={i} type="button" onClick={() => goAsk(r)} className="w-full text-left rounded-card border border-ink-200 bg-white hover:border-brand-300 hover:bg-brand-50/30 px-4 py-3 flex items-center gap-3 group transition-colors duration-fast">
                <span className="text-body text-ink-800">{r}</span>
              </button>
            ))}
          </div>
        </section>
      </Container>

      {/* Persistent "ask follow up" bar (mirrors Perplexity) */}
      <div className="sticky bottom-0 z-30 bg-white lg:bg-white/95 lg:backdrop-blur border-t border-ink-200">
        <Container as="form" size="content" onSubmit={(e: React.FormEvent) => { e.preventDefault(); goAsk(draft) }} className="py-3.5">
          <div className="rounded-pill bg-white border border-ink-200 shadow-card focus-within:border-brand-400 flex items-center gap-2 pl-4 pr-2 h-12 transition-colors duration-fast">
            <Icon.search className="w-4 h-4 text-ink-400 shrink-0" />
            <input
              type="text"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              aria-label="დასვი შემდეგი კითხვა"
              placeholder="დასვი შემდეგი კითხვა…"
              // `h-11`: with only `flex-1` the <input> was 25px tall inside a
              // field that LOOKS ~56px, so most of the visible control was dead
              // to a tap — a finger landing near the rounded edge did nothing,
              // on the primary input of this page. The height now fills the
              // padded row, so the hit area matches what is drawn.
              className="flex-1 h-11 bg-transparent text-body text-ink-900 placeholder:text-ink-400 focus:outline-none"
            />
            <button type="submit" disabled={!draft.trim()} aria-label="გაგზავნა" className="h-10 w-10 sm:h-9 sm:w-9 rounded-full bg-brand-600 hover:bg-brand-700 disabled:bg-ink-100 text-white inline-flex items-center justify-center transition-colors duration-fast shrink-0">
              <Icon.send className="w-4 h-4" />
            </button>
          </div>
        </Container>
      </div>

      <SharedFooter />
    </div>
  )
}

export default function AskPage({ initialUser }: { initialUser?: Me | null }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <AskInner initialUser={initialUser} />
    </Suspense>
  )
}
