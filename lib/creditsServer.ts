// The credit ledger's WRITES. The arithmetic and the vocabulary live in
// lib/credits.ts and are pure; this file is the only place that touches the
// table, so „how did this balance get here" has one answer.
//
// ⚠️ EVERY WRITE HERE IS IDEMPOTENT BY THE INDEX, NEVER BY A CHECK (2026-08-21).
// `@@unique([userId, grantKey])` is the whole mechanism: a movement that must
// happen once carries a key and the database refuses the second row, so it does
// not matter how many times a cron tick, a retried request or a second server
// instance calls the same function. A `findFirst` followed by a `create` is the
// shape that pays a refund twice under two tabs, and this is money-shaped.
//
//   grantKey set    pays once, for ever          the tasks, a release, a job
//   grantKey null   repeats by nature            a spend, an admin's movement
//
// Postgres treats NULLs as distinct in a unique index, which is what lets those
// two live under one constraint. Do not add a second table for it.

import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  CREDIT_TASKS, CONTACT_COST_TETRI, JOB_DONE_TETRI, BIO_MIN, CREDITS_ENFORCED,
  earnedTasks, completeness, contactKey, contactRefundKey, jobDoneKey, adminAdjustReason,
  type CreditTaskKey, type ProfileFacts,
} from '@/lib/credits'

/** The balance, summed from the ledger. There is no counter to read instead. */
export async function balanceOf(userId: string): Promise<number> {
  const agg = await prisma.creditEntry.aggregate({
    where: { userId },
    _sum: { amountTetri: true },
  })
  return agg._sum.amountTetri ?? 0
}

/**
 * What this person's profile actually contains — read once, used by both the
 * grant and the completeness score.
 *
 * ⚠️ IT READS BOTH HALVES. A person may hold either capability or both
 * (lib/capabilities), and „did you upload a photo" is one question about one
 * human — asking it per profile table would pay a two-capability provider
 * twice for one photo, and the unique index would then silently refuse the
 * second grant, which reads as the feature being broken.
 */
export async function profileFacts(userId: string): Promise<ProfileFacts> {
  // ⚠️ ONE PROFILE SINCE 2026-08-24. This read BOTH tables and merged them,
  // because a person could hold either capability or both and „did you upload a
  // photo" is one question about one human — asking it per table would have
  // paid a two-capability provider twice for one photo, and the unique index
  // would then silently refuse the second grant, which reads as the feature
  // being broken. There is one table now, so the merge is gone and the question
  // is asked once by construction.
  const [user, provider] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } }),
    prisma.serviceProfile.findUnique({
      where: { userId },
      select: {
        about: true, services: true, areas: true, priceList: true, photoUrl: true, workPhotos: true,
        professions: true, yearsExp: true,
        // ⚠️ SELECTED HERE SO NOBODY ELSE READS THE ROW. /work needs to know
        // whether this provider has ever saved their own service list (the
        // migration seeded it from their category), and tests/requestQueue §F
        // forbids that page a serviceProfile query of its own — one read, one
        // narrowing, no second source that can disagree.
        servicesConfirmedAt: true,
      },
    }),
  ])
  const bio = (provider?.about ?? '').trim()

  // ⚠️ ONE KEY, TWO WAYS TO EARN IT — the second column of the table in
  // lib/credits. Each pair is the SAME thing in the other half's terms, and the
  // pairs are disjoint on purpose: a provider's `services[]` earns PROFESSIONS
  // (it is literally what routing matches on for them, lib/serviceProfile →
  // routingWhere), and a PRICE against one of those ticks earns SERVICE. Were
  // both to read `services[]`, one tap would pay 40₾ and the profile would
  // still say nothing a client can shop for.
  const priced = provider?.priceList && typeof provider.priceList === 'object' && !Array.isArray(provider.priceList)
    ? Object.values(provider.priceList as Record<string, unknown>).some(v => typeof v === 'number' && v > 0)
    : false

  return {
    hasPhoto: !!user?.avatarUrl || !!provider?.photoUrl,
    hasBio: bio.length >= BIO_MIN,
    // ⚠️ EITHER ANSWER STILL EARNS THE TASK, and the pairs are the SAME
    // question asked of a professional and of a trade. A lawyer names
    // professions and years; a plumber ticks services and the cities they
    // travel to. Both are „have you said who you are and where you work".
    hasProfessions: (provider?.professions ?? []).length > 0 || (provider?.services ?? []).length > 0,
    // ⚠️ THE YEARS HALF OF THIS PAIR WENT ON 2026-08-31, the same way the
    // certificate half went on 2026-08-29: no screen collects it any more, and
    // a fact nothing can make true keeps a task alive with nowhere to do it.
    // The cities half stands alone now. THE LABEL IN lib/credits STILL SAYS
    // „მიუთითე გამოცდილება · რამდენი წელია მუშაობ" and that is the owner's
    // copy to change — it is flagged, not rewritten here.
    hasExperience: (provider?.areas ?? []).length > 0,
    hasService: priced,
    // ⚠️ THE CERTIFICATE HALF OF THIS PAIR IS GONE (2026-08-29) — no screen
    // uploads one any more, so a fact nothing can make true would have kept a
    // 20₾ task alive with nowhere to do it. Work photos are the whole of it.
    hasCertificate: (provider?.workPhotos ?? []).length > 0,
    // Not a task — see the type. A provider with no row at all has nothing to
    // confirm and is not nagged: the note only shows where a profile exists.
    servicesConfirmed: provider === null || provider.servicesConfirmedAt !== null,
  }
}

