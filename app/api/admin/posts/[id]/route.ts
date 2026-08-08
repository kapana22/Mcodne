import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { slugify } from '@/lib/slug'
import { ensureDbReady } from '@/lib/dbBoot'

const SELECT = {
  id: true, slug: true, title: true, excerpt: true, body: true,
  coverUrl: true, tag: true, status: true, authorName: true,
  publishedAt: true, updatedAt: true,
} as const

// GET /api/admin/posts/[id] — one full post, body included. The list endpoint
// omits `body` (60K-character articles × N posts), so the editor fetches the
// selected post here before seeding the form.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  await ensureDbReady()
  const { id } = await params
  const post = await prisma.post.findUnique({ where: { id }, select: SELECT })
  if (!post) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  return NextResponse.json({ ok: true, post })
}

// PATCH /api/admin/posts/[id] — partial update. Publishing (status → PUBLISHED)
// stamps publishedAt the first time. Empty bodies are rejected so no-op saves
// fail loud. `slug` is re-slugified + de-duplicated (excluding this post).
const Body = z
  .object({
    title: z.string().trim().min(2).max(160).optional(),
    slug: z.string().trim().min(1).max(80).optional(),
    excerpt: z.string().trim().max(400).optional(),
    body: z.string().max(60000).optional(),
    // 2000 was a URL ceiling, and it silently rejected every UPLOADED cover:
    // an uploaded image arrives as a base64 data URI, and a 1200×675 webp is
    // ~80–150 THOUSAND characters. Exactly the failure that left every diploma
    // unsaved for weeks (zod max(500) vs a base64 PDF — see
    // tests/certificateStorage.test.ts). The bound stays real: 1.2M characters
    // ≈ 900KB of binary, far above anything /api/uploads can emit for `cover`
    // (it hard-crops to 1200×675 webp) and far below anything that could bloat
    // the row unnoticed.
    coverUrl: z.string().trim().max(1_200_000).optional(),
    tag: z.string().trim().max(40).optional(),
    authorName: z.string().trim().max(80).optional(),
    status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  })
  .refine(v => Object.keys(v).length > 0, { message: 'EMPTY_BODY' })

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  const admin = auth.user
  await ensureDbReady()
  const { id } = await params
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  }

  const existing = await prisma.post.findUnique({ where: { id }, select: { publishedAt: true } })
  if (!existing) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

  const data: Record<string, unknown> = { ...parsed.data }

  // Normalise a custom slug and keep it unique across other posts.
  if (parsed.data.slug !== undefined) {
    const base = slugify(parsed.data.slug) || 'post'
    let slug = base
    for (let i = 2; await prisma.post.findFirst({ where: { slug, NOT: { id } }, select: { id: true } }); i++) {
      slug = `${base}-${i}`
    }
    data.slug = slug
  }

  // Stamp publishedAt on the first publish; going back to DRAFT keeps the date.
  if (parsed.data.status === 'PUBLISHED' && !existing.publishedAt) {
    data.publishedAt = new Date()
  }

  try {
    const updated = await prisma.post.update({ where: { id }, data, select: SELECT })
    // Publishing/unpublishing is what actually changes the public site, so it
    // gets its own action string; plain edits log which fields moved.
    const action = parsed.data.status === 'PUBLISHED' ? 'post.publish'
      : parsed.data.status === 'DRAFT' ? 'post.unpublish'
      : 'post.update'
    await audit(admin.id, action, {
      targetType: 'Post',
      targetId: id,
      meta: { title: updated.title, slug: updated.slug, fields: Object.keys(parsed.data) },
    })
    return NextResponse.json({ ok: true, post: updated })
  } catch {
    return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  }
}

// DELETE /api/admin/posts/[id]
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  const admin = auth.user
  await ensureDbReady()
  const { id } = await params
  try {
    // Read before deleting — the audit row must still name what disappeared.
    const before = await prisma.post.findUnique({ where: { id }, select: { title: true, slug: true, status: true } })
    await prisma.post.delete({ where: { id } })
    await audit(admin.id, 'post.delete', {
      targetType: 'Post',
      targetId: id,
      meta: { title: before?.title ?? null, slug: before?.slug ?? null, status: before?.status ?? null },
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  }
}
