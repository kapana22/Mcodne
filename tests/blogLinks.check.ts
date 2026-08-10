// Dead-internal-link check for published blog posts.
//
// Run: npx tsx tests/blogLinks.check.ts
//
// NOT a pure unit test — it reads the live DB (see project memory: local runs
// hit PRODUCTION), which is why it's `.check.ts` and not `.test.ts`. It only
// ever READS.
//
// WHY: a crawl on 2026-07-29 found a published post linking to
// /blog/rogor-moemzado-konsultaciistvis, which is a DRAFT — a 404 for every
// reader and crawler. Nothing in the build catches that: post bodies are
// admin-authored Markdown in a text column, so a link to an unpublished or
// misspelled slug is invisible until someone clicks it. Run this after editing
// or seeding posts.
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Code-owned routes a post may legitimately link to. Anything under
// /categories/ or /konsultacia/ is validated against the real data instead.
const STATIC_OK = new Set([
  '/', '/tutors', '/categories', '/konsultacia', '/blog', '/apply', '/ask',
  '/about', '/help', '/contact', '/terms', '/privacy', '/cookies',
])

async function main() {
  const [posts, cats] = await Promise.all([
    prisma.post.findMany({ select: { slug: true, title: true, body: true, status: true } }),
    prisma.category.findMany({ where: { status: 'VISIBLE' }, select: { slug: true } }),
  ])
  const published = new Set(posts.filter(p => p.status === 'PUBLISHED').map(p => p.slug))
  const allPosts = new Set(posts.map(p => p.slug))
  const liveCats = new Set(cats.map(c => c.slug))

  const { professions } = await import('../lib/professionSeo')
  const profSlugs = new Set(professions.map(p => p.slug))

  let broken = 0
  let checked = 0

  for (const post of posts.filter(p => p.status === 'PUBLISHED')) {
    for (const m of post.body.matchAll(/\]\((\/[^)\s]*)\)/g)) {
      const href = m[1].split('#')[0].split('?')[0]
      checked++
      let problem: string | null = null

      if (href.startsWith('/blog/')) {
        const slug = href.slice('/blog/'.length)
        if (!allPosts.has(slug)) problem = 'no such post'
        else if (!published.has(slug)) problem = 'post exists but is a DRAFT → 404'
      } else if (href.startsWith('/categories/')) {
        if (!liveCats.has(href.slice('/categories/'.length))) problem = 'not a live category'
      } else if (href.startsWith('/konsultacia/')) {
        if (!profSlugs.has(href.slice('/konsultacia/'.length))) problem = 'no such profession page'
      } else if (href.startsWith('/tutors/')) {
        problem = 'links to ONE expert profile — that breaks when they pause or leave'
      } else if (!STATIC_OK.has(href.replace(/\/$/, '') || '/')) {
        problem = 'unknown route'
      }

      if (problem) {
        broken++
        console.log(`  ✗ ${href}\n      in „${post.title}" (/blog/${post.slug})\n      ${problem}`)
      }
    }
  }

  console.log(`\nchecked ${checked} internal links across ${published.size} published posts`)
  if (broken === 0) console.log('✓ no dead internal links')
  else { console.log(`✗ ${broken} broken`); process.exitCode = 1 }
}

main().finally(() => prisma.$disconnect())
