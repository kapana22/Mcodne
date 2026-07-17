import AuthPage from './auth-client'

// Thin route wrapper — the full auth UI lives in ./auth-client (shared with
// /signup, which renders the same component with defaultView="signup").
// Legacy `?view=signup` deep links keep working: an explicit ?view= always
// overrides the route default inside AuthPage.
export default function SignInPage() {
  return <AuthPage defaultView="signin" />
}
