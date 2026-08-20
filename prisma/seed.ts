import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const CATEGORIES = [
  { slug: 'business', name: 'ბიზნესი', order: 1, count: 32 },
  { slug: 'finance', name: 'ფინანსები', order: 2, count: 18 },
  { slug: 'career', name: 'კარიერა', order: 3, count: 24 },
  { slug: 'law', name: 'სამართალი', order: 4, count: 12 },
  { slug: 'marketing', name: 'მარკეტინგი', order: 5, count: 21 },
  { slug: 'psychology', name: 'ფსიქოლოგია', order: 6, count: 17 },
]

// Demo intro-video URLs rotated across seeded experts so the /tutors cards show
// a real play button + video preview. These are long-lived public YouTube videos
// (placeholders for the demo) — real experts paste their own intro on /tutor/profile.
const DEMO_VIDEOS = [
  'https://www.youtube.com/watch?v=jNQXAC9IVRw',
  'https://www.youtube.com/watch?v=9bZkp7q19f0',
  'https://www.youtube.com/watch?v=kJQP7kiw5Fk',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
]

const TUTORS = [
  {
    email: 'giorgi.meladze@mcodne.ge',
    fullName: 'გიორგი მელაძე',
    specialty: 'ბიზნეს-სტრატეგია',
    categorySlug: 'business',
    headline: 'ex-McKinsey · 12 წელი გამოცდილება',
    bio: '10 წელი ვაშენე და ვყიდე კომპანიები — გეტყვი ნამდვილ ცდომილებებს, არა სახელმძღვანელოს. სპეციალიზაცია: growth strategy, ოპერაციული ეფექტიანობა.',
    price: 80,
    yearsExp: 12,
    rating: 4.9,
    reviewsCount: 124,
    sessionsCount: 312,
    verified: true,
    avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=320&q=80',
  },
  {
    email: 'nino.kvitsinadze@mcodne.ge',
    fullName: 'ნინო კვიცინაძე',
    specialty: 'კარიერული ქოუჩი',
    categorySlug: 'career',
    headline: 'ex-Microsoft, TBC პროდუქტი',
    bio: 'FAANG-ში, Microsoft-ში, ქართულ unicorn-ში — ვიცი რა ლუპებში ცვივა ხალხი. დაგეხმარები FAANG ინტერვიუზე, promotion-ზე ან ცვლილებაზე.',
    price: 60,
    yearsExp: 9,
    rating: 5.0,
    reviewsCount: 87,
    sessionsCount: 198,
    verified: true,
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=320&q=80',
  },
  {
    email: 'levan.janelidze@mcodne.ge',
    fullName: 'ლევან ჯანელიძე',
    specialty: 'საგადასახადო',
    categorySlug: 'finance',
    headline: 'BIG4, 14 წელი ბუღალტერი',
    bio: '14 წელი ვაკეთებდი ბუღალტერიას ბანკში — გეტყვი როგორ აარიდო ლეგალურად 30%. IP სტატუსი, individual entrepreneur, TAX audit.',
    price: 100,
    yearsExp: 14,
    rating: 4.8,
    reviewsCount: 56,
    sessionsCount: 142,
    verified: true,
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=320&q=80',
  },
  {
    email: 'tamar.khurodze@mcodne.ge',
    fullName: 'თამარ ხუროძე',
    specialty: 'პროდუქტ-მენეჯმენტი',
    categorySlug: 'business',
    headline: 'Senior PM · Wayfair (50მ მომხმარებელი)',
    bio: 'გავაჩვენებ როგორ ვამოწმებთ ვარაუდებს, სანამ ვწერთ კოდს. Discovery-ც, A/B-ც, roadmap prioritization.',
    price: 90,
    yearsExp: 8,
    rating: 4.9,
    reviewsCount: 73,
    sessionsCount: 156,
    verified: true,
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=320&q=80',
  },
  {
    email: 'davit.chichinadze@mcodne.ge',
    fullName: 'დავით ჩიჩინაძე',
    specialty: 'ციფრული მარკეტინგი',
    categorySlug: 'marketing',
    headline: 'Head of Growth · Bolt',
    bio: 'Bolt-ში 4 წელი, ex-BOG marketing. Performance marketing, brand, growth loops.',
    price: 75,
    yearsExp: 7,
    rating: 4.7,
    reviewsCount: 41,
    sessionsCount: 89,
    verified: true,
    avatar: 'https://i.pravatar.cc/320?img=52',
  },
  {
    email: 'ana.gvinianidze@mcodne.ge',
    fullName: 'ანა გვინიანიძე',
    specialty: 'ბიზნეს-იურისტი',
    categorySlug: 'law',
    headline: 'BGI Legal · სტარტაპ სპეციალიზაცია',
    bio: 'Term Sheet, SAFE, IP protection, საერთაშორისო კონტრაქტი. მუშაობა ქართულ და საერთაშორისო კომპანიებთან.',
    price: 120,
    yearsExp: 10,
    rating: 4.9,
    reviewsCount: 34,
    sessionsCount: 67,
    verified: true,
    avatar: 'https://i.pravatar.cc/320?img=44',
  },
  {
    email: 'irakli.beridze@mcodne.ge',
    fullName: 'ირაკლი ბერიძე',
    specialty: 'Series A / VC-fundraising',
    categorySlug: 'business',
    headline: 'ex-BCG · 3 exits',
    bio: '3 კომპანია ვმართე, 2 გავყიდე. VC pitching, financial modeling, cap table strategy.',
    price: 150,
    yearsExp: 15,
    rating: 4.95,
    reviewsCount: 61,
    sessionsCount: 128,
    verified: true,
    avatar: 'https://i.pravatar.cc/320?img=15',
  },
  {
    email: 'ketevan.tsereteli@mcodne.ge',
    fullName: 'ქეთევან წერეთელი',
    specialty: 'კლინიკური ფსიქოლოგი',
    categorySlug: 'psychology',
    headline: 'PhD · 8 წლის პრაქტიკა',
    bio: 'CBT, პარტნიორული ურთიერთობები, burnout. კონფიდენციალურობა უზრუნველყოფილია.',
    price: 90,
    yearsExp: 8,
    rating: 4.9,
    reviewsCount: 128,
    sessionsCount: 340,
    verified: true,
    avatar: 'https://i.pravatar.cc/320?img=32',
  },
  {
    email: 'nika.tabatadze@mcodne.ge',
    fullName: 'ნიკა თაბატაძე',
    specialty: 'B2B SaaS Growth',
    categorySlug: 'business',
    headline: 'ex-Pipedrive · 2 exit-ი',
    bio: 'B2B SaaS-ში 9 წელი. Product-led growth, sales funnel, retention. მუშაობა ტექნიკურ ფაუნდერებთან.',
    price: 110,
    yearsExp: 9,
    rating: 4.85,
    reviewsCount: 52,
    sessionsCount: 118,
    verified: true,
    avatar: 'https://i.pravatar.cc/320?img=68',
  },
  {
    email: 'salome.oniani@mcodne.ge',
    fullName: 'სალომე ონიანი',
    specialty: 'HR + Talent Strategy',
    categorySlug: 'career',
    headline: 'ex-Uber · Head of People',
    bio: 'Uber-ში 5 წელი, ტექ სექტორის recruiting + comp. Salary negotiation, offer analysis, career transition.',
    price: 85,
    yearsExp: 11,
    rating: 4.9,
    reviewsCount: 96,
    sessionsCount: 214,
    verified: true,
    avatar: 'https://i.pravatar.cc/320?img=47',
  },
  {
    email: 'gio.chkheidze@mcodne.ge',
    fullName: 'გიო ჩხეიძე',
    specialty: 'Personal Finance + ინვესტიცია',
    categorySlug: 'finance',
    headline: 'CFA · 12 წელი ინვესტ-კონსულტანტი',
    bio: 'ETF, portfolio construction, tax-efficient investing. IB და retirement-ის დაგეგმვა.',
    price: 95,
    yearsExp: 12,
    rating: 4.88,
    reviewsCount: 78,
    sessionsCount: 156,
    verified: true,
    avatar: 'https://i.pravatar.cc/320?img=8',
  },
  {
    email: 'mari.baratashvili@mcodne.ge',
    fullName: 'მარი ბარათაშვილი',
    specialty: 'Performance Marketing',
    categorySlug: 'marketing',
    headline: 'ex-TBC · Meta Ads specialist',
    bio: 'Meta + Google Ads, funnels, ROAS optimization. 6 წელი e-commerce brands-თან მუშაობა.',
    price: 70,
    yearsExp: 6,
    rating: 4.75,
    reviewsCount: 38,
    sessionsCount: 92,
    verified: true,
    avatar: 'https://i.pravatar.cc/320?img=45',
  },
  {
    email: 'zurab.kekelidze@mcodne.ge',
    fullName: 'ზურაბ კეკელიძე',
    specialty: 'შრომის სამართალი',
    categorySlug: 'law',
    headline: 'Partner · 15 წელი პრაქტიკა',
    bio: 'შრომითი ხელშეკრულებები, employment disputes, corporate compliance. კომპანიები 50+ თანამშრომლით.',
    price: 130,
    yearsExp: 15,
    rating: 4.92,
    reviewsCount: 41,
    sessionsCount: 78,
    verified: true,
    avatar: 'https://i.pravatar.cc/320?img=13',
  },
  {
    email: 'nana.jorbenadze@mcodne.ge',
    fullName: 'ნანა ჯორბენაძე',
    specialty: 'ოჯახური ფსიქოთერაპია',
    categorySlug: 'psychology',
    headline: 'MSc · Systemic Family Therapy',
    bio: 'წყვილთა და ოჯახური თერაპია. მშობელი-შვილის ურთიერთობა, გადაწყვეტილების მიღება.',
    price: 80,
    yearsExp: 10,
    rating: 4.87,
    reviewsCount: 67,
    sessionsCount: 189,
    verified: true,
    avatar: 'https://i.pravatar.cc/320?img=25',
  },
  {
    email: 'temur.gogichaishvili@mcodne.ge',
    fullName: 'თემურ გოგიჩაიშვილი',
    specialty: 'Operations + Supply Chain',
    categorySlug: 'business',
    headline: 'ex-Wildberries · COO',
    bio: 'Logistics, warehousing, last-mile delivery. 8 წელი e-commerce სექტორში, ჩრდილო-კავკასია.',
    price: 100,
    yearsExp: 13,
    rating: 4.8,
    reviewsCount: 45,
    sessionsCount: 89,
    verified: true,
    avatar: 'https://i.pravatar.cc/320?img=59',
  },
  {
    email: 'ana.chincharauli@mcodne.ge',
    fullName: 'ანა ჭინჭარაული',
    specialty: 'Content + Brand Strategy',
    categorySlug: 'marketing',
    headline: 'Ex-Bolt · Head of Content',
    bio: 'Content strategy, editorial calendar, storytelling. B2C + D2C brands. 7 წელი.',
    price: 65,
    yearsExp: 7,
    rating: 4.7,
    reviewsCount: 29,
    sessionsCount: 61,
    verified: false,
    avatar: 'https://i.pravatar.cc/320?img=41',
  },
  {
    email: 'lasha.gogua@mcodne.ge',
    fullName: 'ლაშა გოგუა',
    specialty: 'Product Design + UX',
    categorySlug: 'career',
    headline: 'ex-Miro · Senior Designer',
    bio: 'Design systems, prototyping, user research. FAANG portfolio review + design career switch.',
    price: 75,
    yearsExp: 8,
    rating: 4.83,
    reviewsCount: 54,
    sessionsCount: 112,
    verified: true,
    avatar: 'https://i.pravatar.cc/320?img=51',
  },
  {
    email: 'natia.samkharadze@mcodne.ge',
    fullName: 'ნათია სამხარაძე',
    specialty: 'საგადასახადო + IE',
    categorySlug: 'finance',
    headline: 'RS + IE-სთვის სპეციალიზაცია',
    bio: 'Individual Entrepreneur ცხრილი, 1% IT status, საერთაშორისო payments, USDT/USDC vs GEL.',
    price: 80,
    yearsExp: 6,
    rating: 4.9,
    reviewsCount: 88,
    sessionsCount: 165,
    verified: true,
    avatar: 'https://i.pravatar.cc/320?img=30',
  },
]

