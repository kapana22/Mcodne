import type { Metadata } from 'next'

// signin/page.tsx is a client component — a sibling server layout owns metadata.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

export const metadata: Metadata = {
  title: 'შესვლა — მცოდნე',
  description: 'შედი მცოდნეზე ან შექმენი ახალი ანგარიში.',
  alternates: { canonical: `${SITE_URL}/signin` },
  robots: { index: false, follow: true },
  openGraph: {
    title: 'შესვლა — მცოდნე',
    description: 'შედი მცოდნეზე ან შექმენი ახალი ანგარიში.',
    url: `${SITE_URL}/signin`,
  },
}

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return children
}
