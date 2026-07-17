import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import bcrypt from 'bcryptjs'

// Demo-account seed endpoint. Idempotent — upserts the three demo accounts
// and 6 upcoming availability slots for the demo tutor. Safe to call repeatedly.
// Only exposed on non-production or when SEED_ENABLED=1.
export async function POST() {
  // Hard gate: in production this endpoint is OFF unless SEED_ENABLED=1 is
  // explicitly set. Previously the guard was an empty `if` block, so the seed
  // ran for anyone in prod and reset the admin password to a known value —
  // a full account-takeover hole. Fail closed with a 404 (don't advertise it).
  if (process.env.NODE_ENV === 'production' && process.env.SEED_ENABLED !== '1') {
    return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  }
  await ensureDbReady()

  const CATEGORIES = [
    { slug: 'business',   name: 'ბიზნესი',    order: 1, count: 32 },
    { slug: 'finance',    name: 'ფინანსები',   order: 2, count: 18 },
    { slug: 'career',     name: 'კარიერა',     order: 3, count: 24 },
    { slug: 'law',        name: 'სამართალი',   order: 4, count: 12 },
    { slug: 'marketing',  name: 'მარკეტინგი',  order: 5, count: 21 },
    { slug: 'psychology', name: 'ფსიქოლოგია',  order: 6, count: 17 },
  ]
  for (const c of CATEGORIES) {
    await prisma.category.upsert({ where: { slug: c.slug }, update: c, create: c })
  }

  await prisma.user.upsert({
    where: { email: 'admin@mcodne.ge' },
    update: { role: 'ADMIN', passwordHash: await bcrypt.hash('admin1234', 10), emailVerified: true },
    create: {
      email: 'admin@mcodne.ge', fullName: 'ადმინი',
      passwordHash: await bcrypt.hash('admin1234', 10), role: 'ADMIN', emailVerified: true,
    },
  })

  await prisma.user.upsert({
    where: { email: 'student@mcodne.ge' },
    update: { role: 'STUDENT', passwordHash: await bcrypt.hash('student1234', 10), emailVerified: true },
    create: {
      email: 'student@mcodne.ge', fullName: 'თამარ ლომიძე',
      passwordHash: await bcrypt.hash('student1234', 10), role: 'STUDENT',
      avatarUrl: 'https://i.pravatar.cc/120?img=23', emailVerified: true,
    },
  })

  const businessCat = await prisma.category.findUnique({ where: { slug: 'business' } })
  const tutorUser = await prisma.user.upsert({
    where: { email: 'tutor@mcodne.ge' },
    update: { role: 'TUTOR', passwordHash: await bcrypt.hash('tutor1234', 10), emailVerified: true },
    create: {
      email: 'tutor@mcodne.ge', fullName: 'გიორგი მელაძე',
      passwordHash: await bcrypt.hash('tutor1234', 10), role: 'TUTOR',
      avatarUrl: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=320&q=80',
      emailVerified: true,
    },
  })
  // Single demo expert — bookable via the calendar slots seeded below.
  const tutorProfile = await prisma.tutorProfile.upsert({
    where: { userId: tutorUser.id },
    update: {
      consultationDurationMin: 30,
    },
    create: {
      userId: tutorUser.id,
      headline: 'ex-McKinsey · 12 წელი გამოცდილება',
      bio: '10 წელი ვაშენე და ვყიდე კომპანიები — გეტყვი ნამდვილ ცდომილებებს.',
      specialty: 'ბიზნეს-სტრატეგია',
      yearsExp: 12, rating: 4.9, reviewsCount: 124, sessionsCount: 312,
      price: 80, verified: true,
      categoryId: businessCat?.id,
      consultationDurationMin: 30,
    },
  })

  // Seed 6 availability slots on the next 6 weekdays at 14:00–15:00.
  const existingSlots = await prisma.availabilitySlot.count({
    where: { tutorId: tutorProfile.id, startAt: { gte: new Date() } },
  })
  if (existingSlots === 0) {
    const slots = []
    const base = new Date(); base.setHours(0, 0, 0, 0)
    let added = 0
    for (let d = 1; added < 6 && d < 15; d++) {
      const day = new Date(base); day.setDate(day.getDate() + d)
      if (day.getDay() === 0) continue
      const hour = 10 + (added % 6)
      const start = new Date(day); start.setHours(hour, 0, 0, 0)
      const end = new Date(start.getTime() + 3 * 60 * 60 * 1000)
      slots.push({ tutorId: tutorProfile.id, startAt: start, endAt: end, booked: false })
      added++
    }
    if (slots.length > 0) await prisma.availabilitySlot.createMany({ data: slots })
  }

  return NextResponse.json({
    ok: true,
    accounts: [
      { role: 'ADMIN',   email: 'admin@mcodne.ge',   password: 'admin1234' },
      { role: 'STUDENT', email: 'student@mcodne.ge', password: 'student1234' },
      { role: 'TUTOR',   email: 'tutor@mcodne.ge',   password: 'tutor1234' },
    ],
  })
}
