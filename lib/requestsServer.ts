// The requests subsystem, server half — the parts needing the database or
// node:crypto, which therefore cannot live in lib/requests.ts.
//
// WHY THE SPLIT. lib/requests.ts is imported by the client form for its zod
// schema and labels; putting the gate and ref-minting there would drag
// @prisma/client and node:crypto into the browser bundle. The RULES stay one
// copy over there; this file resolves them against real data.

import { randomBytes } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { getCurrentUser } from './auth'
import { ensureDbReady } from './dbBoot'
import { queueWhere } from './requestRouting'
import {
  makePublicRef,
  canSeeRequests, canOpenRequestForm, canFileRequest,
  type RequestViewer,
} from './requests'
import { queueScope, type QueueScope } from './requestRouting'
import { asRole, ROLE } from './roles'

/**
 * A fresh public reference, from real crypto randomness.
 *
 * The only production caller of makePublicRef(), and the reason that function
 * takes its bytes as an argument: the arithmetic is pure and testable there,
 * the entropy unarguable here. A reference minted from anything weaker is not
 * cosmetic — it alone opens a page carrying a stranger's phone number.
 */
export function newPublicRef(): string {
  return makePublicRef(randomBytes(8))
}

/**
 * Write the request, retrying the reference on a collision. 33.5M codes makes
 * one vanishingly unlikely and NOT impossible, and ignoring it means a 500 on a
 * form somebody filled in from their phone. P2002 is the unique violation;
 * anything else is re-thrown rather than retried into a duplicate row.
 */
export async function createServiceRequest(
  data: Omit<Prisma.ServiceRequestUncheckedCreateInput, 'publicRef'>,
): Promise<{ id: string; publicRef: string; status: string }> {
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.serviceRequest.create({
        data: { ...data, publicRef: newPublicRef() },
        // The three fields every caller needs and no more: the id for the audit
        // trail, the ref for the screen, the status so the endpoint can tell the
        // person whether it was refused on the budget floor.
        select: { id: true, publicRef: true, status: true },
      })
    } catch (e: any) {
      // Only a publicRef collision is worth another go. A unique violation on
      // anything else would loop three times and fail identically.
      if (e?.code === 'P2002' && String(e?.meta?.target ?? '').includes('publicRef')) {
        lastErr = e
        continue
      }
      throw e
    }
  }
  throw lastErr
}

/* ── the allowlist ──────────────────────────────────────────────────────── */

/**
 * Is this account allowed in — as themselves, or through a company?
 *
 * TWO WAYS IN, which is why this is a query: a `RequestAccess` row may name a
 * COMPANY, and every member of it is then a provider. Membership is already an
 * admin-maintained allowlist, so borrowing it adds nothing to keep in sync.
 *
 * Returns WHICH provider is acting, not just yes/no — an offer is written by an
 * expert or by a company, never by „a user who has access".
 *
 * `active: false` is a no: turning somebody off must not require deleting the
 * note that says why.
 */
export type ProviderIdentity =
  | { kind: 'EXPERT'; userId: string; companyId: null }
  | { kind: 'COMPANY'; userId: string; companyId: string }

export async function requestAccessOf(userId: string | null | undefined): Promise<ProviderIdentity | null> {
  if (!userId) return null
  await ensureDbReady()

  // Named on the person first. An explicit personal grant outranks a company
  // one: if an admin listed this human by hand, they meant this human.
  const own = await prisma.requestAccess.findUnique({
    where: { userId },
    select: { active: true, kind: true },
  })
  if (own?.active && own.kind === 'EXPERT') {
    return { kind: 'EXPERT', userId, companyId: null }
  }

  // …otherwise through a company they belong to.
  const membership = await prisma.companyMember.findFirst({
    where: { userId, company: { requestAccess: { active: true } } },
    select: { companyId: true },
  })
  if (membership) {
    return { kind: 'COMPANY', userId, companyId: membership.companyId }
  }

  return null
}

