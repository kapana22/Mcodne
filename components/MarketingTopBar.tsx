'use client'
// MarketingTopBar — thin alias over PublicTopBar so the static marketing
// pages (/about, /blog, /categories, /contact, /help, /privacy, /terms,
// /cookies) share the exact same auth-aware chrome as the browse pages.
//
// Historically this was a separate, guest-only bar: signed-in users landing
// on /about or /help kept seeing „შესვლა/დაიწყე" instead of their avatar,
// nav taxonomy differed from /tutors, and the CTA label drifted. Delegating
// kills all three drifts at once; keep the named export so call sites don't
// churn.

import { PublicTopBar } from './PublicTopBar'

export function MarketingTopBar() {
  return <PublicTopBar />
}
