import { getCurrentUser } from '@/lib/auth'
import { PublicTopBar } from './PublicTopBar'
import type { Me } from '@/lib/me'

// Server wrapper around the public header. Reads the session server-side and
// hands the resolved identity to PublicTopBar as `initialUser`, so the header
// renders the correct auth state on the FIRST paint — no client-side flip.
//
// Use this on SERVER-rendered public pages (marketing pages, and the server
// wrappers of /tutors and /tutors/[id]). Client-only pages (home, /ask) render
// <PublicTopBar/> directly and fall back to the deduped client probe; the
// uniform nav means there's no rearrange there either.
//
// Reading cookies() here makes the consuming page dynamic — acceptable: these
// are low-traffic marketing pages, and a correct, non-flickering header is
// worth more than their static cache.
export async function PublicHeader({ activeHref }: { activeHref?: string }) {
  const user = await getCurrentUser()
  const initialUser: Me | null = user
    ? {
        id: user.id,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        // Me is a nullable union — index the role type off the non-null branch.
        role: user.role as NonNullable<Me>['role'],
      }
    : null
  return <PublicTopBar activeHref={activeHref} initialUser={initialUser} />
}
