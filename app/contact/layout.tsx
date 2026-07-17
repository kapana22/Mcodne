import type { Metadata } from 'next'

// See app/apply/layout.tsx for why this exists — the contact page is a client
// component and cannot own its metadata export directly.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

export const metadata: Metadata = {
  title: 'დაგვიკავშირდი — მცოდნე',
  description: 'დაუკავშირდი მცოდნეს — კითხვები, პარტნიორობა, ან პრესა.',
  alternates: { canonical: `${SITE_URL}/contact` },
  openGraph: {
    title: 'დაგვიკავშირდი — მცოდნე',
    description: 'დაუკავშირდი მცოდნეს — კითხვები, პარტნიორობა, ან პრესა.',
    url: `${SITE_URL}/contact`,
  },
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children
}
