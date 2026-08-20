import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { firstGeorgianMessage, georgianRefine } from '@/lib/georgianText'
import { packagesFeatureExists, PACKAGE_LESSON_COUNTS, DEFAULT_VALID_DAYS, readTeacherFields } from '@/lib/packages'
import { packageFits, tutorScheduleCapacity } from '@/lib/packageFit'
import { ROLE } from '@/lib/roles'

// The teacher's own packages. Mirrors app/api/tutor/consultations exactly —
// same guard, same Georgian-text gate, same error shapes — because it is the
// same kind of thing: a service the expert defines and the client buys.
//
// TWO GATES, DIFFERENT ANSWERS, ON PURPOSE:
//   · feature absent           → 404. Nothing about this should be discoverable
//                                before its owner turns it on.
//   · feature on, expert not   → 403 NOT_ENABLED. They ARE the owner of this
//     enabled                    resource, they simply have not been let in;
//                                a 404 here would read as "your data vanished".

const CreateBody = z.object({
  title: z.string().min(2).max(80).superRefine(georgianRefine('პაკეტის სახელი')),
  description: z.string().min(2).max(400).superRefine(georgianRefine('აღწერა')),
  // Fixed set, not a free number: three comparable sizes make cards readable
  // side by side, and 8 is the block the Georgian market already sells in.
  lessonsCount: z.number().int().refine(n => (PACKAGE_LESSON_COUNTS as readonly number[]).includes(n), {
    message: 'გაკვეთილების რაოდენობა უნდა იყოს 4, 8 ან 12',
  }),
  minutesPerLesson: z.number().int().min(15).max(240),
  // ⚠️ THE TOTAL, never a per-lesson rate. The per-lesson figure is derived for
  // display (lib/packages → perLessonPrice) and must never become an input:
  // two independently-stored numbers for one price is how this codebase once
  // published „₾80 · 30 წთ" and „₾25-დან" for the same expert.
  price: z.number().int().min(0).max(100000),
  validDays: z.number().int().min(7).max(365).optional(),
})

/** The caller's tutor profile + whether an admin has let them sell packages. */
async function callerTutor(userId: string) {
  return prisma.tutorProfile.findUnique({
    where: { userId },
    select: { id: true, packagesEnabled: true, profileType: true, professionData: true },
  })
}

export async function GET(req: Request) {
  const auth = await requireRoleApi([ROLE.EXPERT, ROLE.ADMIN])
  if (auth.response) return auth.response
  if (!packagesFeatureExists()) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

  const tutor = await callerTutor(auth.user.id)
  // An empty list, not an error: a tutor who is not enabled simply has none,
  // and the editor renders its own „not enabled yet" state from `enabled`.
  if (!tutor) return NextResponse.json({ items: [], enabled: false })

  // ── Capacity for a package that does not exist yet ────────────────────────
  // The schedule gate used to answer only for SAVED packages, so a teacher
  // chose „8 გაკვეთილი", saved, and only then learned their calendar holds
  // three. The inputs to the answer are all in the draft form; this lets the
  // editor ask before the teacher commits. Same `tutorScheduleCapacity` the
  // saved-package verdict uses — one implementation, asked earlier.
  const sp = new URL(req.url).searchParams
  const dMin = Number(sp.get('draftMinutes'))
  const dDays = Number(sp.get('draftDays'))
  let draftCapacity: number | null = null
  if (Number.isInteger(dMin) && dMin >= 15 && dMin <= 240 && Number.isInteger(dDays) && dDays >= 7 && dDays <= 365) {
    draftCapacity = await tutorScheduleCapacity(tutor.id, dMin, dDays)
  }

  const items = await prisma.package.findMany({
    where: { tutorId: tutor.id },
    orderBy: { lessonsCount: 'asc' },
  })
  // The schedule gate's verdict, per package. Computed on read rather than
  // stored: published availability changes constantly and a cached „fits" would
  // be a promise that quietly stopped being true.
  const fit = await packageFits(tutor.id, items)
  // TWO different gates, reported separately so the editor can say WHICH one is
  // shut: `isTeacher` is what this profile IS, `enabled` is the admin's rollout
  // allowlist. Both must be true to sell. Once the vertical is public the
  // allowlist goes away; the type does not.
  return NextResponse.json({
    items,
    enabled: tutor.packagesEnabled,
    isTeacher: tutor.profileType === 'TEACHER',
    teacher: readTeacherFields(tutor.professionData),
    fit,
    draftCapacity,
  })
}

export async function POST(req: Request) {
  const auth = await requireRoleApi([ROLE.EXPERT, ROLE.ADMIN])
  if (auth.response) return auth.response
  if (!packagesFeatureExists()) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

  const tutor = await callerTutor(auth.user.id)
  if (!tutor) return NextResponse.json({ ok: false, error: 'NO_TUTOR_PROFILE' }, { status: 400 })
  // A consultant cannot create a package even if an admin ticked the allowlist:
  // the product belongs to the type, not to the permission.
  if (tutor.profileType !== 'TEACHER') {
    return NextResponse.json({ ok: false, error: 'NOT_TEACHER', message: 'პაკეტს მხოლოდ ექსპერტი ქმნის.' }, { status: 403 })
  }
  if (!tutor.packagesEnabled) return NextResponse.json({ ok: false, error: 'NOT_ENABLED' }, { status: 403 })

  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    // Surface OUR validation copy (the Georgian-language gate, the lesson-count
    // rule); zod's own English messages stay behind the generic code.
    const msg = firstGeorgianMessage(parsed.error)
    return NextResponse.json({ ok: false, error: msg ? 'INVALID_TEXT' : 'INVALID', message: msg ?? undefined }, { status: 400 })
  }

  // One package per size. Two „8 გაკვეთილი" rows at different prices is not a
  // choice, it is a contradiction the client has to resolve for us.
  const clash = await prisma.package.findFirst({
    where: { tutorId: tutor.id, lessonsCount: parsed.data.lessonsCount },
    select: { id: true },
  })
  if (clash) {
    return NextResponse.json(
      { ok: false, error: 'DUPLICATE_SIZE', message: 'ამ ზომის პაკეტი უკვე გაქვს — შეცვალე არსებული.' },
      { status: 409 },
    )
  }

  const item = await prisma.package.create({
    data: {
      ...parsed.data,
      validDays: parsed.data.validDays ?? DEFAULT_VALID_DAYS,
      tutorId: tutor.id,
    },
  })
  return NextResponse.json({ ok: true, item })
}
