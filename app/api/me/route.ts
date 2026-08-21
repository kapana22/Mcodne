import { NextResponse, after } from 'next/server'
import { normalizePhone, phoneFormatError } from '@/lib/phone'
import { cookies } from 'next/headers'
import { kickSweep } from '@/lib/sweepRunner'
import { z } from 'zod'
import { identityOf } from '@/lib/identity'
import { getCurrentUser, hashPassword, verifyPassword, revokeOtherSessions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { normalizeAvatar } from '@/lib/normalizeAvatar'
import { rateLimit } from '@/lib/rateLimit'
import { firstGeorgianMessage, georgianNameRefine, georgianRefine } from '@/lib/georgianText'
import { ROLE } from '@/lib/roles'


// The header/nav reads role from here to decide what to render. If the browser
// serves a cached response, the top bar keeps showing the PREVIOUS role after
// an admin impersonation swap or exit — no-store guarantees every read is live.
export const dynamic = 'force-dynamic'

// Applied to every response so no browser/proxy layer caches an identity.
const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' }

/**
 * Has this person ever acted as a CLIENT — bought, saved or asked for anything?
 *
 * The question the space switcher needs, and it is deliberately generous: one
 * favourite is enough. Somebody who has done any of the three has a room worth
 * a door; somebody who has done none of them has an empty one, and a provider's
 * menu should be about selling.
 *
 * It flips ON the moment they do any of it — nothing here is cached — so a
 * provider who books their first consultation finds the door already there.
 */
async function hasClientActivity(userId: string): Promise<boolean> {
  const [bought, saved, asked] = await Promise.all([
    prisma.booking.count({ where: { studentId: userId }, take: 1 }),
    prisma.favorite.count({ where: { userId }, take: 1 }),
    prisma.serviceRequest.count({ where: { userId }, take: 1 }),
  ])
  return bought > 0 || saved > 0 || asked > 0
}

export async function GET() {
  // Maintenance sweep, kicked off ordinary traffic. This route is hit on nearly
  // every page load (AppShell reads the role from it), which makes it the
  // cheapest reliable heartbeat in the app. `after()` keeps it strictly OFF the
  // response path, and lib/sweepRunner claims atomically so only one request
  // per 15 min actually does anything — see the WHY block in that file: the
  // Railway cron reported success for days while never running the sweep.
  after(() => kickSweep())

  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ user: null }, { headers: NO_STORE })
  // ⚠️ ONE READ FOR THE WHOLE IDENTITY (2026-08-21). This route called `hatsOf`
  // AND `capabilitiesOf`, two `user.findUnique` round trips whose SELECTs
  // overlapped almost completely and whose supply-side conditions were letter
  // for letter the same — on the endpoint its own comment calls „the cheapest
  // reliable heartbeat in the app", i.e. nearly every page load. See lib/identity.
  const identity = await identityOf(user.id)
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
      bio: (user as any).bio,
      emailVerified: (user as any).emailVerified,
      // Whether the account has a usable password. SSO-only accounts (Google)
      // carry a random unusable hash, but for surfaces like account-deletion the
      // client needs to know whether to collect a current-password. Kept as a
      // boolean so the hash itself never leaves the server.
      hasPassword: !!user.passwordHash,
      // Exposed so the client can detect "brand-new account" and show the
      // onboarding welcome banner for the first few days.
      createdAt: (user as any).createdAt ?? null,
    },
    // ⚠️ THE HATS, AND WITHOUT THEM NO CLIENT COMPONENT COULD DRAW A MASTER'S
    // OWN MENU (2026-08-18). `Role` has three values and none of them is
    // „somebody who bids on requests" — an allowlisted tradesperson keeps role
    // STUDENT (lib/hats states why). So `UserMenu` was labelling a master
    // „სტუდენტი", offering them „შემოგვიერთდი → /apply" (the EXPERT form), and
    // gating its space switcher on `role === ROLE.PROVIDER` — which meant there was
    // no route back to /provider from anywhere on the site. Their own workspace
    // was reachable only by typing the URL or signing in again.
    //
    // `hatsOf` is one indexed read and this endpoint is already per-request and
    // no-store, so nothing is being paid for twice.
    hats: identity.hats,
    // What the person already OFFERS (lib/capabilities): CONSULT = a
    // TutorProfile, WORK = a ServiceProfile plus active RequestAccess. The
    // /join door reads it to stop offering a half somebody already has.
    capabilities: identity.capabilities,
    // ⚠️ WHETHER THE CLIENT ROOM HOLDS ANYTHING (2026-08-21). Owner: „ირევა
    // ჩვეულებრივ იუზერსა და ეს უნდა გავმიჯნოთ სწორად." The user menu offered
    // „ჩემი სივრცე" beside „სამუშაო სივრცე" to every provider — and measured
    // that day, 27 OF 29 PROVIDERS HAD AN ENTIRELY EMPTY CLIENT ROOM: nothing
    // bought, nothing saved, nothing asked for. A door into an empty room, next
    // to their actual workspace, is what mixed the two identities.
    //
    // Three counts, one indexed read each, on a route that is already per-request
    // and no-store. Cheaper than the alternative — a menu that guesses.
    clientRoom: await hasClientActivity(user.id),
  }, { headers: NO_STORE })
}

