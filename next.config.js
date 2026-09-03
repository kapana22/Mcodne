/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // ⚠️ THE GATE AND `next dev` MUST NOT SHARE A BUILD DIR (2026-09-01).
  //
  // They did, and the collision was the single most expensive thing in this
  // repo to diagnose, because it does not read as a build problem: two
  // `next build`s over one .next leave half-written manifests, and what you
  // see is unstyled pages, a missing manifest, or `PageNotFoundError` on an
  // API route. Every one of those looks like the change under test.
  //
  // `npm run check` now sets NEXT_DIST_DIR=.next-check, so the gate builds
  // beside the dev server instead of on top of it and the failure mode is
  // simply gone. Railway sets nothing, gets '.next', and is unaffected —
  // which is the point: this must not be able to change what deploys.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'i.pravatar.cc' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      // Google account avatars (lh3/lh4/lh5.googleusercontent.com) — set on the
      // user's avatarUrl at Google sign-in. Without this next/image refuses the
      // host and the photo renders blank.
      { protocol: 'https', hostname: '**.googleusercontent.com' },
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
  // Lint is a manual/CI step (`npm run lint`), never a deploy gate — `railway up`
  // builds straight from the working tree and tsc is the authoritative check, so
  // a lint warning must not be able to fail a production build.
  eslint: { ignoreDuringBuilds: true },
  // ⚠️ FEATURE_REQUESTS must reach CLIENT components too, and this line is how.
  // Only NEXT_PUBLIC_* vars are inlined into the browser bundle by default, so
  // app/admin/_nav.tsx (a client component) read `undefined`, requestsOn() said
  // off, and the two admin tabs were filtered out of the rail on every
  // deployment — while the server half of the subsystem worked. Found by
  // screenshotting the real panel (2026-08-14).
  //
  // Deliberately NOT renamed to NEXT_PUBLIC_FEATURE_REQUESTS: the middleware,
  // dbBoot and every route already read the unprefixed name, and a rename would
  // be two variables to keep in agreement — the exact failure lib/flags.ts
  // warns about. `env:` inlines the SAME name at build time, which matches how
  // the middleware already consumes it (per-request reads stay server-only).
  env: { FEATURE_REQUESTS: process.env.FEATURE_REQUESTS, FEATURE_PROVIDERS: process.env.FEATURE_PROVIDERS },
}
// Everything under public/ shipped `max-age=0`, and the four preloaded fonts
// therefore cost a blocking 304 round-trip (~220–270ms, measured) on every
// warm navigation. These assets only change by being replaced, so: immutable.
/* RENAMED EXPERT SLUGS.
 *
 * `app/tutors/[id]` resolves a profile by `id OR slug` and there is no slug
 * history, so the moment a slug is rewritten every link anybody ever shared to
 * the old one 404s. That is a real cost and it is avoidable for the price of a
 * line, so a rename is recorded here rather than simply accepted.
 *
 * 308 (`permanent`), not 307: the URL is not coming back, and a permanent
 * redirect is what moves ranking signals onto the new address.
 *
 * This list is for HAND-RENAMED slugs only — a handful, by definition. If it
 * ever grows past a screenful the answer is a `slugHistory` table, not a longer
 * file. 2026-08-13: „Lawyer Besik guliashvili (ადვოკატი ბესიკ გულიაშვილი)" was
 * a marketing line typed into the name field; the name became „ბესიკ
 * გულიაშვილი" and the slug it had generated no longer described anybody.
 */
nextConfig.redirects = async () => ([
  {
    source: '/tutors/lawyer-besik-guliashvili-advokati-besik-guliashv',
    destination: '/tutors/besik-guliashvili',
    permanent: true,
  },
])

nextConfig.headers = async () => ([
  { source: '/fonts/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
  { source: '/:file(logo.svg|favicon.svg|og.png)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
])

module.exports = nextConfig
