// GET /api/requests/<ref>/status — what is happening to my request, right now.
//
// The POLL half of the live room. app/request/_live reads it on a timer only
// when the stream (./events) is not available; the payload itself — every
// number counted, never simulated — is built by lib/requestLive, which is the
// ONE place both routes get it from. Read that file for what is counted and
// why the tempting number („N ექსპერტი ათვალიერებს") is refused.
//
// Authorised by POSSESSION OF THE REFERENCE, like every other client surface —
// no account, by design.

import { NextResponse } from 'next/server'
import { ensureDbReady } from '@/lib/dbBoot'
import { normalizePublicRef } from '@/lib/requests'
import { requestLiveStatus } from '@/lib/requestLive'
import { requestsViewer } from '@/lib/requestsServer'
import { rateLimit, clientIp } from '@/lib/rateLimit'

const notFound = () => NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

export async function GET(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const viewer = await requestsViewer()
  if (!viewer.clientAllowed) return notFound()

  const ref = normalizePublicRef((await params).ref)
  if (!ref) return notFound()

  // ⚠️ THIS IS AN EXISTENCE ORACLE, so it is throttled (2026-08-17, found in
  // review). Unauthenticated, keyed on a 5-character reference, and it answers
  // 200 for a live one and 404 for a dead one — which is exactly the primitive
  // you sweep the keyspace with. And the reference is not a lookup code: it
  // authorises accepting an offer and reading the client's thread with us, so a
  // harvested one is a full account takeover of that request.
  //
  // The keyspace (32^5 ≈ 33.5M) makes a blind sweep expensive rather than
  // impossible, and „expensive" is not a control — the budget is. 60/hour per
  // IP is far above any real client, who polls their own page every 20s only
  // while it is open AND the stream (./events) is down, and far below a sweep
  // worth running.
  const rl = rateLimit(`request-status:${clientIp(req)}`, 60, 60 * 60)
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: 'RATE_LIMITED', retryInSec: rl.retryInSec },
      { status: 429 },
    )
  }

  await ensureDbReady()
  const live = await requestLiveStatus(ref)
  if (!live) return notFound()
  return NextResponse.json({ ok: true, ...live })
}
