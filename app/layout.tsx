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
import { getPublicSiteTextMap } from '@/lib/siteText'
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
    // ⚠️ NOT „ონლაინ კონსულტაცია" ANY MORE (2026-08-20). That named a FORMAT,
    // and the format is now one of the things the site sells rather than what
    // it is. A person searching for a plumber never matched a title that
    // promised a video call — see CLAUDE.md → THE PRODUCT MODEL.
    default: 'მცოდნე — აღწერე რა გჭირდება, მიიღე შეთავაზებები',
    template: '%s',
  },
  /* ⚠️ TWO CLAIMS LEFT THIS SENTENCE ON 2026-09-02, AND BOTH WERE MEASURED
     FALSE THAT DAY. Owner: „არ უნდა იყოს ტყუილები, როგორც სხვა საიტებზე არის
     ქართულზე."
       · „გადამოწმებული ექსპერტები" — 1 of 26 published providers carries the
         ✓. The per-card badge is a fact about one person and stays; the plural
         in a site description is a claim about the roster, and 25 cards say the
         opposite the moment somebody arrives.
       · „ბუღალტერიდან სანტექნიკოსამდე" — the roster holds ZERO tradespeople.
         Every one of the 26 is an office service (marketing 4 · law 4 ·
         accounting 3 · psychology 3 · finance 3 · business 2 · IT 2 · …), so
         the half of the range that was doing the selling did not exist. It is
         also the sentence a person searching for a plumber matches on.
     What is left is what the site does, which needs no adjective. */
  description: 'აღწერე რა გჭირდება და მიიღე შეთავაზებები ექსპერტებისგან. თბილისი. მოთხოვნა უფასოა.',
  manifest: '/manifest.webmanifest',
  // ⚠️ WITHOUT THIS GOOGLE SHOWS NO THUMBNAIL, whatever images the page
  // carries. The default preview budget is small; `max-image-preview: large`
  // is the documented opt-in that makes a result eligible for a real image,
  // and `max-snippet: -1` lifts the description cap on the same terms.
  //
  // It is safe site-wide: the pages that must NOT be indexed at all set their
  // own `robots: { index: false }` (/signin, /signup, /business,
  // /abroad), and an index:false page ignores preview limits entirely.
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
  },
  // Square monogram mark — the wide wordmark (logo.png, 2.6:1) squished into a
  // tab favicon read as an ugly smear; a compact „მ" square is legible at 16px.
  // ⚠️ THE .ico IS NOT OPTIONAL, and its absence was a real defect (2026-08-13):
  // the site declared ONLY the SVG and `/favicon.ico` answered 404. Google
  // fetches the root `/favicon.ico` when it cannot resolve a declared icon, and
  // Search Console was drawing the generic globe next to every one of our
  // pages. Older browsers and several link-preview bots never look for anything
  // else.
  //
  // ORDER MATTERS: the SVG is listed first so a modern browser takes the
  // sharp, scalable one, and the raster files are the fallback rather than the
  // default. Sizes are multiples of 48 (Google's documented favicon guidance);
  // the SVG's own 64×64 is fine for something that scales and is not a size to
  // rasterise to. All of them are generated from that one SVG by
  // scripts/build-favicons.mjs — re-run it if the mark ever changes, or the
  // tab and the search result start showing two different logos.
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'მცოდნე — აღწერე რა გჭირდება, მიიღე შეთავაზებები',
    description: 'აღწერე რა გჭირდება და მიიღე შეთავაზებები ექსპერტებისგან. თბილისი.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'მცოდნე' }],
    locale: 'ka_GE',
    type: 'website',
    url: SITE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'მცოდნე — აღწერე რა გჭირდება, მიიღე შეთავაზებები',
    description: 'აღწერე რა გჭირდება და მიიღე შეთავაზებები ექსპერტებისგან. თბილისი.',
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
  //
  // ⚠️ THE *PUBLIC* MAP, and the word matters: this value is serialized into
  // the RSC payload of every page, so anything in it is delivered to every
  // visitor and every crawler whether or not a component reads it. The full
  // map still holds retired keys — the copy of pages that were replaced — and
  // shipping those put „ხელოსნები" in the HTML of the whole site for weeks
  // after the pages saying it were gone (lib/siteText).
  const siteTexts = await getPublicSiteTextMap()
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
