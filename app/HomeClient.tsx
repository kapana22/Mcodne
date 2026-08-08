'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { SiteText } from '@/components/SiteTextProvider'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { useRouter } from 'next/navigation'
import { PAYMENTS_LIVE } from '@/lib/flags'
import { fmtRating } from '@/lib/fmt'
import { responseTimeLabelKa } from '@/lib/responseTime'
import { Reveal } from '@/components/Reveal'
import { CountUp } from '@/components/CountUp'
import { Footer } from '@/components/Footer'
import { PublicTopBar } from '@/components/PublicTopBar'
import { Icon, CatIcon } from '@/components/Icon'
import { useMe, type Me } from '@/lib/me'
import { ApplyCtaGate } from '@/components/ApplyCtaGate'
import { Container } from '@/components/Container'
import { Eyebrow } from '@/components/Eyebrow'
import { Illustration, IllustrationBand, hasIllustration, type IllustrationName } from '@/components/Illustration'
import { primaryServiceMin } from '@/components/booking/slots'
import { Avatar } from '@/components/Avatar'
import { GlyphBackdrop } from '@/components/home/GlyphBackdrop'
import { LineReveal } from '@/components/home/LineReveal'
import { WordReveal } from '@/components/home/WordReveal'
import { ExpertGrid, type GridExpert } from '@/components/home/ExpertGrid'
import { categoryMark, categoryIcon } from '@/lib/categoryMarks'


const VerifiedMark = ({ size = 16 }: { size?: number }) => (
  <span className="inline-flex items-center justify-center rounded-full bg-brand-600 text-white shrink-0" style={{ width: size, height: size }}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" width={size * 0.55} height={size * 0.55}><path d="m4 12 5 5L20 6" /></svg>
  </span>
)

/* ───── Categories (shared data) ───── */

// One brand treatment for every tile — the canon is the 3-color system, so no
// per-category rainbow hues (and no safelist-dependent dynamic classes).
// The grid is driven by the LIVE, admin-managed categories (GET /api/categories)
// so a hidden category drops out, a rename propagates, and a new one can surface
// — no code edit needed. This per-slug meta only supplies the icon + a short
// description (which aren't stored on the Category row); NAMES come from the DB.
// A default covers any slug without bespoke meta.
// The slug → mark/blurb map moved to lib/categoryMarks: it was ALSO defined,
// differently, in app/categories, so the same category wore two different
// glyphs depending on where you saw it. One source now.

// Fallback used ONLY for the SSR/first paint and if the categories fetch fails —
// so the home never renders an empty category section (SEO). Top-6 by demand;
// once the live fetch resolves, hidden/renamed categories self-correct.
type HomeCat = { slug: string; name: string }
const FALLBACK_CATS: HomeCat[] = [
  { slug: 'business',  name: 'ბიზნესი' },
  { slug: 'tax',       name: 'გადასახადები' },
  { slug: 'marketing', name: 'მარკეტინგი' },
  { slug: 'law',       name: 'სამართალი' },
  { slug: 'it',        name: 'IT და პროგრამირება' },
  { slug: 'career',    name: 'კარიერა' },
]

/* ───── Top nav ─────
   The home page renders the canonical <PublicTopBar /> (same as /tutors and
   every other public surface) — no bespoke inline header. The old inline nav
   with its category mega-menu was the one divergent public header; categories
   stay reachable via the „კატეგორიები“ item PublicTopBar now carries. */

/* ───── Shared footer ───── */
/* Local Footer removed — the home page now renders the shared
   components/Footer.tsx like every other public page, so the columns, honesty
   notes and bottom strip can never drift between surfaces again. (The old
   local copy also pointed „კატეგორიები“ at /tutors instead of /categories.) */

/* ═══════════════════════════════════════════════════════════════════ */
/* HOME VIEW                                                            */
/* ═══════════════════════════════════════════════════════════════════ */

