import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Container } from '@/components/Container'
import { Footer } from '@/components/Footer'
import { Icon } from '@/components/Icon'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { fmtKaDate } from '@/lib/kaDate'
import { renderMarkdown } from '@/lib/markdown'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

export const dynamic = 'force-dynamic'

async function getPost(slug: string) {
  try {
    await ensureDbReady()
    return await prisma.post.findFirst({
      where: { slug, status: 'PUBLISHED' },
      select: { slug: true, title: true, excerpt: true, body: true, tag: true, coverUrl: true, authorName: true, publishedAt: true },
    })
  } catch { return null }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post) return { title: 'ბლოგი — მცოდნე' }
  const desc = post.excerpt || 'პრაქტიკული ცოდნა ქართველი ექსპერტებისგან.'
  return {
    title: `${post.title} — მცოდნე`,
    description: desc,
    alternates: { canonical: `${SITE_URL}/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: desc,
      url: `${SITE_URL}/blog/${post.slug}`,
      images: post.coverUrl ? [post.coverUrl] : undefined,
      type: 'article',
    },
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post) notFound()

  return (
    <div className="min-h-screen bg-white">
      <MarketingTopBar />

      <Container as="main" size="content" className="py-12 lg:py-16">
        <Link href="/blog" className="inline-flex items-center gap-1.5 text-[13px] text-ink-500 hover:text-ink-800 transition-colors">
          <Icon.back className="w-3.5 h-3.5" /> ბლოგი
        </Link>

        <article className="mt-6 max-w-[720px]">
          <div className="flex items-center gap-3 text-[12px] text-ink-500">
            {post.tag && <span className="inline-flex items-center h-6 px-2.5 rounded-pill bg-brand-50 text-brand-700 font-display text-[10.5px] font-semibold uppercase tracking-[0.14em]">{post.tag}</span>}
            {post.publishedAt && <span>{fmtKaDate(new Date(post.publishedAt))}</span>}
            {post.authorName && <span>· {post.authorName}</span>}
          </div>

          <h1 className="mt-4 font-display text-3xl lg:text-[40px] font-bold text-ink-900 tracking-tight leading-[1.1]">{post.title}</h1>
          {post.excerpt && <p className="mt-4 text-[18px] text-ink-600 leading-relaxed">{post.excerpt}</p>}

          {post.coverUrl && (
            <div className="mt-8 rounded-card overflow-hidden border border-ink-100 bg-ink-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={post.coverUrl} alt="" className="w-full h-auto object-cover" />
            </div>
          )}

          <div className="prose-post mt-8 text-[16.5px] leading-[1.75] text-ink-800" dangerouslySetInnerHTML={{ __html: renderMarkdown(post.body) }} />
        </article>

        <div className="mt-14 pt-8 border-t border-ink-100 max-w-[720px]">
          <div className="rounded-card border border-ink-200 bg-ink-50/50 p-6 lg:p-8">
            <h2 className="font-display text-xl font-bold text-ink-900 tracking-tight">გჭირდება პრაქტიკული რჩევა?</h2>
            <p className="mt-2 text-[14.5px] text-ink-600 leading-relaxed">დაჯავშნე კონსულტაცია ექსპერტთან და მიიღე პასუხი შენს კონკრეტულ კითხვაზე.</p>
            <Link href="/tutors" className="mt-5 inline-flex h-11 px-5 rounded-btn bg-brand-500 hover:bg-brand-600 text-white font-display font-semibold text-[13.5px] items-center gap-2 transition-colors">იპოვე ექსპერტი</Link>
          </div>
        </div>
      </Container>

      <Footer />
    </div>
  )
}
