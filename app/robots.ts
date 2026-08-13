import type { MetadataRoute } from 'next'

// Auto-served at /robots.txt. We list the public surface as an explicit Allow
// (for search engines that respect ordering) and disallow authenticated,
// admin, dev, and API paths that should never appear in the index.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/tutors',
          '/tutors/*',
          // The two SEO landing-page families: spheres and professions. Allowed
          // by the bare '/' anyway — listed for the same explicitness as the rest.
          '/categories',
          '/categories/*',
          '/konsultacia',
          '/konsultacia/*',
          '/about',
          '/blog',
          '/contact',
          '/help',
          '/terms',
          '/privacy',
          '/cookies',
          '/apply',
          '/signin',
          // ⚠️ THE ONE /api PATH GOOGLE MUST REACH, and it has to out-rank the
          // `/api/*` Disallow below. Expert photos live in the database as
          // `data:` URIs (19 of 24 on 2026-08-13), so /api/avatars/[id] is the
          // ONLY form of them that exists as a fetchable image — it is what
          // `og:image` and the Person JSON-LD point at. Blocked, those tags
          // reference a URL the crawler is forbidden to open, and no search
          // result or shared link can ever show a face.
          //
          // Google resolves Allow vs Disallow by LONGEST MATCH, so this beats
          // '/api/*' for these URLs and nothing else under /api opens up.
          '/api/avatars/',
        ],
        disallow: [
          '/admin',
          '/admin/*',
          '/api/*',
          '/api/dev/*',
          '/student',
          '/student/*',
          // The expert WORKSPACE only. A bare '/tutor' is a PREFIX rule: it also
          // matches /tutors and /tutors/{id} — the whole public catalog. Google
          // resolves that by longest-match against the Allow rules above, but a
          // first-match crawler would block the entire catalog. '/tutor$' pins the
          // exact route; '/tutor/' covers everything under it without touching
          // '/tutors…'. Never reintroduce a bare '/tutor' or '/tutor*'.
          '/tutor$',
          '/tutor/',
          '/session/*',
          '/notifications',
          '/settings',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
