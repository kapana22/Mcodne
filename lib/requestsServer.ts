// The requests subsystem, server half — the parts that need the database or
// node:crypto and therefore cannot live in lib/requests.ts.
//
// WHY THE SPLIT. lib/requests.ts is imported by the client form (`'use client'`)
// for its zod schema and its labels. If the gate and the ref-minting lived
// there too, that import would drag @prisma/client and node:crypto into the
// browser bundle — the exact reason lib/supportEmails.ts is dependency-free and
// lib/b2b.ts holds no prisma. The RULES are over there and stay one copy; this
// file only resolves them against real data.

import { randomBytes } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { getCurrentUser } from './auth'
import { ensureDbReady } from './dbBoot'
import {
  makePublicRef,
  canSeeRequests, canOpenRequestForm,
  type RequestViewer,
} from './requests'

/**
 * A fresh public reference, from real crypto randomness.
 *
 * The ONLY production caller of makePublicRef(), and the reason that function
 * takes its bytes as an argument: the arithmetic is pure and testable here,
 * while the entropy is unarguable there. A reference minted from anything
 * weaker is not a cosmetic problem — the reference alone opens a page carrying
 * a stranger's phone number.
 */
export function newPublicRef(): string {
  return makePublicRef(randomBytes(8))
}

/**
 * Write the request, retrying the reference on a collision.
 *
 * 33.5M codes makes a collision vanishingly unlikely and NOT impossible, and
 * the failure mode of ignoring it is a 500 on a form somebody filled in from
 * their phone. Three attempts turns that into an outcome nobody ever observes.
 * P2002 is Prisma's unique-violation code; anything else is a real error and
 * is re-thrown on the spot rather than retried into a duplicate row.
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
 * TWO WAYS IN, and the second one is why this is a query rather than a lookup:
 * a `RequestAccess` row may name a COMPANY, and every member of that company is
 * then a provider. Membership is already an allowlist an admin maintains by
 * hand (CompanyMember), so borrowing it here adds no new thing to keep in sync
 * — the same argument lib/b2b's canSpendAsMember makes at length.
 *
 * Returns the provider identity as well as the yes/no, because every caller
 * that needs the answer also needs to know WHICH provider is acting: an offer
 * is written by an expert or by a company, never by „a user who has access".
 *
 * `active: false` is a no. That is the whole point of the column — turning
 * somebody off must not require deleting the note that says why.
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

/* ── the gate, resolved ─────────────────────────────────────────────────── */

export type RequestsViewerState = {
  user: Awaited<ReturnType<typeof getCurrentUser>>
  provider: ProviderIdentity | null
  /**
   * May this caller open a PROVIDER or ADMIN surface? Admin, or on the
   * allowlist. This is the field the old single `allowed` used to be.
   *
   * ⚠️ RENAMED rather than joined by a second flag (2026-08-17). The two gates
   * are now different answers, and the dangerous mistake is a provider route
   * reaching for the client one. A rename makes every one of the ten call sites
   * fail to compile until somebody states which side it is on — a new field
   * beside a familiar name would have let them all keep working while meaning
   * something else.
   */
  providerAllowed: boolean
  /** May this caller open a CLIENT surface? See lib/requests →
   *  canOpenRequestForm: anyone, when the subsystem is on. */
  clientAllowed: boolean
}

/**
 * THE server-side gate. Every page and every route calls this, and none of them
 * re-derives it from `role` plus a query of their own.
 *
 * ⚠️ THE MIDDLEWARE IS NOT A GUARD. It 404s these paths when the flag is off,
 * which is real and worth having — but it runs on the edge with no database, so
 * it cannot know the allowlist, and a middleware matcher is one config edit away
 * from not covering a new path. Every route checks here as well. Neither layer
 * is load-bearing alone; that is the design, not redundancy.
 *
 * The FLAG is checked before anything else and beats an admin, matching
 * requestsVisibleTo(): „off" that an admin can still see is not off.
 */
export async function requestsViewer(): Promise<RequestsViewerState> {
  const user = await getCurrentUser()

  // ⚠️ THE ALLOWLIST IS READ FOR AN ADMIN TOO, and this line used to skip them.
  //
  // The reasoning for skipping was that an admin is already in BY ROLE, so the
  // query could only tell them something they knew. That conflated two
  // different questions, and the second one has no other answer:
  //
  //   „may I SEE this?"     — role answers it. An admin always may.
  //   „am I A PROVIDER?"    — only the allowlist answers it, and an admin who
  //                           is not on it has no identity to attach an offer
  //                           to, so POST /api/provider/offers 404s them.
  //
  // With the skip in place an admin could therefore read every provider screen
  // and never write a single offer, no matter what the allowlist said — the row
  // existed and did nothing. Reported by the owner asking to be added to it
  // (2026-08-14), which is exactly the thing it could not deliver.
  //
  // ⚠️ AN ADMIN ON THIS LIST CAN VERIFY A REQUEST AND THEN BID ON IT. That is a
  // real conflict of interest and it is accepted DELIBERATELY at stage 1: one
  // person is running both sides of a test, and the alternative is maintaining a
  // second account to see their own feature work. It is not a state to leave in
  // place once real providers are on the platform — an admin is on this list
  // because somebody put them there, and taking them off is one switch.
  //
  // Costs one indexed lookup per admin page load. Measured against the queue
  // query beside it, that is noise.
  const provider = user ? await requestAccessOf(user.id) : null

  const viewer: RequestViewer = { role: user?.role, hasAccess: provider !== null }
  return {
    user,
    provider,
    providerAllowed: canSeeRequests(viewer),
    clientAllowed: canOpenRequestForm(),
  }
}

/**
 * The 404 every requests endpoint answers with when it will not serve.
 *
 * ⚠️ 404 AND NEVER 403. A 403 says „this exists and you may not have it", which
 * confirms the subsystem is there to anyone who probes for it — and the entire
 * hiding story is that people who do not know the URL cannot find the feature.
 * A redirect to /signin is just as bad for the same reason: it tells an
 * anonymous visitor the page is real and worth coming back to with an account.
 *
 * Exported as a function rather than written at each site so „the gate answers
 * 404" is one fact and tests can assert it once.
 */
export function requestsNotFound(): Response {
  return Response.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
}