/**
 * Pay for every task this profile has completed and has not been paid for.
 *
 * ⚠️ IDEMPOTENT BY THE INDEX, NOT BY A CHECK. `createMany({ skipDuplicates })`
 * against `@@unique([userId, grantKey])` is what makes calling this on every
 * profile save correct — a read-then-write would pay twice under two tabs, and
 * this is money-shaped. Returns what was newly granted so a caller can say so.
 */
export async function grantEarnedTasks(userId: string): Promise<{
  /** Paid ON THIS CALL — what the caller may announce. */
  granted: { key: CreditTaskKey; tetri: number }[]
  /**
   * ⚠️ WHAT FINISHING THE PROFILE IS STILL WORTH, and it is returned from here
   * rather than fetched separately ON PURPOSE (2026-08-30). The rail draws it
   * on every workspace screen, and the only other way to know it is a second
   * `profileFacts` call — the exact duplicate read this file's own note (and
   * tests/requestQueue §F) exists to prevent. The facts are already in hand one
   * line above; the sum is arithmetic, not a query.
   */
  unearnedTetri: number
  /**
   * ⚠️ THE SAME ARITHMETIC AS `unearnedTetri`, EXPRESSED AS A BAR. The rail
   * draws both, one above the other, and until 2026-08-30 the bar came from
   * lib/profileScore instead — a different six-item list, weighted differently,
   * asking for a headline and a language where the grant pays for a certificate
   * and years of experience. A bar at 100% above „კიდევ 40 ₾ პროფილის
   * შევსებისთვის" is not a rounding difference, it is two questions wearing one
   * control. `completeness` is the grant's own measure, so they cannot disagree.
   */
  percent: number
}> {
  const facts = await profileFacts(userId)
  const earned = earnedTasks(facts)
  const unearnedTetri = CREDIT_TASKS
    .filter(t => !(earned as string[]).includes(t.key))
    .reduce((n, t) => n + t.tetri, 0)
  const percent = completeness(facts)
  if (earned.length === 0) return { granted: [], unearnedTetri, percent }

  const already = await prisma.creditEntry.findMany({
    where: { userId, grantKey: { in: earned } },
    select: { grantKey: true },
  })
  const paid = new Set(already.map(r => r.grantKey))
  const fresh = CREDIT_TASKS.filter(t => (earned as string[]).includes(t.key) && !paid.has(t.key))
  if (fresh.length === 0) return { granted: [], unearnedTetri, percent }

  await prisma.creditEntry.createMany({
    data: fresh.map(t => ({
      userId,
      amountTetri: t.tetri,
      reason: t.key,
      grantKey: t.key,
    })),
    skipDuplicates: true,
  })
  return { granted: fresh.map(t => ({ key: t.key, tetri: t.tetri })), unearnedTetri, percent }
}

/* ═══════════ what spends it: one client's contact ═══════════════════════ */

/** What an unlock attempt can end as. One shape, so the route maps one union
 *  to one status code and the page maps it to one sentence. */
export type UnlockResult =
  | { ok: true; charged: boolean }
  | { ok: false; error: 'NO_BALANCE' | 'CONTACT_LIMIT' }

