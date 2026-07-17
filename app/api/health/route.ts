import { NextResponse } from 'next/server'
import { ensureDbReady } from '@/lib/dbBoot'

export async function GET() {
  // Fire-and-await schema boot here so `curl /api/health` after a deploy
  // is a reliable way to prime the DB. Cached across the process lifetime,
  // so hits after the first are essentially free.
  await ensureDbReady()
  return NextResponse.json({ ok: true, ts: Date.now() })
}