// Shape used by HomeHero's preview cards.
type Expert = {
  id?: string
  /** Expert URL slug. Hrefs MUST use it: a cuid href 308s to the slug and the
      redirect downgrades the navigation to a full load, killing the photo
      view-transition. It was missing from this type entirely, so every
      `(featured as any).urlSlug` read undefined and the hero card has been
      linking by cuid. */
  urlSlug?: string | null
  name: string
  cat: string
  headline: string
  quote: string
  rate: number
  reviews: number
  sessions: number
  price: number
  durationMin: number
  // Real next open start (ISO) or null. Drives the SAME bookability gate the
  // /tutors card and the profile's StickyBookingCard use — a card must never
  // promise a booking the profile will immediately deny.
  nextSlotAt: string | null
  video: boolean
  verified: boolean
  // Credibility a brand-new (unrated) expert genuinely has. Real values only —
  // each renders solely when it exists.
  yearsExp?: number
  photo: string
}

// The old `next`/`online` fields (a formatted "დღეს 14:00" hint and a fake
// presence flag) are gone: the availability preview was removed from every card
// on 2026-07-21 and nothing rendered them since. `nextSlotAt` replaces them as
// a pure boolean gate — see isBookable below.
function isBookable(nextSlotAt: string | null): boolean {
  return nextSlotAt != null
}

// Map a TutorProfile row from /api/tutors → Expert shape used by hero cards.
function mapTutorToExpert(t: any): Expert {
  return {
    id: t.id,
    urlSlug: t?.slug ?? null,
    name: t?.user?.fullName ?? 'ექსპერტი',
    cat: t?.category?.name ?? t?.specialty ?? 'სფერო',
    headline: t?.headline ?? '',
    quote: (t?.bio ?? '').slice(0, 140),
    rate: typeof t?.rating === 'number' ? t.rating : 0,
    reviews: t?.reviewsCount ?? 0,
    sessions: t?.sessionsCount ?? 0,
    // Shared fallback — MUST match TUTOR_DEFAULTS.price (80) in the /tutors
    // surfaces so the same missing-price row never shows two different numbers.
    price: t?.price ?? 80,
    // The FLAGSHIP length, not the profile default. `consultationDurationMin`
    // is a fallback for experts with no tiers; using it directly printed
    // „30-წუთიანი სესია" on every card while the actual headline offer is the
    // one-hour consultation. primaryService = longest PAID tier (slots.ts) is
    // the single source every pre-tier surface already agrees on.
    durationMin: primaryServiceMin(
      Array.isArray(t?.consultations) ? t.consultations : [],
      t?.consultationDurationMin ?? 60,
    ),
    nextSlotAt: t?.nextSlotAt ?? null,
    video: Boolean(t?.videoUrl),
    verified: t?.verified ?? false,
    yearsExp: typeof t?.yearsExp === 'number' ? t.yearsExp : undefined,
    // Measured from Message history (never the self-declared responseHours,
    // which the API deliberately strips before a row reaches a public surface).
    // Fall back to the shared friendly default avatar (no unsplash stock photos —
    // a stock photo tied to a real name reads as a fake identity to crawlers and
    // undermines the "hand-picked" trust claim).
    photo: t?.user?.avatarUrl ?? DEFAULT_AVATAR,
  }
}

// Fisher-Yates. Used ONLY inside the client fetch callback below — see the
// hydration note there before moving this call anywhere near render.
// Preview rotation cadence. Short on purpose (the card is a taster, not
// reading material) — hover/focus pauses it, so it never moves under a hand.
const ROTATE_MS = 3000

