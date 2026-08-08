import { NextResponse, after } from 'next/server'
import type { NextRequest } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { getCurrentUser } from '@/lib/auth'
import { track } from '@/lib/events'
import { parseEventBody, MAX_BODY_CHARS } from '@/components/booking/funnelEvents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The browser's ONLY way into the Event table.
//
// Threat model, because this is an unauthenticated write:
//   • name  — must be one of the booking-funnel constants (allow-list in
//     components/booking/funnelEvents.ts). A client can never invent a row name,
//     so the table can never be polluted into uselessness or grown by a script
//     naming a million distinct events.
//   • props — allow-listed KEYS, scalar values only, the two string props
//     regex-constrained. There is deliberately no "pass anything through" path:
//     free text the user typed (the intake is someone describing a personal
//     problem) must be impossible to log even by accident.
//   • volume — IP-keyed rate limit via the XFF-spoofing-safe clientIp() helper
//     the auth routes use. A whole booking attempt emits ~7 events, so 60/min
//     is roomy for a human and hostile to a flood.
//
// Everything after validation happens in after(): the response is `{ ok: true }`
// and nothing the analytics path does — a slow insert, a missing table, a
// thrown query — can slow or break the page that fired the beacon.
const MAX_EVENTS_PER_MIN = 60

export async function POST(req: NextRequest) {
  const rl = rateLimit(`events:${clientIp(req)}`, MAX_EVENTS_PER_MIN, 60)
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: 'RATE_LIMITED' }, { status: 429 })
  }

  // Read as text first so an oversized body is rejected before JSON.parse has
  // to walk it. (Next has its own body cap; this one is about *our* shape.)
  let text: string
  try {
    text = await req.text()
  } catch {
    return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  }
  if (text.length > MAX_BODY_CHARS) {
    return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  }

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  }

  const parsed = parseEventBody(raw)
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  }

  // Attribution is opportunistic: most funnel events fire before anyone signs
  // in, and anonymous is a first-class case. Start the session lookup inside
  // the request scope (cookies are readable here) but do NOT await it — the
  // response must not wait on a DB round-trip for a beacon.
  const userP = getCurrentUser()
    .then(u => u?.id ?? null)
    .catch(() => null)

  after(async () => {
    try {
      await track(parsed.name, parsed.props, await userP)
    } catch {
      // track() is contractually non-throwing; this is belt-and-braces so a
      // regression there can never surface as a 500 on someone's booking.
    }
  })

  return NextResponse.json({ ok: true })
}
