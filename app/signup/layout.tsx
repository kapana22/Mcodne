import type { Metadata } from 'next'

// signup/page.tsx renders a client component — this sibling server layout owns
// the route's metadata (mirrors app/signin/layout.tsx).
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

export const metadata: Metadata = {
  title: 'რეგისტრაცია — მცოდნე',
  description: 'შექმენი ანგარიში მცოდნეზე — იპოვე ექსპერტი ან გახდი ექსპერტი.',
  alternates: { canonical: `${SITE_URL}/signup` },
  robots: { index: false, follow: true },
  openGraph: {
    title: 'რეგისტრაცია — მცოდნე',
    description: 'შექმენი ანგარიში მცოდნეზე — იპოვე ექსპერტი ან გახდი ექსპერტი.',
    url: `${SITE_URL}/signup`,
  },
}

export default function SignUpLayout({ children }: { children: React.ReactNode }) {
  return children
}
