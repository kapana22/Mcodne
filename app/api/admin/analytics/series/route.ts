import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'

// 30-day daily time series for the admin dashboard charts: new signups,
// new bookings, and realized revenue per day. Grouped in SQL (::int casts avoid
// BigInt serialization), then gap-filled to a dense 30-length array in JS so the
// chart always has one point per day.
//
// TWO THINGS THIS GOT WRONG BEFORE (2026-08-12):
//
// 1. DAYS WERE UTC. `date_trunc('day', "createdAt")` buckets by the DATABASE
//    session zone (UTC), and the JS gap-fill keyed off `toISOString()` — so a
//    signup at 02:00 Tbilisi was charted on the previous day. The site's day is
//    Tbilisi (lib/tz), production runs TZ=Asia/Tbilisi, and every other date the
//    admin reads is Tbilisi; one chart on a different calendar is a chart that
//    disagrees with the table next to it. Both sides are now explicitly Tbilisi.
//
// 2. REVENUE DOUBLE-COUNTED PACKAGES. A package lesson's `Booking.price` is a
//    share of money already taken at the Enrollment (lib/packages →
//    BOOKING_REVENUE_ONLY). The bar chart summed both. It now excludes package
//    lessons and adds the Enrollment in on its `paidAt` day, which is how
//    /api/admin/finance and /api/tutor/earnings count it.
type Row = { day: string; c: number }

const TB = 'Asia/Tbilisi'

export async function GET() {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response

  // `AT TIME ZONE 'Asia/Tbilisi'` turns the stored instant into Tbilisi wall
  // time BEFORE truncating, so the bucket is a Tbilisi day. The `::date::text`
  // cast hands back the key already formatted, which removes the second place
  // a zone could sneak in (`new Date(row.day)` re-parsed it as UTC midnight).
  const [signupRows, bookingRows, revenueRows, pkgRows] = await Promise.all([
    prisma.$queryRawUnsafe<Row[]>(`
      SELECT (date_trunc('day', "createdAt" AT TIME ZONE '${TB}'))::date::text AS day, count(*)::int AS c
      FROM "User" WHERE "createdAt" >= now() - interval '29 days' GROUP BY 1`),
    prisma.$queryRawUnsafe<Row[]>(`
      SELECT (date_trunc('day', "createdAt" AT TIME ZONE '${TB}'))::date::text AS day, count(*)::int AS c
      FROM "Booking" WHERE "createdAt" >= now() - interval '29 days' GROUP BY 1`),
    prisma.$queryRawUnsafe<Row[]>(`
      SELECT (date_trunc('day', "createdAt" AT TIME ZONE '${TB}'))::date::text AS day, coalesce(sum(price),0)::int AS c
      FROM "Booking"
      WHERE status = 'COMPLETED' AND "enrollmentId" IS NULL AND "createdAt" >= now() - interval '29 days'
      GROUP BY 1`),
    // Package money, on the day it was actually paid. Guarded: Enrollment is a
    // dbBoot-added table, so an older database simply contributes nothing here
    // rather than failing the whole dashboard.
    prisma.$queryRawUnsafe<Row[]>(`
      SELECT (date_trunc('day', "paidAt" AT TIME ZONE '${TB}'))::date::text AS day, coalesce(sum("priceTotal"),0)::int AS c
      FROM "Enrollment"
      WHERE "paidAt" IS NOT NULL AND "paidAt" >= now() - interval '29 days' GROUP BY 1`).catch(() => [] as Row[]),
  ])

  const toMap = (rows: Row[]) => new Map(rows.map(r => [String(r.day), r.c]))
  const signupsM = toMap(signupRows), bookingsM = toMap(bookingRows)
  const revenueM = toMap(revenueRows), pkgM = toMap(pkgRows)

  const days: string[] = []
  const signups: number[] = [], bookings: number[] = [], revenue: number[] = []
  // „today" in Tbilisi, as a YYYY-MM-DD key — the same calendar the SQL just
  // bucketed by. `sv-SE` is the locale whose short date format IS ISO.
  const tbKey = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: TB })
  const todayTb = new Date(`${tbKey(new Date())}T00:00:00Z`)
  for (let i = 29; i >= 0; i--) {
    const d = new Date(todayTb); d.setUTCDate(d.getUTCDate() - i)
    const k = d.toISOString().slice(0, 10)
    days.push(k.slice(5)) // MM-DD for compact labels
    signups.push(signupsM.get(k) ?? 0)
    bookings.push(bookingsM.get(k) ?? 0)
    revenue.push((revenueM.get(k) ?? 0) + (pkgM.get(k) ?? 0))
  }

  return NextResponse.json({ days, signups, bookings, revenue })
}
