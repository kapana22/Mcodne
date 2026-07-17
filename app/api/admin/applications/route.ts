import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

export async function GET() {
  await requireRole('ADMIN')
  const apps = await prisma.tutorApplication.findMany({
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { email: true, avatarUrl: true } } },
  })
  return NextResponse.json(apps)
}
