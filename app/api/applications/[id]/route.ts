import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ASSIGNABLE_CATEGORY_WHERE, CATEGORY_READ_ORDER, resolveCategoryByName } from '@/lib/categoryTree'
import { revealCategoryIfHidden } from '@/lib/categoryReveal'
import { requireRoleApi } from '@/lib/auth'
import { notify, normalizePrefs } from '@/lib/notify'
import { audit } from '@/lib/audit'
import { ensureExpertSlug } from '@/lib/expertSlug'
import { normalizeLangs } from '@/lib/languages'
import { sendMail } from '@/lib/mailer'
import { applicationApprovedEmail } from '@/lib/emailTemplates'
import { resolveVerifiedGrant } from '@/app/admin/_application'
import { materializeWeekly } from '@/lib/availabilityRules'
import { MAX_PROFESSIONS } from '@/lib/professions'
import { georgianNameError } from '@/lib/georgianText'
import { normalizePhone, phoneFormatError } from '@/lib/phone'
import type { Prisma } from '@prisma/client'
import { ROLE } from '@/lib/roles'

const Body = z.object({
  action: z.enum(['approve', 'reject', 'revise']),
  note: z.string().optional(),
  // Optional admin override for the approved expert's category (approve only).
  // Lets a niche/custom applicant — whose free-text specialty matches no
  // Category name — be assigned one at approval time instead of being born
  // category-less and invisible on /experts.
  categoryId: z.string().min(1).max(64).optional(),
  // The moderator's deliberate „გადამოწმებული" decision (approve only).
  // STRICTLY a boolean and STRICTLY optional-defaulting-to-false: the badge is
  // a public trust signal on every card, so it may only ever be granted by a
  // human ticking it while the applicant's documents are on screen. Absent
  // (bulk approve, an older client) ⇒ no badge, exactly as before this field
  // existed. `resolveVerifiedGrant` re-asserts the same rule so the default
  // cannot drift if this schema is ever loosened.
  verified: z.boolean().optional(),
})

// Map an /apply service duration onto the Consultation tier enum.


/* SEED ONCE, EVEN WHEN APPROVED TWICE. Every post-approval step below is
 * „count, and create only when zero" — idempotent on paper, and a duplicate
 * factory in practice: a double-click or two moderators send two requests,
 * both count zero, both create, and the live profile shows every tier and
 * every diploma twice. The count and the create therefore run in ONE
 * transaction that first takes the profile's row lock, so the second approver
 * waits for the first and then counts its rows. `FOR UPDATE` on the profile
 * row is the cheapest lock that serialises exactly the two callers who race.
 * Still guarded by the caller's try/catch: a seed step never fails an
 * approval that has already committed. */
