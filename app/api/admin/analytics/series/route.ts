import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'

// 30-day daily time series for the admin dashboard charts: new signups,
// new bookings, and realized revenue (completed bookings) per day. Grouped in
// SQL (::int casts avoid BigInt serialization), then gap-filled to a dense
// 30-length array in JS so the chart always has one point per day.
type Row = { day: Date; c: number }

export async function GET() {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response

  const [signupRows, bookingRows, revenueRows] = await Promise.all([
    prisma.$queryRawUnsafe<Row[]>(`
      SELECT date_trunc('day', "createdAt")::date AS day, count(*)::int AS c
      FROM "User" WHERE "createdAt" >= now() - interval '29 days' GROUP BY 1`),
    prisma.$queryRawUnsafe<Row[]>(`
      SELECT date_trunc('day', "createdAt")::date AS day, count(*)::int AS c
      FROM "Booking" WHERE "createdAt" >= now() - interval '29 days' GROUP BY 1`),
    prisma.$queryRawUnsafe<Row[]>(`
      SELECT date_trunc('day', "createdAt")::date AS day, coalesce(sum(price),0)::int AS c
      FROM "Booking" WHERE status = 'COMPLETED' AND "createdAt" >= now() - interval '29 days' GROUP BY 1`),
  ])

  const key = (d: Date) => new Date(d).toISOString().slice(0, 10)
  const toMap = (rows: Row[]) => new Map(rows.map(r => [key(r.day), r.c]))
  const signupsM = toMap(signupRows), bookingsM = toMap(bookingRows), revenueM = toMap(revenueRows)

  const days: string[] = []
  const signups: number[] = [], bookings: number[] = [], revenue: number[] = []
  const today = new Date(); today.setUTCHours(0, 0, 0, 0)
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today); d.setUTCDate(d.getUTCDate() - i)
    const k = d.toISOString().slice(0, 10)
    days.push(k.slice(5)) // MM-DD for compact labels
    signups.push(signupsM.get(k) ?? 0)
    bookings.push(bookingsM.get(k) ?? 0)
    revenue.push(revenueM.get(k) ?? 0)
  }

  return NextResponse.json({ days, signups, bookings, revenue })
}
