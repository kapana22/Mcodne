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

// Code-owned routes a post may legitimately link to. A profession landing
// (/experts/<slug>) is validated against the real data instead. Old-world
// addresses (/categories/*, /konsultacia/*, and since stage 10 /tutors,
// /masters and the WHOLE /services prefix — the bare door since stage 10, its
// children since stage 11) still 308 (middleware.ts) but a post
// should not link to a redirect — they are flagged below.
const STATIC_OK = new Set([
  '/', '/experts', '/blog', '/apply', '/join',
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
      } else if (href === '/categories' || href.startsWith('/categories/') || href === '/konsultacia' || href.startsWith('/konsultacia/')) {
        problem = 'links to a retired address (308 since stage 8) — use /experts?category=<slug> or /experts/<profession>'
      } else if (href === '/tutors' || href.startsWith('/tutors/') || href === '/masters' || href.startsWith('/masters/') || href === '/services' || href.startsWith('/services/')) {
        problem = 'links to a retired address (308 since stage 10) — the one catalogue is /experts'
      } else if (href.startsWith('/experts/') && profSlugs.has(href.slice('/experts/'.length))) {
        // A profession landing — code-owned, fine.
      } else if (href.startsWith('/experts/')) {
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
