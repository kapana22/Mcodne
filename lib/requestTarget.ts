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
import { topicsForProvider } from './requests'
import { avatarSrc } from './avatarSrc'
import { PUBLIC as PUBLIC_MASTER } from '@/app/experts/_providers'

type RequestTarget = {
  /** The profile row's id — never rendered, and never the thing written to.
   *  An offer is opened with a USER (see `userId`). */
  id: string
  /** The slug the URL carried, echoed back so the wizard can re-send it. */
  slug: string
  name: string
  /** The photo ROUTE, never the image (the column is base64). */
  photoSrc: string | null
  /** Whose INVITED thread this opens. Null for a company-owned profile:
   *  RequestOffer can carry a company, but `inviteProviderToRequest` writes to a
   *  person, and inventing a member to write to would be picking somebody. The
   *  request is still created and still routes — only the thread is skipped. */
  userId: string | null
  /** The topic ids this provider's own offering implies — see
   *  lib/requestTopics → topicsForProvider. Empty = nothing could be inferred. */
  topics: string[]
}

/** The slug shape lib/masterSlug produces, plus the raw cuid the resolver
 *  also accepts. Bounded before it reaches a
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
      professions: true, category: { select: { slug: true } },
      user: { select: { id: true, fullName: true, avatarUrl: true } },
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
    id: row.id,
    slug: row.slug || row.id,
    name: row.company?.name ?? row.user?.fullName ?? '',
    // The uploaded photo, else the account avatar — a migrated professional
    // never had a `photoUrl` and their face is on their account.
    photoSrc: probe[0]?.hasPhoto
      ? `/api/masters/${row.id}/photo?v=${row.updatedAt.getTime()}`
      : avatarSrc(row.user?.id, row.user?.avatarUrl),
    userId: row.userId,
    topics: topicsForProvider({
      services: row.services,
      professions: row.professions,
      categorySlug: row.category?.slug ?? null,
    }),
  }
}

/**
 * Resolve `?to=` to a provider, or null.
 *
 * ⚠️ ONE LOOKUP SINCE 2026-08-24. There were two — one per profile table — and
 * a `prefer` argument decided which was asked first, because the two slug
 * namespaces were independent and could in principle collide. One table, one
 * namespace, one query; the parameter is gone rather than ignored.
 *
 * React-cached: the page resolves it for the recipient line and the metadata
 * pass must not pay for it twice.
 */
export const resolveRequestTarget = cache(async (
  raw: string | null | undefined,
): Promise<RequestTarget | null> => {
  const to = cleanTo(raw)
  if (!to) return null
  try {
    const hit = await master(to)
    // A row with nobody's name on it is not somebody a visitor can be told
    // they are writing to.
    return hit && hit.name.trim() !== '' ? hit : null
  } catch {
    // A database wobble must not take the form down — see the header.
    return null
  }
})
