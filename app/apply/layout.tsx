import type { Metadata } from 'next'
import { requireRole } from '@/lib/auth'

// Re-verify the session on every request (same as the other guarded segments)
// so /apply is never served from a cached render that outlived the session.
export const dynamic = 'force-dynamic'

// `app/apply/page.tsx` is a client component so metadata cannot be exported
// from the page itself — Next requires page-level metadata on server modules.
// A thin server-side layout is the standard workaround.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

export const metadata: Metadata = {
  title: 'გახდი ექსპერტი — მცოდნე',
  description: 'შემოუერთდი მცოდნეს — გააზიარე შენი ცოდნა და დაიწყე კონსულტაციები.',
  alternates: { canonical: `${SITE_URL}/apply` },
  openGraph: {
    title: 'გახდი ექსპერტი — მცოდნე',
    description: 'შემოუერთდი მცოდნეს — გააზიარე შენი ცოდნა და დაიწყე კონსულტაციები.',
    url: `${SITE_URL}/apply`,
  },
}

export default async function ApplyLayout({ children }: { children: React.ReactNode }) {
  // STUDENT only. Applicants keep role STUDENT until an admin approves (see
  // app/api/auth/signup/route.ts — every self-signup is STUDENT; the teach
  // signup hands off here as a STUDENT). A TUTOR re-applying is meaningless
  // (already an expert → /tutor). ADMINs are deliberately excluded: an admin
  // who submits and then approves their own application demotes themselves to
  // TUTOR and locks everyone out of /admin. requireRole redirects an admin to
  // /admin. Guests get /signin?redirect=/apply via requireUser's x-current-path.
  await requireRole(['STUDENT'])
  return children
}
