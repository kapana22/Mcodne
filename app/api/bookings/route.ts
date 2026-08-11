import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { notify, normalizePrefs } from '@/lib/notify'
import { rateLimit } from '@/lib/rateLimit'
import { stripTutorBlobs } from '@/lib/stripTutorBlobs'
import { isStartOpen } from '@/lib/availability'
import { FEATURE_REQUEST_BOOKING } from '@/lib/flags'
import { isAbroadCategory } from '@/lib/abroad'
import { canSeeB2B } from '@/lib/b2b'
import { ensureDbReady } from '@/lib/dbBoot'
import { sendMail } from '@/lib/mailer'
import { bookingRequestEmail, bookingChangedEmail, fmtWhenTz } from '@/lib/emailTemplates'

/**
 * Run a Serializable transaction, retrying the ONE failure that means „try
 * again", not „you lost".
 *
 * WHY THIS EXISTS (found 2026-08-05 in production data). P2034 is Postgres
 * refusing to serialize a transaction. It was mapped straight to SLOT_TAKEN —
 * „ეს დრო დაიკავეს" — and that is a different claim entirely: a serialization
 * conflict is raised by ANY concurrent work touching the same tables, including
 * the cleanup cron that runs every 15 minutes. It does not mean somebody booked
 * the slot.
 *
 * The evidence: an expert with 24 published windows and, in the whole lifetime
 * of the database, ZERO bookings in any status still produced six „that time is
 * taken" refusals inside ten minutes. With no bookings, `busy` is empty, the
 * openness check is identical with and without it, and the genuine SlotTaken
 * branch is unreachable — P2034 was the only path left. The person picked
 * another time, was refused again, and gave up. Across the funnel, 9 of the 11
 * people who reached the final button failed.
 *
 * Retrying is the standard remedy for a serialization failure and the reason
 * the isolation level is safe to use. Only P2034 is retried: SlotTaken,
 * StudentOverlap and NoAvailability are real verdicts about this booking and
 * must reach the user unchanged and on the first attempt.
 */
const MAX_TX_ATTEMPTS = 3
async function runSerializable<T>(attempt: () => Promise<T>): Promise<T> {
  for (let n = 1; ; n++) {
    try {
      return await attempt()
    } catch (e: any) {
      if (e?.code !== 'P2034' || n >= MAX_TX_ATTEMPTS) throw e
      // Short, jittered backoff — long enough for the conflicting statement to
      // finish, short enough that the person never notices the retry.
      await new Promise(r => setTimeout(r, 40 * n + Math.floor(Math.random() * 40)))
    }
  }
}

const Body = z.object({
  tutorId: z.string(),
  consultationId: z.string().optional(),
  topic: z.string().min(3).max(160),
  // Required: the concrete slot start the client picked from the expert's calendar.
  startAt: z.string().datetime().optional(),
  // Required: session length. Server still re-derives price authoritatively.
  durationMin: z.number().int().min(15).max(240).optional(),
  // Ignored server-side (price is always the tutor's/consultation's rate) — kept
  // for backward-compatible client payloads.
  price: z.number().int().min(0).optional(),
  studentNotes: z.string().max(1000).optional(),
  // Request-based booking: the client is PROPOSING this time rather than
  // picking it from the published calendar. Ignored entirely unless
  // FEATURE_REQUEST_BOOKING is on AND the expert is in the diaspora category —
  // an older or hostile client cannot use it to bypass the availability gate.
  proposed: z.boolean().optional(),
  // Their 2nd and 3rd choice of time, so the expert can answer once instead of
  // trading messages. `startAt` above is always the FIRST choice; these are
  // never anything but extra options, and at most two of them. Ignored on the
  // same terms as `proposed`.
  proposedAlternates: z.array(z.string().datetime()).max(2).optional(),
  // B2B (2026-08-11): spend the client's company balance instead of paying by
  // card. Ignored entirely unless canSeeB2B() AND the client is actually a
  // member of an ACTIVE company with enough on it — an older or hostile client
  // cannot use it to book for free, because nothing about this field is
  // trusted: membership, price and balance are all re-read server-side inside
  // the transaction below.
  paidBy: z.enum(['CARD', 'COMPANY_BALANCE']).optional(),
})

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const bookings = await prisma.booking.findMany({
    where: { studentId: user.id },
    orderBy: { startAt: 'desc' },
    take: 100,
    include: {
      // Narrow the tutor.user select — never send passwordHash to the browser.
      // omit heavy blobs at the DB level so professionData/base64 videoUrl don't
      // cross the wire per row; stripTutorBlobs still guards oversized avatars.
      tutor: {
        omit: { professionData: true, videoUrl: true },
        include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
      },
      consultation: true,
    },
  })
  return NextResponse.json(
    bookings.map(b => ({ ...b, tutor: stripTutorBlobs(b.tutor) })),
  )
}

