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
  ServiceProfileInput, SERVICE_GROUPS, sanitizeStored, profileGaps,
} from '@/lib/serviceProfile'

const notFound = () => NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })

/** The picker's own contents, sent with the profile so the form and the schema
 *  cannot disagree about what is selectable. A hard-coded list in the component
 *  is how a service gets added to the vocabulary and stays invisible. */
const vocabulary = () => ({
  groups: SERVICE_GROUPS.map(g => ({
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
  const row = await prisma.serviceProfile.findUnique({
    where: { userId: viewer.user.id },
    select: {
      services: true, areas: true, calloutFee: true, priceFrom: true, available: true,
    },
  })

  // No row yet is a normal first visit, not an error: the form opens empty and
  // the first PUT creates it. Answering 404 here would make „I have not filled
  // this in" indistinguishable from „you may not have this".
  const stored = row ?? { services: [], areas: [], calloutFee: null, priceFrom: null, available: true }
  // The vocabulary moves; a row written last month may name a retired trade.
  const clean = sanitizeStored(stored)

  return NextResponse.json({
    ok: true,
    profile: { ...stored, ...clean },
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
  const saved = await prisma.serviceProfile.upsert({
    where: { userId: viewer.user.id },
    create: { userId: viewer.user.id, ...d },
    update: d,
    select: { services: true, areas: true, calloutFee: true, priceFrom: true, available: true },
  })

  return NextResponse.json({ ok: true, profile: saved, gaps: profileGaps(saved) })
}
