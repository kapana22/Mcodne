import Link from 'next/link'
import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Footer } from '@/components/Footer'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

export const metadata: Metadata = {
  title: 'სფეროები — მცოდნე',
  description:
    'აირჩიე შენი პროფესიული სფერო — ბიზნესი, ფინანსები, კარიერა, სამართალი და სხვ. — და იპოვე გადამოწმებული ექსპერტი.',
  alternates: { canonical: `${SITE_URL}/categories` },
  openGraph: {
    title: 'სფეროები — მცოდნე',
    description:
      'აირჩიე შენი პროფესიული სფერო და იპოვე გადამოწმებული ექსპერტი.',
    url: `${SITE_URL}/categories`,
  },
}

// Server component — Prisma-fed, no client JS needed for the browse view.
// Long-form server render on every hit keeps the counts fresh (categories are
// small, the query is cheap; no need for ISR yet).
export const dynamic = 'force-dynamic'

// Map arbitrary icon slug -> Icon.* key. Category.icon is a free-form string in
// the schema (may reference a Lucide-ish name), so we take a best-effort match
// and fall back to Icon.category for anything unknown.
const ICON_MAP: Record<string, keyof typeof Icon> = {
  business: 'graph',
  finance: 'wallet',
  money: 'money',
  career: 'trend',
  marketing: 'spark',
  law: 'shield',
  psychology: 'heart',
  chat: 'chat',
  doc: 'doc',
  users: 'users',
  bolt: 'bolt',
  globe: 'globe',
  graph: 'graph',
  trend: 'trend',
  wallet: 'wallet',
  shield: 'shield',
  heart: 'heart',
  spark: 'spark',
  category: 'category',
}

// Resolve an icon from the free-form `icon` field first, then fall back to the
// category `slug` (which ICON_MAP also covers) so each sphere gets a distinct
// glyph even when `icon` is null/unmapped — otherwise every card collapses to
// the generic grid icon.
function iconFor(icon: string | null | undefined, slug?: string | null) {
  const tryKey = (v: string | null | undefined) => (v ? ICON_MAP[v.toLowerCase()] : undefined)
  const key = tryKey(icon) ?? tryKey(slug)
  return key ? Icon[key] : Icon.category
}

type ServiceType = 'CONSULTATION' | 'RECURRING'

const SERVICE_PILL: Record<ServiceType, { label: string; cls: string }> = {
  CONSULTATION: {
    label: 'კონსულტაცია',
    cls: 'bg-brand-50 text-brand-700 border-brand-100',
  },
  RECURRING: {
    label: 'მენტორინგი',
    // Informational chip → info blue per canon (accent is deprecated).
    cls: 'bg-info-50 text-info-700 border-info-100',
  },
}

export default async function CategoriesPage() {
  const cats = await prisma.category.findMany({
    where: { isLive: true },
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      slug: true,
      name: true,
      icon: true,
      defaultServiceType: true,
      _count: { select: { tutors: true } },
    },
  })

  return (
    <div className="min-h-screen bg-white">
      <MarketingTopBar />

      <main className="max-w-[1280px] mx-auto px-6 sm:px-8 py-12 lg:py-16">
        {/* Hero */}
        <section className="max-w-[720px] mb-10 lg:mb-12">
          <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand-700 mb-3">
            სფეროები
          </div>
          <h1 className="font-display text-4xl lg:text-5xl font-bold text-ink-900 tracking-tight leading-[1.05]">
            აირჩიე შენი სფერო
          </h1>
          <p className="mt-4 text-[15px] lg:text-[16px] text-ink-600 leading-relaxed">
            თითოეული სფერო ხელით არის ცოცხალი გამოცდილი ექსპერტებით. აირჩიე მიმართულება
            — და დაუყოვნებლივ ნახე ვინც ხელმისაწვდომია.
          </p>
        </section>

        {cats.length === 0 ? (
          <EmptyState
            icon={<Icon.category className="w-6 h-6" />}
            title="სფეროები ჯერ არ არის"
            description="მალე დავამატებთ ახალ სფეროებს. სცადე მოგვიანებით."
            cta={{ label: 'ექსპერტების ძებნა', href: '/tutors' }}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
            {cats.map(c => {
              const IconCmp = iconFor(c.icon, c.slug)
              const pill = SERVICE_PILL[c.defaultServiceType as ServiceType]
              const tutorCount = c._count.tutors
              return (
                <Link
                  key={c.id}
                  href={`/tutors?category=${encodeURIComponent(c.slug)}`}
                  className="group relative flex flex-col overflow-hidden rounded-card border border-ink-200 bg-white p-5 lg:p-6 shadow-xs hover-lift hover:border-brand-200 motion-safe:active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
                >
                  {/* Brand accent hairline — reveals on hover for a subtle premium cue. */}
                  <span
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-brand-500 transition-transform duration-300 ease-out group-hover:scale-x-100"
                  />

                  <div className="flex items-start justify-between gap-3 mb-5">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-btn bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-900/[0.04] shadow-xs transition-colors duration-300 group-hover:text-brand-700">
                      <IconCmp className="w-6 h-6" />
                    </div>
                    <span
                      className={`inline-flex items-center h-6 px-2.5 rounded-pill border font-display text-[10.5px] font-semibold uppercase tracking-[0.14em] ${pill.cls}`}
                    >
                      {pill.label}
                    </span>
                  </div>

                  <div className="font-display text-[18px] lg:text-[19px] font-bold text-ink-900 tracking-tight leading-tight transition-colors duration-200 group-hover:text-brand-700">
                    {c.name}
                  </div>

                  {/* Expert count — a trust signal, so the number carries the weight. */}
                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="font-display text-[26px] lg:text-[28px] font-bold text-ink-900 tabular-nums leading-none">
                      {tutorCount}
                    </span>
                    <span className="text-[13px] text-ink-500">ექსპერტი</span>
                  </div>

                  <div className="mt-5 pt-4 border-t border-ink-100">
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-display font-semibold text-brand-700 transition-all duration-200 group-hover:gap-2.5">
                      ნახე ექსპერტები
                      <Icon.arrow className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
