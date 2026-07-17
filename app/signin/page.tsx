import { redirect } from 'next/navigation'
import { getCurrentUser, postAuthHome } from '@/lib/auth'
import { safeInternalPath } from '@/lib/roleHome'
import AuthPage from './auth-client'

// Thin route wrapper — the full auth UI lives in ./auth-client (shared with
// /signup, which renders the same component with defaultView="signup").
// Legacy `?view=signup` deep links keep working: an explicit ?view= always
// overrides the route default inside AuthPage.
//
// A signed-in user who lands on the plain signin/signup views is bounced to
// their workspace (honoring a safe ?redirect=) instead of being shown the
// auth form — showing "sign in" to someone with a live session is exactly the
// role/session confusion this page must never create. The verify / reset /
// onboarding sub-views are exempt: they legitimately run WITH a live session
// (signup mints one before email verification, reset/confirm mints one before
// the done step), so bouncing there would break those flows.
export default async function SignInPage({
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
  return <AuthPage defaultView="signin" />
}