/**
 * DOES THIS PERSON SELL HERE? The half of „who is who" that the allowlist alone
 * cannot answer.
 *
 * ⚠️ BOTH HALVES ARE REQUIRED, and that is CLAUDE.md's definition rather than a
 * choice made here: „a provider is somebody with a ServiceProfile AND an active
 * RequestAccess row". Each half alone describes somebody mid-registration —
 *
 *   allowlist, no profile → admitted and has not finished filling the form;
 *                           their workspace is empty and refusing them the
 *                           client side too would leave them unable to do
 *                           anything at all on the site.
 *   profile, no allowlist → applied through /join and was never let in. They
 *                           sell nothing yet, so they are a client.
 *
 * The profile is looked up through the company as well as the person, matching
 * `requestAccessOf` above: a member of an allowlisted company is a provider and
 * the trades live on the company's row rather than theirs.
 */
async function hasServiceProfile(userId: string): Promise<boolean> {
  const n = await prisma.serviceProfile.count({
    where: { OR: [{ userId }, { company: { members: { some: { userId } } } }] },
  })
  return n > 0
}

/**
 * The same question for a caller that already holds a user id and does not want
 * a second session read — /me's layout, which resolves the rail's intake button.
 *
 * The allowlist is asked FIRST and short-circuits, so the common case (a plain
 * client) costs one indexed lookup and never touches ServiceProfile.
 */
export async function sellsHere(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false
  await ensureDbReady()
  if (!(await requestAccessOf(userId))) return false
  return hasServiceProfile(userId)
}

/* ── the gate, resolved ─────────────────────────────────────────────────── */

type RequestsViewerState = {
  user: Awaited<ReturnType<typeof getCurrentUser>>
  provider: ProviderIdentity | null
  /**
   * May this caller open a PROVIDER or ADMIN surface? Admin, or on the allowlist.
   *
   * ⚠️ RENAMED rather than joined by a second flag: the dangerous mistake is a
   * provider route reaching for the client gate, and a rename makes every call
   * site fail to compile until somebody states which side it is on.
   */
  providerAllowed: boolean
  /**
   * Does this caller SELL here (lib/requestsServer → sellsHere)? Separate from
   * `providerAllowed`, which answers „may they open a provider SCREEN" and is
   * true for an admin who sells nothing.
   */
  sells: boolean
  /**
   * May this caller open a CLIENT surface? See lib/requests →
   * canOpenRequestForm: anyone, when the subsystem is on.
   *
   * ⚠️ IT IS THE SUBSYSTEM GATE, NOT „the client side". A provider reads the
   * chat and the thread through this same boolean. Do not narrow it by
   * audience — `mayFile` below is where an audience question belongs.
   */
  clientAllowed: boolean
  /**
   * May this caller FILE a request? `clientAllowed`, minus anybody who sells
   * here (owner, 2026-08-31). Read by exactly one place: POST /api/requests.
   */
  mayFile: boolean
}

/**
 * THE server-side gate. Every page and route calls this; none re-derives it.
 *
 * ⚠️ THE MIDDLEWARE IS NOT A GUARD. It 404s these paths when the flag is off,
 * but it runs on the edge with no database, so it cannot know the allowlist,
 * and a matcher is one config edit from not covering a new path. Neither layer
 * is load-bearing alone — that is the design, not redundancy.
 *
 * The FLAG beats an admin: „off" that an admin can still see is not off.
 */
