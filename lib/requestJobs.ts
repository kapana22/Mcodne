// The requests subsystem's BACKGROUND WORK — the four things that used to be
// somebody remembering.
//
// Called from the 15-minute cron (app/api/internal/cleanup) so there is one
// schedule, one secret and one place to look when something did not happen.
// Every function here is idempotent and bounded: a tick that runs twice does
// the work once, and a tick that finds a thousand due rows does a hundred and
// leaves the rest for the next one.
//
// ⚠️ WHAT IS DELIBERATELY NOT HERE: nothing in this file verifies a request,
// accepts an offer, or opens a contact. Those are the three moments the product
// is made of, and every one of them stays a human decision — the admin's phone
// call is the quality gate that separates this from the lead-mills whose
// documented failure is exactly bad leads. Automation carries the MESSAGES and
// sweeps the DEAD ROWS; it never makes the call.

import { prisma } from './prisma'
import { sendMail } from './mailer'
import { notifyMany } from './notify'
import {
  requestVerifiedProviderEmail, offerArrivedClientEmail,
} from './emailTemplates'
import { KIND, kindOf, budgetLabel, timingLabel, topicLabel } from './requests'
import {
  routeRequest, needsProviderNudge, needsClientNudge, shouldAutoClose,
  UNANSWERED_NUDGE_HOURS, CLIENT_NUDGE_HOURS, STALE_OPEN_DAYS, MATCHED_CLOSE_DAYS,
  type RoutableProvider,
} from './requestRouting'

/** How many rows one tick will touch per job. A cron that can do unbounded
 *  work is a cron that can hold a connection for minutes and time out the
 *  whole cleanup route — the same bound every other job in that file uses. */
const BATCH = 100

/* ═══════════ the allowlist, as routable providers ═══════════════════════ */

/**
 * Everyone the allowlist admits, with the sphere each is filed under.
 *
 * Named people carry their TutorProfile's category; company members carry none
 * and are flagged as such — see RoutableProvider for why that is a flag rather
 * than a null.
 */
export async function routableProviders(): Promise<(RoutableProvider & { email: string })[]> {
  const [people, members] = await Promise.all([
    prisma.requestAccess.findMany({
      where: { active: true, kind: 'EXPERT', userId: { not: null } },
      select: {
        user: {
          select: { id: true, email: true, tutor: { select: { categoryId: true } } },
        },
      },
    }),
    prisma.companyMember.findMany({
      where: { company: { requestAccess: { active: true } } },
      select: { user: { select: { id: true, email: true } } },
    }),
  ])

  const out = new Map<string, RoutableProvider & { email: string }>()
  for (const p of people) {
    if (!p.user) continue
    out.set(p.user.id, {
      userId: p.user.id,
      email: p.user.email,
      categoryId: p.user.tutor?.categoryId ?? null,
    })
  }
  for (const m of members) {
    // A person on the list by NAME keeps their sphere: an explicit personal
    // grant is the more specific fact, and overwriting it with the company's
    // sphere-less row would drop them out of every targeted audience.
    if (out.has(m.user.id)) continue
    out.set(m.user.id, { userId: m.user.id, email: m.user.email, categoryId: null, isCompanyMember: true })
  }
  return [...out.values()]
}

/** The verification mail, addressed by the routing rules. Returns what it did
 *  so the caller can audit and the admin panel can say which audience got it. */
export async function mailVerifiedRequest(requestId: string): Promise<{
  audience: string
  sent: number
}> {
  const r = await prisma.serviceRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true, kind: true, topic: true, categoryId: true,
      budgetMin: true, budgetMax: true, timing: true,
    },
  })
  if (!r) return { audience: 'NONE', sent: 0 }

  const providers = await routableProviders()
  const { audience, recipients } = routeRequest(r.categoryId, providers)
  if (recipients.length === 0) return { audience, sent: 0 }

  const kind = kindOf(r.kind)
  const mail = requestVerifiedProviderEmail({
    topicLabel: topicLabel(r.topic),
    kindLabel: KIND[kind].label,
    budgetLabel: budgetLabel(kind, r.budgetMin, r.budgetMax),
    timingLabel: timingLabel(kind, r.timing),
    requestId: r.id,
  })

  await notifyMany(recipients, {
    type: 'GENERIC',
    title: 'ახალი მოთხოვნა',
    body: topicLabel(r.topic),
    href: `/provider/requests/${r.id}`,
  })

  const byId = new Map(providers.map(p => [p.userId, p.email]))
  let sent = 0
  for (const id of recipients) {
    const to = byId.get(id)
    if (!to) continue
    try { await sendMail({ to, ...mail }); sent++ } catch { /* best-effort per address */ }
  }
  return { audience, sent }
}

/* ═══════════ the four jobs ══════════════════════════════════════════════ */

export type RequestJobsResult = {
  providerNudges: number
  clientNudges: number
  autoClosed: number
}

/**
 * One tick of everything the requests subsystem does on its own.
 *
 * Ordered cheapest-first and each stage independent: a throw in one job must
 * not cost the others their tick, so every one is wrapped. The counts are
 * returned for the cron's JSON, which is the only place an operator can see
 * that the automation is alive.
 */
