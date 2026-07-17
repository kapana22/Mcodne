import { NextRequest, NextResponse } from 'next/server'

// Adds baseline security headers to every response. Kept conservative so it
// won't clash with the app's inline styles / Tailwind runtime, and won't
// break the Jitsi popup (which opens in a new tab and needs no framing here).
// Also mirrors the request pathname into `x-current-path` so server components
// (e.g. requireUser) can build a "return-here-after-signin" URL.
export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname + req.nextUrl.search
  const res = NextResponse.next({
    request: { headers: new Headers([...req.headers.entries(), ['x-current-path', path]]) },
  })
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  // HSTS makes sense only on HTTPS; harmless (ignored) on plain HTTP.
  if (process.env.NODE_ENV === 'production') {
    res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  // Content Security Policy — ENFORCED. `'unsafe-inline'` / `'unsafe-eval'` on
  // script-src remain required by Next.js hydration until per-request nonces are
  // wired in, but default-src/connect-src/object-src/frame-ancestors/base-uri/
  // form-action are now actively enforced, so injected scripts can't exfiltrate
  // to third-party origins, the page can't be framed, and forms can't post
  // off-origin. Image hosts: pravatar (fallback avatars), unsplash (marketing
  // photos), Google Cloud Storage (video previews); data:/blob: cover uploaded
  // attachments rendered inline in chat.
  res.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      // img-src: pravatar (fallback), unsplash (marketing photos), Google
      // Cloud Storage (video previews), and YouTube's thumbnail CDN (used by
      // the apply/admin YouTube preview cards).
      "img-src 'self' data: blob: https://i.pravatar.cc https://images.unsplash.com https://commondatastorage.googleapis.com https://img.youtube.com https://i.ytimg.com",
      "font-src 'self' data:",
      "connect-src 'self'",
      // frame-src: allow YouTube's nocookie embed domain so the intro-video
      // iframe on /tutors/[id] and /tutor/profile can load. `frame-ancestors`
      // stays 'none' — that governs *who can embed us*, not *what we embed*.
      "frame-src https://www.youtube-nocookie.com https://www.youtube.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
  )
  return res
}

export const config = {
  // Skip static assets and Next internals; apply to every real page + API route.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts).*)'],
}