/**
 * Open one client's contact to one provider — the ONLY thing a balance buys.
 *
 * Returns `{ ok: true, charged: false }` when this provider had already paid
 * for this request: re-opening the same number tomorrow, or from a second tab,
 * costs nothing and must never look like an error.
 *
 * ⚠️ PAID ONCE, FOR EVER, BY THE INDEX AND NOT BY A CHECK. `contactKey` +
 * `@@unique([userId, grantKey])` is the whole guarantee. A `findFirst` followed
 * by a `create` is how a provider gets billed twice for a number they already
 * hold, and it takes two tabs and no bad luck at all — „charging twice for the
 * same phone number is theft".
 *
 * ⚠️ BOTH CEILINGS LIVE INSIDE THE INSERT, because neither has a row to claim
 * and CLAUDE.md's fourth rule still applies. The balance is a SUM and the
 * contact cap is a COUNT; a `where` cannot hold either, so the guard is pushed
 * into the statement and Postgres evaluates both against the rows it is already
 * holding. Zero rows written means one of the two refused, and the caller is
 * told WHICH by a second read taken only on that slow path.
 *
 *   balance  (SELECT SUM(amountTetri) …) >= CONTACT_COST_TETRI
 *   cap      (SELECT COUNT(*) … WHERE grantKey = contactKey(requestId)) < offerLimit
 *
 * ⚠️ TWO LOCKS, ALWAYS IN THE SAME ORDER — ServiceRequest, then User. Under
 * READ COMMITTED two concurrent unlocks would otherwise both read the same
 * count and both insert, and the fourth provider would get a phone number the
 * client never agreed to hand out. The request lock serialises the cap (which
 * is contended per REQUEST) and the user lock serialises the balance (contended
 * per PERSON). A fixed order is what makes two locks safe; do not swap them.
 *
 * ⚠️ AND THE CAP READS THE LEDGER, NOT A COLUMN. „How many providers opened
 * this contact" is `count(grantKey = contactKey(id))` — the same key that makes
 * the unlock idempotent, read the other way round. That is deliberately NOT
 * `ServiceRequest.offerCount`: spending the offer budget on unlocks would let
 * three providers buy a number, never bid, and leave the client with no offers
 * at all. See lib/credits → CONTACT_LIMIT_REASON for the whole argument.
 */
