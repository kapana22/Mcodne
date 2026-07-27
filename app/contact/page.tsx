import type { Metadata } from 'next'
import ContactPage from './ContactClient'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')
const DESC = `დაგვიკავშირდი — კითხვები პლატფორმაზე, ექსპერტობაზე ან თანამშრომლობაზე. გიპასუხებთ სწრაფად: ${SUPPORT_EMAIL}.`

export const metadata: Metadata = {
  title: 'დაგვიკავშირდი — მცოდნე',
  description: DESC,
  alternates: { canonical: `${SITE_URL}/contact` },
  openGraph: { title: 'დაგვიკავშირდი — მცოდნე', description: DESC, url: `${SITE_URL}/contact`, type: 'website' },
}

export default function Page() {
  return <ContactPage />
}
