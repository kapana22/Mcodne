/**
 * Create ONE synthetic teacher so the packages vertical has something to show
 * on /swavleba before the package composer (phase 3) exists.
 *
 *   npx tsx -r dotenv/config scripts/seed-test-teacher.ts          (dry run)
 *   npx tsx -r dotenv/config scripts/seed-test-teacher.ts --apply  (writes)
 *   npx tsx -r dotenv/config scripts/seed-test-teacher.ts --remove --apply
 *
 * ⚠️ THIS WRITES TO PRODUCTION. There is no sandbox database; a local shell's
 * DATABASE_URL points at the live one. Dry run first, always.
 *
 * WHY THIS ACCOUNT CANNOT LEAK ONTO THE PUBLIC SITE.
 * Three independent reasons, none of which relies on remembering to hide it:
 *
 *   1. It has ZERO Consultation rows, and lib/tutorsQuery filters public browse
 *      on `consultations: { some: {} }`. An expert with nothing bookable is
 *      already excluded from /tutors, the category pages, the SEO landings, the
 *      home grid and the sitemap — every one of them flows through that query.
 *      This is also why /tutors needed no new filter for the teaching vertical:
 *      a teacher who sells only packages is invisible there by construction.
 *   2. /swavleba, the only page that does list it, is ADMIN-only while
 *      PACKAGES_VISIBILITY is 'admin' (lib/packages → canSeePackages).
 *   3. The address is @mcodne.test — a non-deliverable domain, and the same
 *      convention scripts/purge-test-accounts.ts already recognises as
 *      synthetic, so a later cleanup sweep will see it for what it is.
 *
 * PASSWORD. Pass --password=<value> to set a real, usable one so the owner can
 * sign in as this teacher and test the flow first-hand. Without the flag the
 * hash is random bytes nobody holds the pre-image of (the safer default).
 *
 * ⚠️ A known password on a LIVE account is a real liability, mitigated only by
 * the three isolation facts above plus: the address is undeliverable, so no
 * password-reset mail can ever reach it, and the account holds no real data.
 * Remove it when the testing is done — `--remove --apply`.
 */
import { randomBytes } from 'crypto'
import { prisma } from '../lib/prisma'
import { hashPassword } from '../lib/auth'
import { ensureExpertSlug } from '../lib/expertSlug'

const APPLY = process.argv.includes('--apply')
const REMOVE = process.argv.includes('--remove')
const PASSWORD = process.argv.find(a => a.startsWith('--password='))?.slice('--password='.length) || null

const EMAIL = 'luka-kapanadze@mcodne.test'
const FULL_NAME = 'ლუკა კაპანაძე'

/** The profile. Plain data so the whole fixture is readable in one screen. */
const PROFILE = {
  headline: 'ინგლისურის მასწავლებელი — საუბრის პრაქტიკა და გამოცდები',
  specialty: 'ინგლისური ენა',
  bio: 'სატესტო ანგარიში. ვამზადებ ზოგადი ინგლისურისა და საერთაშორისო გამოცდებისთვის.',
  yearsExp: 6,
  // TutorProfile.price is the profile-level fallback and is NOT what a teacher
  // sells; the packages below are. Kept non-zero only because the column is
  // required — nothing on /swavleba reads it.
  price: 60,
  languages: ['ka', 'en'],
  // RECURRING is semantically right for a teacher. It gates NOTHING (that is
  // packagesEnabled's job) — set purely so the row is not misleading to read.
  serviceType: 'RECURRING' as const,
  // What this profile IS. Drives the route, the product, the fields and the
  // words; see enum ProfileType.
  profileType: 'TEACHER' as const,
  packagesEnabled: true,
  // Teacher-specific answers, in the same professionData bag the apply flow
  // already fills for profession-specific questions. Keys are from lib/packages
  // (TEACHER_LEVELS / TEACHER_AGES).
  professionData: {
    teacher: {
      subjects: 'ინგლისური ენა, საუბრის პრაქტიკა',
      levels: ['school', 'exam', 'adult'],
      ages: ['teens', 'adults'],
    },
  },
  available: true,
  // categoryId stays null on purpose: a taxonomy field must never be what
  // hides or reveals a person, and the teaching taxonomy is still an open
  // product decision.
}

