import { NextResponse } from 'next/server'
import { sendSessionReminders } from '@/lib/sessionReminders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Standalone session-reminder trigger. The reminder logic also rides the */15
// cleanup cron (see /api/internal/cleanup), so this endpoint is mainly for a
// dedicated cron or manual runs. Secret-gated with the same CLEANUP_SECRET.
//
//   curl -fsS "https://mcodne.ge/api/internal/reminders?secret=$CLEANUP_SECRET"

function authed(provided: string | null): { ok: true } | { res: NextResponse } {
  const expected = process.env.CLEANUP_SECRET
  if (!expected) return { res: NextResponse.json({ ok: false, error: 'DISABLED', hint: 'Set CLEANUP_SECRET in env.' }, { status: 503 }) }
  if (!provided || provided !== expected) return { res: NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 }) }
  return { ok: true }
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') || ''
  const gate = authed(auth.startsWith('Bearer ') ? auth.slice(7) : null)
  if ('res' in gate) return gate.res
  const result = await sendSessionReminders()
  return NextResponse.json({ ok: true, ...result })
}

export async function GET(req: Request) {
  const gate = authed(new URL(req.url).searchParams.get('secret'))
  if ('res' in gate) return gate.res
  const result = await sendSessionReminders()
  return NextResponse.json({ ok: true, ...result })
}
