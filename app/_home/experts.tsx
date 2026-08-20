'use client'
// Home — the featured-experts rail.

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { SiteText } from '@/components/SiteTextProvider'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { Reveal } from '@/components/Reveal'
import { Container } from '@/components/Container'
import { Eyebrow } from '@/components/Eyebrow'
import { primaryPriceLabel, offerPriceLabel, SERVICE_SUFFIX } from '@/components/booking/slots'
import { ExpertGrid, type GridExpert } from '@/components/home/ExpertGrid'
import { categoryIcon } from '@/lib/categoryMarks'

/* ───── Expert card ─────
   The COMPACT HORIZONTAL card /experts ships (2026-07-27): a fixed square thumb
   on the left, content on the right, price + two actions on a bottom strip —
   ONE layout at every breakpoint. Deliberately MIRRORED, not imported:
   app/experts/client.tsx's card also carries browse-only machinery (favourite
   toggle, hover-video, booking modal) that the home page has no business
   shipping. What must stay identical is the discipline — photo size,
   information order, „ახალი" for an unrated expert, an availability-gated CTA
   — so the two surfaces read as one product.
   The card this replaces had a 16/10 photo BANNER on mobile: avatars are stored
   at 256px, so a full-width banner blew the same source up ~3.7× (visibly
   blurry) and had to crop a portrait into a wide frame, cutting faces at eye
   level. Do NOT bring the banner back. */
/* ExpertCard was DELETED 2026-07-31 along with the „ხელით შერჩეული ექსპერტები"
   section it was built for. It rendered the roster as a catalogue of cards; the
   home page no longer leads with the roster at all (see the questions index
   below), and a component nothing renders is a component that silently rots. The
   browse list and the profile page have their own cards. */

/* ───── The experts ─────
   Reverted to CARDS on 2026-07-31, same day the questions index replaced them,
   on the user's call and for the right reason: a visitor works out what this
   site IS far faster from six faces with a price and a booking button than from
   four sentences. The questions taught what was askable; the cards show what
   you get, and on a marketplace that wins.
   What carried over from the detour is the honesty, not the format — see
   components/home/ExpertGrid: real facts only, the flagship (longest paid)
   duration, and <Avatar> rather than a raw <img>. */
