// MarketingTopBar — the marketing pages' header (/about, /blog, /categories,
// /contact, /help, /privacy, /terms, /cookies). A server component that renders
// the shared PublicHeader, so the auth state is server-resolved and the header
// is correct on the first paint (no client-side flip). Same chrome as the
// browse pages — one header everywhere. Named export kept so call sites (all
// server components) don't churn.

import { PublicHeader } from './PublicHeader'

export function MarketingTopBar() {
  return <PublicHeader />
}
