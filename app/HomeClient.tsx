'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { SiteText } from '@/components/SiteTextProvider'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { useRouter } from 'next/navigation'
import { PAYMENTS_LIVE, COMMISSION_PCT, TUTOR_PAYOUT_PCT } from '@/lib/flags'
import { fmtRating } from '@/lib/fmt'
import { RecentTutorsStrip } from '@/components/RecentTutorsStrip'
import { Reveal } from '@/components/Reveal'
import { CountUp } from '@/components/CountUp'
import { Footer } from '@/components/Footer'
import { PublicTopBar } from '@/components/PublicTopBar'
import { Icon, CatIcon } from '@/components/Icon'
import { useMe } from '@/lib/me'
import { ApplyCtaGate, AnonOnly } from '@/components/ApplyCtaGate'
import { Container } from '@/components/Container'
import { Eyebrow } from '@/components/Eyebrow'


const VerifiedMark = ({ size = 16 }: { size?: number }) => (
  <span className="inline-flex items-center justify-center rounded-full bg-brand-500 text-white shrink-0" style={{ width: size, height: size }}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" width={size * 0.55} height={size * 0.55}><path d="m4 12 5 5L20 6" /></svg>
  </span>
)

/* ───── Categories (shared data) ───── */

// One brand treatment for every tile — the canon is the 3-color system, so no
// per-category rainbow hues (and no safelist-dependent dynamic classes).
// Top-6 by demand (beachhead research): tax/accounting, business, marketing,
// law/setup, IT, career/mentorship — the spheres a 1-hour paid consultation
// most concretely solves. The full 14 live in the /tutors filter.
const categories = [
  { l: 'ბიზნესი',     d: 'სტრატეგია, სტარტაპი',     i: CatIcon.business,   c: 32, slug: 'business' },
  { l: 'გადასახადები', d: 'ინდ. მეწარმე, დღგ, 1%',   i: CatIcon.tax,        c: 26, slug: 'tax' },
  { l: 'მარკეტინგი',  d: 'ბრენდი, რეკლამა, SMM',    i: CatIcon.marketing,  c: 21, slug: 'marketing' },
  { l: 'სამართალი',   d: 'კონტრაქტი, რეგისტრაცია',  i: CatIcon.law,        c: 12, slug: 'law' },
  { l: 'IT',          d: 'დეველოპმენტი, კარიერა',   i: CatIcon.it,         c: 24, slug: 'it' },
  { l: 'კარიერა',     d: 'CV, ინტერვიუ, მენტორობა', i: CatIcon.career,     c: 19, slug: 'career' },
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

// Shape used by HomeHero + FeaturedExperts + ExpertCard.
type Expert = {
  id?: string
  name: string
  cat: string
  headline: string
  quote: string
  rate: number
  reviews: number
  sessions: number
  price: number
  durationMin: number
  next: string
  online: boolean
  video: boolean
  verified: boolean
  photo: string
}

// Compact Georgian label for the next free slot — must tell the same truth as
// the /tutors card ("დღეს" / "ხვალ" / weekday). A static placeholder here used
// to over-promise relative to the detail page.
const KA_DAYS_SHORT = ['კვ.', 'ორშ.', 'სამშ.', 'ოთხ.', 'ხუთ.', 'პარ.', 'შაბ.']
function fmtNextShort(iso: string | null | undefined): string {
  if (!iso) return 'გამოცხადდება მალე'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'გამოცხადდება მალე'
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((that.getTime() - today.getTime()) / 86_400_000)
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (diffDays <= 0) return `დღეს ${hm}`
  if (diffDays === 1) return `ხვალ ${hm}`
  return `${KA_DAYS_SHORT[d.getDay()]} ${d.getDate()}, ${hm}`
}

// Map a TutorProfile row from /api/tutors → Expert shape used by hero cards.
function mapTutorToExpert(t: any): Expert {
  return {
    id: t.id,
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
    durationMin: t?.consultationDurationMin ?? 30,
    next: fmtNextShort(t?.nextSlotAt),
    online: false,
    video: Boolean(t?.videoUrl),
    verified: t?.verified ?? false,
    // Fall back to the shared friendly default avatar (no unsplash stock photos —
    // a stock photo tied to a real name reads as a fake identity to crawlers and
    // undermines the "hand-picked" trust claim).
    photo: t?.user?.avatarUrl ?? DEFAULT_AVATAR,
  }
}

const HomeHero = () => {
  const router = useRouter()
  const [query, setQuery] = useState('')
  // Span the spheres we actually serve (business/career/law/psychology/…),
  // not just VC/tech — a startup-only list bounces the broader audience.
  const quickTopics = ['ბიზნეს-სტრატეგია', 'კარიერა და CV', 'იურიდიული საკითხი', 'ფსიქოლოგიური მხარდაჭერა']
  // Real featured tutors — replaces the previous hardcoded fixture that leaked
  // "გიორგი მელაძე" and other fake names to SSR HTML (crawler / social preview
  // saw them as real tutors). Starts empty so first paint has no fake identities.
  const [experts, setExperts] = useState<Expert[]>([])
  // Distinguishes "still loading" from "loaded, but the marketplace is empty".
  // Without it, a truly-empty catalog (or one with <4 experts) leaves the hero
  // preview + avatar stack pulsing as skeletons FOREVER on a cold start.
  const [loaded, setLoaded] = useState(false)
  const [stats, setStats] = useState<{ total: number; avg: number } | null>(null)
  useEffect(() => {
    let cancelled = false
    // Top experts anchor the hero preview card. We deliberately do NOT gate on
    // `featured` — if nothing is editorially featured the hero must still show a
    // real, strong expert (otherwise it renders an empty skeleton forever).
    fetch('/api/tutors?limit=8')
      .then(r => (r.ok ? r.json() : []))
      .then((rows: any[]) => {
        if (cancelled || !Array.isArray(rows)) return
        setExperts(rows.map(mapTutorToExpert))
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
  const featured = experts[0]
  const sidekicks = experts.slice(1, 5)

  return (
    <section className="relative bg-white overflow-hidden border-b border-ink-200">
      {/* Restrained backdrop — barely-there brand tint, premium/clean.
          Radial glow washes (NOT blur filters — Safari renders those as a
          hard-edged square) drifting on a very slow aurora cycle. */}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-brand-50/12 via-white to-white pointer-events-none" />
      <div aria-hidden className="glow-brand aurora-a absolute -top-64 -right-48 w-[620px] h-[620px] opacity-60 pointer-events-none" />

      <Container className="relative pt-8 sm:pt-14 lg:pt-20 pb-12 sm:pb-16 lg:pb-24">
        {/* Trust strip — clean, single line */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-6 sm:mb-10 lg:mb-12">
          <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-500">
            <Icon.shieldCheck className="w-3.5 h-3.5 text-ink-400" />
            <span>ხელით შერჩეული ბაზა · ინდივიდუალურად შემოწმებული</span>
          </span>
        </div>

        <div className="grid lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-16 xl:gap-20 items-start">
          {/* Left — headline + search + stats */}
          <div className="min-w-0">
            <h1 className="font-display font-bold text-ink-900 leading-[1.02] sm:leading-[0.96] tracking-[-0.03em] text-[34px] sm:text-[58px] lg:text-[72px] motion-safe:animate-rise-in">
              <SiteText k="home.hero.line1" /><br />
              {/* The one gradient-signature moment on this page. */}
              <span className="bg-gradient-signature bg-clip-text text-transparent"><SiteText k="home.hero.line2" /></span>
            </h1>
            <p className="mt-7 sm:mt-8 text-[16px] sm:text-[17.5px] text-ink-700 max-w-[540px] leading-[1.6] motion-safe:animate-rise-in" style={{ animationDelay: '80ms' }}>
              <SiteText k="home.hero.subtitle" /> <span className="font-display font-semibold text-ink-900"><SiteText k="home.hero.subtitleEmphasis" /></span>
            </p>

            {/* Search bar */}
            <div className="mt-9 sm:mt-10 motion-safe:animate-rise-in" style={{ animationDelay: '160ms' }}>
              {/* Label/destination agreement (1.5): the button says „ექსპერტის
                  ძიება", so the form goes to /tutors?q=…. /ask stays reachable
                  via the secondary „დასვი კითხვა“ link below. */}
              <form onSubmit={e => { e.preventDefault(); router.push(query ? `/tutors?q=${encodeURIComponent(query)}` : '/tutors') }} className="rounded-card bg-white border border-ink-200 shadow-card p-2 flex flex-col sm:flex-row gap-2 focus-within:border-brand-400 focus-within:shadow-brand-glow transition-[box-shadow,border-color] duration-mid">
                <div className="relative flex-1">
                  <Icon.search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                  <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="რა გჭირდება? მაგ. გადასახადი, კარიერული ნაბიჯი, იურიდიული რჩევა"
                    className="w-full h-12 pl-11 pr-3 bg-transparent text-[15px] text-ink-900 placeholder:text-ink-400 focus:outline-none"
                  />
                </div>
                <button type="submit" className="btn-sheen h-12 px-6 rounded-btn bg-gradient-cta hover:brightness-105 text-white font-display font-semibold text-[14px] tracking-wide inline-flex items-center justify-center gap-2 shadow-brand-glow hover:shadow-[0_10px_32px_rgba(47,156,134,0.4)] transition-all duration-fast">
                  ექსპერტის ძიება
                </button>
              </form>
              <div className="mt-4 flex items-center gap-1.5 flex-wrap">
                <span className="text-[12px] text-ink-500 mr-1">პოპულარული:</span>
                {quickTopics.map(t => (
                  <Link key={t} href={`/ask?q=${encodeURIComponent(t)}`} className="h-7 px-2.5 rounded-pill bg-white/60 border border-ink-200 hover:bg-white hover:border-ink-300 text-[12px] font-display font-medium text-ink-700 transition-colors inline-flex items-center">
                    {t}
                  </Link>
                ))}
              </div>
              <div className="mt-3 text-[12px] text-ink-500">
                ან{' '}
                <Link href={query ? `/ask?q=${encodeURIComponent(query)}` : '/ask'} className="font-display font-semibold text-brand-700 hover:underline">
                  დასვი კითხვა
                </Link>
                {' '}— და ექსპერტები გიპასუხებენ
              </div>
            </div>

            {/* Quality anchors — honest framing, no fabricated stats. On
                mobile: one compact 3-up row (labels only) instead of three
                stacked rows — saves most of a screen of hero scroll. */}
            <div className="mt-8 sm:mt-12 lg:mt-14 pt-6 sm:pt-8 border-t border-ink-200 grid grid-cols-3 gap-3 sm:gap-8 max-w-[540px] motion-safe:stagger">
              {[
                { l: 'ხელით შერჩეული', d: 'ყოველი ექსპერტი ინდივიდუალურად შემოწმებული' },
                { l: 'გამჭვირვალე ფასი', d: 'ერთი ნათელი განაკვეთი — გადაიხდი მხოლოდ დაჯავშნისას' },
                { l: 'ვიდეოსესია', d: 'HD ვიდეო-ოთახი, ჩატი, ფაილები' },
              ].map(s => (
                <div key={s.l}>
                  <div className="font-display text-[12px] sm:text-[13px] font-bold text-ink-900 tracking-tight leading-snug">{s.l}</div>
                  <div className="mt-1.5 text-[11.5px] text-ink-500 leading-snug hidden sm:block">{s.d}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — product preview: a live, premium expert booking card that
              shows the actual product (Topmate / Intro pattern). Desktop-only:
              on mobile the REAL expert cards of FeaturedExperts are one scroll
              away, and this preview cost ~2.5 screens of duplicate content. */}
          <div className="relative motion-safe:animate-scale-in hidden lg:block" style={{ animationDelay: '240ms' }}>
            {/* Depth: a soft secondary card peeking behind the main one. */}
            <div aria-hidden className="absolute -top-3 left-6 right-6 h-24 rounded-card bg-white border border-ink-100 shadow-sm -z-10 hidden sm:block" />

            {/* Floating live-availability pill — real aggregate, never faked. */}
            <div className="flex justify-center mb-4">
              <span className="inline-flex items-center gap-2 h-8 pl-3 pr-3.5 rounded-pill bg-white border border-ink-200 shadow-pop">
                <Icon.shieldCheck className="w-3.5 h-3.5 text-brand-600" />
                <span className="font-display text-[12px] font-semibold text-ink-800 tracking-tight tabular-nums">
                  {stats ? `${stats.total} გადამოწმებული ექსპერტი` : 'ხელით შერჩეული ბაზა'}
                </span>
              </span>
            </div>

            {featured ? (
              <article className="relative rounded-card bg-white border border-ink-200 shadow-float hover-lift overflow-hidden">
                {/* Identity */}
                <div className="p-5 sm:p-6 flex items-start gap-4">
                  <div className="relative shrink-0">
                    <img src={featured.photo} alt="" className="w-16 h-16 rounded-full object-cover ring-2 ring-white shadow-card" />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-display text-[18px] font-bold text-ink-900 tracking-tight truncate">{featured.name}</span>
                      {featured.verified && <VerifiedMark size={16} />}
                    </div>
                    {featured.headline && (
                      <div className="mt-1 inline-flex items-center gap-1.5 h-5 px-2 rounded-pill bg-ink-75 text-ink-700 border border-ink-200 font-display text-[11px] font-semibold tracking-tight max-w-full truncate">
                        {featured.headline}
                      </div>
                    )}
                    <div className="mt-1.5 text-[12px] text-ink-500 truncate">{featured.cat}</div>
                  </div>
                </div>

                {/* Trust stats row */}
                <div className="px-5 sm:px-6 pb-4 flex items-center gap-3 text-[12px] flex-wrap">
                  <span className="inline-flex items-center gap-1 text-ink-800">
                    <Icon.star className="w-3.5 h-3.5 text-warning-500" />
                    <span className="font-display font-bold tabular-nums">{fmtRating(featured.rate)}</span>
                    <span className="text-ink-400 tabular-nums">({featured.reviews})</span>
                  </span>
                  <span className="w-px h-3.5 bg-ink-200" />
                  <span className="inline-flex items-center gap-1 text-ink-600">
                    <span className="font-display font-semibold text-ink-800 tabular-nums">{featured.sessions}</span> სესია
                  </span>
                </div>

                {/* Price + CTA */}
                <div className="p-5 sm:p-6 pt-4 flex items-center justify-between gap-3">
                  <div>
                    {/* Flat expert-set price for the whole session — "/ N წთ"
                        read like a per-minute rate. */}
                    <span className="font-display text-[24px] font-bold text-ink-900 tabular-nums tracking-tight leading-none">₾{featured.price}</span>
                    <span className="text-[12px] font-medium text-ink-500 ml-1">· {featured.durationMin}-წუთიანი სესია</span>
                  </div>
                  {/* ?rebook=1 opens the booking modal on arrival, so the CTA
                      label is honest — it books, not just views. */}
                  <Link href={featured.id ? `/tutors/${featured.id}?rebook=1` : '/tutors'} className="btn-sheen shrink-0 h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white font-display font-semibold text-[13.5px] tracking-wide inline-flex items-center gap-1.5 shadow-brand-glow hover:shadow-[0_10px_32px_rgba(47,156,134,0.36)] motion-safe:active:scale-[0.97] transition-all duration-fast">
                    დაჯავშნე
                  </Link>
                </div>

                {/* Trust footer */}
                <div className="border-t border-ink-100 px-5 sm:px-6 py-3 flex items-center gap-4 text-[11px] text-ink-600">
                  <span className="inline-flex items-center gap-1.5">
                    <Icon.shieldCheck className="w-3.5 h-3.5 text-brand-600" /> {PAYMENTS_LIVE ? 'დაცული გადახდა' : 'უსაფრთხო გადახდები · მალე'}
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
                  <div className="w-16 h-16 rounded-full bg-ink-100 animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-4 w-32 bg-ink-100 rounded animate-pulse" />
                    <div className="h-4 w-24 bg-ink-100 rounded-pill animate-pulse" />
                    <div className="h-3 w-20 bg-ink-100 rounded animate-pulse" />
                  </div>
                </div>
                <div className="px-6 pb-6 flex items-center justify-between">
                  <div className="h-6 w-16 bg-ink-100 rounded animate-pulse" />
                  <div className="h-11 w-28 bg-ink-100 rounded-btn animate-pulse" />
                </div>
              </article>
            ) : null}

            {/* Avatar stack + see-all */}
            <div className="mt-5 flex items-center gap-3.5">
              {/* Fans slightly apart on hover — a small "these are people" delight. */}
              {(sidekicks.length > 0 || !loaded) && (
                <div className="flex -space-x-2.5 hover:-space-x-1 [&>*]:transition-[margin] [&>*]:duration-300">
                  {sidekicks.length > 0 ? sidekicks.map((e, i) => (
                    <div key={i} className="relative">
                      <img src={e.photo} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-white" />
                    </div>
                  )) : [0, 1, 2].map(i => (
                    <div key={i} className="w-9 h-9 rounded-full bg-ink-100 ring-2 ring-white animate-pulse" />
                  ))}
                  <div className="w-9 h-9 rounded-full bg-ink-100 ring-2 ring-white inline-flex items-center justify-center font-display text-[10.5px] font-bold text-ink-700">+</div>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="font-display text-[13px] font-semibold text-ink-900 tracking-tight">
                  {stats ? `${fmtRating(stats.avg)}★ საშუალო · ${stats.total} ექსპერტი` : 'გადახედე მთელ ბაზას'}
                </div>
                <Link href="/tutors" className="mt-0.5 inline-flex items-center gap-1 font-display text-[11.5px] font-semibold text-brand-700 hover:text-brand-800 transition-colors">
                  ყველა ექსპერტი
                </Link>
              </div>
            </div>

            {/* Trust callout — whole card is the link (no arrow affordance). */}
            <Link href="/tutors" className="mt-5 rounded-card bg-accent-950 text-white p-5 flex items-center gap-4 hover:bg-ink-800 transition-colors">
              <div className="w-11 h-11 rounded-card bg-brand-500 inline-flex items-center justify-center shrink-0">
                <Icon.shieldCheck className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-[14px] font-bold tracking-tight">გადახდა მხოლოდ დაჯავშნისას</div>
                <div className="text-[12px] text-white/70 mt-1 leading-snug">ერთი ნათელი ფასი · ვიდეობმული დადასტურებისთანავე.</div>
              </div>
            </Link>
          </div>
        </div>
      </Container>
    </section>
  )
}


const Categories = () => (
  <section className="bg-white border-b border-ink-200">
    <Container className="py-10 sm:py-16 lg:py-20">
      <Reveal className="flex flex-wrap items-end justify-between gap-4 mb-8 sm:mb-10">
        <div className="max-w-[640px]">
          <Eyebrow className="mb-3">კატეგორიები</Eyebrow>
          <h2 className="font-display text-[30px] sm:text-[40px] font-bold text-ink-900 tracking-[-0.02em] leading-[1.05]">აირჩიე სფერო, რომელშიც გჭირდება ცოდნა</h2>
          <p className="hidden sm:block mt-4 text-[14.5px] text-ink-600 leading-[1.55]">ხელით შერჩეული ექსპერტები 6 სფეროში — გადახედე, შეადარე და დაჯავშნე ვიდეოსესია.</p>
        </div>
      </Reveal>
      <Reveal stagger className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4">
        {categories.map(c => (
          <Link key={c.l} href={`/tutors?category=${c.slug}`} className="group relative overflow-hidden rounded-card border border-ink-200 bg-white p-4 sm:p-6 shadow-xs hover:border-brand-200 hover-lift motion-safe:active:scale-[0.99] flex flex-col text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2">
            {/* Brand accent hairline — reveals on hover (matches /categories). */}
            <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-brand-500 transition-transform duration-300 ease-out group-hover:scale-x-100" />
            <div className="flex items-start justify-between gap-3">
              <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-btn flex items-center justify-center shrink-0 bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-900/[0.04] shadow-xs transition-all duration-300 ease-out group-hover:text-brand-700 motion-safe:group-hover:scale-110 motion-safe:group-hover:-rotate-3 motion-safe:group-active:scale-105 motion-safe:group-active:-rotate-2">
                {React.cloneElement(c.i, { className: 'w-5 h-5 sm:w-7 sm:h-7' })}
              </div>
              <span className="font-display text-[10px] sm:text-[10.5px] font-semibold uppercase tracking-[0.14em] sm:tracking-[0.16em] text-ink-400 whitespace-nowrap pt-1">
                <span className="hidden sm:inline">ხელით შერჩეული</span>
              </span>
            </div>
            <h3 className="mt-4 sm:mt-6 font-display text-[18px] sm:text-[26px] font-bold text-ink-900 leading-[1.1] tracking-tight transition-colors group-hover:text-brand-700">{c.l}</h3>
            <p className="mt-1 sm:mt-1.5 text-[12px] sm:text-[13px] text-ink-600 leading-[1.45] line-clamp-2">{c.d}</p>
            <div className="mt-auto pt-4 sm:pt-5 border-t border-ink-100 flex items-center justify-between">
              <span className="font-display text-[10px] sm:text-[11.5px] font-semibold uppercase tracking-[0.14em] sm:tracking-[0.16em] text-ink-500 group-hover:text-brand-700 transition-colors">
                <span className="sm:hidden">ნახე</span>
                <span className="hidden sm:inline">ექსპერტების ნახვა</span>
              </span>
            </div>
          </Link>
        ))}
      </Reveal>
    </Container>
  </section>
)

const ExpertCard = ({ e }: { e: Expert }) => (
  <article className="group relative rounded-card border border-ink-200 bg-white hover:border-ink-300 hover-lift overflow-hidden flex flex-col">
    {/* Mobile photo banner */}
    <div className="sm:hidden relative aspect-[16/10] w-full bg-gradient-to-br from-brand-50 to-ink-100 overflow-hidden">
      <img src={e.photo} alt={e.name} loading="lazy" className="absolute inset-0 w-full h-full object-cover motion-safe:animate-fade-in-fast" />
      <div className="absolute inset-0 bg-gradient-to-t from-accent-950/40 via-transparent to-transparent" />
      <div className="absolute top-3 left-3 inline-flex items-center gap-1 bg-white/95 backdrop-blur rounded-pill h-7 px-2.5 shadow-xs">
        <Icon.star className="w-3 h-3 text-warning-500" />
        <span className="font-display text-[12px] font-bold text-ink-900 tabular-nums leading-none">{e.rate}</span>
        <span className="text-[10px] text-ink-500 tabular-nums">({e.reviews})</span>
      </div>
    </div>

    {/* Desktop horizontal */}
    <div className="hidden sm:grid sm:grid-cols-[160px_1fr] gap-5 p-5 sm:p-6">
      <div className="shrink-0">
        <div className="relative w-[160px] h-[160px] rounded-card overflow-hidden bg-ink-100">
          <img src={e.photo} alt={e.name} className="absolute inset-0 w-full h-full object-cover" />
        </div>
      </div>
      <div className="min-w-0 flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              <h3 className="font-display text-[20px] font-bold text-ink-900 tracking-tight leading-[1.15]">{e.name}</h3>
              {e.verified && <VerifiedMark size={14} />}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
              <span className="font-display text-[12px] font-semibold text-ink-700">{e.cat}</span>
              {e.headline && (
                <>
                  <span className="text-ink-300">·</span>
                  <span className="inline-flex items-center h-[22px] px-2 rounded-pill bg-ink-75 text-ink-700 border border-ink-200 font-display text-[11px] font-semibold tracking-tight max-w-full truncate">
                    {e.headline}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right -mt-0.5">
            <div className="inline-flex items-baseline gap-1 font-display">
              <Icon.star className="w-3.5 h-3.5 text-warning-500 self-center" />
              <span className="text-[17px] font-bold text-ink-900 tabular-nums leading-none">{e.rate}</span>
            </div>
            <div className="mt-1 text-[9.5px] uppercase tracking-[0.18em] text-ink-500 tabular-nums">{e.reviews} მიმოხ.</div>
          </div>
        </div>
        <p className="mt-3 text-[13px] text-ink-700 leading-[1.55] line-clamp-2">{e.quote}</p>
        <div className="mt-3 pt-3 border-t border-ink-100 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-ink-500">
          <span className="tabular-nums"><span className="font-display font-semibold text-ink-800">{e.sessions}</span> სესია</span>
        </div>
      </div>
    </div>

    {/* Mobile content block */}
    <div className="sm:hidden px-4 pt-4 pb-3 flex flex-col min-w-0">
      <div className="flex items-center gap-1.5 min-w-0">
        <h3 className="font-display text-[18px] font-bold text-ink-900 tracking-tight leading-[1.15] truncate">{e.name}</h3>
        {e.verified && <VerifiedMark size={14} />}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap min-w-0">
        <span className="font-display text-[12px] font-semibold text-ink-700">{e.cat}</span>
        {e.headline && (
          <>
            <span className="text-ink-300">·</span>
            <span className="inline-flex items-center h-[22px] px-2 rounded-pill bg-ink-75 text-ink-700 border border-ink-200 font-display text-[11px] font-semibold tracking-tight max-w-full truncate">
              {e.headline}
            </span>
          </>
        )}
      </div>
      <p className="mt-3 text-[13px] text-ink-700 leading-[1.55] line-clamp-2">{e.quote}</p>
      <div className="mt-3 pt-3 border-t border-ink-100 flex items-center gap-x-3 gap-y-1.5 text-[11px] text-ink-500 flex-wrap">
        <span className="tabular-nums"><span className="font-display font-semibold text-ink-800">{e.sessions}</span> სესია</span>
      </div>
    </div>

    {/* Bottom price strip */}
    <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-t border-ink-100 bg-ink-50/40">
      <div className="min-w-0 flex items-baseline gap-2">
        {/* Flat expert-set price for the whole session — "/ N წთ" read like a
            per-minute rate. */}
        <span className="font-display text-[20px] sm:text-[22px] font-bold text-ink-900 tabular-nums tracking-tight leading-none">
          ₾{e.price}<span className="text-[11.5px] font-medium text-ink-500 ml-1">· {e.durationMin}-წუთიანი სესია</span>
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link href={e.id ? `/tutors/${e.id}` : '/tutors'} className="h-11 px-3.5 rounded-btn border border-ink-200 hover:border-ink-300 bg-white text-ink-700 hover:text-ink-900 font-display font-semibold text-[12.5px] tracking-wide inline-flex items-center transition-colors">
          პროფილი
        </Link>
        {/* ?rebook=1 opens the booking modal on arrival, so "დაიჯავშნე" is
            honest — without it this was just a second profile link. */}
        <Link href={e.id ? `/tutors/${e.id}?rebook=1` : '/tutors'} className="h-11 px-3.5 sm:px-4 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] tracking-wide inline-flex items-center gap-1.5 transition-colors shadow-xs">
          დაჯავშნე
        </Link>
      </div>
    </div>
  </article>
)

const FeaturedExperts = () => {
  const [active, setActive] = useState('all')
  const [experts, setExperts] = useState<Expert[] | null>(null)
  // Fetch real featured tutors (admin-marked featured=true) so the "hand-picked
  // experts" section no longer ships hardcoded fake names in the SSR HTML.
  useEffect(() => {
    let cancelled = false
    const cat = active === 'all' ? '' : `&category=${encodeURIComponent(active)}`
    const load = async () => {
      try {
        let rows = await fetch(`/api/tutors?featured=1&limit=6${cat}`).then(r => (r.ok ? r.json() : []))
        // Fall back to top-rated experts so this section is never empty — a cold
        // "featured" list still shows a strong, hand-picked-feeling row instead
        // of a dead-end empty state.
        if (!Array.isArray(rows) || rows.length === 0) {
          rows = await fetch(`/api/tutors?limit=6${cat}`).then(r => (r.ok ? r.json() : []))
        }
        if (!cancelled && Array.isArray(rows)) setExperts(rows.map(mapTutorToExpert))
      } catch {
        if (!cancelled) setExperts([])
      }
    }
    load()
    return () => { cancelled = true }
  }, [active])
  // Mirrors the top-6 grid emphasis. `all` always populates (fallback in load());
  // category tabs fill in as experts are onboarded into these spheres.
  const filters = [
    { k: 'all', l: 'ყველა' },
    { k: 'business', l: 'ბიზნესი' },
    { k: 'tax', l: 'გადასახადები' },
    { k: 'marketing', l: 'მარკეტინგი' },
    { k: 'it', l: 'IT' },
  ]
  return (
    <section className="bg-ink-50/60 border-b border-ink-200">
      <Container className="py-10 sm:py-16 lg:py-20">
        <Reveal className="mb-8 lg:mb-10 max-w-[640px]">
          <div className="flex items-center gap-3 mb-3">
            <Eyebrow as="span">ექსპერტები</Eyebrow>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-500">
              ხელით შერჩეული · ინდივიდუალურად შემოწმებული
            </span>
          </div>
          <h2 className="font-display text-[28px] sm:text-[40px] lg:text-[48px] font-bold text-ink-900 tracking-[-0.025em] leading-[1.05]">
            ხელით შერჩეული ექსპერტები.
          </h2>
        </Reveal>

        <div className="flex items-center gap-2 mb-7 overflow-x-auto scrollbar-hide rail-fade-end -mx-6 sm:-mx-8 px-6 sm:px-8">
          {filters.map(f => (
            <button key={f.k} type="button" onClick={() => setActive(f.k)} className={`shrink-0 h-9 px-4 rounded-pill font-display text-[12.5px] font-semibold tracking-wide inline-flex items-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 ${active === f.k ? 'bg-brand-500 text-white' : 'bg-white border border-ink-200 text-ink-700 hover:border-ink-300 hover:bg-ink-50'}`}>
              {f.l}
            </button>
          ))}
        </div>

        <Reveal stagger className="grid lg:grid-cols-2 gap-4 sm:gap-5">
          {experts === null ? (
            [0, 1, 2, 3].map(i => (
              <div key={i} className="rounded-card border border-ink-200 bg-white p-5 flex items-start gap-4 animate-pulse">
                <div className="w-20 h-20 rounded-card bg-ink-100 shrink-0" />
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="h-4 w-2/5 bg-ink-100 rounded" />
                  <div className="h-3 w-3/5 bg-ink-100 rounded" />
                  <div className="h-3 w-full bg-ink-100 rounded" />
                </div>
              </div>
            ))
          ) : experts.length === 0 ? (
            <div className="lg:col-span-2 py-14 px-6 text-center rounded-card border border-dashed border-ink-200 bg-white">
              <div className="font-display text-[15px] font-bold text-ink-900">რჩეული ექსპერტები მალე დაემატება</div>
              <p className="text-[12.5px] text-ink-500 mt-1.5 max-w-[420px] mx-auto leading-relaxed">გადახედე ყველა ექსპერტს — მოდერაცია რჩეულ პროფესიონალებს მალე მოირჩევს.</p>
              <Link href="/tutors" className="mt-4 inline-flex items-center gap-1.5 h-11 px-4 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[12.5px] tracking-wide transition-colors">
                ყველა ექსპერტი
              </Link>
            </div>
          ) : (
            experts.map((e, i) => <ExpertCard key={e.id ?? i} e={e} />)
          )}
        </Reveal>

        <div className="mt-12 flex justify-center">
          <Link href="/tutors" className="h-12 px-6 rounded-btn bg-white border border-ink-200 hover:border-ink-300 hover:bg-ink-50 text-ink-900 font-display text-[13px] font-semibold tracking-wide inline-flex items-center gap-2 transition-colors">
            ნახე ყველა ექსპერტი
          </Link>
        </div>
      </Container>
    </section>
  )
}

const HowItWorks = () => (
  <section id="how" className="bg-ink-50 border-b border-ink-200 scroll-mt-24">
    <Container className="py-10 sm:py-16 lg:py-24">
      <div className="grid lg:grid-cols-[1fr_1.6fr] gap-12 items-start">
        <Reveal>
          <Eyebrow className="mb-3">როგორ მუშაობს</Eyebrow>
          <h2 className="font-display text-[32px] sm:text-[44px] font-bold text-ink-900 tracking-[-0.02em] leading-[1.05]">
            სამი ნაბიჯი —<br />
            ვიდრე უკვე გელაპარაკები.
          </h2>
          <p className="text-[15px] text-ink-600 mt-5 max-w-[400px] leading-relaxed">რეგისტრაცია — გაცნობა — სესია. 15 წუთიდან სრულ კონსულტაციამდე.</p>
          <AnonOnly>
            <Link href="/signup" className="mt-7 h-12 px-6 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13px] tracking-wide inline-flex items-center gap-2 transition-colors">
              დაწყება
            </Link>
          </AnonOnly>
        </Reveal>
        <Reveal stagger className="space-y-3">
          {[
            { n: '01', t: 'აირჩიე ექსპერტი', d: 'გადახედე პროფილებს, რეიტინგებს და მოკლე ვიდეოშესავალს. ფილტრები სფერო-ფასი-ხელმისაწვდომობაზე.' },
            { n: '02', t: 'აირჩიე სერვისი და დრო', d: 'აირჩიე ექსპერტის სერვისი და თავისუფალი დრო კალენდრიდან — ის ადასტურებს მოთხოვნას. ფასი ფიქსირებულია.' },
            PAYMENTS_LIVE
              ? { n: '03', t: 'დაცული გადახდა', d: 'ბარათით — თანხა დაცულ ანგარიშზე ჩერდება, ექსპერტს მხოლოდ სესიის შემდეგ გადაერიცხება.' }
              : { n: '03', t: 'უსაფრთხო გადახდები · მალე', d: 'დაცული გადახდები — მალე. ამჟამად სესია იჯავშნება უფასოდ, გადახდის სისტემა მოდის.' },
          ].map((s, i) => (
            <div key={i} className="rounded-card border border-ink-200 bg-white p-6 grid grid-cols-[60px_1fr] gap-5 items-start">
              <div className="font-display text-[44px] font-bold text-brand-500 tabular-nums tracking-tight leading-none">{s.n}</div>
              <div>
                <h3 className="font-display text-xl font-bold text-ink-900 mb-2 tracking-tight">{s.t}</h3>
                <p className="text-[14px] text-ink-600 leading-relaxed">{s.d}</p>
              </div>
            </div>
          ))}
        </Reveal>
      </div>
    </Container>
  </section>
)

const WhyUs = () => (
  <section className="bg-white border-b border-ink-200">
    <Container className="py-10 sm:py-16 lg:py-20">
      <Reveal className="max-w-[720px] mb-10">
        <Eyebrow className="mb-3">რატომ მცოდნე</Eyebrow>
        <h2 className="font-display text-[32px] sm:text-[44px] font-bold text-ink-900 tracking-[-0.02em] leading-[1.05]">
          ცოდნა, რომელსაც ენდობი —<br className="hidden sm:inline" />
          <span className="text-ink-500">ფასი, რომელიც ღირს.</span>
        </h2>
      </Reveal>
      {/* Single-block reveal on purpose: the gap-px/overflow-hidden lattice
          would clip per-cell staggered motion. */}
      <Reveal delay={120} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-ink-200 border border-ink-200 rounded-card overflow-hidden">
        {[
          PAYMENTS_LIVE
            ? { t: 'დაცული გადახდა', d: 'თანხა დაცულ ანგარიშზე ჩერდება სანამ სესია არ ჩატარდება. გაუქმდე უფასოდ 24 სთ-ით ადრე.' }
            : { t: 'უსაფრთხო გადახდები · მალე', d: 'დაცული გადახდები მუშავდება — ამჟამად სესია იჯავშნება უფასოდ, ბარათი არ ვთხოვთ.' },
          { t: 'ხელით მოდერაცია',    d: 'ადმინისტრაცია განიხილავს ყოველ განაცხადს. ვამოწმებთ პროფილს, გამოცდილებას, საჯარო კვალს.' },
          { t: 'HD ვიდეოსესია',     d: 'ჩაშენებული ვიდეო-ოთახი, ფაილების გაცვლა, ჩატი. სესიის ჩაწერა — მალე.' },
          { t: 'გამჭვირვალე ფასი',   d: 'ერთი ნათელი განაკვეთი ექსპერტზე — გადაიხდი მხოლოდ დაჯავშნისას, ფარული საკომისიოს გარეშე.' },
        ].map((c, i) => (
          <div key={i} className="bg-white p-7">
            <Eyebrow tone="muted" className="tabular-nums mb-4">№ {String(i + 1).padStart(2, '0')}</Eyebrow>
            <h3 className="font-display text-[17px] font-bold text-ink-900 tracking-tight leading-tight mb-2">{c.t}</h3>
            <p className="text-[12.5px] text-ink-600 leading-[1.55]">{c.d}</p>
          </div>
        ))}
      </Reveal>
    </Container>
  </section>
)

/* Testimonials removed (Phase 0.2): the previous section showed invented
   people with i.pravatar.cc stock faces and fabricated outcomes. It returns
   only when real outcome-story reviews accumulate (role-attributed, quantified
   quotes pulled from the Reviews system) — never seeded. */

const ExpertCta = () => (
  <section className="relative bg-ink-50/50 border-y border-ink-200">
    <Container className="py-10 sm:py-16 lg:py-24">
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-12 items-center">
        <Reveal>
          <div className="inline-flex items-center gap-2 rounded-pill bg-white border border-ink-200 pl-1 pr-3 py-1 mb-6 shadow-xs">
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-brand-500 text-white px-2.5 py-1 text-[11px] font-display font-semibold tracking-wide">ექსპერტებისთვის</span>
            <span className="text-[12px] text-ink-700 font-medium">ღია განაცხადი · ხელით მოდერაცია</span>
          </div>
          <h2 className="font-display text-[36px] sm:text-[48px] lg:text-[56px] font-bold leading-[1.02] tracking-[-0.02em] text-ink-900">
            გააზიარე შენი ცოდნა.<br />
            <span className="text-brand-600">{PAYMENTS_LIVE ? 'გასამრჯელო — სესიის შემდეგ.' : 'შემოსავალი · მალე.'}</span>
          </h2>
          <p className="text-[15px] text-ink-700 mt-6 max-w-[520px] leading-relaxed">
            შენ წერ შენს კონსულტაციას — ფასს, დროს, თემას. ჩვენ ვუვლით მოდერაციას, ანგარიშფაქტურებს და მომხმარებლების მოძიებას. საკომისიო {COMMISSION_PCT}% — გამჭვირვალე, ერთი ციფრი.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/apply" className="h-12 px-6 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13px] tracking-wide inline-flex items-center gap-2 transition-colors">
              გახდი ექსპერტი
            </Link>
            <Link href="/apply" className="h-12 px-5 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 hover:border-ink-300 text-ink-800 font-display font-medium text-[13px] tracking-wide inline-flex items-center gap-2 transition-colors">
              <Icon.play className="w-3.5 h-3.5 text-brand-600" /> 90 წამიანი ვიდეო
            </Link>
          </div>
        </Reveal>
        <Reveal stagger className="grid grid-cols-1 gap-3">
          {visible => (
            /* One brand treatment for all stat tiles — no per-row hues. The
               numeric tiles count up on scroll-enter (CountUp snaps under
               reduced motion). */
            [
              { n: COMMISSION_PCT as number | null, txt: '', l: 'საკომისიო', s: 'გამჭვირვალე · ერთი ციფრი' },
              { n: TUTOR_PAYOUT_PCT as number | null, txt: '', l: 'შენი ნაწილი', s: 'დანარჩენი — შენს ჯიბეშია' },
              { n: null, txt: 'მალე', l: 'შემოსავალი', s: 'დაცული გადახდის დანერგვის შემდეგ' },
            ].map((s, i) => (
              <div key={i} className="rounded-card border border-ink-200 bg-white p-5 grid grid-cols-[auto_1fr] gap-5 items-baseline shadow-xs">
                <div className="font-display text-[40px] font-bold text-brand-600 tabular-nums tracking-tight leading-none">
                  {/* Static number until scroll-enter (SSR/crawlers always see
                      the real value — never a fake 0%), then CountUp 0→n. */}
                  {s.n !== null
                    ? (visible ? <CountUp value={s.n} from={0} duration={900} suffix="%" /> : <span className="tabular-nums">{s.n}%</span>)
                    : s.txt}
                </div>
                <div>
                  <Eyebrow>{s.l}</Eyebrow>
                  <div className="text-[12px] text-ink-600 mt-1.5 leading-snug">{s.s}</div>
                </div>
              </div>
            ))
          )}
        </Reveal>
      </div>
    </Container>
  </section>
)

const AuthedRecentTutorsStrip = () => {
  // Shared /api/me (lib/me) — deduped with the top bar + AppShell.
  const { me } = useMe()
  const signedIn = !!me
  const [hasItems, setHasItems] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const check = () => {
      try {
        const raw = window.localStorage.getItem('mcodne:recent-tutors')
        if (!raw) { setHasItems(false); return }
        const parsed = JSON.parse(raw)
        setHasItems(Array.isArray(parsed) && parsed.length > 0)
      } catch {
        setHasItems(false)
      }
    }
    check()
    const onChange = () => check()
    window.addEventListener('storage', onChange)
    window.addEventListener('mcodne:recent-tutors:change', onChange as EventListener)
    return () => {
      window.removeEventListener('storage', onChange)
      window.removeEventListener('mcodne:recent-tutors:change', onChange as EventListener)
    }
  }, [])
  if (!signedIn || !hasItems) return null
  return (
    <section className="bg-white border-b border-ink-200">
      <Container className="pt-6 pb-4">
        <RecentTutorsStrip />
      </Container>
    </section>
  )
}

const HomeView = () => (
  <>
    <HomeHero />
    <AuthedRecentTutorsStrip />
    <Categories />
    <FeaturedExperts />
    <HowItWorks />
    <WhyUs />
    {/* „გახდი ექსპერტი“ section is meaningless for an existing expert/admin. */}
    <ApplyCtaGate><ExpertCta /></ApplyCtaGate>
  </>
)

/* ═══════════════════════════════════════════════════════════════════ */
/* PAGE                                                                 */
/* ═══════════════════════════════════════════════════════════════════ */

export default function Landing() {
  return (
    <div className="font-sans bg-white text-ink-900 antialiased">
      <PublicTopBar />
      <HomeView />
      <Footer />
    </div>
  )
}