export const FeaturedExperts = () => {
  const [all, setAll] = useState<GridExpert[] | null>(null)
  const [active, setActive] = useState<string>('all')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        // One fetch, then filter in memory. A refetch per chip would put a
        // spinner between the tap and the answer, which is exactly the pause
        // this interaction exists to remove.
        const rows = await fetch('/api/tutors?limit=24').then(r => (r.ok ? r.json() : []))
        if (cancelled || !Array.isArray(rows)) return
        setAll(rows.map((t: any) => ({
          id: t.id,
          urlSlug: t?.slug ?? null,
          slug: t?.category?.slug ?? '',
          name: t?.user?.fullName ?? 'ექსპერტი',
          // Real category or nothing — see app/experts/_data.tsx.
          cat: t?.category?.name ?? '',
          headline: t?.headline ?? '',
          /* PRICE AND DURATION FROM THE SAME TIER. The duration was already
             resolved from the flagship, but the price stayed `t.price` — the
             flat rate typed at /apply — so the two halves of one line described
             two different things. Measured 2026-08-13: ლიზა ზუბაშვილი's flat
             rate is 20 and her real consultation is ₾60/60წთ, so the home grid
             advertised „₾20 · 60-წუთიანი სესია" — an hour at a third of its
             price, on the front page. `primaryPriceLabel` returns BOTH from one
             tier, which is the entire reason it exists (see its docblock). */
          ...(() => {
            const tiers = Array.isArray(t?.consultations) ? t.consultations : []
            const f = primaryPriceLabel(tiers, t?.price ?? 80, t?.consultationDurationMin ?? 60)
            // `price` stays a NUMBER because the hero animates it with <CountUp>;
            // it comes off the SAME tier as the label and the duration, so the
            // three can no longer describe different services.
            return { price: f.price, priceLabel: offerPriceLabel(f), priceSuffix: f.isService ? SERVICE_SUFFIX : `${f.minutes}-წუთიანი სესია` }
          })(),
          photo: t?.user?.avatarUrl ?? DEFAULT_AVATAR,
          rate: typeof t?.rating === 'number' ? t.rating : 0,
          reviews: t?.reviewsCount ?? 0,
          sessions: t?.sessionsCount ?? 0,
          yearsExp: typeof t?.yearsExp === 'number' ? t.yearsExp : undefined,
          verified: !!t?.verified,
        })))
      } catch {
        if (!cancelled) setAll([])
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // ONLY spheres that actually have someone, busiest first. Built from the
  // fetched experts rather than from the category list, so a chip can never
  // offer a sphere that then shows nothing — the empty-state trap this page has
  // been cleared of everywhere else.
  const spheres = React.useMemo(() => {
    const by = new Map<string, { slug: string; name: string; n: number }>()
    for (const e of all ?? []) {
      if (!e.slug || !e.cat) continue
      const cur = by.get(e.slug) ?? { slug: e.slug, name: e.cat, n: 0 }
      cur.n++
      by.set(e.slug, cur)
    }
    return [...by.values()].sort((a, b) => b.n - a.n)
  }, [all])

  const shown = React.useMemo(
    () => (active === 'all' ? (all ?? []) : (all ?? []).filter(e => e.slug === active)).slice(0, 6),
    [all, active],
  )
  const activeSphere = spheres.find(s => s.slug === active) ?? null

  return (
    <section className="relative bg-ink-50/60 grain border-b border-ink-200">
      <Container className="relative z-10 py-10 sm:py-12 lg:py-16">
        <Reveal className="mb-6 lg:mb-8 max-w-[680px]">
          <Eyebrow className="mb-3"><SiteText k="home.experts.eyebrow" /></Eyebrow>
          <h2 className="font-display text-h2 sm:text-display font-bold text-ink-900 tracking-[-0.02em] leading-[1.08]">
            {activeSphere
              ? <>{activeSphere.name} — <span className="text-brand-600 tabular-nums">{activeSphere.n}</span> ექსპერტი</>
              : <SiteText k="home.experts.title" />}
          </h2>
        </Reveal>

        {/* THE SPHERE RAIL. Picking one re-lays the grid BELOW, in place — no
            navigation, no spinner. The animation carries the information: the
            set genuinely changed, and the cascade is what tells you so. Chips
            are built from the fetched experts, so every one of them leads
            somewhere. */}
        {/* ONE ROW ON MOBILE (2026-08-02). Eight chips wrapped into five ragged
            rows at 390px — ~250px of chrome before the first expert, and a
            left-packed stack with a different ragged right edge on every line.
            Below sm it is now a snap rail that bleeds to both screen edges
            (`-mx-6 px-6`, matching the „მსგავსი ექსპერტები" rail on the profile),
            so the set reads as one horizontal strip and the section starts where
            the content does. From sm up it wraps exactly as before. */}
        {spheres.length > 1 && (
          <div
            role="group"
            aria-label="კატეგორიის ფილტრი"
            className="mb-6 lg:mb-8 flex items-center gap-2 flex-nowrap sm:flex-wrap overflow-x-auto sm:overflow-visible -mx-6 sm:mx-0 px-6 sm:px-0 pb-1 sm:pb-0 snap-x sm:snap-none"
          >
            {[{ slug: 'all', name: 'ყველა', n: (all ?? []).length }, ...spheres].map(s => {
              const on = s.slug === active
              return (
                <button
                  key={s.slug}
                  type="button"
                  onClick={() => setActive(s.slug)}
                  aria-pressed={on}
                  // shrink-0 + snap-start: rail members must keep their natural
                  // width, or flex squeezes eight chips into the viewport and
                  // the rail stops being a rail. h-11, not the old off-canon
                  // h-10 (control tiers are h-9/h-11/h-12).
                  className={`h-11 shrink-0 snap-start px-3.5 rounded-pill font-display text-small font-semibold tracking-wide inline-flex items-center gap-2 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 ${
                    on ? 'bg-brand-600 text-white' : 'bg-white border border-ink-200 text-ink-700 hover:border-ink-300 hover:bg-ink-50'
                  }`}
                >
                  {s.slug !== 'all' && (
                    <span className={on ? 'text-white' : 'text-ink-400'}>
                      {categoryIcon(s.slug, 'w-4 h-4')}
                    </span>
                  )}
                  {s.name}
                  <span className={`tabular-nums text-meta ${on ? 'text-white' : 'text-ink-400'}`}>{s.n}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* Keyed on the active sphere so React remounts the grid and the
            entrance cascade replays on every switch. Without the key the cards
            would swap their contents in silence and the filter would look
            broken — the same „nothing happened" failure as the browse page. */}
        <div key={active} className="motion-safe:stagger">
          {all !== null && shown.length === 0 ? (
            <div className="py-14 px-6 text-center rounded-card border border-dashed border-ink-200 bg-white">
              <div className="font-display text-body-lg font-bold text-ink-900"><SiteText k="home.experts.empty" /></div>
              <Link href="/experts" className="tap-shrink mt-4 inline-flex items-center gap-1.5 h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide transition-colors duration-fast">
                ყველა ექსპერტი
              </Link>
            </div>
          ) : (
            <ExpertGrid loading={all === null} experts={shown} />
          )}
        </div>

        <div className="mt-9 flex justify-center">
          <Link
            href={activeSphere ? `/experts?cats=${encodeURIComponent(activeSphere.slug)}` : '/experts'}
            className="h-12 px-6 rounded-btn bg-white border border-ink-200 hover:border-ink-300 hover:bg-ink-50 text-ink-900 font-display text-small font-semibold tracking-wide inline-flex items-center gap-2 transition-colors duration-fast"
          >
            {activeSphere ? `ყველა — ${activeSphere.name}` : <SiteText k="home.experts.allCta" />}
          </Link>
        </div>
      </Container>
    </section>
  )
}