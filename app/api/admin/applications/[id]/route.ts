import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// The HEAVY half of one application, loaded on demand when the admin opens it
// in the review panel. Kept OUT of the list endpoint because idDoc / selfie /
// certificate scans and profile photos are base64 `data:` images — returning
// them for every row bloated the applications panel by several MB.
//
// `professionData` belongs here too: the list endpoint `omit`s it (unbounded
// apply-flow JSON), and nothing else ever fetched it — so the moderation
// panel's „დამატებითი მონაცემები" block read `active.professionData`, which was
// ALWAYS undefined, and the applicant's headline / languages / services (the
// only fields most applications actually fill in) were invisible to the
// moderator. Same for `user.avatarUrl`: it IS the photo that will appear on the
// public profile, so it must be reviewable — but it is a resized base64 webp
// (~9–16 KB each in prod), which is exactly the payload the list must not carry
// 300× over.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  const { id } = await ctx.params
  const app = await prisma.tutorApplication.findUnique({
    where: { id },
    select: {
      id: true,
      idDocUrl: true,
      selfieUrl: true,
      certificates: true,
      professionData: true,
      user: { select: { avatarUrl: true } },
    },
  })
  if (!app) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  return NextResponse.json(app)
}
