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
          // THE ONE CATALOGUE AND EVERYTHING UNDER IT — and since stage 11
          // (2026-08-19) that is literally everything a visitor can browse.
          // Four pages share the segment: the profession landing
          // (/experts/<profession>), the trade landing (/experts/<trade>) and
          // the two profiles, an expert's and a service one (/experts/<slug>).
          // One Allow covers all four. /tutors, /masters, /services and every
          // /services/<x> now 308 into this prefix, and a redirecting URL does
          // not belong in an Allow.
          '/experts',
          '/experts/*',
          '/about',
          '/blog',
          '/contact',
          '/help',
          '/terms',
          '/privacy',
          '/cookies',
          '/join',
          '/signin',
          // ⚠️ THE ONE /api PATH GOOGLE MUST REACH, and it has to out-rank the
          // `/api/∗` Disallow below. Expert photos live in the database as
          // `data:` URIs (19 of 24 on 2026-08-13), so /api/avatars/[id] is the
          // ONLY form of them that exists as a fetchable image — it is what
          // `og:image` and the Person JSON-LD point at. Blocked, those tags
          // reference a URL the crawler is forbidden to open, and no search
          // result or shared link can ever show a face.
          //
          // Google resolves Allow vs Disallow by LONGEST MATCH, so this beats
          // '/api/∗' for these URLs and nothing else under /api opens up.
          '/api/avatars/',
          // The same, for the trades side: a master's face and work photos are
          // base64 columns served only by /api/masters/[id]/photo, which is
          // what the service profile's og:image and JSON-LD point at
          // (/experts/<slug>, 2026-08-19).
          '/api/masters/',
        ],
        disallow: [
          '/admin',
          '/admin/*',
          '/api/*',
          '/api/dev/*',
          '/me',
          '/me/*',
          // The WORKSPACE only (/work — the expert's AND the master's, stage 6).
          // Its predecessor was '/tutor', where a bare rule is a PREFIX rule
          // that also matched /experts and /experts/{id} — the whole public
          // catalog. Nothing public starts with /work today, but the same
          // discipline: '/work$' pins the exact route; '/work/' covers
          // everything under it. Never a bare '/work' or '/work*'.
          '/work$',
          '/work/',
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
