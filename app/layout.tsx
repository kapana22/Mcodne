import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AppShell } from '@/components/AppShell'
// Wires document.startViewTransition around App Router navigations, which is
// what lets a card's avatar MORPH into the profile page's avatar instead of
// the page swapping in a blink (see .vt-* names in globals.css). Browsers
// without the API (and prefers-reduced-motion users, guarded in CSS) simply
// get the old instant navigation — nothing breaks, nothing waits.
import { ViewTransitions } from 'next-view-transitions'
import { SkipLink } from '@/components/SkipLink'
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts'
import { ImpersonationBanner } from '@/components/ImpersonationBanner'
import { Analytics } from '@/components/Analytics'
import { SiteTextProvider } from '@/components/SiteTextProvider'
import { getSiteTextMap } from '@/lib/siteText'
import { CodeInjector } from '@/components/CodeInjector'
import { getIntegrations } from '@/lib/integrations'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Google Search Console ownership verification — Next renders this as
  // <meta name="google-site-verification" content="…"> in every page <head>.
  // Do NOT remove it, or Search Console will lose verification.
  verification: { google: 'd52ikKfhRDBsgsbzX-ZfC9lE-jPW4BGVpPeNLERiVpo' },
  title: {
    default: 'მცოდნე — ბიზნეს კონსულტაცია ქართველ ექსპერტებთან',
    template: '%s',
  },
  description: 'ქართული ექსპერტ-კონსულტაციის პლატფორმა — დაჯავშნე ვიდეოსესია ბიზნესის, კარიერის, იურიდიულ და ფინანსურ საკითხებზე ხელით შერჩეულ ექსპერტებთან.',
  manifest: '/manifest.webmanifest',
  // Square monogram mark — the wide wordmark (logo.png, 2.6:1) squished into a
  // tab favicon read as an ugly smear; a compact „მ" square is legible at 16px.
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
  openGraph: {
    title: 'მცოდნე — ბიზნეს კონსულტაცია ექსპერტებთან',
    description: 'დაჯავშნე ვიდეოკონსულტაცია ხელით შერჩეულ ქართველ ექსპერტებთან.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'მცოდნე' }],
    locale: 'ka_GE',
    type: 'website',
    url: SITE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'მცოდნე — ბიზნეს კონსულტაცია ექსპერტებთან',
    description: 'დაჯავშნე ვიდეოკონსულტაცია ხელით შერჩეულ ქართველ ექსპერტებთან.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'მცოდნე' }],
  },
}

// Next 15 moved themeColor / colorScheme out of `metadata` into `viewport`.
export const viewport: Viewport = {
  themeColor: '#2F9C86',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Editable site copy resolved once per request (defaults if DB is down), then
  // handed to the client provider so <SiteText>/useSiteText work everywhere.
  const siteTexts = await getSiteTextMap()
  // Admin-managed integrations (GA id + raw header/footer code).
  const integrations = await getIntegrations()
  return (
    <html lang="ka">
      <head>
        {/* FiraGO is fully self-hosted (public/fonts/*.woff2, subset with
            Georgian mkhedruli + mtavruli `case` glyphs) — see globals.css.
            No external font CDN: faster, no third-party dependency, and the
            'Noto Sans Georgian' name in the font stack now acts purely as a
            local system fallback. Preload the body weight to kill FOUT. */}
        <link
          rel="preload"
          href="/fonts/firago-400.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {/* 700 is preloaded too, and it is NOT decoration: every page's LCP
            element is its h1, which is font-bold. With only 400 preloaded the
            h1 painted in the fallback, then swapped when 700 finally arrived —
            LCP is measured at that second paint, and the metric swap moves the
            headline (CLS). Weights 500/600 stay unpreloaded on purpose: they
            only ever appear below the fold, so preloading them would compete
            for bandwidth with the two that decide the score. */}
        <link
          rel="preload"
          href="/fonts/firago-700.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {/* Feed autodiscovery — how readers and aggregators find /rss.xml
            without being told the URL. */}
        <link rel="alternate" type="application/rss+xml" title="მცოდნე — ბლოგი" href="/rss.xml" />
      </head>
      <body className="font-sans bg-ink-50 text-ink-900 antialiased min-h-screen">
        {/* Skip-to-content: visible only when keyboard-focused. Finds the page's
            landmark at click time — a static #main anchor was dead on every
            route that never declared the id (all but three). */}
        <SkipLink />
        {/* Site-wide `/`, ⌘K and `?`. Mounted next to SkipLink because it is the
            same concern: the site has to be operable without reaching for the
            trackpad. */}
        <KeyboardShortcuts />
        <ImpersonationBanner />
        <Analytics gaId={integrations.gaId} />
        <CodeInjector header={integrations.headerHtml} footer={integrations.footerHtml} />
        <SiteTextProvider value={siteTexts}>
          <ViewTransitions><AppShell>{children}</AppShell></ViewTransitions>
        </SiteTextProvider>
      </body>
    </html>
  )
}
