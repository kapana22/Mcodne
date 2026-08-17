import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/* „What did people ask for that we don't have?"  2026-08-11
 *
 * The taxonomy has only ever grown by guesswork. /apply offers a fixed list,
 * and until today the step could not be completed by anyone outside it — so an
 * expert in a field we had not thought of either mis-filed themselves under the
 * nearest wrong sphere or left, and in both cases nothing reached anyone who
 * could add the sphere. There was no question this endpoint answers because
 * there was no way to ask it.
 *
 * Now „ჩემი სფერო სიაში არ არის" is always stored (professionData.requestedCategory,
 * see app/apply/_form.tsx → OTHER_CAT_MAX), and this aggregates it: the field
 * people typed, how many typed it, and when it was last asked for.
 *
 * Grouped case-insensitively on the trimmed value, because „დიეტოლოგია" and
 * „დიეტოლოგი " are the same request and counting them apart is how a real
 * signal reads as two weak ones. The most recent spelling is what is shown.
 *
 * REJECTED applications are included on purpose: a field being asked for is a
 * fact about demand whatever we decided about the person asking.
 */
export async function GET(req: Request) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response

  const { searchParams } = new URL(req.url)
  const rawDays = Number(searchParams.get('days'))
  const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(365, Math.round(rawDays)) : 180

  const rows = await prisma.tutorApplication.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - days * 86_400_000) },
    },
    // No JSON filter: Prisma's nullable-Json filters need `Prisma.DbNull` and
    // still cannot reach INTO the blob portably. The window + `take` already
    // bound the read, and the null rows are dropped in the loop below.
    orderBy: { createdAt: 'desc' },
    select: { professionData: true, createdAt: true, specialty: true, status: true },
    take: 2000,
  })

  const byKey = new Map<string, { label: string; count: number; lastAt: string; examples: string[] }>()
  for (const r of rows) {
    const pd = r.professionData as Record<string, unknown> | null
    const raw = pd && typeof pd === 'object' && !Array.isArray(pd) ? pd.requestedCategory : null
    const label = typeof raw === 'string' ? raw.trim() : ''
    if (!label) continue
    const key = label.toLowerCase()
    const hit = byKey.get(key)
    if (hit) {
      hit.count += 1
      // `rows` is newest-first, so the first spelling seen is the newest one and
      // `lastAt` is already correct — only the count grows.
      if (hit.examples.length < 3 && r.specialty) hit.examples.push(r.specialty)
    } else {
      byKey.set(key, {
        label,
        count: 1,
        lastAt: r.createdAt.toISOString(),
        examples: r.specialty ? [r.specialty] : [],
      })
    }
  }

  const items = [...byKey.values()].sort(
    (a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt),
  )
  return NextResponse.json({ items, days })
}
