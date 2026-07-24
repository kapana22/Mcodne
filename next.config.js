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
module.exports = nextConfig
