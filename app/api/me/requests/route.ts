// GET /api/me/requests — the signed-in client's own service requests, for the
// /me home's section (app/me/_requests.tsx). The page at /me/requests reads
// the same helper directly; this route exists only because the home is a
// client component. Same two gates as the page: the subsystem must be on, and
// the reader must be signed in — the list is theirs and nobody else's.
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { requestsOn } from '@/lib/requests'
import { requestsNotFound } from '@/lib/requestsServer'
import { myRequests } from '@/lib/myRequests'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!requestsOn()) return requestsNotFound()
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  const raw = Number(new URL(req.url).searchParams.get('limit') ?? '')
  const take = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 50) : 50
  const requests = await myRequests(user.id, take)
  return NextResponse.json({ ok: true, requests })
}
