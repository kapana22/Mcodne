import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { PAYMENTS_LIVE, TUTOR_PAYOUT_PCT } from '@/lib/flags'
import { fmtKaDateTime } from '@/lib/kaDate'
import { BOOKING_REVENUE_ONLY } from '@/lib/packages'
import { ROLE } from '@/lib/roles'

// Single source of truth for the tutor's cut — derived from the canonical
// commission percentage in lib/flags.ts (never a hardcoded 0.85 that could drift).
// Online payments aren't live yet and the platform withholds NOTHING today, so
// while PAYMENTS_LIVE is false the expert's share is the full amount: gross IS
// what they'd receive. The commission-aware branch stays here so flipping the
// flag restores net-after-commission everywhere at once.
const TUTOR_SHARE = PAYMENTS_LIVE ? TUTOR_PAYOUT_PCT / 100 : 1

// ── CSV export (?format=csv) helpers — server-side twin of the admin
// dashboard's client-side Blob helper (app/admin/page.tsx): RFC 4180 quoting
// + UTF-8 BOM so Excel opens Georgian text correctly. Reimplemented here
// because the admin helper lives in a 'use client' file.
const escapeCsv = (v: unknown): string => {
  if (v == null) return ''
  const s = String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
const csvResponse = (filename: string, rows: (string | number | null | undefined)[][]) => {
  const csv = rows.map(r => r.map(escapeCsv).join(',')).join('\r\n')
  return new NextResponse('\uFEFF' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
// While payments aren't live, gross === share, so the second money column
// would just repeat the first — drop it until the commission actually applies.
const CSV_HEADER = [
  'თარიღი', 'თემა', 'კლიენტი', 'ხანგრძლივობა (წთ)', 'თანხა (₾)',
  ...(PAYMENTS_LIVE ? ['ჩემი წილი (₾)'] : []),
  'სტატუსი', 'ჯავშნის ID',
]
// Payout wording asserts that money moved — only true once payments are live.
const PAYOUT_KA: Record<string, string> = PAYMENTS_LIVE
  ? { PENDING: 'მოლოდინში', RELEASED: 'გადარიცხულია', REFUNDED: 'დაბრუნებულია' }
  : { PENDING: 'მოლოდინში', RELEASED: 'დასრულდა', REFUNDED: 'ანულირდა' }

export async function GET(req: Request) {
  const auth = await requireRoleApi([ROLE.PROVIDER, ROLE.ADMIN])
  if (auth.response) return auth.response
  const user = auth.user
  const wantsCsv = new URL(req.url).searchParams.get('format') === 'csv'
  const profile = await prisma.tutorProfile.findUnique({ where: { userId: user.id } })
  if (!profile) {
    if (wantsCsv) return csvResponse('mcodne-earnings.csv', [CSV_HEADER])
    return NextResponse.json({
      totalEarned: 0,
      pendingPayout: 0,
      completedCount: 0,
      thisMonth: { earned: 0, count: 0 },
      transactions: [],
    })
  }

  // Full export — ALL completed sessions (the JSON path's transactions list is
  // capped at the recent 50 for display; an accounting export must not be).
  if (wantsCsv) {
    const all = await prisma.booking.findMany({
      where: { tutorId: profile.id, status: 'COMPLETED', ...BOOKING_REVENUE_ONLY },
      orderBy: { startAt: 'desc' },
      take: 5000,
      include: { student: { select: { fullName: true } } },
    })
    const filename = `mcodne-earnings-${new Date().toISOString().slice(0, 10)}.csv`
    return csvResponse(filename, [
      CSV_HEADER,
      ...all.map(b => [
        fmtKaDateTime(b.startAt, { year: true }),
        b.topic,
        b.student.fullName,
        b.durationMin,
        b.price,
        ...(PAYMENTS_LIVE ? [Math.round(b.price * TUTOR_SHARE)] : []),
        PAYOUT_KA[b.payoutStatus] ?? b.payoutStatus,
        b.ref.slice(0, 8),
      ]),
    ])
  }

  // Month boundary in Tbilisi wall-clock (fixed UTC+4, no DST) — same manual
  // offset math as availability/bulk so "this month" doesn't shift in a UTC
  // container.
  const TB_OFFSET_MS = 4 * 3600 * 1000
  const nowTb = new Date(Date.now() + TB_OFFSET_MS)
  const monthStart = new Date(Date.UTC(nowTb.getUTCFullYear(), nowTb.getUTCMonth(), 1) - TB_OFFSET_MS)
  const monthEnd = new Date(Date.UTC(nowTb.getUTCFullYear(), nowTb.getUTCMonth() + 1, 1) - TB_OFFSET_MS)

  const [completed, pending, lifetime, month] = await Promise.all([
    // Recent list for the transactions table (display only).
    prisma.booking.findMany({
      where: { tutorId: profile.id, status: 'COMPLETED', ...BOOKING_REVENUE_ONLY },
      orderBy: { startAt: 'desc' },
      take: 50,
      include: { student: { select: { id: true, fullName: true, avatarUrl: true } } },
    }),
    // NOTE: structurally always 0 today — every path that sets status COMPLETED
    // (bookings/[id] complete + no_show, internal/cleanup auto-complete, admin
    // dispute release) also sets payoutStatus RELEASED, so a COMPLETED booking
    // is never PENDING. The field is kept for the payout-queue era (and because
    // /tutor reads it); the earnings UI must NOT present it as a live metric.
    prisma.booking.aggregate({
      _sum: { price: true },
      where: { tutorId: profile.id, status: 'COMPLETED', ...BOOKING_REVENUE_ONLY, payoutStatus: 'PENDING' },
    }),
    // Lifetime totals across ALL completed bookings — not just the recent 50,
    // which previously undercounted any tutor with more than 50 sessions.
    prisma.booking.aggregate({
      _sum: { price: true },
      _count: true,
      where: { tutorId: profile.id, status: 'COMPLETED', ...BOOKING_REVENUE_ONLY },
    }),
    prisma.booking.aggregate({
      _sum: { price: true },
      _count: true,
      where: { tutorId: profile.id, status: 'COMPLETED', ...BOOKING_REVENUE_ONLY, startAt: { gte: monthStart, lt: monthEnd } },
    }),
  ])

  // ── Package money, counted ONCE, at the Enrollment ────────────────────────
  // The booking aggregates above deliberately exclude package lessons
  // (BOOKING_REVENUE_ONLY), so without this the teacher's earnings would simply
  // LOSE every lari a package brought in. Recognised at `paidAt` — the moment
  // the money actually changed hands — not per lesson delivered, because that
  // is when the client paid and it is the figure both sides agreed on.
  const [pkgLifetime, pkgMonth] = await Promise.all([
    prisma.enrollment.aggregate({
      _sum: { priceTotal: true },
      where: { tutorId: profile.id, paidAt: { not: null } },
    }),
    prisma.enrollment.aggregate({
      _sum: { priceTotal: true },
      where: { tutorId: profile.id, paidAt: { gte: monthStart, lt: monthEnd } },
    }),
  ])
  const pkgTotal = pkgLifetime._sum.priceTotal ?? 0
  const pkgThisMonth = pkgMonth._sum.priceTotal ?? 0

  const totalEarned = Math.round((((lifetime as any)._sum?.price ?? 0) + pkgTotal) * TUTOR_SHARE)
  const pendingPayout = Math.round(((pending as any)._sum?.price ?? 0) * TUTOR_SHARE)
  const completedCount = (lifetime as any)._count ?? 0
  const thisMonth = {
    earned: Math.round((((month as any)._sum?.price ?? 0) + pkgThisMonth) * TUTOR_SHARE),
    count: (month as any)._count ?? 0,
  }

  const transactions = completed.map(b => ({
    id: b.id,
    ref: b.ref,
    topic: b.topic,
    startAt: b.startAt,
    durationMin: b.durationMin,
    gross: b.price,
    net: Math.round(b.price * TUTOR_SHARE),
    payoutStatus: b.payoutStatus,
    student: b.student,
  }))

  return NextResponse.json({
    totalEarned,
    pendingPayout,
    completedCount,
    thisMonth,
    transactions,
  })
}
