// The master's own answer to „what do you do, and where".
//
//   GET  → this account's ServiceProfile, plus the vocabulary to draw the form
//   PUT  → save it
//
// ⚠️ THE ROW IS KEYED ON THE SESSION, NEVER ON A BODY FIELD. There is no
// `userId` in the input and there must never be one: the only account this route
// can read or write is the one holding the cookie. That is the same rule the
// offer endpoint follows — a provider identity is derived, never declared.
//
// ⚠️ ALLOWLIST FIRST, and it is not the same question as „are you signed in".
// A ServiceProfile on an account that may not bid is a row that can never be
// routed to, so writing one would be storing a promise the platform cannot keep.
// `requestsViewer().provider` is the only thing that answers it.
//
// 404 and never 403, like every route in this subsystem — see
// lib/requestsServer → requestsNotFound for why.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { requestsViewer } from '@/lib/requestsServer'
import { CITIES } from '@/lib/requests'
import {
  ServiceProfileInput, LIVE_SERVICE_GROUPS, sanitizeStored, profileGaps,
} from '@/lib/serviceProfile'

const notFound = () => NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

/** The picker's own contents, sent with the profile so the form and the schema
 *  cannot disagree about what is selectable. A hard-coded list in the component
 *  is how a service gets added to the vocabulary and stays invisible.
 *
 *  ⚠️ THE LIVE FOUR, while the schema still accepts all 39 — deliberately, and
 *  lib/serviceProfile → LIVE_SERVICE_GROUPS says why. The asymmetry means a
 *  profile hand-seeded into a closed group keeps saving from this endpoint; it
 *  just does not appear as a fresh choice. */
const vocabulary = () => ({
  groups: LIVE_SERVICE_GROUPS.map(g => ({
    id: g.id,
    label: g.label,
    topics: g.topics.map(t => ({ id: t.id, label: t.label })),
  })),
  cities: CITIES.map(c => ({ id: c.id, label: c.label })),
})

export async function GET() {
  const viewer = await requestsViewer()
  if (!viewer.provider || !viewer.user) return notFound()

  await ensureDbReady()
  // ⚠️ `about` IS SENT, `photoUrl` IS NOT — it is COUNTED (2026-08-18). The
  // photo is a base64 column of up to a few hundred kilobytes and this response
  // is fetched every time the form opens; returning it to tell somebody „you
  // have one" would ship the image twice, once here and once through
  // /api/masters/[id]/photo, which is what actually draws it. The boolean is
  // all the form needs to say „ფოტო ატვირთულია" and offer to replace it. Same
  // split /api/master-applications already uses.
  const row = await prisma.serviceProfile.findUnique({
    where: { userId: viewer.user.id },
    select: {
      id: true, services: true, areas: true, calloutFee: true, priceFrom: true,
      available: true, about: true, updatedAt: true,
    },
  })
  const hasPhoto = row
    ? (await prisma.serviceProfile.count({
        where: { userId: viewer.user.id, NOT: { photoUrl: null } },
      })) > 0
    : false

  // No row yet is a normal first visit, not an error: the form opens empty and
  // the first PUT creates it. Answering 404 here would make „I have not filled
  // this in" indistinguishable from „you may not have this".
  const stored = row ?? {
    id: null, services: [], areas: [], calloutFee: null, priceFrom: null,
    available: true, about: null, updatedAt: null,
  }
  // The vocabulary moves; a row written last month may name a retired trade.
  const clean = sanitizeStored(stored)

  return NextResponse.json({
    ok: true,
    profile: { ...stored, ...clean },
    hasPhoto,
    // „What is still missing", computed HERE rather than in the component, so
    // the page and the routing agree on what „ready" means.
    gaps: profileGaps(clean),
    exists: row !== null,
    ...vocabulary(),
  })
}

export async function PUT(req: Request) {
  const viewer = await requestsViewer()
  if (!viewer.provider || !viewer.user) return notFound()

  const parsed = ServiceProfileInput.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({
      ok: false,
      error: 'INVALID',
      // The first message only. These are the provider's own form errors and
      // they are written to be read (lib/serviceProfile) — but a list of five is
      // a wall, and the form highlights the field anyway.
      detail: parsed.error.issues[0]?.message ?? null,
    }, { status: 400 })
  }

  await ensureDbReady()
  const d = parsed.data

  // Upsert: the first save creates, every later one replaces. `services` and
  // `areas` are REPLACED WHOLE rather than merged — the form sends the complete
  // list, and merging would make unticking a service impossible.
  // ⚠️ `photoUrl` AND `about` ARE OPTIONAL AND MUST NOT BE WRITTEN WHEN ABSENT
  // (2026-08-18). This is a full-replace endpoint, so spreading `d` directly
  // would write `undefined`… which Prisma ignores, but `null` it would not —
  // and a client that sends `photoUrl: null` because it never rendered the
  // field would erase a face the master uploaded on application day. Only what
  // was actually sent is applied.
  const { photoUrl, about, ...core } = d
  const media = {
    ...(photoUrl !== undefined ? { photoUrl } : {}),
    ...(about !== undefined ? { about } : {}),
  }

  const saved = await prisma.serviceProfile.upsert({
    where: { userId: viewer.user.id },
    create: { userId: viewer.user.id, ...core, ...media },
    update: { ...core, ...media },
    select: {
      services: true, areas: true, calloutFee: true, priceFrom: true,
      available: true, about: true, updatedAt: true,
    },
  })

  return NextResponse.json({ ok: true, profile: saved, gaps: profileGaps(saved) })
}
