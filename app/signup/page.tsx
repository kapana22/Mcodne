import { redirect } from 'next/navigation'
import { getCurrentUser, postAuthHome } from '@/lib/auth'
import { safeInternalPath } from '@/lib/roleHome'
import AuthPage from '../signin/auth-client'

// First-class /signup route — renders the shared auth page with the signup
// view as its default. /signin?view=signup remains a working alias.
//
// Mirrors /signin: a signed-in user is bounced to their workspace instead of
// being shown a registration form (verify/reset/onboarding sub-views, which
// run with a live session, are exempt — see app/signin/page.tsx).
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const view = typeof sp.view === 'string' ? sp.view : null
  if (!view || view === 'signin' || view === 'signup') {
    const user = await getCurrentUser()
    if (user) {
      const explicit =
        safeInternalPath(typeof sp.redirect === 'string' ? sp.redirect : null) ??
        safeInternalPath(typeof sp.next === 'string' ? sp.next : null)
      redirect(explicit ?? (await postAuthHome(user)))
    }
  }
  return <AuthPage defaultView="signup" />
}