async function main() {
  // Fail-closed guard: this seed WRITES and DELETES rows, and local dev connects
  // to the PROD DB (there is no sandbox) — so a stray `npm run db:seed` would
  // mutate production. Refuse to run unless the operator explicitly opts in.
  if (process.env.SEED_ENABLED !== '1') {
    console.error('✋ seed refused. Set SEED_ENABLED=1 to run (guards against writing the prod DB by accident).')
    process.exit(1)
  }
  console.log('🌱 Seeding...')

  // Cleanup: remove QA/test junk. DESTRUCTIVE (cascades to bookings/reviews/
  // messages) and doubly-gated behind CLEAN_TEST_USERS=1 — skipped by default,
  // because the broad email patterns below (test*, qa*, @x.com) can match REAL
  // customers on the shared prod DB.
  const junk = process.env.CLEAN_TEST_USERS === '1' ? await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: '@example.com' } },
        { email: { startsWith: 'qa' } },
        { email: { startsWith: 'audit.' } },
        { email: { startsWith: 'audit-' } },
        { email: { startsWith: 'ui-audit' } },
        { email: { startsWith: 'flash-test' } },
        { email: { startsWith: 'badge-' } },
        { email: { startsWith: 'test' } },
        { email: { contains: '@x.com' } },
      ],
    },
    select: { id: true, email: true, fullName: true },
  }) : []
  if (junk.length > 0) {
    console.log(`  cleaning ${junk.length} test users:`, junk.map(u => u.email).join(', '))
    const junkIds = junk.map(u => u.id)
    // Booking has RESTRICT on studentId/tutor, so delete referencing bookings
    // (and their messages) explicitly before the user delete.
    const junkTutorProfiles = await prisma.tutorProfile.findMany({
      where: { userId: { in: junkIds } },
      select: { id: true },
    })
    const junkTutorIds = junkTutorProfiles.map(t => t.id)
    // Find all bookings involving any of these users (as student or tutor)
    const bookings = await prisma.booking.findMany({
      where: {
        OR: [
          { studentId: { in: junkIds } },
          ...(junkTutorIds.length ? [{ tutorId: { in: junkTutorIds } }] : []),
        ],
      },
      select: { id: true },
    })
    if (bookings.length > 0) {
      const bookingIds = bookings.map(b => b.id)
      // Review→Booking is RESTRICT — remove reviews before their bookings.
      // Message→Booking is Cascade but delete explicitly to be safe.
      await prisma.review.deleteMany({ where: { bookingId: { in: bookingIds } } })
      await prisma.message.deleteMany({ where: { bookingId: { in: bookingIds } } })
      await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } })
      console.log(`    (removed ${bookings.length} bookings + reviews + messages first)`)
    }
    // Cascade will remove sessions, favorites, notifications, tutorProfile, availability, etc.
    await prisma.user.deleteMany({ where: { id: { in: junkIds } } })
  }

  for (const c of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: c,
      create: c,
    })
  }

  const cats = await prisma.category.findMany()
  const catBySlug = Object.fromEntries(cats.map(c => [c.slug, c.id]))

  // Admin user
  const adminHash = await bcrypt.hash('admin1234', 10)
  await prisma.user.upsert({
    where: { email: 'admin@mcodne.ge' },
    update: {},
    create: {
      email: 'admin@mcodne.ge',
      fullName: 'ადმინი',
      passwordHash: adminHash,
      role: 'ADMIN',
    },
  })
  console.log('✓ admin@mcodne.ge / admin1234')

  // Sample student — force role back to STUDENT and drop any orphaned
  // tutorProfile it accumulated during QA drift.
  const stu = await prisma.user.upsert({
    where: { email: 'student@mcodne.ge' },
    update: { role: 'STUDENT', fullName: 'თამარ ლომიძე' },
    create: {
      email: 'student@mcodne.ge',
      fullName: 'თამარ ლომიძე',
      passwordHash: await bcrypt.hash('student1234', 10),
      role: 'STUDENT',
      avatarUrl: 'https://i.pravatar.cc/120?img=23',
    },
  })
  // If they still have a tutor profile (from prior QA), clean it up.
  const stuTutor = await prisma.tutorProfile.findUnique({ where: { userId: stu.id } })
  if (stuTutor) {
    // Delete related rows that would otherwise RESTRICT the tutorProfile delete.
    const stuBks = await prisma.booking.findMany({ where: { tutorId: stuTutor.id }, select: { id: true } })
    if (stuBks.length > 0) {
      const bIds = stuBks.map(b => b.id)
      await prisma.review.deleteMany({ where: { bookingId: { in: bIds } } })
      await prisma.message.deleteMany({ where: { bookingId: { in: bIds } } })
      await prisma.booking.deleteMany({ where: { id: { in: bIds } } })
    }
    await prisma.tutorProfile.delete({ where: { id: stuTutor.id } })
    console.log('  (removed stray tutor profile from student@mcodne.ge)')
  }
  console.log('✓ student@mcodne.ge / student1234')

  // Tutors
  for (const [i, t] of TUTORS.entries()) {
    const videoUrl = DEMO_VIDEOS[i % DEMO_VIDEOS.length]
    const user = await prisma.user.upsert({
      where: { email: t.email },
      update: { fullName: t.fullName, avatarUrl: t.avatar, role: 'TUTOR' },
      create: {
        email: t.email,
        fullName: t.fullName,
        passwordHash: await bcrypt.hash('tutor1234', 10),
        role: 'TUTOR',
        avatarUrl: t.avatar,
      },
    })
    await prisma.tutorProfile.upsert({
      where: { userId: user.id },
      update: {
        headline: t.headline, bio: t.bio, specialty: t.specialty, price: t.price,
        yearsExp: t.yearsExp, rating: t.rating, reviewsCount: t.reviewsCount,
        sessionsCount: t.sessionsCount, verified: t.verified, videoUrl,
        categoryId: catBySlug[t.categorySlug],
      },
      create: {
        userId: user.id,
        headline: t.headline, bio: t.bio, specialty: t.specialty, price: t.price,
        yearsExp: t.yearsExp, rating: t.rating, reviewsCount: t.reviewsCount,
        sessionsCount: t.sessionsCount, verified: t.verified, videoUrl,
        categoryId: catBySlug[t.categorySlug],
      },
    })
  }
  console.log(`✓ ${TUTORS.length} tutors`)

  // Availability slots — 6 upcoming slots per tutor across the next ~21 days.
  // Only add for tutors that have zero future slots (so re-running seed doesn't
  // clobber tutor-added slots or duplicate them).
  const tutorRows = await prisma.tutorProfile.findMany()
  const now = Date.now()
  const anchor = new Date()
  anchor.setHours(0, 0, 0, 0)
  const HOURS_MENU = [9, 11, 14, 16, 18, 20]  // rotating hour picks per tutor
  let slotAdded = 0
  for (let ti = 0; ti < tutorRows.length; ti++) {
    const t = tutorRows[ti]
    const existing = await prisma.availabilitySlot.count({
      where: { tutorId: t.id, startAt: { gte: new Date(now) } },
    })
    if (existing > 0) continue
    // Generate 6 slots on staggered day+hour offsets so tutors don't all overlap.
    const slots = []
    for (let k = 0; k < 6; k++) {
      const dayOffset = 2 + k * 3 + (ti % 3)  // days 2, 5, 8, 11, 14, 17 (+ shift)
      const hour = HOURS_MENU[(ti + k) % HOURS_MENU.length]
      const start = new Date(anchor)
      start.setDate(start.getDate() + dayOffset)
      start.setHours(hour, 0, 0, 0)
      // skip Sundays for realism (getDay 0 = Sunday)
      if (start.getDay() === 0) start.setDate(start.getDate() + 1)
      const end = new Date(start.getTime() + 60 * 60 * 1000)
      slots.push({ tutorId: t.id, startAt: start, endAt: end })
    }
    await prisma.availabilitySlot.createMany({ data: slots })
    slotAdded += slots.length
  }
  console.log(`✓ ${slotAdded} availability slots added`)

  // Consultation tiers for each tutor
  const tutors = await prisma.tutorProfile.findMany()
  for (const t of tutors) {
    const existing = await prisma.consultation.count({ where: { tutorId: t.id } })
    if (existing > 0) continue
    await prisma.consultation.createMany({
      data: [
        { tutorId: t.id, tier: 'QUICK', title: 'სწრაფი კითხვა', description: '15 წუთი — ერთი კონკრეტული საკითხი.', minutes: 15, price: Math.max(15, Math.round(t.price / 4)) },
        { tutorId: t.id, tier: 'STANDARD', title: 'სრული სესია', description: '60 წუთი — ღრმა ანალიზი, კონკრეტული რჩევა.', minutes: 60, price: t.price },
        { tutorId: t.id, tier: 'DEEP', title: 'ღრმა კონსულტაცია', description: '90 წუთი + follow-up — რთული საკითხისთვის.', minutes: 90, price: Math.round(t.price * 1.4) },
      ],
    })
  }
  console.log('✓ consultation tiers')

  // Sample bookings
  const student = await prisma.user.findUnique({ where: { email: 'student@mcodne.ge' } })
  if (student) {
    const anyTutor = tutors[0]
    const already = await prisma.booking.count({ where: { studentId: student.id } })
    if (already === 0) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(14, 0, 0, 0)
      await prisma.booking.create({
        data: {
          studentId: student.id,
          tutorId: anyTutor.id,
          topic: 'Series A pitch deck-ის კონსულტაცია',
          startAt: tomorrow,
          durationMin: 60,
          price: anyTutor.price,
          status: 'CONFIRMED',
        },
      })
    }
  }

  console.log('🌱 Done')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
