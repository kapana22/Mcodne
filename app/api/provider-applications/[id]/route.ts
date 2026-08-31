// APPROVING A TRADESPERSON — the only place a master is admitted.
//
// ⚠️ APPROVAL GRANTS TWO ROWS, AND IT MUST GRANT BOTH OR NEITHER.
//   · `RequestAccess`  — may they be sent work at all (the admin's switch)
//   · `ServiceProfile` — what work, and where (the routing's index)
// A master with access and no profile is in the allowlist and matches nothing,
// so they wait forever for a queue that will never fill. A master with a
// profile and no access is indexed and unreachable. Neither state reports
// itself: both look like „quiet". Hence one transaction.
//
// ⚠️ AND IT COPIES, IT DOES NOT MOVE. The application keeps its services and
// areas after approval. The profile is the live record from then on and the
// master edits it themselves at /work/services; the application
// stays as what they told us on the day, which is the only thing a „why was
// this approved" question can be answered from.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { requireRoleApi } from '@/lib/auth'
import { after } from 'next/server'
import { notify, isTypeEnabled } from '@/lib/notify'
import { sendMail } from '@/lib/mailer'
import {
  providerApprovedEmail, providerRevisionEmail, providerRejectedEmail,
} from '@/lib/emailTemplates'
import { audit } from '@/lib/audit'
import { providersOn, PROVIDER_ROUTE } from '@/lib/requests'
import { approvalBlockers } from '@/lib/providerApplication'
import { ensureProviderSlug } from '@/lib/providerSlug'

export const dynamic = 'force-dynamic'

const notFound = () => NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

/**
 * Send one decision mail, and never let it break the decision.
 *
 * ⚠️ THE TRADES QUEUE HAD NO EMAIL AT ALL UNTIL NOW (2026-08-18). Every
 * decision was a bell row — and the bell is not drawn inside /provider, the one
 * screen a master lives on, so an approval reached them only if they happened
 * to come back and look. The expert queue wrote the reason down in August: „the
 * in-app bell only lands if they come back on their own."
 *
 * PREF-GATED like every other APPLICATION_STATUS mail: somebody who turned
 * these off is not asking to be told about this one either. The address is read
 * here rather than passed in — `ProviderApplication` carries its own name and
 * phone but no email, so the account's is the only one.
 */
async function sendMasterMail(userId: string, mail: { subject: string; html: string }) {
  try {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
    if (!u?.email) return
    if (!(await isTypeEnabled(userId, 'APPLICATION_STATUS'))) return
    await sendMail({ to: u.email, subject: mail.subject, html: mail.html })
  } catch {
    // Silent — a decision that already committed must not fail on a mail server.
  }
}

/* ═══════════ GET — the heavy half, one row ══════════════════════════════ */

