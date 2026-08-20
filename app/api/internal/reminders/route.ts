import { NextResponse } from 'next/server'
import { sendSessionReminders } from '@/lib/sessionReminders'
import { cronAuth } from '@/lib/cronAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Standalone session-reminder trigger. The reminder logic also rides the ∗/15
// cleanup cron (see /api/internal/cleanup), so this endpoint is mainly for a
// dedicated cron or manual runs. Gated by lib/cronAuth with CLEANUP_SECRET.
//
//   curl -fsS -X POST -H "Authorization: Bearer $CLEANUP_SECRET" \
//     https://mcodne.ge/api/internal/reminders

export async function POST(req: Request) {
  const gate = cronAuth(req)
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status })
  const result = await sendSessionReminders()
  return NextResponse.json({ ok: true, ...result })
}

export async function GET(req: Request) {
  // Legacy `?secret=` tolerated on GET only, matching /cleanup, until the cron
  // command moves to the header form.
  const gate = cronAuth(req, { allowQuery: true })
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status })
  const result = await sendSessionReminders()
  return NextResponse.json({ ok: true, ...result })
}
