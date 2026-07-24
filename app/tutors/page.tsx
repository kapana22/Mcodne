// Thin SERVER page for /tutors — the SSR shell of the expert browse list.
//
// Mirrors the proven /tutors/[id] split (server page.tsx + client.tsx): this
// component runs the default expert query ON THE SERVER and hands the rows to
// the interactive client list as `initialTutors`, so real expert cards are in
// the initial HTML instead of an empty skeleton that only fills after a
// post-hydration /api/tutors fetch. Metadata stays in layout.tsx (unchanged).
//
// MUST be force-dynamic: queryTutors() reads Postgres, and the DB is
// UNREACHABLE at `next build` time (only at runtime inside the container).
// Static/ISR would execute the query at build and fail the deploy with
// "Can't reach database server". force-dynamic defers the query to request time.
export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { queryTutors } from '@/lib/tutorsQuery'
import { getCurrentUser } from '@/lib/auth'
import { TutorsClient } from './client'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')
const TUTORS_DESC = 'დაათვალიერე ხელით შერჩეული ქართველი ექსპერტები — ბიზნესი, კარიერა, იურიდიული, ფინანსური და ფსიქოლოგიური კონსულტაცია. გაფილტრე კატეგორიით, ფასითა და ენით, დაჯავშნე ვიდეოსესია.'

export const metadata: Metadata = {
  title: 'ექსპერტები — იპოვე და დაჯავშნე კონსულტაცია | მცოდნე',
  description: TUTORS_DESC,
  alternates: { canonical: '/tutors' },
  openGraph: {
    title: 'ექსპერტები — მცოდნე',
    description: TUTORS_DESC,
    url: `${SITE_URL}/tutors`,
    type: 'website',
  },
}

export default async function TutorsPage() {
  // Default unfiltered list — matches what the client fetched on first mount
  // with no params. Category / price / language filters are applied client-side
  // on top of this seed; only a free-text `?q=` triggers a client refetch.
  // Resolve the session server-side too so the shared header renders the
  // correct auth state on first paint (no client-side flip).
  const [initialTutors, user] = await Promise.all([
    queryTutors({ limit: 40 }),
    getCurrentUser(),
  ])
  const initialUser = user
    ? { id: user.id, fullName: user.fullName, avatarUrl: user.avatarUrl, role: user.role }
    : null
  return <TutorsClient initialTutors={initialTutors} initialUser={initialUser} />
}