async function seedOnce(
  userId: string,
  fn: (tx: Prisma.TransactionClient, profile: { id: string }) => Promise<void>,
): Promise<void> {
  await prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "TutorProfile" WHERE "userId" = ${userId} FOR UPDATE`
    const profile = rows[0]
    if (!profile) return
    await fn(tx, profile)
  })
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response
  const admin = auth.user
  const { id } = await ctx.params
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 })
  const { action, note, categoryId, verified } = parsed.data

  // Reject AND revise must carry a reason — it is sent to the applicant and kept
  // in the audit trail. Revise IS the correction note ("write your name in
  // Georgian"), so it is meaningless empty. The admin UI enforces this too; the
  // server is the backstop.
  if ((action === 'reject' || action === 'revise') && !note?.trim()) {
    return NextResponse.json(
      { ok: false, error: 'REASON_REQUIRED', message: action === 'revise' ? 'შესწორების მითითება სავალდებულოა' : 'უარყოფის მიზეზი სავალდებულოა' },
      { status: 400 },
    )
  }

  // Fetch the applicant's current role — approval promotes to TUTOR, and we
  // must NEVER demote an ADMIN (or anyone non-STUDENT) that way. An admin who
  // accidentally submitted an application and then approved it used to lose
  // their admin role and lock everyone out of /admin — this guard prevents it.
  const app = await prisma.tutorApplication.findUnique({
    where: { id },
    // `phone` too: the promotion below only FILLS a missing number, never
    // overwrites one the person set later in /settings.
    include: { user: { select: { role: true, phone: true } } },
  })
  if (!app) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

  /* AN APPROVAL IS NOT A PIECE OF PAPER — IT ALREADY PROMOTED SOMEBODY.
   *
   * `approve` writes role=TUTOR, creates the public TutorProfile, publishes a
   * calendar and opens bookings. Nothing below undoes any of that: `reject` and
   * `revise` only move the APPLICATION's status and send a message. So on an
   * already-APPROVED row they produced a state where the record says REJECTED
   * while the person stays listed, bookable and holding the TUTOR role — and
   * the applicant is told „შენი განაცხადი უარყოფილია" while their profile is
   * still live. The moderator gets no signal that nothing happened.
   *
   * Refused, rather than silently made to work: taking a live expert down is a
   * different, deliberate act (suspend the account, or hide the profile from
   * the „ექსპერტები" tab), and it must not be a side effect of re-reading an
   * old application. Re-approving is still allowed — that path is idempotent
   * by construction (every post-approval step is guarded on „already there").
   */
  if (app.status === 'APPROVED' && action !== 'approve') {
    return NextResponse.json(
      {
        ok: false,
        error: 'ALREADY_APPROVED',
        message: 'ეს განაცხადი უკვე დამტკიცებულია და ექსპერტი აქტიურია. პროფილის დახურვა ექსპერტების გვერდიდან ხდება.',
      },
      { status: 409 },
    )
  }

  if (action === 'approve') {
    if (app.user.role !== ROLE.CLIENT) {
      // Only a STUDENT applicant can be promoted. ADMIN → refuse outright;
      // an existing TUTOR is already an expert (nothing to promote).
      return NextResponse.json(
        { ok: false, error: app.user.role === 'ADMIN' ? 'CANNOT_PROMOTE_ADMIN' : 'ALREADY_EXPERT' },
        { status: 400 },
      )
    }
    // Resolve the applicant's chosen category (stored as its NAME in `specialty`,
    // since /apply's preset list mirrors the live Category names) to a real
    // Category id. A specialty that matches nothing stays null, and that is a
    // real cost but NOT the disappearance this comment used to claim: since
    // lib/tutorsQuery made the category a LABEL rather than a gate, an expert
    // with no category still shows in the unfiltered browse. What they lose is
    // every sphere page, the browse filter, and the category chip on their own
    // card — so it is worth getting right, and the moderator's dropdown is where
    // it gets fixed.
    // The candidate set and the matcher both live in lib/categoryTree now.
    //
    // ASSIGNABLE, not „browsable OR hidden". The old inline `where` pulled in
    // EVERY hidden row — including the /abroad `diaspora` marker, which the
    // 2026-08-10 migration protects in SQL specifically so it can never reach
    // the public menu. Approving into it would have filed the expert nowhere
    // AND flipped the marker VISIBLE via the un-hide below. Sub-fields stay in
    // (an applicant who answered „ფინანსები" must not end up filed nowhere) and
    // hidden SPHERES stay in (somebody has to be able to go first in „კარიერა").
    //
    // The read order is explicit because the resolver scans this list: an
    // unordered findMany returns Postgres' physical order, so the same
    // application could resolve differently after a VACUUM.
    const liveCats = await prisma.category.findMany({
      where: ASSIGNABLE_CATEGORY_WHERE,
      orderBy: CATEGORY_READ_ORDER,
      select: { id: true, slug: true, name: true, status: true, parentId: true, defaultServiceType: true },
    })
    // ONE matcher, shared with the moderation panel's pre-selection — the two
    // used to state different rules, so the dropdown lied about the outcome.
    const matchedCat = resolveCategoryByName(app.specialty || '', liveCats)
    // An explicit `categoryId` from the admin OVERRIDES the name match — that is
    // the whole point of the override (the name matched nothing, or matched the
    // wrong bucket). It must name an ASSIGNABLE category — the same set the
    // panel's dropdown is built from — so a stale id, a REDIRECTED row whose
    // sphere has since been hidden, or the /abroad marker is refused rather
    // than silently written onto a real person.
    const overrideCat = categoryId ? liveCats.find(c => c.id === categoryId) : undefined
    if (categoryId && !overrideCat) {
      return NextResponse.json({ ok: false, error: 'BAD_CATEGORY' }, { status: 400 })
    }
    const chosenCat = overrideCat ?? matchedCat
    const resolvedCategoryId = chosenCat?.id

    // A sphere is HIDDEN because it has no expert yet; filing one into it
    // makes that false, so it comes back into view here — for a sub-field
    // („დიეტოლოგია") the row revealed is its SPHERE. The rule, the write and
    // the audit row are ONE function shared with the admin re-file endpoint
    // (lib/categoryReveal, stage 11) — the two used to inline the same calls.
    await revealCategoryIfHidden(chosenCat, liveCats, {
      adminId: admin.id,
      reason: 'first approved expert',
      via: chosenCat?.slug ?? null,
    })

    // Carry the languages the applicant selected (stored in professionData as
    // free-text tags like „ქართული · მშობლიური") into the structured
    // TutorProfile.languages the cards/profile actually read — otherwise the
    // profile is born with the ["ka"] default and the applicant's real languages
    // are silently lost. Normalized to canonical CODES (lib/languages.ts) because
    // that is what the profile editor and the browse filter speak — writing the
    // raw Georgian name here left the expert with zero chips selected and a
    // duplicated „ქართული · English · ქართული · English" card after they re-picked.
    const resolvedLanguages = normalizeLangs((app.professionData as any)?.languages)
    // WHAT THEY CALLED THEMSELVES — „ბუღალტერი", „მარკეტოლოგი" (lib/professions).
    // Carried onto the profile so the applicant never re-picks what they already
    // answered. Bounded and de-duplicated here rather than trusted: professionData
    // is an unbounded JSON bag written by the client.
    const resolvedProfessions = Array.isArray((app.professionData as any)?.professions)
      ? [...new Set(
          ((app.professionData as any).professions as unknown[])
            .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
            .map(x => x.trim().slice(0, 80)),
        )].slice(0, MAX_PROFESSIONS)
      : []
    // „გადამოწმებული" — granted ONLY when the moderator explicitly ticked it on
    // this approval. `hadDocument` records whether anything was actually
    // attached at that moment, so the audit trail can answer „why is this
    // person verified?" long after the fact. A grant with nothing attached is
    // permitted (a moderator may have verified out-of-band) but never silent.
    const badge = resolveVerifiedGrant(verified, app)

    /* THE APPLICANT'S OWN ANSWERS, CARRIED ONTO THE ACCOUNT.
     *
     * Approval copied a dozen fields onto the TutorProfile and wrote exactly
     * `{ role: ROLE.EXPERT }` to the User — so `fullName` and `phone`, the two
     * things /apply validates hardest, were collected and then dropped.
     * Measured on production 2026-08-17: 15 of 25 approved experts gave a phone
     * on /apply and their account still had `phone: null`, and one gave
     * „ნიკა წოწორია" while the account kept the Latin „nika tsotsoria" Google
     * had supplied.
     *
     * That last one also broke a promise written in lib/georgianText: Google
     * sign-in is exempt from the Georgian-name rule „by necessity — refusing the
     * name would refuse the sign-in — so it is caught at /apply instead, before
     * anything becomes public." /apply did catch it. Nothing wrote it back, so
     * the exemption caught nothing and a Latin name went public anyway.
     *
     * NAME: taken only when the application's own name passes the strict rule
     * (it was validated at submit, but a row predating that rule must not
     * overwrite a good account name with a worse one).
     * PHONE: FILLED, NEVER OVERWRITTEN — a number the person later set in
     * /settings is newer than the one on the application. */
    const promoted: { role: typeof ROLE.EXPERT; fullName?: string; phone?: string } = { role: ROLE.EXPERT }
    {
      const appName = (app.fullName ?? '').trim()
      if (appName && !georgianNameError('სახელი', appName)) promoted.fullName = appName
      const appPhone = (app.phone ?? '').trim()
      if (appPhone && !app.user.phone) {
        // Same normalisation every other write path uses, so the column cannot
        // hold „+995 555 15 13 13" here and „555151313" everywhere else.
        const normalized = normalizePhone(appPhone)
        if (normalized && !phoneFormatError(normalized, { required: true })) promoted.phone = normalized
      }
    }

    await prisma.$transaction([
      prisma.tutorApplication.update({
        where: { id },
        data: { status: 'APPROVED', moderatorNote: note, reviewedAt: new Date() },
      }),
      prisma.user.update({ where: { id: app.userId }, data: promoted }),
      prisma.tutorProfile.upsert({
        where: { userId: app.userId },
        create: {
          userId: app.userId,
          // Seed the real one-line pitch the applicant wrote (stashed in
          // professionData at submit) — falling back to the category name only
          // when they left it blank. Without this the profile's headline was
          // always just the category, and the expert had to retype it.
          headline: ((app.professionData as any)?.headline?.trim?.() || app.specialty),
          specialty: app.specialty,
          categoryId: resolvedCategoryId,
          // Inherit the category's default service type (admin-set) instead of
          // always falling back to the schema default.
          serviceType: chosenCat?.defaultServiceType ?? undefined,
          // Carry the applicant's „შესახებ" text over so the profile isn't born
          // with an empty bio the expert has to re-enter.
          bio: app.motivation?.trim() || null,
          // Preserve the applicant's real languages (see derivation above) — only
          // when we actually parsed some, otherwise let the ["ka"] default stand.
          languages: resolvedLanguages.length ? resolvedLanguages : undefined,
          professions: resolvedProfessions,
          yearsExp: app.yearsExp,
          price: app.hourlyRate,
          verified: badge.grant,
          linkedinUrl: app.linkedinUrl,
          websiteUrl: app.websiteUrl,
          professionData: app.professionData ?? undefined,
          // Carry the applicant's YouTube intro URL onto the freshly-minted
          // TutorProfile so they don't have to re-submit it. Same normalized
          // canonical form ("youtu.be/{id}") already stored on the application.
          videoUrl: (app as any).introVideoUrl ?? null,
        },
        update: {
          linkedinUrl: app.linkedinUrl,
          // Only ever ADDS: a re-approval must not wipe professions the expert
          // has since edited on their own profile.
          ...(resolvedProfessions.length ? { professions: resolvedProfessions } : {}),
          websiteUrl: app.websiteUrl,
          professionData: app.professionData ?? undefined,
          // Grant-only, never revoke: re-approving an existing profile with the
          // box unticked must not strip a badge that was awarded earlier (that
          // would make a routine re-approval silently downgrade a live expert).
          // Removing the badge stays the explicit job of the „ექსპერტები" tab's
          // verify toggle (`tutor.unverify`).
          ...(badge.grant ? { verified: true } : {}),
          // videoUrl is deliberately NOT touched on re-approval — a tutor who
          // already exists may have edited their intro to a newer/better clip
          // since their original application. Only the `create` path seeds it.
        },
      }),
    ])

    // Public URL slug — „/experts/ana-gagoshidze" instead of the raw cuid.
    // Deliberately OUTSIDE the promotion transaction and fully guarded: a slug
    // is cosmetic, and it must never be able to fail an approval. A profile
    // without one stays reachable by id (app/experts/[slug] resolves both).
    try {
      const profile = await prisma.tutorProfile.findUnique({
        where: { userId: app.userId },
        select: { id: true },
      })
      if (profile) await ensureExpertSlug(profile.id)
    } catch { /* non-fatal — see above */ }

    // Turn the services the applicant defined during /apply into real
    // Consultation tiers. Runs OUTSIDE the promotion tx and is fully guarded, so
    // a malformed service row can NEVER block the approval itself. Skips if the
    // profile already has consultations (a re-approval mustn't duplicate them).
    try {
      const services = (app.professionData as any)?.services
      if (Array.isArray(services) && services.length) {
        await seedOnce(app.userId, async (tx, profile) => {
          const existing = await tx.consultation.count({ where: { tutorId: profile.id } })
          if (existing === 0) {
            const rows = services
              // ⚠️ A SERVICE HAS NO `dur`, SO IT MAY NOT BE REQUIRED HERE
              // (2026-08-20). This filter demanded a finite duration on every
              // row, which was true while the form could only collect hours —
              // and would have silently DROPPED every service an applicant
              // registered with, publishing an approved expert with an empty
              // profile and no error anywhere. A name is the only thing every
              // shape must have.
              .filter((s: any) => s && typeof s.name === 'string' && s.name.trim())
              .slice(0, 10)
              .map((s: any) => {
                // Absent reads as bookable: an application written before the
                // flag existed carries hours, and that is what they are.
                const bookable = s.bookable !== false
                const minutes = bookable
                  ? Math.min(240, Math.max(5, Math.round(Number(s.dur) || 60)))
                  : 0
                const title = String(s.name).trim().slice(0, 80)
                return {
                  tutorId: profile.id,
                  // The tier is derived from minutes and means nothing for a
                  // service; it keeps its default rather than inventing one.
                  title,
                  description: (String(s.desc ?? '').trim() || title).slice(0, 400),
                  minutes,
                  bookable,
                  price: Math.min(10000, Math.max(0, Math.round(Number(s.price) || 0))),
                }
              })
            if (rows.length) await tx.consultation.createMany({ data: rows })
          }
        })
      }
    } catch { /* consultations are a convenience — never fail the approval on them */ }
    // Same guarded pattern for the diploma/certificate scans uploaded during
    // /apply ({ title, url }[] on TutorApplication.certificates) — without this
    // the fresh expert's certificates tab is empty and they must re-upload
    // everything they already sent us. The SCAN itself stays admin-only on the
    // application (schema comment: verification media is never copied to the
    // The scan is carried over as-is (base64 included); `year` falls back to
    // the application year, and an unknown issuer stays EMPTY rather than
    // becoming a placeholder string the profile would display as fact.
    try {
      const certs = (app.certificates as any)
      if (Array.isArray(certs) && certs.length) {
        await seedOnce(app.userId, async (tx, profile) => {
          const existing = await tx.certificate.count({ where: { tutorId: profile.id } })
          if (existing === 0) {
            const year = app.createdAt.getFullYear()
            const rows = certs
              .filter((c: any) => c && typeof c.title === 'string' && c.title.trim())
              .slice(0, 10)
              .map((c: any) => {
                const url = String(c.url ?? '').trim()
                return {
                  tutorId: profile.id,
                  title: String(c.title).trim().slice(0, 200),
                  // Empty, not „მითითებული არ არის". That placeholder was stored
                  // as DATA and then rendered on the public profile as if the
                  // expert had typed it. The UI now omits an empty issuer.
                  issuer: String((c as any).issuer ?? '').trim().slice(0, 200),
                  year,
                  // Carry the scan over whatever its form — a base64 data: URI
                  // is exactly what /api/uploads returns, and rejecting it here
                  // (the old `^https?://` + 500-char test) is why every approved
                  // expert lost the diploma they had just uploaded.
                  fileUrl: url || null,
                }
              })
            if (rows.length) await tx.certificate.createMany({ data: rows })
          }
        })
      }
    } catch { /* certificates are a convenience — never fail the approval on them */ }

    /* OPEN THE CALENDAR (2026-08-07). The applicant picked a weekly pattern on
     * /apply — pre-filled with a full working week — and this is where it
     * becomes real bookable availability.
     *
     * WHY IT MATTERS: publishing time used to be a separate job AFTER approval,
     * and 46% of booking attempts died on „this expert has no free time". An
     * approved expert with an empty calendar is an expert nobody can book, so
     * the empty calendar is what had to go.
     *
     * Guarded and idempotent like every other post-approval step: it never fails
     * an approval that has already committed, and it does nothing at all when
     * the expert already has future windows (a re-approval must not double-book
     * the week, and must never overwrite a schedule they have since edited).
     */
    let openedWindows = 0
    try {
      const av = (app.professionData as any)?.availability
      const days: number[] = Array.isArray(av?.days) ? av.days.filter((d: any) => Number.isInteger(d) && d >= 0 && d <= 6) : []
      const startHour = Number(av?.startHour)
      const endHour = Number(av?.endHour)
      const weeks = Math.min(12, Math.max(1, Number(av?.weeks) || 8))
      if (days.length && Number.isInteger(startHour) && Number.isInteger(endHour) && endHour > startHour) {
        await seedOnce(app.userId, async (tx, profile) => {
          const already = await tx.availabilitySlot.count({
            where: { tutorId: profile.id, endAt: { gt: new Date() } },
          })
          if (already === 0) {
            const windows = materializeWeekly(days.map(day => ({ day, startHour, endHour })), weeks)
            if (windows.length) {
              const res = await tx.availabilitySlot.createMany({
                data: windows.map(w => ({ tutorId: profile.id, startAt: w.startAt, endAt: w.endAt })),
                skipDuplicates: true,
              })
              openedWindows = res.count
            }
          }
        })
      }
    } catch { /* availability is a convenience — never fail the approval on it */ }

    // Point the approval at the SCHEDULE: booking is slot-gated, and the expert
    // must be able to SEE (and change) what we just published in their name.
    // A moderator note still overrides the body.
    await notify(app.userId, {
      type: 'APPLICATION_STATUS',
      title: openedWindows > 0 ? 'დამტკიცდი — შენი განრიგი გამოქვეყნდა' : 'დამტკიცდი — გახსენი შენი დრო',
      body: note?.trim() || (openedWindows > 0
        // Says what we did on their behalf. A calendar that opened without a
        // word would be a client booking an hour the expert never agreed to.
        ? 'ახლა ხარ ექსპერტი. განაცხადში მითითებული განრიგი გამოქვეყნდა და დაჯავშნა შესაძლებელია — შეამოწმე და შეცვალე, თუ საჭიროა.'
        : 'ახლა ხარ ექსპერტი. სანამ თავისუფალ დროს არ გამოაქვეყნებ, ვერავინ დაგიჯავშნის.'),
      href: '/work/schedule',
    })
    // Same message by email — the in-app bell only lands if they come back on
    // their own. Runs off the response path (the admin shouldn't wait on a mail
    // round-trip) and is fully guarded + pref-gated on APPLICATION_STATUS, the
    // same toggle the notify() above respects. sendMail RESOLVES on a provider
    // failure (it logs its own [server-error]), so a dead mailbox can never fail
    // an approval that has already committed.
    after(async () => {
      try {
        const u = await prisma.user.findUnique({
          where: { id: app.userId },
          select: { email: true, fullName: true, notificationPrefs: true },
        })
        if (u?.email && normalizePrefs(u.notificationPrefs).APPLICATION_STATUS) {
          const { subject, html } = applicationApprovedEmail({ name: u.fullName, note: note?.trim() || undefined })
          await sendMail({ to: u.email, subject, html })
        }
      } catch { /* email is best-effort */ }
    })
    await audit(admin.id, 'application.approve', {
      targetType: 'TutorApplication',
      targetId: id,
      meta: { note, applicantUserId: app.userId, verified: badge.grant, hadDocument: badge.hadDocument },
    })
    // A SECOND, separately-filterable row when the badge was actually granted —
    // „გადამოწმებული" is the one decision here with a public consequence, and
    // the audit tab filters by action string. `hadDocument: false` is the
    // record of a badge awarded with nothing attached.
    if (badge.grant) {
      await audit(admin.id, 'application.approve.verified', {
        targetType: 'TutorApplication',
        targetId: id,
        meta: {
          applicantUserId: app.userId,
          hadDocument: badge.hadDocument,
          grantedWithoutDocument: badge.grantedWithoutDocument,
          certificateCount: Array.isArray(app.certificates) ? app.certificates.length : 0,
          idDoc: !!app.idDocUrl,
          selfie: !!app.selfieUrl,
        },
      })
    }
  } else if (action === 'revise') {
    // „გაასწორე" — softer than a reject. The application lands in NEEDS_REVISION
    // (not REJECTED), the applicant's role/profile is untouched, and the note is
    // the correction instruction they must address before re-submitting. The
    // /apply POST upsert resets them back to SUBMITTED on re-send.
    await prisma.tutorApplication.update({
      where: { id },
      data: { status: 'NEEDS_REVISION', moderatorNote: note, reviewedAt: new Date() },
    })
    await notify(app.userId, {
      type: 'APPLICATION_STATUS',
      title: 'შეასწორე განაცხადი',
      body: note!.trim(),
      href: '/join?can=CONSULT',
    })
    await audit(admin.id, 'application.revise', { targetType: 'TutorApplication', targetId: id, meta: { note, applicantUserId: app.userId } })
  } else {
    await prisma.tutorApplication.update({
      where: { id },
      data: { status: 'REJECTED', moderatorNote: note, reviewedAt: new Date() },
    })
    await notify(app.userId, {
      type: 'APPLICATION_STATUS',
      title: 'შენი განაცხადი უარყოფილია',
      body: note?.trim() || 'შემდგომი შეკითხვებისთვის მოგვწერე.',
      href: '/join?can=CONSULT',
    })
    await audit(admin.id, 'application.reject', { targetType: 'TutorApplication', targetId: id, meta: { note, applicantUserId: app.userId } })
  }
  return NextResponse.json({ ok: true })
}