/**
 * The photos live here and only here. The list endpoint omits them (see
 * /api/admin/master-applications); a reviewer who opens one row pays for one
 * row's images, which is the same split the tutor queue already uses.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!providersOn()) return notFound()
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response

  await ensureDbReady()
  const { id } = await params
  const app = await prisma.providerApplication.findUnique({
    where: { id },
    include: { user: { select: { id: true, email: true, fullName: true } } },
  })
  if (!app) return notFound()

  return NextResponse.json({ ok: true, application: app, blockers: approvalBlockers(app) })
}

/* ═══════════ PATCH — approve / revise / reject ══════════════════════════ */

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!providersOn()) return notFound()
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  const me = auth.user

  await ensureDbReady()
  const { id } = await params

  let body: { action?: string; note?: string } = {}
  try { body = await req.json() } catch {}
  const action = body.action
  const note = (body.note ?? '').trim()

  if (action !== 'approve' && action !== 'revise' && action !== 'reject') {
    return NextResponse.json({ ok: false, error: 'BAD_ACTION' }, { status: 400 })
  }
  // A rejection without a reason is a dead end the applicant cannot act on, and
  // a revision request without one is worse — it says „fix it" and nothing else.
  if (action !== 'approve' && !note) {
    return NextResponse.json({ ok: false, error: 'NOTE_REQUIRED' }, { status: 400 })
  }

  const app = await prisma.providerApplication.findUnique({ where: { id } })
  if (!app) return notFound()

  if (action !== 'approve') {
    const status = action === 'revise' ? 'NEEDS_REVISION' : 'REJECTED'
    // ⚠️ CLAIMED, NOT CHECKED-THEN-WRITTEN. Two admins in two tabs is the
    // ordinary case in a small team, and the read above is already stale by the
    // time this line runs — see CLAUDE.md, the same rule bookings/cancel uses.
    const { count } = await prisma.providerApplication.updateMany({
      where: { id, status: { not: 'APPROVED' } },
      data: { status, moderatorNote: note, reviewedAt: new Date() },
    })
    if (count !== 1) {
      return NextResponse.json({ ok: false, error: 'ALREADY_APPROVED' }, { status: 409 })
    }
    await notify(app.userId, {
      type: 'APPLICATION_STATUS',
      title: status === 'NEEDS_REVISION' ? 'განაცხადს ერთი რამ აკლია' : 'განაცხადი არ დამტკიცდა',
      body: note,
      href: '/join?can=WORK',
    })
    // `after()` and fully guarded: the decision has committed and must not be
    // undone by a mail failure.
    after(() => sendMasterMail(app.userId, status === 'NEEDS_REVISION'
      ? providerRevisionEmail({ name: app.fullName, note })
      : providerRejectedEmail({ name: app.fullName, note })))
    await audit(me.id, `provider.${action}`, { targetType: 'ProviderApplication', targetId: id })
    return NextResponse.json({ ok: true, status })
  }

  /* ── approve ─────────────────────────────────────────────────────────── */

  // The soft gate closing. lib/providerApplication → approvalBlockers explains why
  // the photo is checked HERE and not at submit: blocking the form loses the
  // applicant, blocking the approval costs one message.
  const blockers = approvalBlockers(app)
  if (blockers.length > 0) {
    return NextResponse.json(
      { ok: false, error: 'NOT_READY', blockers, message: blockers.join(' · ') },
      { status: 400 },
    )
  }

  await prisma.$transaction(async tx => {
    const { count } = await tx.providerApplication.updateMany({
      where: { id, status: { not: 'APPROVED' } },
      data: { status: 'APPROVED', moderatorNote: note || null, reviewedAt: new Date() },
    })
    // Inside the transaction, so a second admin approving the same row at the
    // same moment cannot produce two grants.
    if (count !== 1) throw new Error('ALREADY_APPROVED')

    // ⚠️ INDIVIDUAL ONLY, DELIBERATELY. A COMPANY application names a firm we
    // have not created yet — a `Company` row carries a tax id, a balance and a
    // membership list, and minting one silently from a form field would put an
    // unverified entity into the billing model. The admin creates the company
    // and attaches it in /admin → access; until then the applicant is granted
    // as themselves, which is true and is not nothing.
    await tx.requestAccess.upsert({
      where: { userId: app.userId },
      create: { userId: app.userId, kind: 'EXPERT', active: true, note: `სერვისი — ${app.fullName}` },
      update: { active: true },
    })
    await tx.serviceProfile.upsert({
      where: { userId: app.userId },
      create: {
        userId: app.userId,
        services: app.services,
        areas: app.areas,
        calloutFee: app.calloutFee,
        priceFrom: app.priceFrom,
        // ⚠️ CARRIED, for the same reason the photo is. The applicant priced
        // their services on the form; a profile created without them is a card
        // that says „ask" about work whose price was already given, and nobody
        // would ever find out — the number simply would not be there.
        priceList: app.priceList ?? {},
        // ⚠️ THE PHOTO AND THE SENTENCE ARE CARRIED, and forgetting this is the
        // whole reason /services read as a directory of nobody: the application
        // collected a face, approval created a profile without one, and the
        // card had nothing to draw. `approvalBlockers` guarantees photoUrl is
        // non-null by the time this line runs.
        photoUrl: app.photoUrl,
        about: app.about,
        // ⚠️ CARRIED, AND THEY USED TO BE DROPPED HERE (2026-08-18). The form
        // asks for up to six photos of finished work and uploads them one at a
        // time; approval created the profile without them and they were never
        // seen again outside the admin drawer. `yearsExp` had the same fate and
        // still does — it has no column on the profile yet.
        workPhotos: app.workPhotos,
        available: true,
      },
      // ⚠️ SERVICES AND AREAS ARE NOT OVERWRITTEN ON RE-APPROVAL. If a profile
      // already exists the master has been editing it, and their own list is
      // newer than the one on a form they filled weeks ago. Re-approving flips
      // them back on; it does not undo their work.
      //
      // The photo IS overwritten, and that is not an inconsistency with the
      // line above. The commonest reason a master is sent back is „ფოტო არ
      // არის" — so the second approval's photo is precisely the thing that was
      // asked for, and keeping the old one would ignore the fix. Guarded
      // against null so an approval can never blank a photo that is already
      // there.
      update: {
        available: true,
        ...(app.photoUrl ? { photoUrl: app.photoUrl } : {}),
        ...(app.workPhotos.length > 0 ? { workPhotos: app.workPhotos } : {}),
      },
    })
  })

  // Public URL slug — „/experts/giorgi-maisuradze" instead of the raw cuid.
  // Deliberately OUTSIDE the grant transaction and fully guarded: a slug is
  // cosmetic, and it must never be able to fail an approval. A profile without
  // one stays reachable by id (app/experts/[slug] resolves both). Same shape
  // as the expert approval in app/api/applications/[id].
  try {
    const profile = await prisma.serviceProfile.findUnique({
      where: { userId: app.userId },
      select: { id: true },
    })
    if (profile) await ensureProviderSlug(profile.id)
  } catch { /* non-fatal — see above */ }

  await notify(app.userId, {
    type: 'APPLICATION_STATUS',
    title: 'დამტკიცებულია',
    body: 'მოთხოვნები უკვე მოგდის.',
    // ⚠️ THE CONSTANT, NOT THE LITERAL — and not to dodge a test. The
    // subsystem's URLs are DEFINED in lib/requests, and every file outside
    // app/request and app/provider that writes one as a string is a place the
    // path can drift out of step with the routes. lib/hats.ts made the same
    // call for the same reason; tests/requests.test.ts scans for the literal
    // precisely so this stays true.
    href: `${PROVIDER_ROUTE}/requests`,
  })
  // ⚠️ THE MOST IMPORTANT OF THE FOUR MAILS. /provider is linked from nowhere
  // on the site — not the public header, not the user menu — so this link is a
  // newly-approved master's only route into their own workspace short of
  // guessing the URL or waiting for the next sign-in.
  after(() => sendMasterMail(app.userId, providerApprovedEmail({ name: app.fullName, note: note || null })))
  await audit(me.id, 'provider.approve', {
    targetType: 'ProviderApplication',
    targetId: id,
    meta: { services: app.services, areas: app.areas, kind: app.kind },
  })

  return NextResponse.json({ ok: true, status: 'APPROVED' })
}
