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
          '/about',
          '/blog',
          '/contact',
          '/help',
          '/terms',
          '/privacy',
          '/cookies',
          '/apply',
          '/signin',
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
