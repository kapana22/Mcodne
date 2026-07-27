import type { Metadata } from 'next'
import Landing from './HomeClient'
import { jsonLdString } from '@/lib/jsonLd'

// Home is a client component (HomeClient) for its interactivity, so this thin
// server wrapper carries the SEO: a strong title/description, a self-canonical,
// and Organization + WebSite JSON-LD (brand knowledge panel + sitelinks search
// box). Without this the homepage inherited the weak layout defaults.

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')
const DESC = 'დაჯავშნე ონლაინ კონსულტაცია ქართველ ექსპერტთან — ბიზნესი, ფინანსები, კარიერა და სამართალი. ხელით შერჩეული ბაზა, ვიდეოსესია, გამჭვირვალე ფასი.'

export const metadata: Metadata = {
  title: 'ბიზნეს კონსულტაცია ონლაინ — ქართველ ექსპერტებთან | მცოდნე',
  description: DESC,
  alternates: { canonical: '/' },
  openGraph: {
    title: 'მცოდნე — ბიზნეს კონსულტაცია ექსპერტებთან',
    description: DESC,
    url: SITE_URL,
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'მცოდნე' }],
    locale: 'ka_GE',
    type: 'website',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'მცოდნე',
      url: SITE_URL,
      logo: `${SITE_URL}/logo.png`,
      description: DESC,
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: 'მცოდნე',
      url: SITE_URL,
      inLanguage: 'ka-GE',
      publisher: { '@id': `${SITE_URL}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/tutors?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    },
  ],
}

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <Landing />
    </>
  )
}
