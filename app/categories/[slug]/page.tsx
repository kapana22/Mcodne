import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { Container } from '@/components/Container'
import { Footer } from '@/components/Footer'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { queryTutors } from '@/lib/tutorsQuery'

// SEO landing page per category — a crawlable, keyword-targeted URL
// (/categories/ბიზნეს-კონსულტაცია) with a unique H1 + description + the real
// expert list. Captures long-tail "<category> კონსულტაცია" search intent that
// the client-side /tutors filter can't rank for.
export const dynamic = 'force-dynamic'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

async function getCategory(slug: string) {
  try {
    await ensureDbReady()
    return await prisma.category.findFirst({
      where: { slug, isLive: true },
      select: { id: true, slug: true, name: true },
    })
  } catch { return null }
}

const descFor = (name: string) =>
  `„${name}" კატეგორიაში იპოვი გადამოწმებულ ქართველ ექსპერტებს ონლაინ ვიდეო-კონსულტაციისთვის. ნახე შეფასებები და ფასი, აირჩიე დრო და დაჯავშნე 60-წუთიანი სესია.`

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const cat = await getCategory(slug)
  if (!cat) return { title: 'კატეგორია — მცოდნე' }
  const desc = descFor(cat.name)
  return {
    title: `${cat.name} — იპოვე ექსპერტი და დაჯავშნე კონსულტაცია | მცოდნე`,
    description: desc,
    alternates: { canonical: `${SITE_URL}/categories/${cat.slug}` },
    openGraph: { title: `${cat.name} — ექსპერტები | მცოდნე`, description: desc, url: `${SITE_URL}/categories/${cat.slug}`, type: 'website' },
  }
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const cat = await getCategory(slug)
  if (!cat) notFound()

  const experts = await queryTutors({ category: cat.slug, limit: 48 }).catch(() => [])

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'მთავარი', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'კატეგორიები', item: `${SITE_URL}/categories` },
      { '@type': 'ListItem', position: 3, name: cat.name },
    ],
  }
  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${cat.name} — ექსპერტები`,
    url: `${SITE_URL}/categories/${cat.slug}`,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: experts.length,
      itemListElement: experts.slice(0, 20).map((t, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}/tutors/${t.id}`,
        name: t.user?.fullName ?? 'ექსპერტი',
      })),
    },
  }

  return (
    <div className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      <MarketingTopBar />

      <Container as="main" size="wide" className="py-14 lg:py-20">
        <nav className="flex items-center gap-1.5 text-[12px] text-ink-400 mb-5">
          <Link href="/" className="hover:text-ink-700">მთავარი</Link>
          <span>/</span>
          <Link href="/categories" className="hover:text-ink-700">კატეგორიები</Link>
          <span>/</span>
          <span className="text-ink-600">{cat.name}</span>
        </nav>

        <div className="max-w-[720px]">
          <Eyebrow className="mb-3">კატეგორია</Eyebrow>
          <h1 className="font-display text-4xl lg:text-5xl font-bold text-ink-900 tracking-tight leading-[1.05]">
            „{cat.name}" ექსპერტები
          </h1>
          <p className="mt-5 text-[16.5px] text-ink-600 leading-relaxed">{descFor(cat.name)}</p>
        </div>

        {experts.length === 0 ? (
          <div className="mt-12 rounded-card border border-dashed border-ink-200 bg-ink-50/40 p-10 text-center max-w-[560px]">
            <p className="text-[14px] text-ink-600">ამ კატეგორიაში ჯერ ხელმისაწვდომი ექსპერტი არ არის.</p>
            <Link href="/tutors" className="mt-4 inline-flex h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13.5px] items-center gap-2 transition-colors">ყველა ექსპერტი</Link>
          </div>
        ) : (
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {experts.map(t => {
              const name = t.user?.fullName ?? 'ექსპერტი'
              const rating = typeof t.rating === 'number' ? t.rating : 0
              const price = typeof t.price === 'number' ? t.price : null
              return (
                <Link key={t.id} href={`/tutors/${t.id}`} className="group rounded-card border border-ink-200 bg-white p-5 flex flex-col hover-lift transition-all">
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={t.user?.avatarUrl || DEFAULT_AVATAR} alt={name} className="w-12 h-12 rounded-full object-cover ring-1 ring-ink-200" />
                    <div className="min-w-0">
                      <div className="font-display text-[15px] font-bold text-ink-900 truncate group-hover:text-brand-700 transition-colors">{name}</div>
                      {t.specialty && <div className="text-[12px] text-ink-500 truncate">{t.specialty}</div>}
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-ink-100 flex items-center justify-between text-[12px]">
                    <span className="inline-flex items-center gap-1 text-ink-600">
                      {rating > 0 ? <><Icon.star className="w-3.5 h-3.5 text-warning-500" /> {rating.toFixed(1)}</> : <span className="text-ink-400">ახალი</span>}
                    </span>
                    {price != null && <span className="font-display font-bold text-ink-900 tabular-nums">₾{price}</span>}
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        <div className="mt-12">
          <Link href="/tutors" className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-brand-700 hover:underline">ყველა კატეგორიის ექსპერტი <Icon.arrow className="w-3.5 h-3.5" /></Link>
        </div>
      </Container>

      <Footer />
    </div>
  )
}
