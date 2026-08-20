import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { ensureDbReady } from '@/lib/dbBoot'
import { avatarSrc } from '@/lib/avatarSrc'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { Container } from '@/components/Container'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Footer } from '@/components/Footer'
import { Eyebrow } from '@/components/Eyebrow'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { canSeePackages, perLessonPrice, PACKAGES_ROUTE } from '@/lib/packages'
import { packageFits } from '@/lib/packageFit'
import { RequestButton } from './RequestButton'

// The teaching vertical's own route (2026-08-05). Who may see it is decided in
// ONE place — lib/flags → PACKAGES_VISIBILITY, read through canSeePackages().
//
// ⚠️ THE STAGE MOVES; THIS FILE MUST MOVE WITH IT. It was written when the
// stage was 'admin' and every surface below assumed an operator was reading.
// When the stage became 'signed-in' (2026-08-05) real clients started reading
// the same page, and three of those surfaces were still speaking to an admin:
// the „N ჩართული ექსპერტი" tally, the per-package „განრიგი ვერ იტევს"
// diagnostics, and the route printed as a <code> footer. Everything
// operator-facing is now behind `isAdmin` — check that list before the next
// stage change rather than after it.
//
// WHY A SEPARATE ROUTE AND NOT A FILTER ON /experts. Two different search
// intents deserve two pages — „ინგლისურის მასწავლებელი" is not the same query
// as „ბიზნეს კონსულტანტი" — and a route is a hard boundary where a toggle is a
// soft one people leave set wrong. It also means /experts is not touched at all.
//
// This page is a VIEW over the same supply, keyed on TutorProfile.packagesEnabled.
// It is deliberately NOT a hidden Category: lib/abroad.ts documents why that
// mechanism backfires — moving an expert into a hidden category removes them
// from the public catalog instead of adding them here.
export const dynamic = 'force-dynamic'

// Belt and braces. The page already 404s for non-admins, so a crawler can never
// reach it — but if the stage is ever moved to 'public' before the SEO work is
// done, this keeps it out of the index until that is deliberate too.
export const metadata: Metadata = {
  title: 'სწავლება — მცოდნე',
  robots: { index: false, follow: false },
}

