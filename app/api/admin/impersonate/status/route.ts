import { NextResponse } from 'next/server'
import { getCurrentUser, getImpersonatorId } from '@/lib/auth'

// GET /api/admin/impersonate/status
// Lightweight read for the persistent "you are impersonating" banner. Reads the
// CURRENT session's server-side `impersonatorId` (not a client cookie), so it
// only ever reflects genuine impersonation state and cannot be spoofed.
//
// ⚠️ WHY THIS ONE ROUTE UNDER /api/admin HAS NO ROLE GUARD, written down so the
// next reviewer who greps for one finds the reason instead of a hole
// (2026-08-21). The caller is components/ImpersonationBanner, mounted in the
// root layout for EVERY visitor, and the person it answers for is the
// IMPERSONATED user — who is by definition not an admin. A `requireRole` here
// would blind the banner for exactly the session that needs it, which is the
// one where somebody else is acting as you.
//
// What it may therefore never do is disclose anything. Two changes make that
// true rather than merely likely:
//   · a session is required, so an anonymous caller gets the constant `false`
//     without a database read (the banner already ignores a falsy answer);
//   · `originalAdminId` is NOT returned. The banner only ever reads
//     `impersonating`; the id was the one field on this route that told the
//     impersonated user something about the admin, and nothing rendered it.
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ impersonating: false })

  return NextResponse.json({ impersonating: !!(await getImpersonatorId()) })
}