const Patch = z.object({
  // The site is Georgian-only at this stage (2026-08-02) — public text must
  // be written in Georgian. Latin brands/acronyms inside it stay fine; see
  // lib/georgianText.ts for the exact rule.
  // The STRICT name rule, not the prose share test — see lib/georgianText.
  fullName: z.string().min(2).max(80).superRefine(georgianNameRefine('სახელი')).optional(),
  phone: z.string().max(40).optional(),
  bio: z.string().max(500).superRefine(georgianRefine('აღწერა')).optional(),
  // Only a same-origin uploaded image (data:image/…) or an https URL — never a
  // `javascript:`/`data:text/html` string that could be reflected elsewhere.
  avatarUrl: z.string().max(500_000)
    .refine(v => /^data:image\/(png|jpeg|webp|gif);base64,/.test(v) || /^https:\/\//.test(v), 'BAD_AVATAR')
    .nullable().optional(),
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(8).max(120).optional(),
})

export async function PATCH(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  const parsed = Patch.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    // Surface OUR validation copy (e.g. the Georgian-language gate); zod's
    // own English messages stay behind the generic code.
    const msg = firstGeorgianMessage(parsed.error)
    return NextResponse.json({ ok: false, error: msg ? 'INVALID_TEXT' : 'INVALID', message: msg ?? undefined }, { status: 400 })
  }

  const { fullName, phone, bio, avatarUrl, currentPassword, newPassword } = parsed.data

  // A number given here has to satisfy the same rule as the one given at signup
  // — this is the OTHER way a phone reaches the column (settings, and the
  // missing-phone prompt), and a rule enforced on one path only is not a rule.
  // Clearing it (empty string) stays allowed: the column is nullable, and the
  // prompt — not this route — is what makes a phone mandatory.
  if (phone !== undefined && phone.trim()) {
    const msg = phoneFormatError(phone, { required: true })
    if (msg) {
      return NextResponse.json(
        { ok: false, error: 'INVALID_PHONE', field: 'phone', message: msg },
        { status: 400 },
      )
    }
  }

  const data: any = {}
  if (fullName !== undefined) data.fullName = fullName.trim()
  if (phone !== undefined) data.phone = phone.trim() ? normalizePhone(phone) : null
  if (bio !== undefined) data.bio = bio.trim() || null
  // Downscale an inbound base64 avatar to a 256px webp (same as /api/uploads)
  // so this write path can't persist a multi-MB avatar. null clears it.
  if (avatarUrl !== undefined) data.avatarUrl = avatarUrl ? await normalizeAvatar(avatarUrl) : null

  if (newPassword) {
    if (!currentPassword) {
      return NextResponse.json({ ok: false, error: 'CURRENT_PASSWORD_REQUIRED' }, { status: 400 })
    }
    // Throttle password changes here too — this PATCH is a second path to the
    // same operation as /api/me/password, so share the `pwchange` budget (an
    // attacker with a live session shouldn't get unlimited current-password guesses).
    const rl = rateLimit(`pwchange:${user.id}`, 5, 15 * 60)
    if (!rl.ok) return NextResponse.json({ ok: false, error: 'RATE_LIMITED', retryInSec: rl.retryInSec }, { status: 429 })
    const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } })
    if (!fresh) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
    const ok = await verifyPassword(currentPassword, fresh.passwordHash)
    if (!ok) return NextResponse.json({ ok: false, error: 'BAD_CURRENT_PASSWORD' }, { status: 400 })
    data.passwordHash = await hashPassword(newPassword)
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: false, error: 'NOTHING_TO_UPDATE' }, { status: 400 })
  }

  const updated = await prisma.user.update({ where: { id: user.id }, data })
  if (data.passwordHash) {
    await revokeOtherSessions(user.id)
  }
  return NextResponse.json({
    ok: true,
    user: {
      id: updated.id,
      fullName: updated.fullName,
      phone: updated.phone,
      bio: (updated as any).bio,
      avatarUrl: updated.avatarUrl,
    },
  })
}

