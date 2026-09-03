'use client'
import { ClientSidebar } from './ClientSidebar'
import type { ClientNavBadges } from './navConfig'
import { ClientTopBar } from './ClientTopBar'
import { WorkspaceFooter } from '@/components/WorkspaceFooter'

/* Visual shell for every /me/* page: desktop = sticky sidebar + top bar,
   mobile = top bar + the global BottomNav (mounted from AppShell — do not
   duplicate here). Mirrors the provider's WorkspaceShell so both workspaces
   read as one product.

   Unlike the provider shell, the content column imposes NO max-width — each
   page keeps its own <Container> (the enforced grid primitive), so per-page
   widths (content / narrow / wide) and the canon gutter are preserved. Children
   scroll in the document, never a nested scroll container (BottomNav padding +
   sticky rails depend on document scrolling).

   ⚠️ THE GROUND IS `bg-ink-50`, NOT `bg-ink-50/40` (2026-08-31). It was a 40%
   wash back when ink-50 was #FFFFFF and „the ground" and „a card" were the same
   colour; the owner's canvas made ink-50 cream (#FBF9F5) and the whole system
   is now that a white surface reads as LIFTED off the paper. At 40% the paper
   was almost white again, so every card in this room floated on nothing.

   ⚠️ THE TWO SERVER-RESOLVED VALUES ARE PROPS, NOT FETCHES. `badges` holds two
   real counts and `newRequestHref` is the FEATURE_REQUESTS gate — both
   answered in app/me/layout, because a client component can read neither (the
   flag is not in the browser, and a badge that arrives after mount is the exact
   „ნახევარს ტვირთავს ხოლმე" the /me rewrite removed on 2026-08-30). */
export function ClientShell({
  user,
  badges,
  newRequestHref,
  children,
}: {
  user?: { name: string; avatar?: string | null }
  /** Every number the rail prints — live requests, and unread messages since
   *  2026-09-02. One object rather than one prop per pill, so a row cannot be
   *  handed a count that belongs to a different row (see ClientSidebar). */
  badges: ClientNavBadges
  /** The intake, or null on a deployment without the subsystem. */
  newRequestHref: string | null
  /** Does this person already sell here? The server knows; the rail must not
   *  have to guess it after hydration — see app/me/layout.tsx. */
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-ink-50 lg:flex lg:items-start">
      <ClientSidebar badges={badges} newRequestHref={newRequestHref} />
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        <ClientTopBar user={user} />
        {children}
        <WorkspaceFooter />
      </div>
    </div>
  )
}
