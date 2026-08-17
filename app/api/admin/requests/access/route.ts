// The allowlist — who can see this subsystem at all.
//
//   GET   /api/admin/requests/access  → the list
//   POST  /api/admin/requests/access  → add a person or a company
//   PATCH /api/admin/requests/access  → turn one on or off
//
// ⚠️ NOBODY IS ON IT BY DEFAULT, and that is the design rather than an empty
// state waiting to be filled by a migration. The experts already approved on
// this platform applied to be BOOKED, not to bid on leads; switching them all
// on would ship an unfinished product to people who never asked for it. An
// empty list can only produce an empty audience — the only safe state for a
// stage-1 test.
//
// There is no DELETE. Turning somebody off is `active: false`, so the note
// saying why survives the decision — a list you can only erase from is a list
// where „why is this person not here" has no answer.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { ensureDbReady } from '@/lib/dbBoot'
import { audit } from '@/lib/audit'
import { AccessGrantInput, accessSubjectError } from '@/lib/requests'
import { requestsViewer, requestsNotFound } from '@/lib/requestsServer'

/** Both gates, in the order every admin endpoint here uses them. Returns the
 *  admin when the caller may proceed, otherwise the response to send. */
async function guard() {
  const viewer = await requestsViewer()
  if (!viewer.providerAllowed) return { admin: null, response: requestsNotFound() }
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return { admin: null, response: auth.response }
  await ensureDbReady()
  return { admin: auth.user, response: null }
}

export async function GET() {
  const g = await guard()
  if (g.response) return g.response

  const rows = await prisma.requestAccess.findMany({
    // Active first, then newest — the same „what needs looking at" order the
    // rest of the panel uses.
    orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    take: 500,
    select: {
      id: true, kind: true, active: true, note: true, createdAt: true,
      user: { select: { id: true, fullName: true, email: true, role: true } },
      company: { select: { id: true, name: true, _count: { select: { members: true } } } },
    },
  })
  return NextResponse.json({ ok: true, access: rows })
}

export async function POST(req: Request) {
  const g = await guard()
  if (g.response) return g.response
  const admin = g.admin!

  const parsed = AccessGrantInput.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  // Exactly one subject — checked in lib/requests so the rule lives beside the
  // one for an offer's provider rather than inside this handler.
  const shapeErr = accessSubjectError(parsed.data)
  if (shapeErr) return NextResponse.json({ ok: false, error: shapeErr }, { status: 400 })

  const note = (parsed.data.note ?? '').trim() || null

  // ── An expert, found by the address the admin actually knows ─────────────
  if (parsed.data.kind === 'EXPERT') {
    const email = (parsed.data.email ?? '').trim().toLowerCase()
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } })
    // A dangling row would be worse than a refusal: it looks granted in the
    // panel and admits nobody, and the admin has no way to see the difference.
    if (!user) return NextResponse.json({ ok: false, error: 'USER_NOT_FOUND' }, { status: 404 })
    // An ADMIN MAY BE ADDED, and the refusal that used to sit here was wrong.
    //
    // It read „an admin is already in by role, so a row would be a second
    // answer to a settled question". That is true of SEEING the subsystem and
    // false of BEING A PROVIDER: without a row an admin has no identity to
    // attach an offer to, so the offer endpoint 404s them. Refusing the row
    // meant an admin could never write one — see the long note in
    // lib/requestsServer → requestsViewer.
    //
    // ⚠️ It does mean they can verify a request and then bid on it. Accepted
    // deliberately at stage 1 (one person testing both sides); the `active`
    // switch is how it is undone.

    // Upsert rather than create: re-adding somebody who was turned off is the
    // normal way back on, and answering „already exists" would send the admin
    // hunting through the list for a row they cannot see from here.
    const row = await prisma.requestAccess.upsert({
      where: { userId: user.id },
      create: { kind: 'EXPERT', userId: user.id, note, active: true },
      update: { active: true, ...(note ? { note } : {}) },
      select: { id: true },
    })
    await audit(admin.id, 'request.access.grant', {
      targetType: 'RequestAccess', targetId: row.id,
      meta: { kind: 'EXPERT', email, note },
    })
    return NextResponse.json({ ok: true })
  }

  // ── A company: every member becomes a provider ───────────────────────────
  const companyId = (parsed.data.companyId ?? '').trim()
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } })
  if (!company) return NextResponse.json({ ok: false, error: 'COMPANY_NOT_FOUND' }, { status: 404 })

  const row = await prisma.requestAccess.upsert({
    where: { companyId: company.id },
    create: { kind: 'COMPANY', companyId: company.id, note, active: true },
    update: { active: true, ...(note ? { note } : {}) },
    select: { id: true },
  })
  await audit(admin.id, 'request.access.grant', {
    targetType: 'RequestAccess', targetId: row.id,
    meta: { kind: 'COMPANY', companyId: company.id, note },
  })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: Request) {
  const g = await guard()
  if (g.response) return g.response
  const admin = g.admin!

  const body = await req.json().catch(() => ({})) as { id?: unknown; active?: unknown }
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  const active = typeof body.active === 'boolean' ? body.active : null
  if (!id || active === null) {
    return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  }

  const row = await prisma.requestAccess.update({
    where: { id },
    data: { active },
    select: { id: true, kind: true, active: true, userId: true, companyId: true },
  }).catch(() => null)
  if (!row) return requestsNotFound()

  await audit(admin.id, active ? 'request.access.enable' : 'request.access.disable', {
    targetType: 'RequestAccess', targetId: row.id,
    meta: { kind: row.kind, userId: row.userId, companyId: row.companyId },
  })
  return NextResponse.json({ ok: true, access: row })
}
