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
}
module.exports = nextConfig
