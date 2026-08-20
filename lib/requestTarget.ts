// `?to=<slug>` — WHO THIS REQUEST IS BEING WRITTEN TO.
//
// ⚠️ THE MISSING HALF OF „the client has two verbs" (2026-08-19). The room
// already let a client write to somebody first (an INVITED offer — see
// lib/requestInvite), but ONLY from inside a request that already existed. So a
// visitor standing on a plumber's profile could not hire that plumber: they had
// to post a request into the void and then invite from the room. The two verbs
// are „დაჯავშნე" and „აღწერე", and until now „აღწერე" could not be aimed.
//
// This file is the aiming: a slug from a profile CTA, resolved server-side to a
// real, VISIBLE provider.
//
// ⚠️ AN UNKNOWN OR HIDDEN `to` IS IGNORED, NEVER A 404. The parameter is a
// nicety on a form that must work without it — a stale link in somebody's chat
// history, a paused master, a mistyped slug: all of them still get to describe
// what they need. A 404 here would take the whole intake away over a decoration.
//
// ⚠️ AND IT IS RESOLVED TWICE, DELIBERATELY. The page resolves it to draw the
// recipient's name; POST /api/requests resolves it AGAIN from the submitted
// body, because the browser is not who decides who gets written to. Nothing the
// client sends is trusted beyond „this string was in the URL".

import { cache } from 'react'
import { prisma } from './prisma'
import { topicsForProvider, type Vertical } from './requests'
import { PUBLIC_TUTOR } from './tutorsQuery'
import { avatarSrc } from './avatarSrc'
import { PUBLIC as PUBLIC_MASTER } from '@/app/experts/_masterData'

export type RequestTarget = {
  /** MASTER = a ServiceProfile; EXPERT = a TutorProfile. Both answer at
   *  /experts/<slug> since stage 11 — ONE namespace, so this no longer says
   *  which prefix the slug came from, only which TABLE it was found in. The
   *  wizard only prints the name; the difference matters to the topic
   *  inference. A slug is unique across both tables (lib/slugSpace), so the
   *  two lookups below can never both answer. */
  kind: 'MASTER' | 'EXPERT'
  /** The profile row's id — never rendered, and never the thing written to.
   *  An offer is opened with a USER (see `userId`). */
  id: string
  /** The slug the URL carried, echoed back so the wizard can re-send it. */
  slug: string
  name: string
  /** The photo ROUTE, never the image (both halves store base64 columns). */
  photoSrc: string | null
  /** Whose INVITED thread this opens. Null for a company-owned service profile:
   *  RequestOffer can carry a company, but `inviteProviderToRequest` writes to a
   *  person, and inventing a member to write to would be picking somebody. The
   *  request is still created and still routes — only the thread is skipped. */
  userId: string | null
  /** The topic ids this provider's own offering implies — see
   *  lib/requestTopics → topicsForProvider. Empty = nothing could be inferred. */
  topics: string[]
}

/** The slug shape both namespaces produce (lib/masterSlug, lib/expertSlug),
 *  plus the raw cuid both resolvers also accept. Bounded before it reaches a
 *  query: this is a URL anybody can craft. */
function cleanTo(raw: string | null | undefined): string {
  const v = (raw ?? '').trim().toLowerCase()
  return /^[a-z0-9-]{1,80}$/.test(v) ? v : ''
}

async function master(to: string): Promise<RequestTarget | null> {
  const row = await prisma.serviceProfile.findFirst({
    // The same either/or app/experts/[slug] accepts — the public slug OR the raw
    // id, so a link shared before slugs existed still names somebody.
    where: { AND: [{ OR: [{ slug: to }, { id: to }] }, PUBLIC_MASTER] },
    // ⚠️ NO `photoUrl` AND NO `workPhotos`. They are base64 columns; the probe
    // below asks whether one is servable and gets back a boolean.
    select: {
      id: true, slug: true, services: true, updatedAt: true, userId: true,
      user: { select: { fullName: true } },
      company: { select: { name: true } },
    },
  })
  if (!row) return null
  const probe = await prisma.$queryRawUnsafe<{ hasPhoto: boolean }[]>(
    `SELECT ("photoUrl" IS NOT NULL AND "photoUrl" LIKE 'data:image/%' AND "photoUrl" NOT LIKE 'data:image/svg%') AS "hasPhoto"
       FROM "ServiceProfile" WHERE "id" = $1`,
    row.id,
  ).catch(() => [])
  return {
    kind: 'MASTER',
    id: row.id,
    slug: row.slug || row.id,
    name: row.company?.name ?? row.user?.fullName ?? '',
    photoSrc: probe[0]?.hasPhoto
      ? `/api/masters/${row.id}/photo?v=${row.updatedAt.getTime()}`
      : null,
    userId: row.userId,
    topics: topicsForProvider({ kind: 'MASTER', services: row.services }),
  }
}

async function expert(to: string): Promise<RequestTarget | null> {
  const row = await prisma.tutorProfile.findFirst({
    where: { AND: [{ OR: [{ slug: to }, { id: to }] }, PUBLIC_TUTOR] },
    select: {
      id: true, slug: true, professions: true, userId: true,
      category: { select: { slug: true } },
      // ONE row, so the stored avatar is a fair read — `avatarSrc` turns it
      // into the cached route rather than shipping the data URI.
      user: { select: { id: true, fullName: true, avatarUrl: true } },
    },
  })
  if (!row) return null
  return {
    kind: 'EXPERT',
    id: row.id,
    slug: row.slug || row.id,
    name: row.user?.fullName ?? '',
    photoSrc: avatarSrc(row.user?.id, row.user?.avatarUrl),
    userId: row.userId,
    topics: topicsForProvider({
      kind: 'EXPERT',
      professions: row.professions ?? [],
      categorySlug: row.category?.slug ?? null,
    }),
  }
}

/**
 * Resolve `?to=` to a provider, or null.
 *
 * `prefer` breaks the tie: the two slug namespaces are independent (a master
 * slug and an expert slug could in principle read the same), so the door the
 * visitor came through decides which table is asked first — `for=service` on a
 * trades CTA, the expert side otherwise. Both are tried either way, because the
 * cost of guessing wrong is silently losing the recipient.
 *
 * React-cached: the page resolves it for the recipient line and the metadata
 * pass must not pay for it twice.
 */
export const resolveRequestTarget = cache(async (
  raw: string | null | undefined,
  prefer: Vertical = 'EXPERT',
): Promise<RequestTarget | null> => {
  const to = cleanTo(raw)
  if (!to) return null
  try {
    const order = prefer === 'SERVICE' ? [master, expert] : [expert, master]
    for (const look of order) {
      const hit = await look(to)
      // A row with nobody's name on it is not somebody a visitor can be told
      // they are writing to.
      if (hit && hit.name.trim() !== '') return hit
    }
    return null
  } catch {
    // A database wobble must not take the form down — see the header.
    return null
  }
})
