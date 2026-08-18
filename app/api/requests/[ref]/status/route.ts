// GET /api/requests/<ref>/status — what is happening to my request, right now.
//
// Polled by the panel the client sees straight after sending (app/request/
// _live). It exists so that screen can be ALIVE without being a liar.
//
// ⚠️ EVERY NUMBER HERE IS COUNTED, NEVER SIMULATED, and that is the whole
// design of this file. The obvious way to make a waiting screen feel busy is to
// say „N ექსპერტი ათვალიერებს" and animate it — and at the moment somebody
// presses send that is FALSE by construction: the request is NEW, no provider
// has been told anything, and none will be until an operator phones. Zero
// people are looking. A number invented there is the „3 people are viewing this
// room" pattern, and it is worse here than on a hotel site: this person is
// being asked to WAIT on the strength of it, and what they are waiting for is a
// phone call we would have just misrepresented.
//
// So the panel gets facts instead, and they turn out to be better ones:
//   status          where the request actually is
//   notified        how many providers we HAVE told — 0 until routing runs,
//                   then the real audience
//   expertsInField  how many experts are filed under this sphere at all. True
//                   the second the request is written, which is what makes it
//                   worth showing on the screen where nothing has happened yet.
//   offerCount      offers actually received
//
// Authorised by POSSESSION OF THE REFERENCE, like every other client surface —
// no account, by design.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { normalizePublicRef } from '@/lib/requests'
import { requestsViewer } from '@/lib/requestsServer'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { avatarSrc } from '@/lib/avatarSrc'

const notFound = () => NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

export async function GET(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const viewer = await requestsViewer()
  if (!viewer.clientAllowed) return notFound()

  const ref = normalizePublicRef((await params).ref)
  if (!ref) return notFound()

  // ⚠️ THIS IS AN EXISTENCE ORACLE, so it is throttled (2026-08-17, found in
  // review). Unauthenticated, keyed on a 5-character reference, and it answers
  // 200 for a live one and 404 for a dead one — which is exactly the primitive
  // you sweep the keyspace with. And the reference is not a lookup code: it
  // authorises accepting an offer and reading the client's thread with us, so a
  // harvested one is a full account takeover of that request.
  //
  // The keyspace (32^5 ≈ 33.5M) makes a blind sweep expensive rather than
  // impossible, and „expensive" is not a control — the budget is. 60/hour per
  // IP is far above any real client, who polls their own page every 20s only
  // while it is open, and far below a sweep worth running.
  const rl = rateLimit(`request-status:${clientIp(req)}`, 60, 60 * 60)
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: 'RATE_LIMITED', retryInSec: rl.retryInSec },
      { status: 429 },
    )
  }

  await ensureDbReady()
  const r = await prisma.serviceRequest.findFirst({
    where: { publicRef: ref },
    select: { id: true, status: true, pickMode: true, offerCount: true, offerLimit: true, categoryId: true },
  })
  if (!r) return notFound()

  // ── The experts this request could go to, as cards ───────────────────────
  //
  // ⚠️ THE SECOND ROUTE, MADE CONCRETE (owner, 2026-08-17: „ექსპერტების
  // ქარდებიც უნდა ჩანდეს — ექსპერტიც უნდა ნახოს"). Waiting for offers is one
  // way to be helped; the other is going and picking somebody, and until now
  // that was a LINK to a filtered list. A link is a decision to make later; a
  // face and a name is a decision you can make now.
  //
  // ⚠️ NO CONTACT DETAILS AND NO RAW AVATARS. The card carries what the public
  // catalogue already shows anybody — name, sphere, rating, verified — and the
  // avatar goes through `avatarSrc`, because `User.avatarUrl` holds a data: URI
  // and passing it raw is what made /tutors half a megabyte of HTML (see
  // lib/avatarSrc, which says USE IT IN EVERY LIST PAYLOAD).
  //
  // Six, ordered the way the catalogue orders itself: verified first, then
  // rating. More than six is a directory, and this screen is not one.
  const [notified, expertsInField, experts] = await Promise.all([
    // Literally „who did we tell" — one Notification row per provider, written
    // by lib/requestJobs when the request was routed. Counting the rows rather
    // than recomputing the audience means this can never claim somebody was
    // told who was not.
    prisma.notification.count({ where: { href: `/provider/requests/${r.id}` } }),
    // Everyone filed under this sphere, by the same filter the admin panel
    // lists candidates with (`available: true`). Not „online", not „looking" —
    // „this many exist", which is the honest and more useful number.
    r.categoryId
      ? prisma.tutorProfile.count({ where: { categoryId: r.categoryId, available: true } })
      : Promise.resolve(0),
    r.categoryId
      ? prisma.tutorProfile.findMany({
          where: { categoryId: r.categoryId, available: true },
          orderBy: [{ verified: 'desc' }, { rating: 'desc' }],
          take: 6,
          select: {
            id: true, slug: true, verified: true, rating: true, headline: true,
            user: { select: { id: true, fullName: true, avatarUrl: true } },
          },
        })
      : Promise.resolve([]),
  ])

  return NextResponse.json({
    ok: true,
    status: r.status,
    offerCount: r.offerCount,
    offerLimit: r.offerLimit,
    pickMode: r.pickMode,
    notified,
    expertsInField,
    experts: experts.map(e => ({
      id: e.id,
      // The profile URL prefers the slug: a cuid href 308s to the slug, and
      // that redirect downgrades a client-side navigation to a full load.
      href: `/tutors/${e.slug ?? e.id}`,
      name: e.user.fullName,
      headline: e.headline,
      verified: e.verified,
      rating: e.rating,
      avatar: avatarSrc(e.user.id, e.user.avatarUrl),
    })),
  })
}
