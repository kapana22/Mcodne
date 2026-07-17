import type { Metadata } from 'next'

// tutors/page.tsx is a client component — a server layout owns metadata.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

export const metadata: Metadata = {
  title: 'ექსპერტების ძებნა — მცოდნე',
  description: 'იპოვე გამოცდილი ექსპერტი კონკრეტული სფეროდან — ფილტრი, რეიტინგები, ხელმისაწვდომობა.',
  alternates: { canonical: `${SITE_URL}/tutors` },
  openGraph: {
    title: 'ექსპერტების ძებნა — მცოდნე',
    description: 'იპოვე გამოცდილი ექსპერტი კონკრეტული სფეროდან — ფილტრი, რეიტინგები, ხელმისაწვდომობა.',
    url: `${SITE_URL}/tutors`,
  },
}

export default function TutorsLayout({ children }: { children: React.ReactNode }) {
  return children
}
