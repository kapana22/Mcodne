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
          '/tutor',
          '/tutor/*',
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