/**
 * Two sizes so the card shows a real volume discount: 65₾ vs 60₾ per lesson.
 * 8 is the middle option because it is the unit the Georgian market already
 * sells in — 2 lessons/week × 4 weeks (see lib/packages → PACKAGE_LESSON_COUNTS).
 */
const PACKAGES = [
  { title: '4 გაკვეთილი — გასაცნობი', description: 'კვირაში ერთხელ, ერთი თვე.', lessonsCount: 4, minutesPerLesson: 50, price: 260, validDays: 30 },
  { title: '8 გაკვეთილი — ინტენსიური', description: 'კვირაში ორჯერ, ერთი თვე.', lessonsCount: 8, minutesPerLesson: 50, price: 480, validDays: 30 },
]

const STUDENT_EMAIL = 'nino-testeri@mcodne.test'
const STUDENT_NAME = 'ნინო ტესტერი'

/**
 * Publish a plain weekday schedule for the test teacher.
 *
 * Without it every package fails the schedule gate (capacity 0) and nothing can
 * be requested — which is correct behaviour, but makes the fixture untestable.
 * Mon–Fri 15:00–19:00 local for the next 5 weeks is enough to hold a 12-lesson
 * package comfortably.
 */
async function seedAvailability(tutorId: string) {
  await prisma.availabilitySlot.deleteMany({ where: { tutorId } })
  const rows: { tutorId: string; startAt: Date; endAt: Date }[] = []
  const day0 = new Date()
  day0.setHours(0, 0, 0, 0)
  for (let d = 1; d <= 35; d++) {
    const day = new Date(day0.getTime() + d * 24 * 60 * 60 * 1000)
    const dow = day.getDay()
    if (dow === 0 || dow === 6) continue           // weekdays only
    const start = new Date(day); start.setHours(15, 0, 0, 0)
    const end = new Date(day); end.setHours(19, 0, 0, 0)
    rows.push({ tutorId, startAt: start, endAt: end })
  }
  await prisma.availabilitySlot.createMany({ data: rows })
  return rows.length
}

/** A synthetic CLIENT, so the buying half of the flow can be walked too. */
async function seedStudent(): Promise<string> {
  const passwordHash = await hashPassword(PASSWORD ?? randomBytes(32).toString('hex'))
  const u = await prisma.user.upsert({
    where: { email: STUDENT_EMAIL },
    update: { fullName: STUDENT_NAME, role: 'STUDENT', ...(PASSWORD ? { passwordHash } : {}) },
    create: { email: STUDENT_EMAIL, fullName: STUDENT_NAME, role: 'STUDENT', emailVerified: true, passwordHash },
    select: { id: true },
  })
  return u.id
}

async function remove() {
  // The student first — it has no dependants, and leaving it behind would be
  // the silent half of an incomplete cleanup.
  const stu = await prisma.user.findUnique({ where: { email: STUDENT_EMAIL }, select: { id: true } })
  if (stu) {
    const n = await prisma.enrollment.count({ where: { studentId: stu.id } })
    if (APPLY) {
      await prisma.enrollment.deleteMany({ where: { studentId: stu.id } })
      await prisma.user.delete({ where: { id: stu.id } })
      console.log(`წაიშალა მოსწავლე: ${STUDENT_EMAIL} (${n} ჩაწერა)`)
    } else {
      console.log(`წასაშლელი მოსწავლე: ${STUDENT_EMAIL} (${n} ჩაწერა)`)
    }
  }

  const user = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true, role: true, _count: { select: { bookingsAsStudent: true, sentMessages: true } } },
  })
  if (!user) return console.log(`არ არსებობს: ${EMAIL}`)

  // Same refusal rule as purge-test-accounts: if the row grew real history it
  // was not expected to have, stop rather than guess.
  const tutor = await prisma.tutorProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
  const asTutor = tutor ? await prisma.booking.count({ where: { tutorId: tutor.id } }) : 0
  if (asTutor > 0 || user._count.bookingsAsStudent > 0 || user._count.sentMessages > 0) {
    throw new Error(`უარი: ${EMAIL}-ს აქვს ისტორია (ჯავშანი: ${asTutor + user._count.bookingsAsStudent}, წერილი: ${user._count.sentMessages}). ხელით გადახედე.`)
  }
  console.log(`წასაშლელი: ${EMAIL} (${user.role})`)
  if (!APPLY) return console.log('გასაშვებად: --remove --apply')
  // Package/Enrollment and TutorProfile cascade from the user row.
  await prisma.user.delete({ where: { id: user.id } })
  console.log('✅ წაიშალა')
}