// How far around the requested time we pull availability rows. Wide enough that
// a long chain of LEGACY pre-sliced rows merges whole (the start grid is
// anchored to the MERGED window's start, so a truncated chain could shift it),
// narrow enough that the read stays bounded.
const WINDOW_LOOKAROUND_MS = 7 * 24 * 60 * 60 * 1000
// The PAST_DATE guard below tolerates 5 minutes of client clock skew; the
// openness check must use the same floor or it would reject starts the guard
// just accepted.
const CLOCK_SKEW_MS = 5 * 60 * 1000

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

  // This route reads TutorProfile.bufferMin, a dbBoot-added column — make sure
  // the boot DDL has run on this process before the first booking touches it.
  // Idempotent and already-resolved after the first call, so it costs nothing
  // on a warm process.
  await ensureDbReady()

  // Dual-role model (2026-07-23): a TUTOR may also act as a CLIENT and book
  // another expert. The /student/* surfaces + space switcher are now wired for
  // it, and the booking is reached via the client space. Booking is keyed off
  // User.id (studentId), independent of the tutor's TutorProfile, so a promoted
  // expert's client bookings never collide with their expert bookings. The only
  // thing refused is booking YOURSELF — enforced by the SELF_BOOKING check below
  // (tutor.userId === user.id). ADMIN has no client space, so keep it out.
  if (user.role === 'ADMIN') {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  // Email verification is intentionally NOT required to book — the confirmation
  // step was friction with no payoff at this stage (no payments yet, and the
  // in-app notifications reach the user regardless). Removed 2026-07-20.

  // Rate-limit per authenticated user: 10 bookings per hour is more than any
  // real student would create; higher rates are almost certainly abuse.
  const rl = rateLimit(`book:${user.id}`, 10, 60 * 60)
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: 'RATE_LIMIT', retryInSec: rl.retryInSec },
      { status: 429 },
    )
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  const { tutorId, consultationId, topic, studentNotes } = parsed.data

  // Validate the date BEFORE any DB work — it's free, and a bad date must never
  // cost a remote round-trip.
  // Every booking is scheduled against the expert's published availability —
  // the client must send a concrete startAt (+ duration). There is no more
  // "instant / live-now" path.
  if (!parsed.data.startAt || parsed.data.durationMin == null) {
    return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  }
  const start = new Date(parsed.data.startAt)
  if (isNaN(start.getTime())) {
    return NextResponse.json({ ok: false, error: 'BAD_DATE' }, { status: 400 })
  }
  if (start.getTime() < Date.now() - 5 * 60 * 1000) {
    return NextResponse.json({ ok: false, error: 'PAST_DATE' }, { status: 400 })
  }
  const reqDurationMin = parsed.data.durationMin

  // Independent pre-checks fan out CONCURRENTLY. Sequential awaits cost one
  // remote round-trip each (~300ms on the Railway proxy) and made the whole
  // POST feel hung; the checks don't depend on each other, only the verdicts do.
  // (There is no availability pre-probe any more: openness depends on the
  // AUTHORITATIVE duration, which the consultation row can override, and the
  // only check that counts runs inside the Serializable transaction below.)
  const [tutor, consultationRow] = await Promise.all([
    prisma.tutorProfile.findUnique({
      where: { id: tutorId },
      include: {
        user: { select: { suspendedAt: true } },
        // Only for the request-booking scope check below. The category is the
        // audience gate: a proposal is a diaspora affordance, and reading it off
        // the expert's own row means a client cannot claim to be in that
        // audience — there is no „context" field to forge.
        category: { select: { slug: true } },
      },
    }),
    consultationId
      ? prisma.consultation.findFirst({
          where: { id: consultationId, tutorId },
          select: { id: true, price: true, minutes: true },
        })
      : Promise.resolve(null),
  ])

  if (!tutor) return NextResponse.json({ ok: false, error: 'TUTOR_NOT_FOUND' }, { status: 404 })

  // (Active-booking cap removed 2026-07-19 per owner — too much friction. The
  // per-tutor + per-student overlap checks below still prevent real conflicts;
  // no-show abuse is a policy/penalty concern to revisit when payments land.)

  if (tutor.userId === user.id) {
    return NextResponse.json({ ok: false, error: 'SELF_BOOKING' }, { status: 400 })
  }

  // Server-side guard for paused tutors. The /tutors/[id] client hides all
  // booking CTAs when available=false, but the API must independently refuse —
  // anyone can craft a direct POST /api/bookings from an old deep link or
  // scripted client. Existing bookings for this tutor are unaffected.
  if (tutor.available === false) {
    return NextResponse.json({ ok: false, error: 'TUTOR_UNAVAILABLE' }, { status: 409 })
  }

  // A suspended expert must not accept new bookings even via a stale deep link.
  // Mirrors the available guard — the profile is hidden from browse, but the API
  // has to refuse independently since anyone can craft a direct POST.
  if (tutor.user.suspendedAt) {
    return NextResponse.json({ ok: false, error: 'TUTOR_UNAVAILABLE' }, { status: 409 })
  }

  // If a consultation is referenced, it MUST belong to this tutor. Never trust
  // a client-supplied consultationId that could point at another tutor's row —
  // and use its authoritative price/minutes below instead of client values.
  const consultation = consultationRow
  if (consultationId && !consultation) {
    return NextResponse.json({ ok: false, error: 'CONSULTATION_NOT_FOUND' }, { status: 404 })
  }

  // Duration + price are authoritative from the server (consultation row, or
  // the tutor's published rate) — NEVER the client body. Previously `price`
  // was taken straight from the request, letting a student book at price 0.
  const durationMin = consultation ? consultation.minutes : reqDurationMin
  const price = consultation ? consultation.price : tutor.price

  // A request only exists when the FEATURE is on, the client asked for one, AND
  // the expert belongs to the diaspora category. Resolved once, here, so the
  // gate below and the row written afterwards can never disagree about which
  // kind of booking this is.
  //
  // THE CATEGORY TERM IS A SECOND LOCK, not a nicety. The published-window gate
  // is the platform's only guarantee that an expert is never booked at a time
  // they did not offer, and a request deliberately steps around it. Scoping that
  // exception to one hidden category means flipping the flag on cannot loosen
  // the guarantee for the ~18 experts in the ordinary catalog, who never agreed
  // to answer out-of-schedule proposals. Both terms, always.
  const isRequest =
    FEATURE_REQUEST_BOOKING && parsed.data.proposed === true && isAbroadCategory(tutor.category?.slug)

  // Their 2nd/3rd choice, normalised: real dates, in the future (same 5-minute
  // clock-skew floor the PAST_DATE guard uses), never a repeat of a time already
  // on the list or of the primary choice, capped at two. Anything else is
  // dropped rather than rejected — a malformed alternate must not cost the
  // client the booking their FIRST choice would have produced.
  const alternates: string[] = []
  if (isRequest) {
    const seen = new Set([start.getTime()])
    for (const raw of parsed.data.proposedAlternates ?? []) {
      const d = new Date(raw)
      if (isNaN(d.getTime())) continue
      if (d.getTime() < Date.now() - CLOCK_SKEW_MS) continue
      if (seen.has(d.getTime())) continue
      seen.add(d.getTime())
      alternates.push(d.toISOString())
      if (alternates.length === 2) break
    }
  }

  const end = new Date(start.getTime() + durationMin * 60 * 1000)

  // Buffer around every session (0 = back-to-back allowed, the historical
  // behavior). lib/availability implements it by fattening each busy interval.
  const bufferMin = tutor.bufferMin ?? 0
  const bufferMs = bufferMin * 60 * 1000

  // Race-safe creation. Everything that must be consistent — the overlap
  // re-check, the openness check, and the insert — runs inside ONE Serializable
  // transaction. Two concurrent bookings for the same time can no longer both
  // pass: the loser sees the winner's row in the overlap re-check, or hits a
  // Postgres serialization failure, and is rejected with SLOT_TAKEN.
  //
  // Nothing is CLAIMED any more (no `booked = true`, no heldSlotId): an
  // availability row is a WINDOW, and this booking's own [startAt, end) is the
  // busy interval every later openness check subtracts. That is what lets a
  // 60-min service span two touching 30-min legacy rows, and stops a 15-min
  // service from destroying a whole 60-min row's remaining inventory.
  // B2B: is this a balance-paid booking at all? Resolved here, once, so the
  // charge below and the row that records it cannot disagree about which kind
  // of payment this was.
  //
  // The FLAG and the request must BOTH say yes. Membership is not checked here
  // on purpose — it is claimed inside the transaction, because a membership
  // read out here is a check-before-write and this one guards real money.
  const wantsBalance = canSeeB2B(user.role) && parsed.data.paidBy === 'COMPANY_BALANCE'

  class SlotTaken extends Error {}
  class StudentOverlap extends Error {}
  class NoAvailability extends Error {}
  // B2B failures. Distinct classes for the same reason the three above are:
  // „your company has no money" and „that time is taken" are different verdicts
  // and the client says different things about them.
  class NotCompanyMember extends Error {}
  class InsufficientBalance extends Error {}
  let booking: {
    id: string
    ref: string
    startAt: Date
    durationMin: number
    price: number
    status: string
  }
  // The transaction body is unchanged; it is only wrapped so a serialization
  // failure can be retried instead of reported as a lost slot.
  const attemptBooking = () => prisma.$transaction(async tx => {
      // Re-check overlap INSIDE the tx. ONE query serves two jobs: this guard
      // (the real concurrency protection) and the `busy` set the openness check
      // below subtracts. The upper bound is end+buffer rather than end so a
      // session starting AFTER ours can still block us through its buffer; the
      // guard re-applies the strict `startAt < end` bound in JS so its behavior
      // is byte-for-byte what it was.
      const candidates = await tx.booking.findMany({
        where: {
          tutorId,
          status: { in: ['PREPARING', 'CONFIRMED', 'LIVE'] },
          startAt: { lt: new Date(end.getTime() + bufferMs) },
        },
        select: { startAt: true, durationMin: true },
      })
      const overlaps = candidates.some(c => {
        const cEnd = new Date(c.startAt.getTime() + c.durationMin * 60 * 1000)
        return c.startAt < end && cEnd > start
      })
      if (overlaps) throw new SlotTaken()

      // Reject the user double-booking THEMSELVES for an overlapping time —
      // two simultaneous sessions waste an expert's slot and guarantee a
      // no-show on one side. (The check above only covers the same tutor.)
      // A dual-role user's own EXPERT-side sessions live under tutor.userId, not
      // studentId, so both hats must be unioned — otherwise an expert who is due
      // to teach at 14:00 could book another expert as a client at 14:00.
      const selfCandidates = await tx.booking.findMany({
        where: {
          OR: [{ studentId: user.id }, { tutor: { userId: user.id } }],
          status: { in: ['PREPARING', 'CONFIRMED', 'LIVE'] },
          startAt: { lt: end },
        },
        select: { startAt: true, durationMin: true },
      })
      const selfOverlap = selfCandidates.some(c => {
        const cEnd = new Date(c.startAt.getTime() + c.durationMin * 60 * 1000)
        return cEnd > start
      })
      if (selfOverlap) throw new StudentOverlap()

      // The requested start must be genuinely bookable: inside one of the
      // expert's published WINDOWS, on that window's start grid, long enough for
      // THIS service, and clear of every active booking (+buffer). Legacy
      // pre-sliced rows fuse back into one window on the way in — that's how
      // this works with no data migration.
      const windowRows = await tx.availabilitySlot.findMany({
        where: {
          tutorId,
          endAt: { gt: new Date(start.getTime() - WINDOW_LOOKAROUND_MS) },
          startAt: { lt: new Date(end.getTime() + WINDOW_LOOKAROUND_MS) },
        },
        select: { startAt: true, endAt: true },
        orderBy: { startAt: 'asc' },
        take: 2000,
      })
      const openOpts = {
        windows: windowRows.map(w => ({ start: w.startAt, end: w.endAt })),
        busy: candidates.map(c => ({
          start: c.startAt,
          end: new Date(c.startAt.getTime() + c.durationMin * 60 * 1000),
        })),
        serviceMin: durationMin,
        bufferMin,
        now: new Date(Date.now() - CLOCK_SKEW_MS),
      }
      // ── The published-window gate ────────────────────────────────────────
      // A REQUEST (`proposed`) is exactly the booking whose start is NOT in a
      // published window — so this one check, and only this one, is skipped.
      // Everything above still ran: the overlap re-check and the student's own
      // overlap are INSIDE this transaction and rejected the request already if
      // it collided. A proposal may sit outside the expert's calendar; it may
      // never sit on top of a real session.
      if (!isRequest && !isStartOpen(start, openOpts)) {
        // Split the verdict so the client keeps its two distinct messages:
        // re-running the same predicate with no bookings isolates "the expert
        // never published this time / it isn't a valid start" (NO_AVAILABILITY)
        // from "something is already booked there" (SLOT_TAKEN — including a
        // neighbouring session whose buffer reaches into this one).
        if (!isStartOpen(start, { ...openOpts, busy: [] })) throw new NoAvailability()
        throw new SlotTaken()
      }

      // ── The company charge ────────────────────────────────────────────────
      // INSIDE this transaction, and after every availability verdict above, so
      // a balance is never spent on a booking that then fails to be created.
      // If anything below throws — including a Postgres serialization failure
      // that runSerializable retries — the decrement rolls back with it, which
      // is why the retry cannot double-charge.
      //
      // The membership is CLAIMED, not checked: `updateMany` with the whole
      // condition in its WHERE, and `count !== 1` meaning somebody else won.
      // A read-then-write here loses to the client's second tab and to an admin
      // adjusting the same balance, and losing means an overdraw — real money.
      // Same rule as app/api/bookings/[id]/cancel, and the database CHECK
      // (balance >= 0) sits underneath it as a backstop.
      let chargedCompanyId: string | null = null
      let balanceAfter = 0
      if (wantsBalance) {
        // Membership is read here only to name the company for the claim below;
        // the claim itself re-states every condition, so this read being stale
        // cannot authorise anything.
        const membership = await tx.companyMember.findFirst({
          where: { userId: user.id },
          select: { companyId: true },
        })
        if (!membership) throw new NotCompanyMember()

        const claimed = await tx.company.updateMany({
          where: {
            id: membership.companyId,
            // A frozen company may receive money but may not spend it.
            status: 'ACTIVE',
            // `price` is the SERVER's number — derived above from the
            // consultation row or the expert's rate, never from the request.
            balance: { gte: price },
          },
          data: { balance: { decrement: price } },
        })
        if (claimed.count !== 1) throw new InsufficientBalance()

        const after = await tx.company.findUniqueOrThrow({
          where: { id: membership.companyId },
          select: { balance: true },
        })
        chargedCompanyId = membership.companyId
        balanceAfter = after.balance
      }

      const created = await tx.booking.create({
        data: {
          studentId: user.id,
          tutorId,
          consultationId: consultation?.id ?? undefined,
          topic,
          startAt: start,
          durationMin,
          price,
          studentNotes,
          // Only ever written when a balance was actually charged. An ordinary
          // booking leaves this null, which `paymentSourceOf()` reads as CARD —
          // the same value every booking made before this feature existed has.
          ...(chargedCompanyId ? { paidBy: 'COMPANY_BALANCE' as const } : {}),
          // PREPARING already means „waiting for the expert to answer", which is
          // exactly what a request is — so a proposal needs no new status and
          // no new answer flow. Only its ORIGIN differs, recorded below.
          status: 'PREPARING',
          // Snapshot the tutor's current type so past bookings never rewrite.
          serviceType: tutor.serviceType,
          // heldSlotId deliberately left null — nothing is claimed. The release
          // paths (cancel/decline/cleanup) treat null as a no-op and stay in
          // place only to free LEGACY rows that really were flipped booked.
        },
        select: { id: true, ref: true, startAt: true, durationMin: true, price: true, status: true },
      })
      // The ORIGIN of the booking, written INSIDE the transaction so a request
      // can never commit as an ordinary booking: the expert would then see a
      // time outside their calendar with nothing explaining it, and the
      // alternates they were offered would be gone.
      //
      // Raw SQL, matching `rescheduleRequest`: these are dbBoot columns and the
      // create() above stays a plain typed insert.
      if (isRequest) {
        await tx.$executeRawUnsafe(
          `UPDATE "Booking" SET "proposedByStudent" = true, "proposedAlternates" = $2::jsonb WHERE id = $1`,
          created.id,
          alternates.length ? JSON.stringify(alternates.map(startAt => ({ startAt }))) : null,
        )
      }

      // The ledger row, in the SAME transaction as the decrement and the
      // booking. The number and the row that explains it are written together
      // or not at all — a balance that moved with nothing recording why is the
      // one state this feature must never reach.
      //
      // `bookingId` is a plain column with no FK (see schema.prisma), so this
      // row survives the booking being deleted. It has to: the money was spent.
      if (chargedCompanyId) {
        await tx.companyTransaction.create({
          data: {
            companyId: chargedCompanyId,
            type: 'CHARGE',
            amount: price,
            balanceAfter,
            bookingId: created.id,
            // No actorId — nobody at the company did this by hand; the booking
            // flow did. A null here is the difference between „an admin took
            // money off" and „a session was booked".
            actorId: null,
            note: topic.slice(0, 300),
          },
        })
      }
      return created
    }, { isolationLevel: 'Serializable' })

  try {
    booking = await runSerializable(attemptBooking)
  } catch (e: any) {
    if (e instanceof SlotTaken) {
      return NextResponse.json({ ok: false, error: 'SLOT_TAKEN' }, { status: 409 })
    }
    if (e instanceof StudentOverlap) {
      return NextResponse.json({ ok: false, error: 'STUDENT_OVERLAP' }, { status: 409 })
    }
    if (e instanceof NoAvailability) {
      return NextResponse.json({ ok: false, error: 'NO_AVAILABILITY' }, { status: 409 })
    }
    // B2B. Both are 409 — the request was well-formed and the state refused it,
    // which is the same shape as SLOT_TAKEN. Nothing was created and nothing
    // was charged: the whole transaction rolled back.
    if (e instanceof NotCompanyMember) {
      return NextResponse.json({ ok: false, error: 'NOT_COMPANY_MEMBER' }, { status: 409 })
    }
    if (e instanceof InsufficientBalance) {
      return NextResponse.json({ ok: false, error: 'INSUFFICIENT_BALANCE' }, { status: 409 })
    }
    // P2034 after MAX_TX_ATTEMPTS retries (see runSerializable). Reaching here
    // means the transaction could not be serialized three times running, which
    // — unlike a single P2034 — really is best explained by contention on this
    // slot, so the user still gets „that time was taken".
    //
    // Logged, and logged distinctly: this used to be indistinguishable from a
    // genuine SlotTaken in both the response and the funnel, which is how six
    // refusals against an expert with no bookings at all went unexplained for a
    // day. If this line starts appearing, the conflict is real and the retry
    // budget is the thing to look at — not the availability data.
    if (e?.code === 'P2034') {
      console.error('[booking] serialization retries exhausted', { tutorId, startAt: start.toISOString(), durationMin })
      return NextResponse.json({ ok: false, error: 'SLOT_TAKEN' }, { status: 409 })
    }
    throw e
  }

  // Notify the tutor of the new booking request — AFTER the response is sent.
  // notify() costs two more remote round-trips; the student shouldn't stare at
  // a spinner for them. after() (Next 15) runs once the response has flushed.
  after(async () => {
    await notify(tutor.userId, {
      type: 'BOOKING_CREATED',
      title: 'ახალი ჯავშნის მოთხოვნა',
      // Say up front when the client named the time — the bell is often the
      // only thing an expert reads, and „why is this not in my schedule?" is
      // the first question an unannounced proposal raises.
      body: isRequest ? `${topic} — დრო კლიენტმა შემოგვთავაზა` : topic,
      href: `/tutor/bookings/${booking.id}`,
    })
    // ALSO email the expert — a request they don't act on within 24h gets
    // auto-canceled by the cleanup cron, so the in-app bell alone isn't enough.
    // Gate on the tutor's BOOKING_CREATED pref (same as the in-app notify).
    const whenText = fmtWhenTz(booking.startAt, { year: true })
    let expertName = 'ექსპერტი'
    try {
      const tutorUser = await prisma.user.findUnique({
        where: { id: tutor.userId },
        select: { email: true, fullName: true, notificationPrefs: true },
      })
      if (tutorUser?.fullName) expertName = tutorUser.fullName
      if (tutorUser?.email && normalizePrefs(tutorUser.notificationPrefs).BOOKING_CREATED) {
        const { subject, html } = bookingRequestEmail({
          studentName: user.fullName,
          topic,
          whenText,
          // A proposal must ANNOUNCE itself, in the email as well as in the
          // dashboard: the expert is being shown a time that is not on their
          // calendar, plus up to two more they were never asked about.
          proposedByStudent: isRequest,
          alternateWhenTexts: alternates.map(iso => fmtWhenTz(new Date(iso), { year: true })),
        })
        await sendMail({ to: tutorUser.email, subject, html })
      }
    } catch { /* email is best-effort */ }
    // …and a receipt to the CLIENT. Until now the requesting side got nothing at
    // all: the request sits in PREPARING, and if the expert never answers, the
    // cleanup cron cancels it — so a booking could be created and die without a
    // single line reaching the person who made it. The receipt states the 24h
    // rule, so the silence is at least expected. Its OWN try/catch: a failure
    // emailing the expert must not swallow the client's copy.
    try {
      const student = await prisma.user.findUnique({
        where: { id: user.id },
        select: { email: true, notificationPrefs: true },
      })
      if (student?.email && normalizePrefs(student.notificationPrefs).BOOKING_CREATED) {
        const { subject, html } = bookingChangedEmail('request_sent', {
          counterpartName: expertName,
          topic,
          whenText,
          href: `/student/bookings/${booking.id}`,
        })
        await sendMail({ to: student.email, subject, html })
      }
    } catch { /* email is best-effort */ }
  })

  // Echo the AUTHORITATIVE facts (server may have overridden client-sent
  // price/duration via the consultation row) so the confirmation screen
  // renders what was actually booked, not what the client asked for.
  return NextResponse.json({
    ok: true,
    id: booking.id,
    ref: booking.ref,
    startAt: booking.startAt,
    durationMin: booking.durationMin,
    price: booking.price,
    status: booking.status,
  })
}
