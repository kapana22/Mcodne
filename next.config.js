/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
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
}
// Everything under public/ shipped `max-age=0`, and the four preloaded fonts
// therefore cost a blocking 304 round-trip (~220–270ms, measured) on every
// warm navigation. These assets only change by being replaced, so: immutable.
nextConfig.headers = async () => ([
  { source: '/fonts/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
  { source: '/:file(logo.svg|favicon.svg|og.png)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
])

module.exports = nextConfig
