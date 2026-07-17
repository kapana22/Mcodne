import { NextResponse } from 'next/server'
import { getImpersonatorId } from '@/lib/auth'

// GET /api/admin/impersonate/status
// Lightweight read for the persistent "you are impersonating" banner. Reads the
// CURRENT session's server-side `impersonatorId` (not a client cookie), so it
// only ever reflects genuine impersonation state and cannot be spoofed.
export async function GET() {
  const originalAdminId = await getImpersonatorId()
  return NextResponse.json({
    impersonating: !!originalAdminId,
    originalAdminId,
  })
}