export async function chargeForContact(
  userId: string,
  requestId: string,
  offerLimit: number,
): Promise<UnlockResult> {
  const key = contactKey(requestId)

  const result = await prisma.$transaction(async tx => {
    // Already paid? Asked first and cheaply, because it is the common case
    // after the first time and it must cost nothing — the unique index would
    // refuse the row anyway, but a P2002 is not a nice way to say „yes".
    const held = await tx.creditEntry.findFirst({
      where: { userId, grantKey: key },
      select: { id: true },
    })
    if (held) return { ok: true as const, charged: false }

    // The locks, in their fixed order. `$queryRaw` and not `$executeRaw`
    // because `FOR UPDATE` is still a SELECT and executeRaw refuses a statement
    // that returns rows.
    await tx.$queryRaw`SELECT 1 FROM "ServiceRequest" WHERE "id" = ${requestId} FOR UPDATE`
    await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${userId} FOR UPDATE`

    // ⚠️ EVERY PARAMETER CARRIES ITS ::cast. A bind in a SELECT list has no
    // column to take its type from, and Postgres answers „could not determine
    // data type of parameter $1" — the same trap lib/events documents for its
    // own raw INSERT. The id is a uuid because `@default(cuid())` is generated
    // by the Prisma client and there is no client on this path.
    //
    // The first disjunct of the balance test is the switch: when enforcement is
    // off that half is simply true and the balance may go negative, which is
    // the pre-2026-08-21 behaviour. The CAP has no such escape — it protects
    // the client, not the ledger, and a flag about money must not quietly
    // disable a promise made to a person.
    const written = await tx.$executeRaw`
      INSERT INTO "CreditEntry" ("id", "userId", "amountTetri", "reason", "grantKey", "refId", "createdAt")
      SELECT ${randomUUID()}::text, ${userId}::text, ${-CONTACT_COST_TETRI}::integer,
             'CONTACT_OPENED'::text, ${key}::text, ${requestId}::text, now()
      WHERE ( ${!CREDITS_ENFORCED}::boolean
              OR (SELECT COALESCE(SUM("amountTetri"), 0) FROM "CreditEntry" WHERE "userId" = ${userId}::text)
                 >= ${CONTACT_COST_TETRI}::integer )
        AND (SELECT COUNT(*) FROM "CreditEntry" WHERE "grantKey" = ${key}::text) < ${offerLimit}::integer
    `
    if (written === 1) return { ok: true as const, charged: true }

    // THE SLOW PATH, taken only when the write already failed, so it costs
    // nothing in the normal case. Which of the two ceilings stopped it decides
    // what the provider is told, and „ბალანსი არ არის საკმარისი" shown to
    // somebody who is actually the fourth caller is a lie they would top up to
    // fix.
    const taken = await tx.creditEntry.count({ where: { grantKey: key } })
    if (taken >= offerLimit) return { ok: false as const, error: 'CONTACT_LIMIT' as const }
    return { ok: false as const, error: 'NO_BALANCE' as const }
  })

  return result
}

/** Has this provider already paid for this request's contact? A ledger read,
 *  and therefore this file's business — it is what lets the page fetch the
 *  phone number ONLY inside an `if`, which is the rule lib/requests set when it
 *  removed the columns from `ProviderRequestRow`: a rule enforced by what is
 *  FETCHED is a rule a future render cannot forget. */
export async function contactUnlocked(userId: string, requestId: string): Promise<boolean> {
  const row = await prisma.creditEntry.findFirst({
    where: { userId, grantKey: contactKey(requestId) },
    select: { id: true },
  })
  return row !== null
}

/** How many providers have opened this request's contact. Read for DISPLAY —
 *  „N ადგილიდან M" — and never as a guard; the guard is inside the INSERT
 *  above, because a count read before a write loses to a second tab. */
export async function contactCountOf(requestId: string): Promise<number> {
  return prisma.creditEntry.count({ where: { grantKey: contactKey(requestId) } })
}

/* ═══════════ what gives it back ═════════════════════════════════════════ */

/**
 * Pay for a finished job. Returns whether THIS call was the one that paid it.
 *
 * Same mechanism, different key — see lib/credits → JOB_DONE_TETRI for why 25₾
 * and why the stamp is a safe thing to pay on.
 */
export async function grantJobDone(userId: string, offerId: string): Promise<boolean> {
  const r = await prisma.creditEntry.createMany({
    data: [{
      userId,
      amountTetri: JOB_DONE_TETRI,
      reason: 'JOB_DONE',
      grantKey: jobDoneKey(offerId),
      refId: offerId,
    }],
    skipDuplicates: true,
  })
  return r.count === 1
}

/**
 * An admin moves a balance by hand. `amountTetri` is SIGNED; the reason the
 * operator typed is written onto the row (lib/credits → adminAdjustReason says
 * why it lives in `reason` and not in a column of its own).
 *
 * ⚠️ `grantKey` IS NULL, so this is NOT idempotent — deliberately. A hand
 * movement is a decision and not an event: an admin who types 20₾ twice meant
 * it twice, and a key that silently swallowed the second one would be a panel
 * that lies about what it just did. The route answers with the new balance so a
 * double-submit is visible immediately, and the AuditLog is where a mistaken
 * one is found afterwards.
 */
export async function adjustBalance(
  userId: string,
  amountTetri: number,
  note: string,
): Promise<number> {
  await prisma.creditEntry.create({
    data: { userId, amountTetri, reason: adminAdjustReason(note) },
  })
  return balanceOf(userId)
}

/* ═══════════ the sweep ══════════════════════════════════════════════════ */

/** How many offers one cron tick will judge. The same bound every other job in
 *  the cleanup route uses — a tick that can do unbounded work is a tick that
 *  can hold a connection for minutes and time the whole route out. */
const BATCH = 200

export type CreditSweepResult = { jobsPaid: number }

/**
 * THE BACKSTOP UNDER THE EARN-BACK: pay for finished jobs the „დასრულდა" route
 * did not manage to pay for.
 *
 * ⚠️ WHAT USED TO BE HERE AND IS GONE (2026-08-21). This function also released
 * the 5₾ of an offer nobody ever answered — the counterweight to charging for
 * an offer, and the reason that model was defensible at all. The owner moved the
 * charge off the offer and onto the CONTACT, so sending an offer is free, so
 * there is nothing left to release: an offer that goes unanswered now costs its
 * provider nothing, which is the same outcome the refund existed to produce, one
 * step earlier and with no bookkeeping. The whole branch was deleted rather than
 * left switched off — see lib/credits for the history it belongs to.
 *
 * ⚠️ IT RE-DERIVES FROM STATE AND HANGS OFF NO EVENT, which is why it can be a
 * backstop at all. `doneAt` is the state; the ledger row is the record that it
 * was paid for; the unique index is what stops the two writers colliding. So the
 * worst a failed tick or a crashed request costs is fifteen minutes.
 *
 * ⚠️ ONLY AN INDIVIDUAL IS PAID, for the same reason only an individual is
 * charged: the ledger is keyed on a USER and a company's finished job has no
 * personal balance to land in.
 */
export async function runCreditJobs(_now: number = Date.now()): Promise<CreditSweepResult> {
  const out: CreditSweepResult = { jobsPaid: 0 }

  try {
    const due = await prisma.requestOffer.findMany({
      where: { doneAt: { not: null }, expertUserId: { not: null } },
      orderBy: { doneAt: 'desc' },
      take: BATCH,
      select: { id: true, expertUserId: true },
    })
    if (due.length) {
      // ⚠️ `userId` IS IN THE WHERE FOR THE INDEX, not for correctness — the
      // key already identifies the offer. `(userId, grantKey)` is the unique
      // index, so a query on `grantKey` alone cannot use its leading column.
      const paid = new Set(
        (await prisma.creditEntry.findMany({
          where: {
            userId: { in: [...new Set(due.map(o => o.expertUserId!))] },
            grantKey: { in: due.map(o => jobDoneKey(o.id)) },
          },
          select: { grantKey: true },
        })).map(r => r.grantKey),
      )
      for (const o of due) {
        if (paid.has(jobDoneKey(o.id))) continue
        if (await grantJobDone(o.expertUserId!, o.id)) out.jobsPaid++
      }
    }
  } catch (e) {
    // One job's failure is not the tick's — the contract every other sweep in
    // the cleanup route keeps. Logged rather than swallowed: this one moves
    // money, and a silent failure is a provider quietly unpaid.
    console.error('[credits] done sweep failed', e)
  }

  return out
}

/* ═══════════ giving it back when the lead died ═══════════════════════════ */

/**
 * REFUND EVERY CONTACT BOUGHT ON A REQUEST THAT ENDED WITH NOBODY ANSWERING.
 *
 * ⚠️ THIS IS THE COMPLAINT THAT DEFINES THE CATEGORY, AND WE ARE ANSWERING IT
 * (2026-08-30). Researched that day: the loudest and most repeated grievance
 * against Thumbtack is a provider paying for a lead, replying at once, and the
 * client never speaking again — with the refund refused, or returned as
 * platform credit that can only be spent on more leads. „Inescapable spending
 * cycle" is the phrase their own pros use.
 *
 * mcodne has the same exposure by construction: a contact costs 1₾ BEFORE the
 * offer (app/api/provider/requests/[id]/contact), so a provider can pay for a
 * phone number that was never going to answer. The difference is what happens
 * next.
 *
 * ⚠️ THE RULE IS NARROW ON PURPOSE — „the request died with NOBODY answering".
 * Losing to a better offer is competition and is not refunded; a client who
 * chose somebody else did engage, and the platform did its job. What is
 * refunded is the case where the whole request went nowhere: `offerCount = 0`
 * at the moment the sweep closes it as stale (lib/requestJobs). Nobody won, so
 * nobody should have paid.
 *
 * ⚠️ IT IS IDEMPOTENT BY THE INDEX, NOT BY A CHECK — the same rule every grant
 * in this file follows. `@@unique([userId, grantKey])` on
 * `contactRefundKey(requestId)` means the second run writes zero rows, so the
 * sweep may call this on every tick for ever.
 *
 * Returns the ids of the providers who were made whole ON THIS CALL — not
 * everybody who was ever refunded. The caller mails them, and a re-run must
 * not re-mail somebody whose money came back a week ago.
 */
export async function refundDeadContacts(requestId: string): Promise<string[]> {
  const spends = await prisma.creditEntry.findMany({
    where: { grantKey: contactKey(requestId), reason: 'CONTACT_OPENED' },
    select: { userId: true },
  })
  if (spends.length === 0) return []

  const key = contactRefundKey(requestId)
  const refunded: string[] = []
  for (const s of spends) {
    // `createMany` + `skipDuplicates` would do this in one statement, but a
    // per-row create is what tells us WHICH were new — and that is the list the
    // caller mails.
    try {
      await prisma.creditEntry.create({
        data: {
          userId: s.userId,
          amountTetri: CONTACT_COST_TETRI,
          reason: 'CONTACT_REFUND',
          grantKey: key,
          refId: requestId,
        },
      })
      refunded.push(s.userId)
    } catch (err) {
      // ⚠️ ONLY THE UNIQUE VIOLATION MAY BE SWALLOWED, and the check has to be
      // narrow. A bare `catch {}` here read „already refunded" out of EVERY
      // failure — a dropped connection, a timeout, a full disk — and since the
      // caller only reaches this at the moment a request dies, that silence
      // would be permanent: the provider is not made whole and nothing ever
      // says so. P2002 is „the row is already there", which is the one error
      // that genuinely means success.
      if ((err as { code?: string })?.code === 'P2002') continue
      console.error('[server-error]', JSON.stringify({
        scope: 'contact-refund', requestId, detail: String(err).slice(0, 200),
      }))
      // Left for `sweepDeadContactRefunds` to pick up on a later tick — see
      // lib/requestJobs. Throwing would abandon the providers after this one.
    }
  }
  return refunded
}
