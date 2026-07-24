'use client'
// Site-text context. The server (app/layout) resolves the full map once per
// request and feeds it here; components read editable copy via <SiteText k/> or
// useSiteText(). Works in BOTH server and client parents because <SiteText> is a
// tiny client leaf — no page needs to become async to show editable copy.

import { createContext, useContext } from 'react'
import { SITE_TEXT_DEFAULTS } from '@/lib/siteTextDefs'

const Ctx = createContext<Record<string, string> | null>(null)

export function SiteTextProvider({ value, children }: { value: Record<string, string>; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSiteText(key: string): string {
  const map = useContext(Ctx)
  return map?.[key] ?? SITE_TEXT_DEFAULTS[key] ?? ''
}

// Render a single editable string. Use inside any markup (server or client):
//   <SiteText k="footer.tagline" />
export function SiteText({ k }: { k: string }) {
  return <>{useSiteText(k)}</>
}