export async function runRequestJobs(now: number = Date.now()): Promise<RequestJobsResult> {
  const out: RequestJobsResult = { providerNudges: 0, clientNudges: 0, autoClosed: 0 }

  // ── 1. Stale → CLOSED, and it runs FIRST ────────────────────────────────
  // ⚠️ THE ORDER IS THE FIX. With the sweep last, a request that had sat
  // unanswered for fifteen days was NUDGED and then closed inside the same
  // tick — providers mailed about work that ceased to exist a millisecond
  // later. Caught by firing the real cron against seeded rows (2026-08-17):
  // it reported two nudges where one was honest. Closing first means the
  // nudge queries below simply never see a dead row.
  //
  // Closing is a STATUS change and nothing else: no mail, no deletion, no data
  // lost — the row keeps everything it ever said and stops occupying a live
  // queue.
  try {
    const staleOpen = await prisma.serviceRequest.updateMany({
      where: {
        status: 'VERIFIED', offerCount: 0,
        verifiedAt: { lte: new Date(now - STALE_OPEN_DAYS * 86_400_000) },
      },
      data: { status: 'CLOSED' },
    })
    const oldMatched = await prisma.serviceRequest.updateMany({
      where: {
        status: 'MATCHED',
        updatedAt: { lte: new Date(now - MATCHED_CLOSE_DAYS * 86_400_000) },
      },
      data: { status: 'CLOSED' },
    })
    out.autoClosed = staleOpen.count + oldMatched.count
  } catch { /* one job's failure is not the tick's */ }

  // ── 2. Unanswered → re-mail, WIDENED ────────────────────────────────────
  // The second mail deliberately ignores the sphere and goes to everybody: the
  // targeted audience has already had its chance and said nothing, so the
  // narrower list is exactly the thing that failed. Widening is the recovery,
  // and it happens once.
  try {
    const due = await prisma.serviceRequest.findMany({
      where: {
        status: 'VERIFIED', offerCount: 0, providerNudgeAt: null,
        verifiedAt: { lte: new Date(now - UNANSWERED_NUDGE_HOURS * 3_600_000) },
      },
      take: BATCH,
      select: {
        id: true, status: true, offerCount: true, verifiedAt: true, createdAt: true,
        updatedAt: true, providerNudgeAt: true, clientNudgeAt: true,
        kind: true, topic: true, budgetMin: true, budgetMax: true, timing: true,
      },
    })
    const providers = await routableProviders()
    for (const r of due) {
      // The pure predicate re-checked against the row we actually loaded —
      // the `where` above is an INDEX HINT, this is the rule.
      if (!needsProviderNudge(r, now)) continue
      // Claim first: the flag is written before the mail goes, so a crash
      // mid-send costs one notification rather than sending it every 15
      // minutes forever. Under-notifying is recoverable by hand; a mail loop
      // is what makes people filter us.
      const claimed = await prisma.serviceRequest.updateMany({
        where: { id: r.id, providerNudgeAt: null },
        data: { providerNudgeAt: new Date(now) },
      })
      if (claimed.count !== 1) continue

      const kind = kindOf(r.kind)
      const mail = requestVerifiedProviderEmail({
        topicLabel: topicLabel(r.topic),
        kindLabel: KIND[kind].label,
        budgetLabel: budgetLabel(kind, r.budgetMin, r.budgetMax),
        timingLabel: timingLabel(kind, r.timing),
        requestId: r.id,
      })
      for (const p of providers) {
        try { await sendMail({ to: p.email, ...mail }) } catch { /* best-effort */ }
      }
      out.providerNudges++
    }
  } catch { /* one job's failure is not the tick's */ }

  // ── 3. Offers waiting, nobody chose → remind the client ─────────────────
  try {
    const due = await prisma.serviceRequest.findMany({
      where: {
        status: 'VERIFIED', offerCount: { gte: 1 }, clientNudgeAt: null,
        email: { not: null },
        verifiedAt: { lte: new Date(now - CLIENT_NUDGE_HOURS * 3_600_000) },
      },
      take: BATCH,
      select: {
        id: true, status: true, offerCount: true, verifiedAt: true, createdAt: true,
        updatedAt: true, providerNudgeAt: true, clientNudgeAt: true,
        publicRef: true, topic: true, email: true,
      },
    })
    for (const r of due) {
      if (!needsClientNudge(r, now) || !r.email) continue
      const claimed = await prisma.serviceRequest.updateMany({
        where: { id: r.id, clientNudgeAt: null },
        data: { clientNudgeAt: new Date(now) },
      })
      if (claimed.count !== 1) continue
      // The existing „an offer arrived" template, reused rather than a fourth
      // near-identical one: what the client needs is the count and the link,
      // and that is exactly what it carries. The provider name is the one
      // field that does not fit a summary, so it says how many instead.
      const mail = offerArrivedClientEmail({
        publicRef: r.publicRef,
        topicLabel: topicLabel(r.topic),
        priceLabel: `${r.offerCount} შეთავაზება`,
        providerName: 'ექსპერტები',
        offerCount: r.offerCount,
      })
      try { await sendMail({ to: r.email, ...mail }); out.clientNudges++ } catch { /* best-effort */ }
    }
  } catch { /* … */ }

  return out
}

/** Re-exported so the cron's JSON and the tests read the same numbers. */
export { UNANSWERED_NUDGE_HOURS, CLIENT_NUDGE_HOURS, STALE_OPEN_DAYS, MATCHED_CLOSE_DAYS }
