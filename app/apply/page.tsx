import { pageMetadata } from '@/lib/pageSeo'
import { redirect } from 'next/navigation'
import TutorApply from './ApplyClient'
import { ApplyMarketing } from './ApplyMarketing'
import { getCurrentUser } from '@/lib/auth'
import { socialMeta } from '@/lib/seo'

// Session-dependent: never statically render or cache this shell, or a guest
// could be served a signed-in render (or vice-versa).
export const dynamic = 'force-dynamic'

// Thin server wrapper so the /apply funnel has real SEO (title/description/
// canonical) — the interactive multi-step form lives in ApplyClient ('use
// client'). Targets "become an expert / consultant" intent.

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')
const DESC = 'გახდი ექსპერტი მცოდნეზე — გაუზიარე ცოდნა და გამოიმუშავე ვიდეოკონსულტაციებით. დროსა და ფასს შენ ადგენ.'

// Editable in ადმინი → ტექსტები (group „SEO — …"). See lib/pageSeo.
export const generateMetadata = () => pageMetadata('apply', '/apply')

export default async function Page() {
  const user = await getCurrentUser()

  // Guest → the public „გახდი ექსპერტი" landing page. This is the crawlable
  // view and the whole reason the auth gate moved out of the layout.
  if (!user) return <ApplyMarketing />

  // Already an expert / an admin → the two role conflicts described in
  // layout.tsx. Redirect rather than render a form they must not submit.
  if (user.role === 'TUTOR') redirect('/tutor')
  if (user.role === 'ADMIN') redirect('/admin')

  return <TutorApply />
}