export default async function TeachingPage() {
  // 404, never 403: a 403 confirms the page exists and is worth returning to.
  const me = await getCurrentUser()
  if (!canSeePackages(me?.role)) notFound()
  const isAdmin = me?.role === 'ADMIN'

  await ensureDbReady()

  // The allowlist IS the query. `packagesEnabled` starts false for every
  // profile, so before an admin turns anyone on this page is simply empty —
  // it can never show somebody who was not chosen.
  const rows = await prisma.tutorProfile.findMany({
    where: {
      // BOTH gates, matching the request API exactly. Listing on
      // `packagesEnabled` alone let an EXPERT with the admin flag ticked appear
      // on the teaching route while POST /api/packages/[id]/request refused
      // them with NOT_TEACHER — a page advertising something the server would
      // not sell.
      profileType: 'TEACHER',
      packagesEnabled: true,
      available: true,
      user: { is: { suspendedAt: null } },
    },
    select: {
      id: true,
      slug: true,
      headline: true,
      specialty: true,
      languages: true,
      // No `avatarUrl` on the list payload by accident — it is a data: URI in
      // Postgres and shipping it raw is what once made /experts 556KB of HTML.
      // avatarSrc() below turns it into the cacheable /api/avatars/<id> route.
      user: { select: { id: true, fullName: true, avatarUrl: true } },
      category: { select: { name: true } },
      // Ranking inputs — see the sort below.
      verified: true,
      rating: true,
      packages: {
        where: { active: true },
        select: { id: true, title: true, lessonsCount: true, minutesPerLesson: true, price: true, validDays: true },
        orderBy: { lessonsCount: 'asc' },
      },
    },
    // `updatedAt desc` used to decide this, which means „whoever edited last is
    // first" — a fact about our database, not a reason for a parent to look at
    // someone. Same rule the catalogue uses (lib/tutorsQuery): verified first,
    // then rating.
    orderBy: [{ verified: 'desc' }, { rating: 'desc' }],
  })

  // The schedule gate. A package whose teacher has not published enough time
  // cannot honestly be sold — see lib/packages → packageFits for the measured
  // reason. On this admin-only page it is SHOWN and labelled rather than
  // hidden: the person looking at it is the one who has to fix it, and a
  // silently missing row tells them nothing.
  const fits = Object.assign(
    {},
    ...(await Promise.all(rows.map(t => packageFits(t.id, t.packages)))),
  ) as Record<string, { capacity: number; fits: boolean }>
  const blocked = Object.values(fits).filter(f => !f.fits).length

  // A CLIENT is never shown a package that cannot be sold. POST
  // /api/packages/[id]/request refuses it with NO_CAPACITY, so advertising it
  // means offering something the server will decline — and the old behaviour
  // was worse than that: it rendered the internal capacity read-out („30 დღეში
  // 3 გაკვეთილი 8-იდან") plus a disabled request button, i.e. our scheduling
  // problem, itemised, in front of the buyer. An ADMIN keeps seeing everything:
  // they are the one who can fix it, and a silently missing row tells them
  // nothing (the same reasoning the teacher's own editor uses).
  const visible = isAdmin
    ? rows
    : rows
        .map(t => ({ ...t, packages: t.packages.filter(p => fits[p.id]?.fits) }))
        .filter(t => t.packages.length > 0)

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <MarketingTopBar />

      <Container as="main" className="w-full py-12 lg:py-16 flex-1">
        {/* An unmissable reminder of WHY this page is reachable. It renders for
            admins only, which is exactly who needs to know the state. */}
        <div className="mb-8 rounded-card border border-warning-300 bg-warning-50 px-4 py-3">
          <p className="font-display text-small font-semibold text-warning-800">
            სატესტო რეჟიმი — გვერდი ბმულით ხსნადია, ნავიგაციაში არსად წერია
          </p>
          <p className="mt-1 text-meta text-ink-700">
            {isAdmin
              ? 'ექსპერტი აქ ჩნდება მხოლოდ მას შემდეგ, რაც ადმინში ჩართავ „პაკეტებს“.'
              : 'პაკეტის მოთხოვნის შემდეგ ექსპერტი დაგიდასტურებს და გადახდაზე შეგითანხმდება.'}
          </p>
        </div>

        <Eyebrow className="mb-3">სწავლება</Eyebrow>
        <h1 className="font-display text-h1 lg:text-display font-bold text-ink-900 tracking-tight leading-[1.08]">
          ექსპერტები თვიური პაკეტით
        </h1>
        {/* An operator tally („N ჩართული ექსპერტი · M პაკეტს განრიგი ვერ
            იტევს"), so it is shown to operators. A parent has no use for how
            many profiles we have switched on. */}
        {isAdmin && (
          <p className="mt-4 text-body-lg text-ink-600 leading-relaxed max-w-[62ch]">
            {rows.length > 0
              ? `${rows.length} ჩართული ექსპერტი.${blocked > 0 ? ` ${blocked} პაკეტს განრიგი ვერ იტევს.` : ''}`
              : 'ჯერ არავინაა ჩართული.'}
          </p>
        )}

        {visible.length === 0 ? (
          <div className="mt-10 max-w-[560px]">
            {/* Two audiences, two empty states. „ადმინში გახსენი…" with a link
                to /admin is an instruction only an operator can follow; a
                client reaching an empty list needs the neutral one. Both
                strings already exist elsewhere in the product — neither is
                invented here. */}
            {isAdmin ? (
              <EmptyState
                icon={<Icon.users className="w-6 h-6" />}
                title="სია ცარიელია"
                description="ადმინში გახსენი ექსპერტის პროფილი და ჩართე „პაკეტები“ — შემდეგ აქ გამოჩნდება."
                cta={{ label: 'ადმინში გადასვლა', href: '/admin' }}
              />
            ) : (
              <EmptyState icon={<Icon.users className="w-6 h-6" />} title="ჯერ არაფერია" />
            )}
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {visible.map((t, i) => {
              const photo = avatarSrc(t.user?.id, t.user?.avatarUrl) || DEFAULT_AVATAR
              // The first row is above the fold at every width (1-up mobile,
              // 2-up from lg), so those photos are the LCP candidate and must
              // not wait for the lazy pass.
              const eager = i < 2
              return (
                <article key={t.id} className="rounded-card border border-ink-200 bg-white p-5 flex flex-col">
                  <div className="flex items-start gap-4 min-w-0">
                    {/* Round, matching every other expert photo on the site. */}
                    <img
                      src={photo}
                      alt={t.user?.fullName ?? ''}
                      width={96}
                      height={96}
                      loading={eager ? 'eager' : 'lazy'}
                      fetchPriority={eager ? 'high' : undefined}
                      decoding="async"
                      className="shrink-0 w-24 h-24 rounded-full object-cover object-center bg-ink-100 ring-1 ring-ink-100"
                    />
                    <div className="min-w-0 flex-1">
                      <h2 className="font-display text-h3 font-bold text-ink-900 tracking-tight leading-tight">
                        <Link href={`/experts/${t.slug || t.id}`} className="hover:text-brand-700 transition-colors duration-fast">
                          {t.user?.fullName}
                        </Link>
                      </h2>
                      {t.category?.name && (
                        <span className="mt-1.5 inline-flex items-center h-5 px-2 rounded-pill bg-ink-75 border border-ink-200 text-ink-700 font-display text-meta font-semibold">
                          {t.category.name}
                        </span>
                      )}
                      {t.headline && (
                        <p className="mt-2 text-small text-ink-600 leading-snug line-clamp-2">{t.headline}</p>
                      )}
                    </div>
                  </div>

                  {/* THE TEACHING PRICE GRAMMAR, and only it. A card on this
                      route never prints „₾100 · 60 წთ სესია" — that is the
                      consultation route's sentence. One card, one grammar,
                      decided by the route and not by the expert's data. */}
                  <div className="mt-4 pt-4 border-t border-ink-100">
                    {t.packages.length === 0 ? (
                      <p className="text-meta text-ink-500">პაკეტი ჯერ არ შეუქმნია.</p>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {t.packages.map(p => {
                          const f = fits[p.id]
                          return (
                            <li key={p.id}>
                              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                                <span className="font-display text-small font-semibold text-ink-800">
                                  {p.lessonsCount} გაკვეთილი
                                  <span className="text-ink-500 font-normal"> · {p.minutesPerLesson} წთ · {p.validDays} დღე</span>
                                </span>
                                <span className="font-display text-body font-bold text-ink-900 tabular-nums">
                                  ₾{p.price}
                                  <span className="text-meta font-medium text-ink-500 ml-1.5 tracking-normal">
                                    ₾{perLessonPrice(p.price, p.lessonsCount)} / გაკვეთილი
                                  </span>
                                </span>
                              </div>
                              {/* Operator diagnostics. A non-admin never reaches
                                  this branch any more — an unsellable package is
                                  filtered out of `visible` above rather than
                                  shown with our scheduling problem attached. */}
                              {isAdmin && f && !f.fits && (
                                <div className="mt-1 text-meta text-warning-800 tabular-nums">
                                  ⚠ განრიგი ვერ იტევს — {p.validDays} დღეში {f.capacity} გაკვეთილი {p.lessonsCount}-იდან
                                </div>
                              )}
                              {/* Admins are here to inspect, not to buy. The
                                  button is never disabled: everything a client
                                  can see here can actually be requested. */}
                              {!isAdmin && (
                                <div className="mt-2">
                                  <RequestButton packageId={p.id} />
                                </div>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}

        {/* The route, printed for whoever is testing the rollout. Was rendered
            unconditionally — a client should not be reading our URL constants
            off the bottom of a page they came to shop on. */}
        {isAdmin && (
          <p className="mt-10 text-meta text-ink-400">
            <code className="font-mono">{PACKAGES_ROUTE}</code>
          </p>
        )}
      </Container>

      <Footer />
    </div>
  )
}
