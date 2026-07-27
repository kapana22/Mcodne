import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { normalizePrefs } from '@/lib/notify'

const Segment = z.enum(['all', 'students', 'tutors', 'recent'])
const Body = z.object({
  segment: Segment,
  subject: z.string().min(1).max(120),
  body: z.string().min(1).max(4000),
})

function whereForSegment(segment: z.infer<typeof Segment>) {
  switch (segment) {
    case 'all': return {}
    case 'students': return { role: 'STUDENT' as const }
    case 'tutors': return { role: 'TUTOR' as const }
    case 'recent': {
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000)
      return { createdAt: { gte: since } }
    }
  }
}

// POST /api/admin/broadcast/send → { ok, sent }
// Fans a Notification row out to every user in the segment. No email is
// dispatched — this uses the existing in-app Notification model only. We chunk
// via createMany to keep the write to one query per segment.
export async function POST(req: Request) {
  const admin = await requireRole('ADMIN')
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  const { segment, subject, body } = parsed.data

  const users = await prisma.user.findMany({
    where: whereForSegment(segment),
    select: { id: true, notificationPrefs: true },
  })
  if (users.length === 0) return NextResponse.json({ ok: true, sent: 0 })

  // Filter out users who opted out of ADMIN_BROADCAST — createMany bypasses our
  // notify() gate, so we apply the pref check inline before the fan-out INSERT.
  const targets = users.filter(u => normalizePrefs(u.notificationPrefs).ADMIN_BROADCAST)
  if (targets.length === 0) return NextResponse.json({ ok: true, sent: 0 })

  const rows = targets.map(u => ({
    userId: u.id,
    title: subject.trim(),
    body: body.trim(),
    type: 'ADMIN_BROADCAST',
  }))

  // createMany is a single INSERT — cheaper than N individual writes for a
  // broadcast fan-out. skipDuplicates has no effect here (no unique on user/
  // title) but is left off to keep behavior explicit.
  const res = await prisma.notification.createMany({ data: rows })
  // A message that lands in every user's bell is worth a trail: who sent what,
  // to which segment, and how many rows it actually wrote.
  await audit(admin.id, 'broadcast.send', {
    meta: {
      segment,
      subject: subject.trim(),
      body: body.trim().slice(0, 300),
      sent: res.count,
      segmentSize: users.length,
      optedOut: users.length - targets.length,
    },
  })
  return NextResponse.json({ ok: true, sent: res.count })
}
