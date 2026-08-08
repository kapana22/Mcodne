import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { slugify } from '@/lib/slug'
import { ensureDbReady } from '@/lib/dbBoot'

// GET /api/admin/posts — every post (draft + published), newest first, for the
// admin blog editor. The Post table is created by dbBoot, so ensure it exists
// before the first query after a cold deploy.
// `body` is deliberately NOT selected: articles run to 60K characters, so the
// list payload dragged every full text along on every open. The editor
// lazy-loads the selected post (GET /api/admin/posts/[id]) when it needs it.
export async function GET() {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  await ensureDbReady()
  const rows = await prisma.post.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, slug: true, title: true, excerpt: true,
      coverUrl: true, tag: true, status: true, authorName: true,
      publishedAt: true, updatedAt: true,
    },
  })
  return NextResponse.json(rows)
}

// POST /api/admin/posts — create a draft from a title. Slug is derived
// (Georgian → Latin) and de-duplicated; the post starts as DRAFT.
const CreateBody = z.object({ title: z.string().trim().min(2).max(160) })

export async function POST(req: Request) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  const admin = auth.user
  await ensureDbReady()
  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  }
  const { title } = parsed.data
  // `|| 'post'` mirrors the PATCH sibling: an untransliterable title slugifies to
  // '' and would otherwise take the loop's `base-2` stub instead of a real slug.
  const base = slugify(title) || 'post'
  let slug = base
  for (let i = 2; await prisma.post.findUnique({ where: { slug } }); i++) {
    slug = `${base}-${i}`
  }
  const created = await prisma.post.create({
    data: { title, slug, status: 'DRAFT' },
    select: {
      id: true, slug: true, title: true, excerpt: true, body: true,
      coverUrl: true, tag: true, status: true, authorName: true,
      publishedAt: true, updatedAt: true,
    },
  })
  await audit(admin.id, 'post.create', {
    targetType: 'Post',
    targetId: created.id,
    meta: { title: created.title, slug: created.slug },
  })
  return NextResponse.json({ ok: true, post: created }, { status: 201 })
}
