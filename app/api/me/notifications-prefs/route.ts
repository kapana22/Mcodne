import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { normalizePrefs, type PrefKey } from '@/lib/notify'

// GET /api/me/notifications-prefs → { prefs: { <key>: bool, … } }
// Falls back to DEFAULT_PREFS when the column is null (fresh user). This is
// the shape the Settings page renders — normalized so unknown JSON on old rows
// still yields a strict boolean map.
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { notificationPrefs: true },
  })
  const prefs = normalizePrefs(row?.notificationPrefs)
  return NextResponse.json({ prefs })
}

// PATCH body accepts a partial map — any missing key inherits the current
// stored value. This lets the UI send only the toggled key on each flip
// instead of resubmitting the whole payload.
const PrefsBody = z.object({
  prefs: z
    .object({
      MESSAGE_NEW: z.boolean().optional(),
      REVIEW_NEW: z.boolean().optional(),
      APPLICATION_STATUS: z.boolean().optional(),
      ADMIN_BROADCAST: z.boolean().optional(),
    })
    .strict(),
})

export async function PATCH(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const parsed = PrefsBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const current = await prisma.user.findUnique({
    where: { id: user.id },
    select: { notificationPrefs: true },
  })

  // Merge partial update over the normalized current — never trust the DB blob
  // to already match the strict shape (older writes may have missing keys).
  const merged = { ...normalizePrefs(current?.notificationPrefs) }
  for (const k of Object.keys(parsed.data.prefs) as PrefKey[]) {
    const v = parsed.data.prefs[k]
    if (typeof v === 'boolean') merged[k] = v
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { notificationPrefs: merged },
  })

  return NextResponse.json({ ok: true, prefs: merged })
}
