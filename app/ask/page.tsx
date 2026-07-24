import type { Metadata } from 'next'
import AskPage from './AskClient'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')
const DESC = 'დაუსვი შენი კითხვა — მცოდნე გირჩევს შესაფერის ექსპერტს ბიზნესის, კარიერის, იურიდიულ თუ ფინანსურ საკითხზე. აღწერე რა გჭირდება და დაჯავშნე კონსულტაცია.'

export const metadata: Metadata = {
  title: 'დასვი კითხვა — იპოვე შესაფერისი ექსპერტი | მცოდნე',
  description: DESC,
  alternates: { canonical: `${SITE_URL}/ask` },
  openGraph: { title: 'დასვი კითხვა — მცოდნე', description: DESC, url: `${SITE_URL}/ask`, type: 'website' },
}

export default function Page() {
  return <AskPage />
}