async function create() {
  const existing = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } })
  console.log(existing ? `უკვე არსებობს — განახლდება: ${EMAIL}` : `შეიქმნება: ${EMAIL} (${FULL_NAME})`)
  console.log(`  პაკეტი: ${PACKAGES.map(p => `${p.lessonsCount}×${p.minutesPerLesson}წთ = ₾${p.price}`).join('  ·  ')}`)
  console.log('  კონსულტაცია: 0 — ამიტომ /tutors-ზე არ გამოჩნდება')
  if (!APPLY) return console.log('\nგასაშვებად: --apply')

  // A real password only when explicitly asked for; otherwise random bytes.
  const passwordHash = await hashPassword(PASSWORD ?? randomBytes(32).toString('hex'))

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    // Re-running WITHOUT --password must not silently reset a password the
    // owner is currently using to test, so the hash is only written when one
    // was supplied.
    update: { fullName: FULL_NAME, role: 'TUTOR', ...(PASSWORD ? { passwordHash } : {}) },
    create: { email: EMAIL, fullName: FULL_NAME, role: 'TUTOR', emailVerified: true, passwordHash },
    select: { id: true },
  })

  const tutor = await prisma.tutorProfile.upsert({
    where: { userId: user.id },
    update: { ...PROFILE },
    create: { userId: user.id, ...PROFILE },
    select: { id: true },
  })

  // Replace rather than accumulate, so re-running does not stack duplicates.
  await prisma.package.deleteMany({ where: { tutorId: tutor.id } })
  await prisma.package.createMany({ data: PACKAGES.map(p => ({ ...p, tutorId: tutor.id })) })

  const windows = await seedAvailability(tutor.id)
  await seedStudent()
  const slug = await ensureExpertSlug(tutor.id)
  console.log(`  განრიგი: ${windows} სამუშაო ფანჯარა (ორშ–პარ 15:00–19:00)`)

  console.log(`\n✅ მზადაა — /swavleba (ადმინით) ან /tutors/${slug ?? tutor.id}`)
  if (PASSWORD) {
    console.log(`\n   მასწავლებელი: ${EMAIL}`)
    console.log(`   მოსწავლე:     ${STUDENT_EMAIL}`)
    console.log(`   პაროლი (ორივე): ${PASSWORD}`)
    console.log('   ⚠️ ცოცხალი ანგარიშებია — ტესტის დასრულებისას წაშალე.')
  }
  console.log(`   წასაშლელად: npx tsx -r dotenv/config scripts/seed-test-teacher.ts --remove --apply`)
}

async function main() {
  console.log(`⚠️  პროდუქციის ბაზა. რეჟიმი: ${APPLY ? 'ჩაწერა' : 'მშრალი გაშვება'}\n`)
  await (REMOVE ? remove() : create())

  // Prove the isolation claim rather than asserting it.
  const publicCount = await prisma.tutorProfile.count({
    where: { available: true, user: { is: { suspendedAt: null } }, consultations: { some: {} } },
  })
  console.log(`\nსაჯარო კატალოგში ექსპერტი: ${publicCount}`)
}

main()
  .catch(e => { console.error('\n❌', e instanceof Error ? e.message : e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
