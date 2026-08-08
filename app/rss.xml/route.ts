import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'

// RSS 2.0 feed for the blog, served at /rss.xml.
//
// Route handler rather than a page: Next's Metadata API has no feed primitive,
// and the response needs a real `application/rss+xml` content type.
//
// force-dynamic for the same reason as app/sitemap.ts — Railway's build
// container cannot reach the DB, so anything static would ship an empty feed.
export const dynamic = 'force-dynamic'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

// XML text escape. Post titles and excerpts are author-written Georgian prose
// that regularly contains „…“ quotes and & — unescaped, one ampersand makes the
// whole feed unparseable, and every reader drops it silently.
function esc(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c] as string
  ))
}

export async function GET() {
  let posts: { slug: string; title: string; excerpt: string | null; tag: string | null; publishedAt: Date | null }[] = []
  try {
    await ensureDbReady()
    posts = await prisma.post.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      take: 50,
      select: { slug: true, title: true, excerpt: true, tag: true, publishedAt: true },
    })
  } catch {
    // A DB blip yields an empty-but-VALID feed. Returning a 500 would make
    // readers back off and eventually unsubscribe.
    posts = []
  }

  // Feed-level date = the newest post, not `now`: same honesty rule as the
  // sitemap's lastmod (see CONTENT_REVISION there).
  const newest = posts[0]?.publishedAt ?? null

  const items = posts.map(p => {
    const url = `${SITE_URL}/blog/${p.slug}`
    return `    <item>
      <title>${esc(p.title)}</title>
      <link>${esc(url)}</link>
      <guid isPermaLink="true">${esc(url)}</guid>${p.excerpt ? `
      <description>${esc(p.excerpt)}</description>` : ''}${p.tag ? `
      <category>${esc(p.tag)}</category>` : ''}${p.publishedAt ? `
      <pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate>` : ''}
    </item>`
  }).join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>მცოდნე — ბლოგი</title>
    <link>${SITE_URL}/blog</link>
    <description>პრაქტიკული სახელმძღვანელოები ქართველი ექსპერტებისგან — ბიზნესი, გადასახადები, სამართალი, მარკეტინგი, ფინანსები და კარიერა.</description>
    <language>ka</language>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />${newest ? `
    <lastBuildDate>${new Date(newest).toUTCString()}</lastBuildDate>` : ''}
${items}
  </channel>
</rss>
`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      // Readers poll often; an hour of shared caching keeps that off the DB
      // without making a new post wait meaningfully long.
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
