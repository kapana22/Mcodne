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

const notFound = () => NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

export async function GET(_req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const viewer = await requestsViewer()
  if (!viewer.clientAllowed) return notFound()

  const ref = normalizePublicRef((await params).ref)
  if (!ref) return notFound()

  await ensureDbReady()
  const r = await prisma.serviceRequest.findFirst({
    where: { publicRef: ref },
    select: { id: true, status: true, offerCount: true, offerLimit: true, categoryId: true },
  })
  if (!r) return notFound()

  const [notified, expertsInField] = await Promise.all([
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
  ])

  return NextResponse.json({
    ok: true,
    status: r.status,
    offerCount: r.offerCount,
    offerLimit: r.offerLimit,
    notified,
    expertsInField,
  })
}
