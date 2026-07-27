import type { Metadata } from 'next'
import TutorApply from './ApplyClient'

// Thin server wrapper so the /apply funnel has real SEO (title/description/
// canonical) — the interactive multi-step form lives in ApplyClient ('use
// client'). Targets "become an expert / consultant" intent.

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')
const DESC = 'გახდი ექსპერტი მცოდნეზე — გაუზიარე ცოდნა და გამოიმუშავე ვიდეო-კონსულტაციებით. დროსა და ფასს შენ ადგენ.'

export const metadata: Metadata = {
  title: 'გახდი ექსპერტი — გამოიმუშავე კონსულტაციებით | მცოდნე',
  description: DESC,
  alternates: { canonical: '/apply' },
  openGraph: {
    title: 'გახდი ექსპერტი — მცოდნე',
    description: DESC,
    url: `${SITE_URL}/apply`,
    type: 'website',
  },
}

export default function Page() {
  return <TutorApply />
}