const DeleteBody = z.object({
  // Optional: SSO-only accounts have no usable password to re-enter. When a
  // password account submits one it is still verified below.
  currentPassword: z.string().min(1).optional(),
  // Accept the ASCII sentinel or the Georgian word the delete modal collects
  // („წაშლა") so the typed confirmation actually reaches the server.
  confirm: z.union([z.literal('DELETE'), z.literal('წაშლა')]),
})

export async function DELETE(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

  const parsed = DeleteBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  // Password accounts must re-enter their password; SSO-only accounts (no usable
  // passwordHash) delete on the typed confirmation alone. Never weaken the check
  // for accounts that do have a password.
  const hasPassword = !!user.passwordHash
  if (hasPassword) {
    if (!parsed.data.currentPassword) {
      return NextResponse.json({ ok: false, error: 'CURRENT_PASSWORD_REQUIRED' }, { status: 400 })
    }
    const ok = await verifyPassword(parsed.data.currentPassword, user.passwordHash)
    if (!ok) return NextResponse.json({ ok: false, error: 'BAD_CURRENT_PASSWORD' }, { status: 400 })
  }

  // Refuse if the account has live obligations (upcoming/live sessions in either role).
  const [asStudent, asTutor] = await Promise.all([
    prisma.booking.count({
      where: {
        studentId: user.id,
        status: { in: ['PREPARING', 'CONFIRMED', 'LIVE'] },
      },
    }),
    prisma.booking.count({
      where: {
        tutor: { userId: user.id },
        status: { in: ['PREPARING', 'CONFIRMED', 'LIVE'] },
      },
    }),
  ])
  if (asStudent + asTutor > 0) {
    return NextResponse.json({
      ok: false,
      error: 'HAS_ACTIVE_BOOKINGS',
      count: asStudent + asTutor,
    }, { status: 409 })
  }

  // Cascade deletes via Prisma schema (User has onDelete: Cascade for sessions, otp,
  // reset tokens, tutor profile, application, favorites, notifications).
  // Historical bookings, messages, and reviews use FK-restrict — if any exist we
  // refuse rather than orphan referential integrity.
  try {
    await prisma.user.delete({ where: { id: user.id } })
  } catch (e: any) {
    if (e?.code === 'P2003' || e?.code === 'P2014') {
      return NextResponse.json({
        ok: false,
        error: 'HAS_HISTORY',
        hint: 'ანგარიშს აქვს დასრულებული ჯავშნები ან შეტყობინებები. მიმართე მხარდაჭერას ხელით წასაშლელად.',
      }, { status: 409 })
    }
    throw e
  }

  const jar = await cookies()
  jar.delete('mcodne_session')
  return NextResponse.json({ ok: true })
}