function shuffled<T>(list: T[]): T[] {
  const out = list.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const HomeHero = () => {
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


const Categories = ({ initialCategories = [] }: { initialCategories?: HomeCat[] }) => {
  // Drive the grid from the live, admin-managed categories. Seed with the
  // fallback so SSR/first paint (and a failed fetch) still render the canonical
  // top-6 — the effect then replaces them with the DB set (hidden categories
  // drop out, renames propagate). Kept to 6 tiles so the 2×3 design is intact.
  // `initialCategories` is resolved SERVER-side (app/page.tsx) precisely so the
  // „ყველა სფერო" links below are in the HTML a crawler reads first. The
  // hardcoded FALLBACK_CATS only covers a DB blip.
  const [cats, setCats] = useState<HomeCat[]>(initialCategories.length ? initialCategories.slice(0, 6) : FALLBACK_CATS)
  const [allCats, setAllCats] = useState<HomeCat[]>(initialCategories.length ? initialCategories : FALLBACK_CATS)
  useEffect(() => {
    let cancelled = false
    fetch('/api/categories')
      .then(r => (r.ok ? r.json() : []))
      .then((rows: any[]) => {
        if (cancelled || !Array.isArray(rows) || rows.length === 0) return
        // Only categories that actually HAVE a visible expert. A tile that
        // leads to „ვერ ვიპოვეთ" is a dead end, and today 11 of 15 categories
        // are empty. If none are populated yet, fall through to the seeded
        // fallback rather than rendering an empty section.
        const populated = rows.filter(r => (r.expertCount ?? 0) > 0)
        if (populated.length === 0) return
        setCats(populated.map(r => ({ slug: r.slug, name: r.name })))
        // POPULATED ONLY — same predicate as the tiles (2026-08-02). This row
        // used to link every LIVE sphere on the SEO argument in the note below,
        // and the result was two rows on one screen contradicting each other:
        // the grid correctly showed spheres that have someone to book, and the
        // text row directly underneath it offered 7 more (career, product,
        // design, hr, real-estate, relocation, crypto — measured live) that all
        // land on „ამ სფეროში ჯერ არ არის ექსპერტი". A visitor whose field is
        // one of those learns we don't cover it AFTER a click, which is worse
        // than not seeing it. The SSR seed still carries every live sphere into
        // the first HTML (app/page.tsx has no counts to filter by), so the
        // crawl-depth argument keeps what it was actually worth.
        setAllCats(populated.map(r => ({ slug: r.slug, name: r.name })))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  // The six the grid renders, and whatever is left over. `cats` holds ALL
  // populated spheres (the grid slices to six), so the row's old
  // `allCats.length > cats.length` test compared a list against itself the
  // moment both were filtered the same way — and the row would have vanished
  // even when there WERE spheres the tiles couldn't fit. Compare against the
  // six actually on screen.
  const tileCats = cats.slice(0, 6)
  const untiledCats = allCats.filter(c => !tileCats.some(t => t.slug === c.slug))
  return (
    <section className="bg-white border-b border-ink-200">
      {/* Section padding trimmed 2026-07-31 (py-12/16/20 → py-10/12/16). Every
          seam on this page was a section's bottom padding plus the next one's
          top padding — 160px of nothing on desktop, measured as five dead bands
          of 150–210px down the page, each split by a single rule. Read at speed
          it looks like the content ran out. Boundaries are now ~128px: still
          generous, no longer a void. */}
      <Container className="py-10 sm:py-12 lg:py-16">
        <Reveal className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 mb-7 sm:mb-9">
          <div className="max-w-[640px]">
            <Eyebrow className="mb-3"><SiteText k="home.categories.eyebrow" /></Eyebrow>
            {/* One section-heading scale for the whole page (24/32/36). It sits
                a clear step under the hero h1 — before, three sections outran it. */}
            <h2 className="font-display text-h2 sm:text-display font-bold text-ink-900 tracking-[-0.02em] leading-[1.08]"><SiteText k="home.categories.title" /></h2>
            <p className="hidden sm:block mt-4 text-body-lg text-ink-600 leading-[1.55]"><SiteText k="home.categories.subtitle" /></p>
          </div>
          {/* Only 6 of the 14 live spheres fit the grid — say where the rest are
              instead of leaving the row looking like the whole catalogue.
              HIDDEN <sm (2026-08-02): at 390px this link and the h2 shared one
              flex row, so „ყველა სფერო" sat jammed against „აირჩიე შენი სფერო"
              at the heading's own baseline — two different things reading as one
              broken line. Nothing is lost by dropping it there: the „ყველა
              სფერო" nav directly below the tiles carries the same links, and on
              mobile it is one thumb-flick away rather than a corner tap. */}
          <Link href="/categories" className="hidden sm:inline-flex font-display text-small font-semibold text-brand-700 hover:text-brand-800 transition-colors duration-fast items-center h-11">
            ყველა სფერო
          </Link>
        </Reveal>
        {/* Tile = icon + name + one line. The two label strips that used to ride
            here are gone: „ხელით შერჩეული" repeated the hero's trust strip six
            times in one viewport, and the „ექსპერტების ნახვა" footer restated an
            affordance the whole-tile link already carries. Between them they cost
            ~45% of every tile's height and said nothing the user didn't know. */}
        <Reveal stagger className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3.5">
          {tileCats.map(c => {
            const meta = categoryMark(c.slug)
            return (
              /* flex-col until sm: at 390px the 2-up grid leaves a ~166px column,
                 and an icon sitting beside the text cut the text box to ~105px —
                 narrow enough that Georgian compounds („გადასახადები",
                 „მარკეტინგი") broke mid-word. Stacked, the name gets the full
                 column; from sm the row has the width to go horizontal. */
              /* → /categories/<slug>, NOT /tutors?category=<slug>. The filtered
                 listing canonicalises to /tutors, so every link into it dropped
                 its equity on the floor while the real, indexable landing page
                 got none. Same destination for the user, ranking value kept. */
              <Link key={c.slug} href={`/categories/${c.slug}`} className="group relative overflow-hidden rounded-card border border-ink-200 bg-white p-4 sm:p-5 shadow-xs hover:border-brand-200 hover-lift motion-safe:active:scale-[0.99] flex flex-col sm:flex-row items-start gap-2.5 sm:gap-3.5 text-left transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2">
                {/* Brand accent hairline — reveals on hover (matches /categories). */}
                <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-brand-500 transition-transform duration-mid ease-out-quart group-hover:scale-x-100" />
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-btn flex items-center justify-center shrink-0 bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-900/[0.04] shadow-xs transition-all duration-mid ease-out-quart group-hover:text-brand-700 motion-safe:group-hover:scale-110 motion-safe:group-active:scale-105">
                  {categoryIcon(c.slug, 'w-5 h-5 sm:w-6 sm:h-6')}
                </div>
                <div className="min-w-0">
                  <h3 className="font-display text-body-lg sm:text-h2 font-bold text-ink-900 leading-[1.15] tracking-tight transition-colors duration-fast group-hover:text-brand-700 break-words">{c.name}</h3>
                  <p className="mt-1 text-meta sm:text-small text-ink-600 leading-[1.4] line-clamp-2">{meta.description}</p>
                </div>
              </Link>
            )
          })}
        </Reveal>

        {/* Every sphere as plain text, under the six tiles.
            TWO reasons, and the second is the one that matters:
            · a visitor whose field isn't among the six populated tiles can still
              reach it in one click instead of concluding we don't cover it;
            · the home page linked only 4–6 category pages, so the other 9–11
              were reachable ONLY from /categories. Google draws sitelinks from
              what the home page points at, and it crawls what the home page
              points at FIRST — those pages were effectively second-class on
              their own site. findme.ge, the direct competitor, links 12 from its
              home page and has the sitelinks to show for it.
            Deliberately text, not more tiles: the 2×3 grid is a design decision
            (see the tile note above) and 15 tiles would bury the six that
            actually have someone to book.
            SCOPE (2026-08-02): populated spheres only — see the setAllCats note
            above. „ყველა" now means every sphere you can actually book in. */}
        {untiledCats.length > 0 && (
          <nav aria-label="ყველა სფერო" className="mt-6 sm:mt-8">
            <Eyebrow tone="muted" className="mb-2.5"><SiteText k="home.categories.allEyebrow" /></Eyebrow>
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {allCats.map(c => (
                <li key={c.slug}>
                  <Link
                    href={`/categories/${c.slug}`}
                    // min-h-[40px] below sm: these are real navigation links and
                    // a 20px-tall text line is half the minimum touch target.
                    className="text-small text-ink-600 hover:text-brand-700 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 rounded-sm inline-flex items-center min-h-[40px] sm:min-h-0"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </Container>
    </section>
  )
}

/* ───── Expert card ─────
   The COMPACT HORIZONTAL card /tutors ships (2026-07-27): a fixed square thumb
   on the left, content on the right, price + two actions on a bottom strip —
   ONE layout at every breakpoint. Deliberately MIRRORED, not imported:
   app/tutors/client.tsx's card also carries browse-only machinery (favourite
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
const FeaturedExperts = () => {
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
          cat: t?.category?.name ?? t?.specialty ?? '',
          headline: t?.headline ?? '',
          price: t?.price ?? 80,
          // The flagship tier, never `consultationDurationMin` — that default is
          // why every card used to read „30 წთ" against a one-hour offer.
          durationMin: primaryServiceMin(
            Array.isArray(t?.consultations) ? t.consultations : [],
            t?.consultationDurationMin ?? 60,
          ),
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
            aria-label="სფეროს ფილტრი"
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
              <Link href="/tutors" className="tap-shrink mt-4 inline-flex items-center gap-1.5 h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body tracking-wide transition-colors duration-fast">
                ყველა ექსპერტი
              </Link>
            </div>
          ) : (
            <ExpertGrid loading={all === null} experts={shown} />
          )}
        </div>

        <div className="mt-9 flex justify-center">
          <Link
            href={activeSphere ? `/tutors?cats=${encodeURIComponent(activeSphere.slug)}` : '/tutors'}
            className="h-12 px-6 rounded-btn bg-white border border-ink-200 hover:border-ink-300 hover:bg-ink-50 text-ink-900 font-display text-small font-semibold tracking-wide inline-flex items-center gap-2 transition-colors duration-fast"
          >
            {activeSphere ? `ყველა — ${activeSphere.name}` : <SiteText k="home.experts.allCta" />}
          </Link>
        </div>
      </Container>
    </section>
  )
}

/* ───── How it works (+ the „why" row, merged in 2026-07-27) ─────
   This used to be TWO full-height sections. „რატომ მცოდნე" restated, one
   section later, exactly what the hero's three quality anchors and step 03
   already said: hand-picked / transparent price / video session, plus a second
   copy of the payments note verbatim. Read end to end the page said the same
   three things three times and then asked you to become an expert.
   The four „why" cells first became a compact strip at the FOOT of this section
   — the detail under the steps rather than a competing heading — and were then
   removed outright 2026-08-08 (owner). The section is now the three steps and
   nothing else; see the note where the strip used to be for why its SiteText
   keys stay in the registry. */
/**
 * Do the three step drawings exist yet — ALL of them?
 *
 * All three or none, deliberately: two illustrated steps and one bare one reads
 * as a loading failure, not as a design. Module scope because the registry is a
 * build-time constant; nothing here changes at runtime.
 *
 * ⚠️ These are the ON-DARK variants. This band is `bg-ink-900` (#0F0E0A) and the
 * light-ground drawings were verified by screenshot to be nearly invisible on
 * it — thin dark-teal strokes on near-black. Do not point these at the light
 * files; they need their own art (see components/Illustration).
 */
const stepArt =
  hasIllustration('expertSearchOnDark') &&
  hasIllustration('bookingsOnDark') &&
  hasIllustration('videoSessionOnDark')

const HowItWorks = () => (
  /* THE PAGE'S ONE DARK BAND (2026-07-31).
     Everything above and below this is white or a warm off-white — hero, cards,
     questions, the „why" strip. Read end to end the page was one uninterrupted
     sheet, which is the real reason it felt flat: no contrast, no chapters, no
     place for the eye to rest. Motion cannot fix a static picture.
     One full-bleed dark section, in the middle, does three things at once: it
     splits the page into a before and an after, it lets the brand green finally
     read as a colour instead of an accent on white, and it costs no data. */
  <section id="how" className="relative overflow-hidden bg-ink-900 deep grain grain-dark text-white scroll-mt-24">
    {/* z-10: `.grain` paints through ::after ON TOP of the section, so anything
        that must stay crisp — all of it — has to sit above that layer. */}
    <Container className="relative z-10 py-10 sm:py-12 lg:py-16">
      <div className="grid lg:grid-cols-[1fr_1.6fr] gap-10 lg:gap-12 items-start">
        <Reveal>
          {/* brand-400, not the default brand-700: on ink-900 the dark green
              measures 2.84:1 — a label nobody can read. The light step is
              7.56:1 and is the same hue. Any Eyebrow that lands on the dark
              band needs this. */}
          <Eyebrow className="mb-3 !text-brand-400"><SiteText k="home.how.eyebrow" /></Eyebrow>
          {/* `whitespace-pre-line` replaces the hardcoded <br>: the line break
              is now whatever the admin types in the textarea, and the default
              carries the exact same two lines it always had. */}
          <h2 className="font-display text-h2 sm:text-display font-bold text-white tracking-[-0.02em] leading-[1.08] whitespace-pre-line">
            <SiteText k="home.how.title" />
          </h2>
          <p className="text-body-lg text-white/70 mt-5 max-w-[400px] leading-relaxed"><SiteText k="home.how.subtitle" /></p>
          {/* The CTA now points at the primary path. „დაწყება" → /signup asked a
              first-time visitor to open an account before they had seen a single
              expert, and it was the one place on the page where the secondary
              path outranked „find an expert". Signing up still happens — it is
              the first thing the booking flow asks for, in context. */}
          <Link href="/tutors" className="mt-7 h-12 px-6 rounded-btn bg-white hover:bg-white/90 text-ink-900 font-display font-semibold text-small tracking-wide inline-flex items-center gap-2 transition-colors duration-fast">
            <SiteText k="home.how.cta" />
          </Link>
        </Reveal>
        <Reveal stagger className="space-y-3">
          {([
            { n: '01', t: 'აირჩიე ექსპერტი', d: 'გადახედე პროფილებს, შეფასებებს და ვიდეოგაცნობას.', tk: 'home.how.step1.title', dk: 'home.how.step1.desc', art: 'expertSearchOnDark' },
            { n: '02', t: 'აირჩიე სერვისი და დრო', d: 'აირჩიე სერვისი და დრო კალენდრიდან — ექსპერტი ადასტურებს.', tk: 'home.how.step2.title', dk: 'home.how.step2.desc', art: 'bookingsOnDark' },
            // Step 03 must describe something the visitor DOES. „უსაფრთხო
            // გადახდები · მალე" described a feature that doesn't exist yet — a
            // step you cannot take. Until payments are live the third step is
            // the session itself, which is the actual next thing that happens.
            //
            // Only the LIVE branch carries SiteText keys. The payments version
            // is unreachable copy today, and an admin field that edits a string
            // nobody can see is a dead control — it gets keys the day
            // PAYMENTS_LIVE flips.
            PAYMENTS_LIVE
              ? { n: '03', t: 'დაცული გადახდა', d: 'თანხა დაცულია — ექსპერტს სესიის შემდეგ გადაერიცხება.' }
              : { n: '03', t: 'შეხვდი ვიდეოზე', d: 'დანიშნულ დროს ბმულით შეხვალ — დაჯავშნა ახლა უფასოა.', tk: 'home.how.step3.title', dk: 'home.how.step3.desc', art: 'videoSessionOnDark' },
          ] as { n: string; t: string; d: string; tk?: string; dk?: string; art?: IllustrationName }[]).map((s, i) => (
            /* No card. On a dark ground a white panel is a hole, not a card —
               the steps are ruled rows instead, and the numeral does the work a
               border used to. */
            <div key={i} className="border-t border-white/15 py-5 sm:py-6 grid grid-cols-[64px_1fr] sm:grid-cols-[110px_1fr] gap-4 sm:gap-6 items-baseline">
              <div className="font-display text-display sm:text-display-xl font-bold text-brand-400 tabular-nums tracking-[-0.03em] leading-[0.85]">{s.n}</div>
              <div className={stepArt ? 'flex items-center gap-4 sm:gap-6' : undefined}>
                <div className="min-w-0">
                  <h3 className="font-display text-h3 sm:text-h2 font-bold text-white mb-1.5 tracking-tight leading-tight">{s.tk ? <SiteText k={s.tk} /> : s.t}</h3>
                  <p className="text-body text-white/65 leading-relaxed">{s.dk ? <SiteText k={s.dk} /> : s.d}</p>
                </div>
                {/* ALL THREE or none — see `stepArt` above. Below sm the row is
                    already tight against a 64px numeral, so the art is desktop
                    only rather than squeezing a phone to three columns. */}
                {stepArt && s.art && (
                  <div className="hidden sm:block shrink-0 ml-auto">
                    <Illustration name={s.art} size="step" alt="" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </Reveal>
      </div>

      {/* The three-cell „რას გთავაზობთ?" strip that used to close this section
          was REMOVED 2026-08-08 (owner). Its seven SiteText keys —
          `home.includes.eyebrow` and `home.why.card1–3.title/body` — are marked
          `retired: true` in lib/siteTextDefs rather than deleted: the keys must
          survive (production rows hold the owner's hand-written copy under those
          exact strings) but the admin fields must not, or they would edit a
          void. Render this strip again and the stored text comes back with it. */}
    </Container>
  </section>
)

/* Testimonials removed (Phase 0.2): the previous section showed invented
   people with i.pravatar.cc stock faces and fabricated outcomes. It returns
   only when real outcome-story reviews accumulate (role-attributed, quantified
   quotes pulled from the Reviews system) — never seeded. */

/* ───── „გახდი ექსპერტი" ─────
   The page's SECONDARY path, and it now looks like one. It used to close the
   home with a lg:py-24 band, a bespoke pill-in-a-pill badge, three big cards
   with 40px numerals, and two buttons that both went to /apply — more visual
   weight than the expert row it follows, for the smaller audience. Same copy,
   same honesty branches, a third of the height. */
/* `border-b`, NOT `border-y`. The section immediately above (#how) already ends
   in `border-b border-ink-200`, so a top border here landed a second 1px rule on
   the exact same y — two hairlines stacked, in slightly different tints because
   the backgrounds differ (bg-ink-50 vs bg-ink-50/50). It read as one thick,
   smudged, misaligned divider.
   Rule for this page: a section owns its BOTTOM edge only — EXCEPT this one,
   the last before the footer, which now owns neither: the footer draws its own
   full-bleed hairline, so the two sat 80px apart with nothing between them.
   That pair is the „two lines above the footer" you can see from across the
   room. The footer's rule is canonical — it is on every page, including those
   that do not end in a bordered section.
   (A `{/* … *\/}` here is a SYNTAX error — a JSX comment cannot be the first
   thing inside an arrow function's parenthesised return. Keep it a /* *\/ block
   above the arrow.) */
const ExpertCta = () => (
  <section className="relative bg-ink-50/50 grain">
    <Container className="relative z-10 py-10 sm:py-12 lg:py-16">
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8 lg:gap-12 items-center">
        <Reveal>
          {/* Canon section-header pattern (eyebrow + heading), replacing the
              bespoke badge — whose „ხელით მოდერაცია" tail also repeated the
              „ყოველი ჯავშანი მოიცავს" cell directly above this section. */}
          <Eyebrow className="mb-3"><SiteText k="home.expertCta.eyebrow" /></Eyebrow>
          <h2 className="font-display text-h2 sm:text-display font-bold leading-[1.08] tracking-[-0.02em] text-ink-900">
            <SiteText k="home.expertCta.title" /><br />
            <span className="text-brand-600">{PAYMENTS_LIVE ? 'გასამრჯელო — სესიის შემდეგ.' : 'სრული თანხა შენია.'}</span>
          </h2>
          <p className="text-body-lg text-ink-700 mt-5 max-w-[520px] leading-relaxed">
            {/* The commission clause was removed 2026-08-05 (owner) — with it
                went the PAYMENTS_LIVE branch and the COMMISSION_PCT template,
                which is exactly why this paragraph is editable now. */}
            <SiteText k="home.expertCta.body" />
          </p>
          {/* One CTA. The „როგორ მუშაობს" button next to it pointed at /apply
              too — the same destination twice reads as a choice and isn't one. */}
          <Link href="/apply" className="tap-shrink mt-7 h-12 px-6 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body-lg tracking-wide inline-flex items-center gap-2 transition-colors duration-fast">
            <SiteText k="home.expertCta.cta" />
          </Link>
        </Reveal>
        {/* One hairline lattice instead of three shadowed cards — the same three
            facts, read as one object. Single-block reveal: the gap-px /
            overflow-hidden lattice would clip per-cell staggered motion. */}
        <Reveal delay={120} className="grid grid-cols-1 gap-px bg-ink-200 border border-ink-200 rounded-card overflow-hidden">
          {visible => (
            (PAYMENTS_LIVE
              // No percentage in EITHER branch (2026-08-05): the payout share
              // states the commission by subtraction (85% ⇒ 15%), which is the
              // very thing this section no longer advertises.
              ? [
                  { n: null as number | null, txt: 'მალე', l: 'გასამრჯელო', s: 'სესიის დასრულების შემდეგ' },
                  { n: null as number | null, txt: 'შენ', l: 'ადგენ ფასს', s: 'დროსა და თემას' },
                  { n: null as number | null, txt: '60', l: 'წუთი სესია', s: 'ხანგრძლივობასა და ფასს შენ ადგენ' },
                ]
              // Flag off = no charge and no deduction today. The commission
              // figure was removed from this cell 2026-08-05 (owner): the
              // sub-line said what WILL be withheld, which is a promise the
              // marketing surfaces no longer make. /terms still states it.
              : [
                  { n: null as number | null, txt: '0%', l: 'საკომისიო დღეს', s: 'ახლა არაფერს ვიკავებთ' },
                  { n: null as number | null, txt: '100%', l: 'შენი ნაწილი', s: 'სრული თანხა შენია' },
                  // Was „მალე / შემოსავალი" — a stat cell whose figure is the
                  // word „soon". A number slot holding roadmap status is the
                  // emptiest thing on the page; this states what the expert
                  // actually controls today.
                  { n: null as number | null, txt: '60', l: 'წუთი სესია', s: 'ხანგრძლივობასა და ფასს შენ ადგენ' },
                ]
            ).map((s, i) => (
              <div key={i} className="bg-white px-5 py-4 flex items-baseline gap-4">
                <div className="font-display text-h1 font-bold text-brand-600 tabular-nums tracking-tight leading-none shrink-0 min-w-[68px]">
                  {/* Static number until scroll-enter (SSR/crawlers always see
                      the real value — never a fake 0%), then CountUp 0→n. */}
                  {s.n !== null
                    ? (visible ? <CountUp value={s.n} from={0} duration={900} suffix="%" /> : <span className="tabular-nums">{s.n}%</span>)
                    : s.txt}
                </div>
                <div className="min-w-0">
                  <Eyebrow>{s.l}</Eyebrow>
                  <div className="text-meta text-ink-600 mt-1 leading-snug">{s.s}</div>
                </div>
              </div>
            ))
          )}
        </Reveal>
      </div>
    </Container>
  </section>
)

/* ───── The page's closing image ─────
   Full-bleed, no copy, no CTA: the drawing's own left→right story — questions
   and half-written notes resolving into a booked video consultation — is the
   whole product in one picture, which is why it closes the page rather than
   explaining any one section.

   Placement is the owner's call (2026-08-08): it shipped above „როგორ მუშაობს"
   first and was moved here, under „გააზიარე შენი ცოდნა". Note the one hard
   constraint if it ever moves again — it CANNOT go inside `#how`; that band is
   bg-ink-900 and this art is thin dark-teal line work, verified by screenshot
   to be nearly invisible there.

   `bg-ink-75` is not a guess: the artwork was colour-shifted at export so its
   paper measures #F8F6F2 exactly, which is why the empty left half reads as the
   drawing's own paper continuing rather than as a background behind an image.
   Change this class and the band grows a vertical seam — see the PAPER note in
   components/Illustration. No border either side: the footer below draws its
   own full-bleed hairline, and the tone step above IS the divider.

   OUTSIDE `<ApplyCtaGate>` deliberately — an existing expert doesn't see the
   „გახდი ექსპერტი" section, but the page still needs something between the
   dark band and the footer. */
const JourneyBand = () => (
  <section className="bg-ink-75">
    <IllustrationBand name="consultationJourney" />
  </section>
)

const HomeView = ({ initialCategories = [] }: { initialCategories?: HomeCat[] }) => (
  <>
    <HomeHero />
    <Categories initialCategories={initialCategories} />
    <FeaturedExperts />
    {/* „როგორ მუშაობს" now also carries the former „რატომ მცოდნე" cells —
        see the note above HowItWorks for why those two sections merged. */}
    <HowItWorks />
    {/* „გახდი ექსპერტი“ section is meaningless for an existing expert/admin. */}
    <ApplyCtaGate><ExpertCta /></ApplyCtaGate>
    <JourneyBand />
  </>
)

/* ═══════════════════════════════════════════════════════════════════ */
/* PAGE                                                                 */
/* ═══════════════════════════════════════════════════════════════════ */

export default function Landing({ initialCategories = [], initialUser }: { initialCategories?: HomeCat[]; initialUser?: Me | null }) {
  return (
    <div className="font-sans bg-white text-ink-900 antialiased">
      {/* initialUser is server-resolved (app/page.tsx). Without it the header
          fell back to the client probe, and for a signed-in TUTOR that meant
          „გახდი ექსპერტი" rendered, then vanished a beat later once /api/me
          landed — the header visibly rearranging on the busiest page on the
          site. Free to fix: this page is already force-dynamic. */}
      <PublicTopBar initialUser={initialUser} />
      {/* main landmark — the skip link and SR navigation need it; home was
          the one page without it. */}
      <main id="main"><HomeView initialCategories={initialCategories} /></main>
      <Footer />
    </div>
  )
}