export async function requestsViewer(): Promise<RequestsViewerState> {
  const user = await getCurrentUser()

  // ⚠️ THE ALLOWLIST IS READ FOR AN ADMIN TOO. Two different questions, and the
  // second has no other answer:
  //
  //   „may I SEE this?"   — role answers it; an admin always may.
  //   „am I A PROVIDER?"  — only the allowlist does, and an admin who is not on
  //                         it has no identity to attach an offer to.
  //
  // Skipping it let an admin read every provider screen and never write an
  // offer, whatever the allowlist said.
  //
  // ⚠️ AN ADMIN ON THIS LIST CAN VERIFY A REQUEST AND THEN BID ON IT. A real
  // conflict of interest, accepted deliberately at stage 1 — one person running
  // both sides of a test. Not a state to leave once real providers are on the
  // platform; taking them off is one switch.
  const provider = user ? await requestAccessOf(user.id) : null

  // ⚠️ THE SECOND HALF, AND IT COSTS NOTHING FOR A CLIENT. `provider` is the
  // allowlist row; a person who has none cannot be a seller, so the
  // ServiceProfile count is only ever run for somebody already admitted. See
  // `hasServiceProfile` above for why one half is not enough.
  //
  // ⚠️ AN ADMIN IS NEVER A SELLER FOR THIS PURPOSE, and the precedent is thirty
  // lines up: „an admin on this list can verify a request and then bid on it —
  // a real conflict of interest, accepted deliberately at stage 1, one person
  // running both sides of a test." The same person has to be able to walk the
  // client half of the funnel on the live site, and an operator account that
  // also happens to carry a ServiceProfile would otherwise be locked out of the
  // only screen where the intake can be checked end to end.
  //
  // 🔒 IT IS NOT A HOLE IN THE RULE THAT MATTERS. What the owner asked for is
  // that the two identities do not mix, and the place that could actually
  // corrupt something — self-bidding and self-review — is closed for EVERYONE,
  // admins included: app/api/provider/offers claims against the author id and
  // lib/offerLifecycle → reviewGate answers 'SELF'. This exemption reopens one
  // form, not the chain behind it.
  const sells =
    provider !== null &&
    !!user &&
    asRole(user.role) !== 'ADMIN' &&
    (await hasServiceProfile(user.id))

  const viewer: RequestViewer = { role: user?.role, hasAccess: provider !== null }
  return {
    user,
    provider,
    sells,
    providerAllowed: canSeeRequests(viewer),
    clientAllowed: canOpenRequestForm(),
    // 🔒 A SELLER CANNOT FILE A REQUEST (owner, 2026-08-31 — see lib/requests →
    // canFileRequest). This is the authoritative refusal: the POST reads it, so
    // a hidden link, a typed URL or a crafted request all meet the same answer.
    mayFile: canFileRequest(sells),
  }
}

/**
 * The 404 every requests endpoint answers with when it will not serve.
 *
 * ⚠️ 404 AND NEVER 403. A 403 says „this exists and you may not have it", which
 * confirms the subsystem to anyone who probes. A redirect to /signin is just as
 * bad: it tells an anonymous visitor the page is real.
 *
 * A function rather than written at each site, so tests assert it once.
 */
export function requestsNotFound(): Response {
  return Response.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
}

/* ── the queue narrowing, resolved ──────────────────────────────────────── */

/**
 * WHAT THIS PERSON OFFERS, read once, for the three screens that must agree.
 *
 * ⚠️ ONE READER, BECAUSE THREE COPIES OF A QUERY IS THREE ANSWERS. The nav
 * badge (app/work/layout), the home board (app/work/page) and the queue itself
 * each used to fetch the ServiceProfile with their own `findFirst` and pass it
 * to the same narrowing. That was already one rule too thinly spread — the
 * badge and the list had disagreed once before over exactly this — and adding
 * the CONSULT half would have meant a second query duplicated three times.
 * The DECISION is pure and lives in lib/requestRouting; this only resolves it
 * against the database, which is why it is in this file and not that one.
 *
 * The service profile is looked up through the company as well as the person:
 * a member of an allowlisted company is a provider (see requestAccessOf), and
 * the trades live on the company's row rather than theirs.
 */
