import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AppShell } from '@/components/AppShell'
import { ImpersonationBanner } from '@/components/ImpersonationBanner'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'მცოდნე — ცოდნის არქივი',
    template: '%s',
  },
  description: 'ექსპერტების პლატფორმა',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
  openGraph: {
    title: 'მცოდნე',
    description: 'ცოდნის არქივი — შეხვდი საუკეთესო ექსპერტებს.',
    images: ['/logo.png'],
    locale: 'ka_GE',
    type: 'website',
    url: SITE_URL,
  },
}

// Next 15 moved themeColor / colorScheme out of `metadata` into `viewport`.
export const viewport: Viewport = {
  themeColor: '#159A82',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
      </head>
      <body className="font-sans bg-ink-50 text-ink-900 antialiased min-h-screen">
        {/* Skip-to-content: visible only when keyboard-focused. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:h-11 focus:px-4 focus:rounded-btn focus:bg-brand-500 focus:text-white focus:font-display focus:font-semibold focus:text-[13px] focus:inline-flex focus:items-center focus:shadow-float"
        >
          გადადი მთავარ შიგთავსზე
        </a>
        <ImpersonationBanner />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
