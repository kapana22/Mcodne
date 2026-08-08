'use client'
// Home — the hero: headline, search, and the trust strip under it.

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { SiteText } from '@/components/SiteTextProvider'
import { useRouter } from 'next/navigation'
import { PAYMENTS_LIVE } from '@/lib/flags'
import { fmtRating } from '@/lib/fmt'
import { CountUp } from '@/components/CountUp'
import { Icon } from '@/components/Icon'
import { Container } from '@/components/Container'
import { Avatar } from '@/components/Avatar'
import { GlyphBackdrop } from '@/components/home/GlyphBackdrop'
import { LineReveal } from '@/components/home/LineReveal'
import { WordReveal } from '@/components/home/WordReveal'
import { Expert, ROTATE_MS, VerifiedMark, mapTutorToExpert, shuffled } from './data'

export const HomeHero = () => {
  const router = useRouter()
  const [query, setQuery] = useState('')
  // Placeholder length is the only thing this drives. Starts false so the
  // server render and the first client render agree (no hydration mismatch);
  // the effect corrects it before anyone can read the field.
  const [isNarrow, setIsNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const sync = () => setIsNarrow(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  // Span the spheres we actually serve (business/career/law/psychology/…),
  // not just VC/tech — a startup-only list bounces the broader audience.
  // SPHERES WE ACTUALLY STAFF. „ბიზნეს-სტრატეგია" and „კარიერა და CV" both
  // landed on ZERO experts (measured 2026-07-31) — the first thing a visitor is
  // invited to tap, and two of the three went nowhere. These are the real ones,
  // linked by slug so the destination cannot mis-detect them.
  const quickTopics: { label: string; slug: string }[] = [
    { label: 'მარკეტინგი', slug: 'marketing' },
    { label: 'გაყიდვები', slug: 'sales' },
    { label: 'ფსიქოლოგიური მხარდაჭერა', slug: 'psychology' },
  ]
  // Real featured tutors — replaces the previous hardcoded fixture that leaked
  // "გიორგი მელაძე" and other fake names to SSR HTML (crawler / social preview
  // saw them as real tutors). Starts empty so first paint has no fake identities.
  const [experts, setExperts] = useState<Expert[]>([])
  // Distinguishes "still loading" from "loaded, but the marketplace is empty".
  // Without it, a truly-empty catalog (or one with <4 experts) leaves the hero
  // preview + avatar stack pulsing as skeletons FOREVER on a cold start.
  const [loaded, setLoaded] = useState(false)
  const [stats, setStats] = useState<{ total: number; avg: number } | null>(null)
  // Which expert currently fronts the preview card. Advances on a slow timer so
  // the hero isn't the same two faces on every visit.
  const [slot, setSlot] = useState(0)
  const [held, setHeld] = useState(false)
  useEffect(() => {
    let cancelled = false
    // Top experts anchor the hero preview card. We deliberately do NOT gate on
    // `featured` — if nothing is editorially featured the hero must still show a
    // real, strong expert (otherwise it renders an empty skeleton forever).
    fetch('/api/tutors?limit=8')
      .then(r => (r.ok ? r.json() : []))
      .then((rows: any[]) => {
        if (cancelled || !Array.isArray(rows)) return
        // Shuffle so a repeat visitor doesn't always meet the same expert. This
        // is hydration-safe by construction: nothing about this list is
        // server-rendered (it starts empty and is filled by this effect), so the
        // randomness never runs during SSR and can't desync the first paint.
        setExperts(shuffled(rows.map(mapTutorToExpert)))
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true) })
    // Real aggregate numbers — honest, never fabricated.
    fetch('/api/tutors/stats')
      .then(r => (r.ok ? r.json() : null))
      .then((s: any) => {
        if (cancelled || !s) return
        setStats({ total: s.total ?? 0, avg: s.avgRating ?? 0 })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Rotation of the preview. Paused while the pointer/keyboard is inside the
  // card (nothing moves under a hand that's about to click „დაჯავშნე“), and
  // switched off entirely under reduced motion — there the per-visit shuffle
  // above is already enough variety.
  useEffect(() => {
    if (experts.length < 2 || held) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setSlot(s => s + 1), ROTATE_MS)
    return () => clearInterval(t)
  }, [experts.length, held])

  // Manual step. `+ len - 1` instead of `- 1` keeps `slot` non-negative — every
  // read is `slot % len`, and JS `%` returns a NEGATIVE remainder for negative
  // operands, which would index out of the array.
  const step = (dir: 1 | -1) =>
    setSlot(s => (experts.length ? s + (dir === 1 ? 1 : experts.length - 1) : s))

  const featured = experts.length ? experts[slot % experts.length] : undefined
  // The next few experts, wrapping around — so nobody appears twice at once and
  // a thin catalog (2–3 experts) simply shows fewer faces instead of looping.
  const sidekicks = experts.length > 1
    ? Array.from({ length: Math.min(4, experts.length - 1) }, (_, i) => experts[(slot + 1 + i) % experts.length])
    : []
  // „+N“ must mean N more REAL experts — never a decorative plus.
  const moreCount = Math.max(0, (stats?.total ?? experts.length) - (featured ? 1 : 0) - sidekicks.length)

  return (
    <section className="relative bg-white overflow-hidden border-b border-ink-200">
      {/* Restrained backdrop — barely-there brand tint, premium/clean.
          Radial glow washes (NOT blur filters — Safari renders those as a
          hard-edged square) drifting on a very slow aurora cycle. */}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-brand-50/12 via-white to-white pointer-events-none" />
      <div aria-hidden className="glow-brand aurora-a absolute -top-64 -right-48 w-[620px] h-[620px] opacity-60 pointer-events-none" />
      {/* The page's one piece of ownable graphic material: a mkhedruli „მ",
          outlined, bleeding off the right edge. See GlyphBackdrop — the layout,
          cards and icons here could belong to any marketplace in any country;
          the script cannot. */}
      <GlyphBackdrop className="-right-[7%] -top-[14%] text-[42vw] xl:text-[36vw] z-0" />

      <Container className="relative pt-8 sm:pt-12 lg:pt-16 pb-12 sm:pb-16 lg:pb-20">
        {/* Trust strip — one quiet line. The expert count rides here (real
            aggregate, only once it has loaded) so mobile gets it too. */}
        <div className="relative z-10 flex items-center gap-3 mb-5 sm:mb-8 lg:mb-10 text-meta text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <Icon.shieldCheck className="w-3.5 h-3.5 text-ink-400" />
            <span><SiteText k="home.hero.trustChip" /></span>
          </span>
          {stats && stats.total > 0 && (
            <>
              <span aria-hidden className="w-px h-3 bg-ink-200" />
              <span className="tabular-nums">{stats.total} ექსპერტი</span>
            </>
          )}
        </div>

        {/* 1.3fr gives the headline enough measure to break where it's authored
            (two lines) instead of ragging into four. */}
        {/* 1.15fr / 1fr, not 1.3 / 1. The card is the only thing on this screen
            that shows the actual product — a face, a price, a booking button —
            and at 1fr against a 1.3fr headline plus a 64px gutter it rendered
            small enough to read as a thumbnail. The headline still leads; the
            card is now close enough in weight to be looked AT. */}
        <div className="relative z-10 grid lg:grid-cols-[1.15fr_1fr] gap-10 lg:gap-12 xl:gap-14 items-start">
          {/* Left — headline + search + stats */}
          <div className="min-w-0">
            {/* STEPPED DOWN ONE NOTCH, 2026-08-04 (44/52 → 36/44). The headline
                is authored as TWO lines and the size is what keeps it there. It
                had drifted back to four cramped lines: the copy is edited from
                the admin panel, so a heading sized to the exact string it shipped
                with re-wraps the first time someone rewrites it — which is what
                happened. A step down buys the room that the old comment's
                one-pixel argument was trying to squeeze out of the ramp, and it
                holds for a longer sentence too.
                OFF-RAMP (25px on mobile, not a ramp step): the ramp's `text-h1`
                = 28px pushes line 2 over at 390px. Every breakpoint above it is
                on the scale. If the copy grows again, take the SIZE down before
                you take the line break out. */}
            {/* Each line is MASKED and rises out of its own baseline, 90ms apart,
                so the headline reads as being typeset rather than as two blocks
                arriving. See LineReveal. */}
            <h1 className="font-display font-bold text-ink-900 leading-[1.1] sm:leading-[1.04] tracking-[-0.028em] text-[25px] sm:text-display xl:text-display-lg">
              {/* Word-by-word, ~70ms apart, line 2 picking up where line 1
                  ends — the sentence is SET in front of the reader. WordReveal
                  resolves the same SiteText keys, so admin copy edits still
                  win. */}
              <WordReveal k="home.hero.line1" /><br />
              {/* Line 2 is SOLID brand green, not a gradient (2026-08-04, owner's
                  call). It used to carry `gradient-signature` through
                  background-clip:text — which is also why it is one mask rather
                  than word-split like line 1, since a clipped gradient restarts
                  per element and would have shown seams. The mask stays because
                  it is still this line's entrance; the gradient is gone.
                  brand-600 (#26806E) is the canon step for brand text on white —
                  4.78:1, and the one green that passes without going olive. */}
              <LineReveal delay={300}>
                <span className="text-brand-600"><SiteText k="home.hero.line2" /></span>
              </LineReveal>
            </h1>
            {/* The hero arrives as ONE sequence, ~90ms apart: headline lines,
                then the promise, then the field, then the topics. Each step is
                the next thing you would read, so the motion follows the eye
                instead of decorating the box. */}
            <p className="mt-5 sm:mt-6 text-body-lg sm:text-h3 text-ink-700 max-w-[520px] leading-[1.62] motion-safe:animate-rise-in" style={{ animationDelay: '180ms' }}>
              <SiteText k="home.hero.subtitle" /> <span className="font-display font-semibold text-ink-900"><SiteText k="home.hero.subtitleEmphasis" /></span>
            </p>

            {/* Search bar */}
            <div className="mt-7 sm:mt-8 max-w-[560px] motion-safe:animate-rise-in" style={{ animationDelay: '270ms' }}>
              {/* Label/destination agreement (1.5): the button says „ექსპერტის
                  ძიება", so the form goes to /tutors?q=…. /ask stays reachable
                  via the secondary „დასვი კითხვა“ link below. */}
              <form action="/tutors" method="get" onSubmit={e => { e.preventDefault(); router.push(query ? `/tutors?q=${encodeURIComponent(query)}` : '/tutors') }} className="rounded-card bg-white border border-ink-200 shadow-card p-2 flex flex-col sm:flex-row gap-2 focus-within:border-brand-400 focus-within:shadow-brand-glow transition-[box-shadow,border-color] duration-mid">
                <div className="relative flex-1">
                  <Icon.search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                  {/* Two placeholders, because a placeholder cannot ellipsize:
                      the long one was cut dead at „…გადასახადი, კა" on a 390px
                      screen, so the example list ended mid-word and read as a
                      rendering fault. The wide one was ALSO clipped — measured
                      at 1440px it ended on „…იურიდი", so the long version never
                      fitted anywhere; it is now short enough to land whole. */}
                  <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    name="q" aria-label="ექსპერტების ძებნა" placeholder={isNarrow ? 'რა გჭირდება?' : 'რა გჭირდება? მაგ. გადასახადი ან კარიერა'}
                    className="w-full h-12 pl-11 pr-3 bg-transparent text-body-lg text-ink-900 placeholder:text-ink-400 focus:outline-none"
                  />
                </div>
                <button type="submit" className="h-12 px-6 rounded-btn bg-gradient-cta hover:brightness-105 text-white font-display font-semibold text-body-lg tracking-wide inline-flex items-center justify-center gap-2 shadow-brand-glow hover:shadow-[0_10px_32px_rgba(47,156,134,0.4)] transition-all duration-fast">
                  ძებნა
                </button>
              </form>
              {/* The live „ამ კვირაში ღია დრო აქვს N ექსპერტს" line was removed
                  2026-08-05 (owner's call). It was the only reader of
                  `openThisWeek`, so the field is no longer pulled off the
                  /api/tutors/stats payload either — the endpoint still returns
                  it, and `total` / `avgRating` are still used below. */}

              {/* The topics land last, one after another — the sequence's tail.
                  `stagger` gives each child its own delay; the wrapper delay
                  hands over from the search field above. */}
              {/* No „პოპულარული:" label. A row of tappable topics under a search
                  field needs no introduction, and the word was the only thing
                  forcing a fourth chip onto a second line — the block wrapped
                  into a ragged two-row stack that read as a list of leftovers
                  rather than as a row of shortcuts. */}
              <div className="mt-4 flex items-center gap-2 flex-wrap motion-safe:stagger" style={{ animationDelay: '360ms' }}>
                {quickTopics.map(t => (
                  <Link key={t.slug} href={`/ask?q=${encodeURIComponent(t.label)}&cat=${encodeURIComponent(t.slug)}`} // h-10 below sm (28px missed the 40px tap floor on the surface most
                    // likely to be used one-handed); the compact chip returns from sm up.
                    className="h-10 sm:h-7 px-3 sm:px-2.5 rounded-pill bg-white/60 border border-ink-200 hover:bg-white hover:border-ink-300 text-meta font-display font-medium text-ink-700 transition-colors duration-fast inline-flex items-center">
                    {t.label}
                  </Link>
                ))}
              </div>
              {/* One clear secondary action instead of a sentence with a link
                  buried in the middle. „— ექსპერტი გიპასუხებს" restated the
                  hero's whole promise a third time, four lines under it. */}
              <div className="mt-4 text-small">
                <Link href={query ? `/ask?q=${encodeURIComponent(query)}` : '/ask'} className="inline-flex items-center gap-1.5 min-h-[40px] sm:min-h-0 font-display font-semibold text-brand-700 hover:text-brand-800 transition-colors duration-fast">
                  ვერ პოულობ? დაუსვი კითხვა ექსპერტს
                  <Icon.arrow aria-hidden className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* The three-column claim row that sat here is GONE (2026-07-31).
                „ხელით შერჩეული / გამჭვირვალე ფასი / ვიდეოსესია" is the same
                promise the hero's own trust line states above it, the card's
                footer states beside it, and the „ყოველი ჯავშანი მოიცავს" strip
                states again further down with more room and better type — the
                same three claims FOUR times on one page, twice inside this hero.
                It was also the least-designed element on the screen (a plain
                text grid under a rule) and it sat BELOW the CTA, where nobody is
                still shopping for reassurance. */}
          </div>

          {/* Right — product preview: a live, premium expert booking card that
              shows the actual product (Topmate / Intro pattern). Desktop-only:
              on mobile the REAL expert cards of FeaturedExperts are one scroll
              away, and this preview cost ~2.5 screens of duplicate content. */}
          <div
            // `group/stack` so the two ghost cards behind can respond to the
            // pointer: they spread apart on hover, which reads as depth rather
            // than as a static drop shadow. Named group — the card inside has
            // its own hover states.
            className="group/stack relative motion-safe:animate-scale-in hidden lg:block"
            style={{ animationDelay: '330ms' }}
            onMouseEnter={() => setHeld(true)}
            onMouseLeave={() => setHeld(false)}
            onFocusCapture={() => setHeld(true)}
            onBlurCapture={() => setHeld(false)}
          >
            {/* Depth: a soft secondary card peeking behind the main one. The
                count that used to float above it now lives in the trust strip —
                one number, one place. */}
            {/* Depth: two receding cards, not one — a single ghost reads as a
                misaligned duplicate, two read as a stack. */}
            <div aria-hidden className="absolute -top-3 left-6 right-6 h-24 rounded-[20px] bg-white border border-ink-200 shadow-sm -z-10 transition-transform duration-slow ease-out-quart motion-safe:group-hover/stack:-translate-y-1.5" />
            <div aria-hidden className="absolute -top-6 left-12 right-12 h-24 rounded-[20px] bg-white border border-ink-200/70 -z-20 transition-transform duration-slow ease-out-quart motion-safe:group-hover/stack:-translate-y-3" />

            {featured ? (
              /* Keyed on the expert so a rotation tick fades the new one in. */
              <article key={featured.id ?? slot} className="relative rounded-[20px] bg-white border border-ink-200 shadow-float hover-lift overflow-hidden motion-safe:animate-fade-in-fast">
                {/* A brand hairline across the top — the card's one accent, and
                    the only thing that tells you at a glance this is OUR card
                    and not a generic profile tile. */}
                <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-brand-500 via-brand-400 to-brand-500/0" />

                {/* Whole-card link — same stretched-overlay pattern as
                    components/home/ExpertGrid (see the note there): the card
                    lifts on hover, so a click anywhere on it must go somewhere.
                    Overlay → the profile, CTA → the profile with ?rebook=1. */}
                {featured.id && (
                  <Link
                    href={`/tutors/${featured.urlSlug || featured.id}`}
                    aria-label={`${featured.name} — პროფილი`}
                    className="absolute inset-0 z-10 rounded-[20px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
                  />
                )}

                {/* Identity. The portrait carries the card, so it is bigger and
                    squarer than a chat avatar: a 72–80px rounded-card crop reads
                    as a considered photograph, a 64px circle reads as a list
                    item. */}
                <div className="p-5 sm:p-6 xl:p-7 pt-6 sm:pt-7 xl:pt-8 flex items-start gap-4 xl:gap-5">
                  <div className="relative shrink-0">
                    {/* Circle, and Avatar's own ring — see the note in
                        ExpertGrid. `!rounded-card` here squared the wrapper
                        while the photo stayed round: two frames, one face. */}
                    <Avatar
                      src={featured.photo}
                      name={featured.name}
                      size={80}
                      className="w-[72px] h-[72px] sm:w-20 sm:h-20"
                    />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-display text-h3 xl:text-h2 font-bold text-ink-900 tracking-tight truncate">{featured.name}</span>
                      {featured.verified && <VerifiedMark size={16} />}
                    </div>
                    {featured.headline && (
                      <div className="mt-1 inline-flex items-center gap-1.5 h-5 px-2 rounded-pill bg-ink-75 text-ink-700 border border-ink-200 font-display text-meta font-semibold tracking-tight max-w-full truncate">
                        {featured.headline}
                      </div>
                    )}
                    <div className="mt-1.5 text-meta text-ink-500 truncate">{featured.cat}</div>
                  </div>
                </div>

                {/* Only facts that EXIST. This row used to read „ახალი ექსპერტი
                    · 0 სესია" for most of the roster — on the single most
                    prominent element of the homepage, our loudest advert was two
                    admissions of weakness side by side. A rating and a session
                    count appear when there is one; years of experience stands in
                    when there isn't; and when none of the three exist the row
                    does not render at all. An absent fact is absent. */}
                {(() => {
                  const bits: React.ReactNode[] = []
                  if (featured.rate > 0 && featured.reviews > 0) bits.push(
                    <span key="r" className="inline-flex items-center gap-1 text-ink-800">
                      <Icon.star className="w-3.5 h-3.5 text-warning-500" />
                      <span className="font-display font-bold tabular-nums">{fmtRating(featured.rate)}</span>
                      <span className="text-ink-400 tabular-nums">({featured.reviews})</span>
                    </span>)
                  if (featured.sessions > 0) bits.push(
                    <span key="s" className="text-ink-600">
                      <span className="font-display font-semibold text-ink-800 tabular-nums">{featured.sessions}</span> სესია
                    </span>)
                  if (bits.length === 0 && featured.yearsExp && featured.yearsExp > 0) bits.push(
                    <span key="y" className="text-ink-600">
                      <span className="font-display font-semibold text-ink-800 tabular-nums">{featured.yearsExp}</span> წლის გამოცდილება
                    </span>)
                  if (bits.length === 0) return null
                  return (
                    <div className="px-5 sm:px-6 pb-4 flex items-center gap-3 text-meta flex-wrap">
                      {bits.map((b, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && <span aria-hidden className="w-px h-3.5 bg-ink-200" />}
                          {b}
                        </React.Fragment>
                      ))}
                    </div>
                  )
                })()}

                {/* Price + CTA */}
                <div className="p-5 sm:p-6 pt-4 flex items-center justify-between gap-3">
                  <div>
                    {/* Flat expert-set price for the whole session — "/ N წთ"
                        read like a per-minute rate. */}
                    {/* The price ROLLS from the previous expert's to this one's
                        every time the card rotates. Motion where the content
                        genuinely changes — the number you are watching is the
                        number that moved, which is the only kind of animation
                        that carries information instead of decorating a box.
                        CountUp snaps instantly under prefers-reduced-motion. */}
                    <CountUp
                      value={featured.price}
                      prefix="₾"
                      duration={520}
                      className="block font-display text-display font-bold text-ink-900 tabular-nums tracking-[-0.02em] leading-none"
                    />
                    <span className="mt-1 block text-meta font-medium text-ink-500">
                      <CountUp value={featured.durationMin} duration={420} className="tabular-nums" />-წუთიანი სესია
                    </span>
                  </div>
                  {/* ?rebook=1 opens the booking modal on arrival, so the CTA
                      label is honest — it books, not just views. */}
                  <Link href={featured.id ? `/tutors/${featured.urlSlug || featured.id}?rebook=1` : '/tutors'} className="relative z-20 shrink-0 h-11 px-5 rounded-btn bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-display font-semibold text-body tracking-wide inline-flex items-center gap-1.5 shadow-brand-glow hover:shadow-[0_10px_32px_rgba(47,156,134,0.36)] motion-safe:active:scale-[0.97] transition-all duration-fast">
                    დაჯავშნე
                  </Link>
                </div>

                {/* Trust footer. `ink-200`, matching the card's own border —
                    an `ink-100` rule meeting an `ink-200` frame at a right angle
                    is the mismatch that made the page's lines read as strays. */}
                <div className="border-t border-ink-200 px-5 sm:px-6 py-3 flex items-center gap-4 text-meta text-ink-600">
                  <span className="inline-flex items-center gap-1.5">
                    <Icon.shieldCheck className="w-3.5 h-3.5 text-brand-600" /> {PAYMENTS_LIVE ? 'დაცული გადახდა' : 'უფასო დაჯავშნა'}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    {/* Honest: only claim ID-verification when this expert
                        actually is verified; otherwise show a claim that's
                        always true (every listed expert is hand-picked). */}
                    <Icon.check className="w-3.5 h-3.5 text-brand-600" /> {featured.verified ? 'ID + გადამოწმებული' : 'ხელით შერჩეული'}
                  </span>
                </div>
              </article>
            ) : !loaded ? (
              <article aria-busy="true" className="relative rounded-card bg-white border border-ink-200 shadow-float overflow-hidden">
                <div className="p-6 flex items-start gap-4">
                  <div className="w-16 h-16 rounded-full bg-ink-100 motion-safe:animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-4 w-32 bg-ink-100 rounded motion-safe:animate-pulse" />
                    <div className="h-4 w-24 bg-ink-100 rounded-pill motion-safe:animate-pulse" />
                    <div className="h-3 w-20 bg-ink-100 rounded motion-safe:animate-pulse" />
                  </div>
                </div>
                <div className="px-6 pb-6 flex items-center justify-between">
                  <div className="h-6 w-16 bg-ink-100 rounded motion-safe:animate-pulse" />
                  <div className="h-11 w-28 bg-ink-100 rounded-btn motion-safe:animate-pulse" />
                </div>
              </article>
            ) : null}

            {/* Avatar stack + see-all */}
            <div className="mt-5 flex items-center gap-3.5">
              {/* The hover fan-out (`hover:-space-x-1` + an animated `margin`)
                  was removed 2026-07-29: it moved content out from under the
                  cursor, and animating `margin` is a layout animation — the one
                  property class the compositor cannot run off the main thread. */}
              {(sidekicks.length > 0 || !loaded) && (
                <div className="flex -space-x-2.5">
                  {sidekicks.length > 0 ? sidekicks.map(e => (
                    <div key={e.id ?? e.name} className="relative">
                      {/* <Avatar>, not a raw <img>: three of the nine experts
                          carry an avatarUrl that is present but unusable, which
                          rendered a broken-image glyph in this stack. Avatar owns
                          the initials fallback. */}
                      {/* NO ring here. `className` lands on Avatar's OUTER span,
                          which has no radius — so `ring-2 ring-white` drew a
                          SQUARE outline behind every circular photo („რაღაც უკან
                          დასდევს"). Avatar already rings its own round clip. */}
                      <Avatar src={e.photo} name={e.name} size={36} className="w-9 h-9" />
                    </div>
                  )) : [0, 1, 2].map(i => (
                    <div key={i} className="w-9 h-9 rounded-full bg-ink-100 ring-2 ring-white ring-inset motion-safe:animate-pulse" />
                  ))}
                  {/* ring-inset, matching Avatar's own clip: an outset ring on a
                      -space-x stack paints OVER the neighbour and reads as a gap
                      in the row. */}
                  {moreCount > 0 && (
                    <div className="w-9 h-9 rounded-full bg-ink-100 ring-2 ring-white ring-inset inline-flex items-center justify-center font-display text-meta font-bold text-ink-700 tabular-nums">+{moreCount}</div>
                  )}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="font-display text-small font-semibold text-ink-900 tracking-tight">
                  {/* On a cold catalog the average is 0 — printing „0.0★ საშუალო“
                      would read as a terrible score rather than „no reviews yet“.
                      The count itself lives in the trust strip now. */}
                  {stats && stats.avg > 0
                    ? `${fmtRating(stats.avg)}★ საშუალო შეფასება`
                    : <SiteText k="home.hero.browseAll" />}
                </div>
                <Link href="/tutors" className="mt-0.5 inline-flex items-center gap-1 font-display text-meta font-semibold text-brand-700 hover:text-brand-800 transition-colors duration-fast">
                  ყველა ექსპერტი
                </Link>
              </div>

              {/* Manual prev/next. These are CAROUSEL CONTROLS, not the decorative
                  trailing arrows the canon bans on CTAs — they do something.
                  Hidden with fewer than 2 experts (nothing to step through); the
                  surrounding wrapper's hover/focus already pauses auto-advance,
                  so clicking never fights the timer. */}
              {experts.length > 1 && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => step(-1)}
                    aria-label="წინა ექსპერტი"
                    className="w-10 h-10 rounded-btn border border-ink-200 bg-white text-ink-700 hover:text-ink-900 hover:bg-ink-50 inline-flex items-center justify-center transition-colors duration-fast"
                  >
                    <Icon.chevL className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => step(1)}
                    aria-label="შემდეგი ექსპერტი"
                    className="w-10 h-10 rounded-btn border border-ink-200 bg-white text-ink-700 hover:text-ink-900 hover:bg-ink-50 inline-flex items-center justify-center transition-colors duration-fast"
                  >
                    <Icon.chevR className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* The black „დაჯავშნა ახლა უფასოა" callout that sat here is GONE
                (2026-07-31). It said „დაჯავშნა უფასოა" TWICE inside itself —
                headline and sub-line — and the card directly above it already
                carries „უფასო დაჯავშნა" in its footer. Three statements of one
                fact inside one column, in the heaviest treatment on the page. */}
          </div>
        </div>
      </Container>
    </section>
  )
}