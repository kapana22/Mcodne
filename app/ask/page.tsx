import type { Metadata } from 'next'
import AskPage from './AskClient'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')
const DESC = 'დაუსვი შენი კითხვა — მცოდნე გირჩევს შესაფერის ექსპერტს ბიზნესის, კარიერის, იურიდიულ თუ ფინანსურ საკითხზე. აღწერე რა გჭირდება და დაჯავშნე კონსულტაცია.'

export const metadata: Metadata = {
  title: 'დასვი კითხვა — იპოვე შესაფერისი ექსპერტი | მცოდნე',
  description: DESC,
  alternates: { canonical: `${SITE_URL}/ask` },
  // noindex, follow — and removed from the sitemap (2026-07-29).
  // /ask is a matching TOOL: what it shows depends entirely on `?q=`, so there
  // is no stable document here for Google to rank, and every ?q= variant
  // canonicalises back to this URL anyway. `follow` is deliberate: the page
  // links out to real expert profiles and those links should still be crawled.
  robots: { index: false, follow: true },
  openGraph: { title: 'დასვი კითხვა — მცოდნე', description: DESC, url: `${SITE_URL}/ask`, type: 'website' },
}

export default function Page() {
  return <AskPage />
}
