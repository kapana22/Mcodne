import Link from 'next/link'
import type { Metadata } from 'next'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Container } from '@/components/Container'
import { Footer } from '@/components/Footer'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { fmtKaDate } from '@/lib/kaDate'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

// DB-backed: admin publishes posts in the panel, they appear here immediately.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'ბლოგი — მცოდნე',
  description: 'ცოდნა, პრაქტიკული რჩევები და ანალიზი ქართველი ექსპერტებისგან.',
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: {
    title: 'ბლოგი — მცოდნე',
    description: 'ცოდნა, პრაქტიკული რჩევები და ანალიზი ქართველი ექსპერტებისგან.',
    url: `${SITE_URL}/blog`,
  },
}

async function getPosts() {
  try {
    await ensureDbReady()
    return await prisma.post.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      select: { slug: true, title: true, excerpt: true, tag: true, coverUrl: true, publishedAt: true },
    })
  } catch { return [] }
}

export default async function BlogPage() {
  const posts = await getPosts()

  return (
    <div className="min-h-screen bg-white">
      <MarketingTopBar />

      <Container as="main" size="wide" className="py-16 lg:py-24">
        <div className="max-w-[680px]">
          <Eyebrow className="mb-3">ბლოგი</Eyebrow>
          <h1 className="font-display text-4xl lg:text-5xl font-bold text-ink-900 tracking-tight leading-[1.05]">
            პრაქტიკული ცოდნა, პირდაპირ ექსპერტებისგან
          </h1>
          <p className="mt-6 text-[17px] text-ink-600 leading-relaxed">
            პრაქტიკული სახელმძღვანელოები, კონსულტანტების ჩანაწერები და ინდუსტრიის ანალიზი — ქართველი ექსპერტებისგან.
          </p>
        </div>

        {posts.length > 0 ? (
          <section className="mt-14">
            <div className="grid md:grid-cols-3 gap-5">
              {posts.map(p => (
                <Link
                  key={p.slug}
                  href={`/blog/${p.slug}`}
                  className="group relative rounded-card border border-ink-200 bg-white overflow-hidden flex flex-col transition-all hover-lift"
                >
                  {p.coverUrl && (
                    <div className="aspect-[16/9] w-full overflow-hidden bg-ink-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.coverUrl} alt="" className="w-full h-full object-cover transition-transform duration-slow group-hover:scale-[1.03]" />
                    </div>
                  )}
                  <div className="p-6 flex flex-col flex-1">
                    <div className="flex items-center gap-2 self-start">
                      {p.tag && (
                        <span className="inline-flex items-center h-6 px-2.5 rounded-pill bg-brand-50 text-brand-700 font-display text-[10.5px] font-semibold uppercase tracking-[0.14em]">{p.tag}</span>
                      )}
                    </div>
                    <h3 className="font-display text-[17px] font-bold text-ink-900 mt-4 leading-snug tracking-tight group-hover:text-brand-700 transition-colors">{p.title}</h3>
                    {p.excerpt && <p className="mt-3 text-[13.5px] text-ink-600 leading-relaxed flex-1">{p.excerpt}</p>}
                    <div className="mt-5 pt-4 border-t border-ink-100 flex items-center justify-between text-[11.5px] text-ink-500">
                      <span>{p.publishedAt ? fmtKaDate(new Date(p.publishedAt)) : ''}</span>
                      <span className="inline-flex items-center gap-1 text-brand-700 font-semibold">კითხვა <Icon.arrow className="w-3 h-3" /></span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : (
          <section className="mt-14">
            <div className="rounded-card border border-dashed border-ink-200 bg-ink-50/40 p-10 lg:p-14 text-center max-w-[560px] mx-auto">
              <div className="inline-flex items-center gap-2 h-9 px-3.5 rounded-pill bg-warning-50 border border-warning-200 text-warning-800">
                <Icon.bolt className="w-3.5 h-3.5" />
                <span className="font-display text-[12px] font-semibold tracking-wide">მალე გამოვა</span>
              </div>
              <h2 className="mt-5 font-display text-2xl font-bold text-ink-900 tracking-tight">ბლოგი მალე ამოქმედდება</h2>
              <p className="mt-3 text-[15px] text-ink-600 leading-relaxed">პირველი სტატიები მზადდება. დაგვიკავშირდი და შეგატყობინებთ გამოსვლისას.</p>
              <Link href="/contact" className="mt-6 inline-flex h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13.5px] items-center gap-2 transition-colors">
                მაცნობე გამოსვლისას
              </Link>
            </div>
          </section>
        )}
      </Container>

      <Footer />
    </div>
  )
}