export async function providerQueueScope(
  user: { id: string; role?: string | null } | null | undefined,
): Promise<QueueScope> {
  // No session is not a state this screen can be in — the layouts 404 first —
  // but the narrowest possible answer is still the right default.
  if (!user) return { mode: 'UNLISTED' }
  await ensureDbReady()
  // ⚠️ ONE ROW SINCE 2026-08-24. This asked two tables the same question about
  // one person — the services and cities from `ServiceProfile`, the sphere and
  // the professions from `TutorProfile` — and merged the answers. They are
  // columns on one row now, so the merge is gone and the two halves cannot
  // disagree.
  const profile = await prisma.serviceProfile.findFirst({
    where: {
      OR: [
        { userId: user.id },
        { company: { members: { some: { userId: user.id } } } },
      ],
    },
    // ⚠️ `available` IS SELECTED, NOT FILTERED ON, and the difference was a
    // shipped bug (2026-08-18). Filtering here returns null for a paused
    // provider, which every reader downstream would have to read as „no
    // profile" — and „no profile" used to widen the queue to the whole
    // platform. Turning yourself off made the noise worse. Absent and paused
    // are different facts and only the row can tell them apart.
    select: {
      services: true, areas: true, available: true,
      categoryId: true, professions: true, category: { select: { slug: true } },
    },
  })
  return queueScope({
    service: profile ? { services: profile.services, areas: profile.areas, available: profile.available } : null,
    expert: profile
      ? {
          categoryId: profile.categoryId,
          categorySlug: profile.category?.slug ?? null,
          professions: profile.professions,
        }
      : null,
    isAdmin: asRole(user.role) === ROLE.ADMIN,
  })
}

/**
 * HOW MANY OPEN REQUESTS THIS PERSON CAN ACTUALLY SEE.
 *
 * ⚠️ ONE HELPER, FOUR READERS (2026-08-29). This count is printed in four
 * places now — the rail badge (app/work/layout.tsx) and the „ახალი" stage on
 * each of the three screens the flow is drawn on — and it was already the kind
 * of number that had been wrong before for exactly this reason: the badge once
 * counted platform-wide while the list beside it filtered by the viewer's own
 * trades, so it advertised work the queue would never show.
 *
 * The narrowing is `queueWhere(providerQueueScope(user))` — the SAME pair the
 * queue page and the routing use (lib/requestRouting). A second copy of these
 * three lines is how the badge and the list start disagreeing again.
 */
export async function openRequestCount(
  user: { id: string; role?: string | null } | null | undefined,
): Promise<number> {
  if (!user) return 0
  return prisma.serviceRequest.count({
    where: {
      status: 'VERIFIED',
      offerCount: { lt: prisma.serviceRequest.fields.offerLimit },
      ...queueWhere(await providerQueueScope(user)),
    },
  })
}

/**
 * WHICH TOPICS ANYBODY ACTUALLY DOES — the client intake's own vocabulary.
 *
 * ⚠️ THE INTAKE WAS OFFERING WORK NOBODY CAN ANSWER (2026-08-30). Owner:
 * „როდესაც სერვისი არაა გამოტანილი სერჩში, ვერ უნდა გაგზავნოს… და ისინი უნდა
 * იყოს, რომლებიც გვყავს კატეგორიაში და დამატებული."
 *
 * Measured that day: the wizard offered 148 topics and exactly 46 of them had a
 * live provider. **102 topics — 69% — were a request that could reach nobody**,
 * and 19 of the 28 groups were empty end to end. Somebody describing an IELTS
 * course or a visa was walking five screens to join a queue with no other side.
 *
 * ⚠️ DERIVED, NEVER LISTED — that is the owner's „პარალელურად". The moment a
 * provider ticks a trade on /work/services it becomes offerable here, and the
 * moment the last one un-ticks it, it stops. A hand-kept list would be a second
 * copy of the roster and the copy that goes stale.
 *
 * ⚠️ AND NOTHING IS LOST BY NARROWING. A person whose words match no offered
 * topic still reaches the free-text escape („ამ სახელით ვერ ვიპოვეთ — მაგრამ
 * მაინც მოგვწერე", app/request/_stepWhat.tsx), which files under OTHER_TOPIC
 * and routes to EVERYONE rather than to a filed specialist. So the narrowing
 * removes dead ends, not requests.
 *
 * The same pair every routing read uses: published AND available. A paused
 * provider is not supply.
 */
export async function coveredTopicIds(): Promise<string[]> {
  const rows = await prisma.serviceProfile.findMany({
    where: { published: true, available: true },
    select: { services: true },
  })
  return [...new Set(rows.flatMap(r => r.services))]
}
