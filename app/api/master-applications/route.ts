// A TRADESPERSON APPLYING — submit, and read back your own.
//
// ⚠️ MIRRORS /api/applications ON PURPOSE, AND DIVERGES ON PURPOSE. Same
// upsert-one-per-account shape, same admin ping, same „re-submit resets to
// SUBMITTED" behaviour — a reviewer works one queue mentally and two rows that
// behave differently under the same button is how a status gets skipped. What
// differs is everything the expert flow judges: no headline, no hourly rate, no
// consultations, no calendar. See prisma/schema → MasterApplication for why
// this is a separate table rather than a flag.
//
// ⚠️ THE VALIDATION IS NOT WRITTEN HERE. `MasterApplicationInput` lives in
// lib/masterApplication and the FORM imports the same object. That is the rule
// this codebase already learned twice the hard way (lib/applyValidation's
// header records the production failure); a bound restated in a route handler
// is a bound that will disagree with the screen that collected it.

import { NextResponse } from 'next/server'
import { after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { getCurrentUser } from '@/lib/auth'
import { notify, notifyMany } from '@/lib/notify'
import { sendMail } from '@/lib/mailer'
import { newMasterApplicationAdminEmail } from '@/lib/emailTemplates'
import { providersOn } from '@/lib/requests'
import { MasterApplicationInput, MASTER_KIND_LABEL, MASTER_STATUS_TEXT } from '@/lib/masterApplication'
import { groupIsService } from '@/lib/requestTopics'
import { LIVE_OFFER_GROUPS } from '@/lib/serviceProfile'
import { CITIES, topicLabel, cityLabel } from '@/lib/requestTopics'

export const dynamic = 'force-dynamic'

const notFound = () => NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

/** The picker's contents, sent with the application so the form cannot hold a
 *  stale copy of the vocabulary. The LIVE four only — see
 *  lib/serviceProfile → LIVE_OFFER_GROUPS. */
const vocabulary = () => ({
  groups: LIVE_OFFER_GROUPS.map(g => ({
    id: g.id,
    label: g.label,
    // ⚠️ WHICH WORLD THIS GROUP BELONGS TO (2026-08-30). Owner: „როდესაც
    // დამლაგებლად დაამატა სერვისი, იმას ხომ არ ექნება სურვილი ბუღალტრის
    // სერვისი ჰქონდეს… რეგისტრაციისას ეს დეტალები კომფორტულად უნდა იყოს და
    // ზედმეტ რაღაცებს აღარ უნდა თავაზობდეს."
    //
    // Measured on the 28 live providers who have any services: EVERY ONE of
    // them is inside a single vertical, and 26 of the 28 inside a single
    // GROUP — an average of 1.1 groups each. So the form was offering 28
    // groups to people who use one, and the 27 they scroll past include the
    // ones that could not possibly apply to them.
    //
    // `groupIsService` is the same function the catalogue filter and the
    // client intake read, so the split cannot drift between the three.
    vertical: groupIsService(g) ? 'SERVICE' : 'EXPERT',
    // ⚠️ `alt` TRAVELS TOO (2026-08-20). The application's service search
    // matches on it, and those are the words people actually type —
    // „დამლაგებელი" for „ბინის დალაგება", „სანტექნიკოსი" for the plumbing
    // rows. A search that only knew our printed labels would fail exactly the
    // applicant it is for: the one who names their trade in their own words.
    // Small strings, already public in the client-side intake's own catalogue.
    topics: g.topics.map(t => ({ id: t.id, label: t.label, alt: t.alt ?? [] })),
  })),
  cities: CITIES.map(c => ({ id: c.id, label: c.label })),
})

/* ═══════════ GET — my own application, or nothing ═══════════════════════ */

export async function GET() {
  // ⚠️ 404, NEVER 403 — the whole requests subsystem answers this way, and this
  // route is part of it. A 403 would confirm the feature exists to somebody
  // probing for it; there is nothing here worth telling them.
  if (!providersOn()) return notFound()
  const user = await getCurrentUser()
  if (!user) return notFound()

  await ensureDbReady()
  // ⚠️ THE IMAGES ARE COUNTED, NOT SENT. They are base64 columns and this
  // response is fetched every time the form opens; returning six data URIs to
  // tell somebody „you already uploaded six" would ship a megabyte to render a
  // sentence. `photoUrl` collapses to a boolean, `workPhotos` to a length —
  // which is all the form needs to say what is there and offer to replace it.
  const row = await prisma.masterApplication.findUnique({
    where: { userId: user.id },
    omit: { photoUrl: true, workPhotos: true },
  })
  const counts = row ? await prisma.$queryRaw<{ has: boolean; n: number }[]>`
    SELECT ("photoUrl" IS NOT NULL) AS has, COALESCE(array_length("workPhotos", 1), 0)::int AS n
    FROM "MasterApplication" WHERE "userId" = ${user.id}
  ` : []

  return NextResponse.json({
    ok: true,
    application: row,
    hasPhoto: counts[0]?.has ?? false,
    workPhotoCount: counts[0]?.n ?? 0,
    ...vocabulary(),
  })
}

/* ═══════════ POST — submit or re-submit ═════════════════════════════════ */

export async function POST(req: Request) {
  if (!providersOn()) return notFound()
  const user = await getCurrentUser()
  if (!user) return notFound()

  await ensureDbReady()

  // ⚠️ AN APPROVED APPLICATION IS NOT REOPENABLE FROM HERE. Once approved the
  // master's real record is their `ServiceProfile`, which they edit at
  // /work/services — letting this endpoint overwrite an approved row
  // would mean two editors for one identity, and the one that loses is
  // whichever the admin happens not to be looking at.
  const existing = await prisma.masterApplication.findUnique({
    where: { userId: user.id },
    select: { status: true },
  })
  if (existing?.status === 'APPROVED') {
    return NextResponse.json({ ok: false, error: 'ALREADY_APPROVED' }, { status: 409 })
  }

  let body: unknown
  try { body = await req.json() } catch { body = null }

  const parsed = MasterApplicationInput.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return NextResponse.json({
      ok: false,
      error: 'INVALID',
      field: first?.path?.[0] ?? null,
      message: first?.message ?? 'შეავსე ველები სწორად.',
    }, { status: 400 })
  }

  const d = parsed.data
  const data = {
    kind: d.kind,
    fullName: d.fullName,
    phone: d.phone,
    // Cleared, not carried, when the kind does not own them — otherwise a
    // company name lingers on an individual's row and reads as a firm.
    companyName: d.kind === 'COMPANY' ? d.companyName : null,
    taxId: d.kind === 'COMPANY' ? d.taxId : null,
    services: d.services,
    areas: d.areas,
    about: d.about,
    yearsExp: d.yearsExp,
    calloutFee: d.calloutFee,
    priceFrom: d.priceFrom,
    // Already validated to hold only ticked services and positive integers —
    // see MasterApplicationInput's two rules for priceList.
    priceList: d.priceList,
    photoUrl: d.photoUrl,
    workPhotos: d.workPhotos,
  }

  const app = await prisma.masterApplication.upsert({
    where: { userId: user.id },
    create: { ...data, userId: user.id, status: 'SUBMITTED' },
    update: { ...data, status: 'SUBMITTED', moderatorNote: null, reviewedAt: null },
    select: { id: true, status: true },
  })

  // Tell everybody who needs to know. Guarded and off the response path: a
  // submission that committed must not fail because a bell did.
  after(async () => {
    // ⚠️ THE APPLICANT FIRST, AND THEY USED TO GET NOTHING AT ALL (2026-08-18).
    // Somebody filled in seven blocks, uploaded a photo, pressed send — and the
    // only acknowledgement in the entire system was a sentence on the screen
    // they were about to close. Nothing in their account, nothing in their
    // inbox. If they came back an hour later there was no evidence they had
    // ever applied, and nothing in the signed-in site links to /apply/master.
    //
    // The href matters as much as the message: it is the one route back to
    // their own application.
    try {
      await notify(user.id, {
        type: 'APPLICATION_STATUS',
        title: 'განაცხადი მიღებულია',
        body: MASTER_STATUS_TEXT.SUBMITTED,
        href: '/join?can=WORK',
      })
    } catch {}

    try {
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true, email: true },
      })
      if (!admins.length) return
      await notifyMany(admins.map(a => a.id), {
        type: 'APPLICATION_NEW',
        title: 'ახალი განაცხადი — სერვისი',
        body: `${d.fullName} · ${MASTER_KIND_LABEL[d.kind]} · ${d.services.map(topicLabel).slice(0, 3).join(', ')}`,
        href: '/admin#masters',
      })

      // ⚠️ AND BY EMAIL. The tutor queue learned this in August and wrote the
      // reason down: „the bell alone only lands if an admin happens to open
      // /admin — a submission could sit unreviewed for days because nobody was
      // told." That lesson was not carried over to this queue, and this queue
      // matters more: an unreviewed tradesperson is the supply side of a
      // vertical with no supply. NOT pref-gated — an ops signal to staff.
      const { subject, html } = newMasterApplicationAdminEmail({
        name: d.fullName,
        kind: MASTER_KIND_LABEL[d.kind],
        company: d.companyName,
        services: d.services.map(topicLabel),
        areas: d.areas.map(cityLabel),
        phone: d.phone,
        email: user.email,
      })
      for (const a of admins) {
        if (a.email) await sendMail({ to: a.email, subject, html })
      }
    } catch {}
  })

  return NextResponse.json({ ok: true, id: app.id, status: app.status })
}
