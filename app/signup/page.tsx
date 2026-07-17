import AuthPage from '../signin/auth-client'

// First-class /signup route — renders the shared auth page with the signup
// view as its default. /signin?view=signup remains a working alias.
export default function SignUpPage() {
  return <AuthPage defaultView="signup" />
}
