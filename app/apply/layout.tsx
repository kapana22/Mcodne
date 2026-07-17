import type { Metadata } from 'next'

// `app/apply/page.tsx` is a client component so metadata cannot be exported
// from the page itself — Next requires page-level metadata on server modules.
// A thin server-side layout is the standard workaround.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

export const metadata: Metadata = {
  title: 'გახდი ექსპერტი — მცოდნე',
  description: 'შემოუერთდი მცოდნეს — გააზიარე შენი ცოდნა და დაიწყე კონსულტაციები.',
  alternates: { canonical: `${SITE_URL}/apply` },
  openGraph: {
    title: 'გახდი ექსპერტი — მცოდნე',
    description: 'შემოუერთდი მცოდნეს — გააზიარე შენი ცოდნა და დაიწყე კონსულტაციები.',
    url: `${SITE_URL}/apply`,
  },
}

export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return children
}
