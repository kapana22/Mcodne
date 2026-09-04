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
import { sendSms } from './sms'
import { verifiedRequestSms } from './smsTemplates'
import { notifyMany } from './notify'
import {
  requestVerifiedProviderEmail, offerArrivedClientEmail,
  requestClosedNoOffersClientEmail, contactRefundedProviderEmail,
} from './emailTemplates'
import { refundDeadContacts, refundSilentContact } from './creditsServer'
import { CONTACT_REFUND_HOURS, gelLabel, contactRefundKey } from './credits'
import { KIND, kindOf, budgetLabel, timingLabel, topicLabel, PROVIDER_ROUTE } from './requests'
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
export async function routableProviders(): Promise<(RoutableProvider & { email: string | null; phone: string | null })[]> {
  const [people, members] = await Promise.all([
    prisma.requestAccess.findMany({
      where: { active: true, kind: 'EXPERT', userId: { not: null } },
      select: {
        user: {
          select: {
            id: true, email: true, phone: true,
            // ⚠️ `tutor` WAS SELECTED HERE UNTIL 2026-08-26 AND THE RELATION IS
            // GONE — TutorProfile was dropped on 2026-08-24 and the comment
            // below already said so („ONE PROFILE SINCE 2026-08-24 … They are
            // columns on this row now"), but the select was not deleted with
            // it. So THIS QUERY THREW on every call, and it is the query that
            // decides who hears about a request: `mailVerifiedRequest` (an
            // admin verifying a request, and /api/requests) and the unanswered
            // nudge both start here. Nobody was mailed. Live errors on
            // 2026-08-25 18:30 and 21:30 and again on 2026-08-26 12:02 and
            // 14:40 — „Unknown field `tutor` for select statement on model
            // `User`" — and nothing below ever read the field: the sphere and
            // the professions come off `serviceProfile`.
            // ⚠️ THE TRADES SIDE OF THE MATCH (2026-08-18). A master has no
            // TutorProfile and therefore no `categoryId`, so without this every
            // service request fell through to „EVERYONE" — a Tbilisi cleaning
            // job was mailed to the Batumi electrician. `available` is read,
            // not filtered on: a paused master must be EXCLUDED, and filtering
            // here would instead make them look like somebody with no profile,
            // i.e. put them back in the everybody audience. The same mistake
            // the provider queue made and had to be fixed for.
            // ⚠️ ONE PROFILE SINCE 2026-08-24. The sphere and the professions
            // used to come from `tutor` (the consultation profile) and the
            // services from here — two tables answering one question about one
            // person. They are columns on this row now.
            serviceProfile: {
              select: {
                services: true, areas: true, available: true,
                categoryId: true, professions: true,
              },
            },
          },
        },
      },
    }),
    prisma.companyMember.findMany({
      where: { company: { requestAccess: { active: true } } },
      select: { user: { select: { id: true, email: true, phone: true } } },
    }),
  ])

  // ⚠️ `email` IS NULLABLE SINCE PHONE REGISTRATION (2026-09-04) and `phone`
  // has always been. A provider now legitimately has ONE of the two, so every
  // send below asks before it sends rather than assuming an address exists.
  const out = new Map<string, RoutableProvider & { email: string | null; phone: string | null }>()
  for (const p of people) {
    if (!p.user) continue
    const svc = p.user.serviceProfile
    out.set(p.user.id, {
      userId: p.user.id,
      email: p.user.email,
      phone: p.user.phone,
      categoryId: svc?.categoryId ?? null,
      professions: svc?.professions ?? [],
      // A paused master keeps an empty list, which matches no topic — so they
      // fall out of every TARGETED audience and are only ever reached by a
      // deliberate „everyone" broadcast, which is what pausing should mean.
      services: svc?.available ? svc.services : [],
      areas: svc?.available ? svc.areas : [],
    })
  }
  for (const m of members) {
    // A person on the list by NAME keeps their sphere: an explicit personal
    // grant is the more specific fact, and overwriting it with the company's
    // sphere-less row would drop them out of every targeted audience.
    if (out.has(m.user.id)) continue
    out.set(m.user.id, { userId: m.user.id, email: m.user.email, phone: m.user.phone, categoryId: null, isCompanyMember: true })
  }
  return [...out.values()]
}

/** The verification mail, addressed by the routing rules. Returns what it did
 *  so the caller can audit and the admin panel can say which audience got it. */
export async function mailVerifiedRequest(
  requestId: string,
  /**
   * ⚠️ AN EXPLICIT LIST BEATS THE ROUTING RULES (2026-08-18). Owner: „ხელით
   * მართვაც დამატე, რომ გავაგზავნო ყველა ქიმიის მასწავლებელთან."
   *
   * While the supply side is one person, automatic routing is not a feature —
   * it is a way to lose track of who was told what. So the operator may name
   * the recipients, and the rules below apply only when they do not.
   *
   * ⚠️ AN EMPTY ARRAY IS NOT THE SAME AS `undefined`. `[]` means „send to
   * nobody" and is answered with sent: 0; omitting it means „work out who".
   * Collapsing the two would make an operator who deselected everybody
   * broadcast to everybody.
   */
  only?: string[],
): Promise<{
  audience: string
  sent: number
}> {
  const r = await prisma.serviceRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true, kind: true, topic: true, categoryId: true, city: true,
      budgetMin: true, budgetMax: true, timing: true,
      // 🔒 WHO WROTE IT — read only to take them OUT of the audience below.
      userId: true,
    },
  })
  if (!r) return { audience: 'NONE', sent: 0 }

  const providers = await routableProviders()
  // ⚠️ THE TOPIC AND THE CITY ARE PASSED, and their absence was the bug: a
  // trades request carries no sphere (the sphere table is the expert taxonomy),
  // so this call used to hand `null` and get „EVERYONE" every single time.
  const routed = routeRequest(r.categoryId, providers, { topic: r.topic, city: r.city })
  // A named list is filtered against the allowlist rather than trusted: the
  // panel's checkboxes are a UI, and an id that is no longer routable must not
  // become a mail because it was on screen when somebody pressed send.
  const allowed = new Set(providers.map(p => p.userId))
  const audience = only ? 'MANUAL' : routed.audience
  const chosen = only ? only.filter(id => allowed.has(id)) : routed.recipients

  // 🔒 THE AUTHOR IS NOT AN AUDIENCE (2026-08-31). „ახალი მოთხოვნა შენს
  // სფეროში" landing in the inbox of the person who just wrote it is the
  // clearest possible version of the mixing the owner asked to remove („ირევა
  // ძალიან კოდი"), and it is not only cosmetic: the mail is the invitation to
  // bid, and bidding on your own request is refused three lines deep in
  // app/api/provider/offers. Inviting somebody to do a thing the server will
  // then refuse is worse than not inviting them.
  //
  // ⚠️ IT APPLIES TO THE MANUAL LIST TOO, and that is deliberate: an admin
  // ticking boxes in the panel is choosing from a UI, and „I did not notice"
  // is exactly the case a filter is for. Same reason `allowed` filters it.
  //
  // A COMPANY colleague is NOT filtered here — `routableProviders` keys the
  // audience by user, and one member's request does not make the whole company
  // ineligible to hear about work. The colleague who reads it still cannot bid
  // on it; the offer endpoint owns that rule and owns it alone.
  const recipients = r.userId ? chosen.filter(id => id !== r.userId) : chosen
  if (recipients.length === 0) return { audience, sent: 0 }

  const kind = kindOf(r.kind)
  const mail = await requestVerifiedProviderEmail({
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
    href: `${PROVIDER_ROUTE}/requests/${r.id}`,
  })

  const byId = new Map(providers.map(p => [p.userId, p]))
  const smsText = await verifiedRequestSms(topicLabel(r.topic))
  let sent = 0
  for (const id of recipients) {
    const p = byId.get(id)
    if (!p) continue
    // ⚠️ `p.email` CAN BE NULL SINCE PHONE REGISTRATION (2026-09-04) — a
    // provider who signed up with a number has no address at all, and for them
    // the SMS below is not an addition to the letter, it IS the notification.
    if (p.email) {
      try { await sendMail({ key: 'request.verified.provider', to: p.email, ...mail }); sent++ } catch { /* best-effort per address */ }
    }
    // ⚠️ THE TEXT IS AN ADDITION TO THE LETTER, NEVER A REPLACEMENT. Six of the
    // 26 providers on the allowlist have no Georgian mobile (measured
    // 2026-09-02), so an SMS-only path would simply stop telling them. It is
    // also OFF until somebody turns it on in /admin — lib/outboundSettings
    // defaults every product SMS to off, because a part is billed.
    if (p.phone) {
      try { await sendSms({ key: 'request.verified.provider', to: p.phone, text: smsText }) } catch { /* best-effort */ }
    }
  }
  return { audience, sent }
}

/* ═══════════ the four jobs ══════════════════════════════════════════════ */

type RequestJobsResult = {
  providerNudges: number
  clientNudges: number
  autoClosed: number
  /** Contacts refunded this tick — see the stale-close loop. Reported so the
   *  operator can see the promise being kept, and so a sudden spike (many paid
   *  leads dying at once) is visible without a query. */
  contactsRefunded: number
}

/**
 * GIVE BACK EVERY CONTACT PAID ON A REQUEST THAT WENT NOWHERE — and tell them.
 *
 * Two halves, and the second is not decoration. `refundDeadContacts` moves the
 * money; without the bell and the mail the provider learns about it by
 * noticing a balance they had already written off, which — from where they sit
 * — is indistinguishable from never being refunded at all. The complaint this
 * feature answers is as much about silence as about money.
 *
 * Exported for the admin close/reject path, which needs exactly this and must
 * not grow a second copy of it.
 */
export async function refundDeadRequest(
  requestId: string,
  label: string,
): Promise<number> {
  /* ⚠️ PAIRS, NOT IDS (2026-09-03). A contact costs 1–10₾ by the job's budget,
     so „N₾ დაგიბრუნდა" can only be said per provider — see refundDeadContacts. */
  let refunded: { userId: string; amountTetri: number }[] = []
  try {
    refunded = await refundDeadContacts(requestId)
  } catch {
    // A refund that throws must not stop the row from closing — the close is
    // the client's outcome, the refund is ours to retry. The next tick finds
    // the spend rows still unmatched and pays them then.
    return 0
  }
  if (refunded.length === 0) return 0

  /* ⚠️ ONE BELL AND ONE MAIL PER PROVIDER, because the figure differs per
     provider now. `notifyMany` still exists and is still right where a whole
     audience shares a sentence; here they do not. The list is at most the
     request's `offerLimit` — three — so the loop is not a fan-out. */
  const emails = new Map(
    (await prisma.user.findMany({
      where: { id: { in: refunded.map(r => r.userId) } },
      select: { id: true, email: true },
    })).map(u => [u.id, u.email]),
  )
  for (const r of refunded) {
    const amount = gelLabel(r.amountTetri)
    await notifyMany([r.userId], {
      type: 'PAYOUT',
      title: `${amount} დაგიბრუნდა`,
      body: `${label} — კლიენტი არ გამოეხმაურა.`,
      href: '/work',
    })
    const to = emails.get(r.userId)
    if (!to) continue
    const mail = await contactRefundedProviderEmail({ topicLabel: label, amountLabel: amount })
    try { await sendMail({ key: 'request.contactRefunded.provider', to, ...mail }) } catch { /* best-effort */ }
  }
  return refunded.length
}

/**
 * THE SAFETY NET UNDER THE REFUND — every contact bought on a request that has
 * since died and has not been paid back.
 *
 * ⚠️ IT ASKS THE LEDGER, NOT THE REQUESTS, and that is what makes it cheap. The
 * obvious version walks recently-closed requests and calls `refundDeadContacts`
 * on each, which is one query per row for a job that almost always has nothing
 * to do. Money left the ledger, so the ledger is where the evidence is: a
 * `CONTACT:<id>` spend with no `CONTACT_REFUND:<id>` beside it is either a live
 * request (fine) or a debt (not).
 *
 * The request table is then asked ONE question about only those few ids: is it
 * dead? Dead means the same two endings the admin path uses — REJECTED at all,
 * or CLOSED with nobody having answered.
 */
export async function sweepDeadContactRefunds(): Promise<number> {
  const spends = await prisma.creditEntry.findMany({
    where: { reason: 'CONTACT_OPENED', refId: { not: null } },
    select: { refId: true },
    take: BATCH,
  })
  const ids = [...new Set(spends.map(s => s.refId!).filter(Boolean))]
  if (ids.length === 0) return 0

  // Already settled — dropped here rather than in the loop so a request that
  // was paid back long ago costs nothing on every tick for ever.
  const paid = await prisma.creditEntry.findMany({
    where: { grantKey: { in: ids.map(contactRefundKey) } },
    select: { refId: true },
  })
  const settled = new Set(paid.map(p => p.refId))
  const owed = ids.filter(id => !settled.has(id))
  if (owed.length === 0) return 0

  const dead = await prisma.serviceRequest.findMany({
    where: {
      id: { in: owed },
      OR: [{ status: 'REJECTED' }, { status: 'CLOSED', offerCount: 0 }],
    },
    select: { id: true, topic: true },
  })

  let n = 0
  for (const r of dead) n += await refundDeadRequest(r.id, topicLabel(r.topic))
  return n
}

/**
 * THE 48-HOUR PROMISE, KEPT — a contact paid for, and a client who never spoke.
 *
 * ⚠️ THIS IS THE HALF THAT MAKES THE NEW PRICE FAIR (2026-09-01, the canvas:
 * „თუ კლიენტი 48 საათში არ გამოგეხმაურება, 3₾ ავტომატურად დაგიბრუნდება"). The
 * money now changes hands AFTER the client picked somebody, which removes the
 * old risk — the dead lead — and creates a new one: being chosen by somebody who
 * then goes quiet. A provider who pays on the strength of „you have been picked"
 * and hears nothing has been sold a job that did not exist.
 *
 * ⚠️ IT ASKS THE LEDGER FIRST, like its neighbour above, and for the same
 * reason: money left, so the ledger holds the evidence and the query is two
 * indexed reads on a job that usually has nothing to do. Walking recent unlocks
 * from the request side would be one query per row.
 *
 * ⚠️ WHAT COUNTS AS „გამოეხმაურა" IS A MESSAGE AFTER THE UNLOCK, and the choice
 * is deliberately generous to the provider. We cannot observe a phone call, so
 * the only evidence we have is the thread. A provider who WAS called back and
 * gets refunded anyway has lost nothing; a provider charged for silence is the
 * exact complaint the refund exists to answer. The doubt is spent their way.
 *
 * ⚠️ AND IT IS `> unlockedAt`, NOT „any client message". The client wrote when
 * they accepted the offer; counting that would mean nobody is ever refunded,
 * because acceptance is the event that made the purchase possible in the first
 * place.
 *
 * ⚠️ BEING CHOSEN AFTER THE UNLOCK IS ALSO AN ANSWER (2026-09-03), AND WITHOUT
 * THIS THE SWEEP WOULD HAVE STARTED REFUNDING WON JOBS. The client can now open
 * a provider's number themselves — POST /api/requests/[ref]/call charges for
 * it — so an unlock no longer implies „this provider was already chosen". The
 * normal shape of a good outcome became: client rings, they agree on the phone,
 * client presses „ავირჩევ", and NOBODY TYPES ANYTHING. Message-only evidence
 * reads that as silence and hands the fee back on the one lead that worked.
 *
 * The accept is read from `OfferEvent` and not from `RequestOffer.status`,
 * because the question is WHEN. A status is a fact with no clock on it, and on
 * the older path — provider pays after being chosen — the offer is ACCEPTED
 * before the unlock exists, so a status test would refund nobody, ever. The
 * event carries `at`, so „chosen AFTER you paid" is askable.
 */
export async function sweepSilentContacts(now: number = Date.now()): Promise<number> {
  const cutoff = new Date(now - CONTACT_REFUND_HOURS * 3_600_000)

  /* ⚠️ THE „ALREADY REFUNDED" FILTER IS IN THE SQL, NOT AFTER THE `take`, AND
   * THAT IS THE WHOLE CORRECTNESS OF THIS SWEEP.
   *
   * The obvious shape — take a batch of old spends, then drop the settled ones
   * in JavaScript — works until the settled ones outnumber the batch. Every
   * contact ever bought stays older than 48 hours for ever, so the pool of
   * already-refunded rows only grows; past `BATCH` of them the page fills
   * entirely with rows that need nothing and the genuinely unpaid ones are
   * never reached. The sweep would go quiet without failing, which is the worst
   * way for a promise about money to break.
   *
   * `NOT EXISTS` against the refund key does the same work in the index and
   * lets `LIMIT` mean „this many rows that still need something".
   *
   * The key is the pair (userId, grantKey) because that is the unique index the
   * refund is idempotent by — matching on `refId` alone would treat one
   * provider's refund as settling the request for everybody on it.
   */
  const spends = await prisma.$queryRawUnsafe<{ userId: string; refId: string; createdAt: Date }[]>(
    `SELECT s."userId", s."refId", s."createdAt"
       FROM "CreditEntry" s
      WHERE s."reason" = 'CONTACT_OPENED'
        AND s."refId" IS NOT NULL
        AND s."createdAt" <= $1
        AND NOT EXISTS (
              SELECT 1 FROM "CreditEntry" r
               WHERE r."userId" = s."userId"
                 AND r."grantKey" = $3 || s."refId"
            )
      ORDER BY s."createdAt" ASC
      LIMIT $2`,
    cutoff, BATCH, contactRefundKey(''),
  )
  if (spends.length === 0) return 0
  const ids = [...new Set(spends.map(s => s.refId))]

  // One read for the batch. The bell names the job — „ბინის დალაგება —
  // კლიენტი არ გამოეხმაურა." — and a provider with several open contacts
  // cannot tell which was refunded without it.
  const topics = new Map(
    (await prisma.serviceRequest.findMany({
      where: { id: { in: ids } },
      select: { id: true, topic: true },
    })).map(r => [r.id, topicLabel(r.topic)]),
  )

  let n = 0
  for (const s of spends) {
    // Did the client speak on THIS provider's thread after they paid? Asked as
    // a count over the offer relation so one query answers it — the thread is
    // per offer (prisma/schema → RequestMessage), and the provider's own
    // ACCEPTED offer is the only one they can read.
    const spoke = await prisma.requestMessage.count({
      where: {
        requestId: s.refId,
        fromClient: true,
        createdAt: { gt: s.createdAt },
        offer: { is: { expertUserId: s.userId, status: 'ACCEPTED' } },
      },
    })
    if (spoke > 0) continue

    // …or did they CHOOSE this provider after paying? See the note above: with
    // the client able to open a number, being picked is the strongest evidence
    // the contact worked, and it is often the only one — a call leaves no row.
    const chosen = await prisma.offerEvent.count({
      where: {
        type: 'ACCEPTED',
        at: { gt: s.createdAt },
        offer: { is: { requestId: s.refId, expertUserId: s.userId } },
      },
    })
    if (chosen > 0) continue

    const back = await refundSilentContact(s.userId, s.refId)
    if (back > 0) {
      n++
      // ⚠️ TOLD, NOT JUST PAID — the same argument `refundDeadRequest` makes one
      // function above, in the same words and the same notification type. A
      // balance that quietly goes back up is indistinguishable, from where the
      // provider sits, from never having been refunded; and two vocabularies for
      // one event („PAYOUT" here, something else there) would be a provider
      // learning the same fact twice. Best-effort: a failed bell must not cost
      // the refund, which has already been written.
      try {
        await notifyMany([s.userId], {
          type: 'PAYOUT',
          title: `${gelLabel(back)} დაგიბრუნდა`,
          body: `${topics.get(s.refId) ?? 'მოთხოვნა'} — კლიენტი არ გამოეხმაურა.`,
          href: '/work',
        })
      } catch { /* the money is the promise; the bell is the courtesy */ }
    }
  }
  return n
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
  const out: RequestJobsResult = {
    providerNudges: 0, clientNudges: 0, autoClosed: 0, contactsRefunded: 0,
  }

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
    // ⚠️ CLAIMED ONE BY ONE, NOT SWEPT — and the reason is the mail below.
    // This was a single `updateMany`, which is why nobody was ever told: a bulk
    // status change has no rows to write to. The person who described their
    // problem, left a number and waited two weeks learnt that nobody came by
    // never hearing anything again, and the same transition closed their thread
    // with us, so the moment they stopped hearing from us was the moment they
    // could no longer ask why.
    //
    // Same claim-then-act shape as the two nudges: the status is written first
    // and the mail follows, so a crash costs one notification rather than
    // re-closing (and re-mailing) the row on every tick. Bounded by BATCH.
    const staleDue = await prisma.serviceRequest.findMany({
      where: {
        status: 'VERIFIED', offerCount: 0,
        verifiedAt: { lte: new Date(now - STALE_OPEN_DAYS * 86_400_000) },
      },
      take: BATCH,
      select: {
        id: true, status: true, offerCount: true, verifiedAt: true, createdAt: true,
        updatedAt: true, providerNudgeAt: true, clientNudgeAt: true,
        publicRef: true, topic: true, email: true,
      },
    })
    let staleClosed = 0
    for (const r of staleDue) {
      // The pure predicate re-checked against the row we actually loaded — the
      // `where` above is an index hint, `shouldAutoClose` is the rule.
      if (!shouldAutoClose(r, now)) continue
      const claimed = await prisma.serviceRequest.updateMany({
        where: { id: r.id, status: 'VERIFIED', offerCount: 0 },
        data: { status: 'CLOSED' },
      })
      if (claimed.count !== 1) continue
      staleClosed++

      // ⚠️ THE MONEY GOES BACK BEFORE THE MAIL GOES OUT (2026-08-30). This is
      // the request that died with NOBODY answering — offerCount is 0, it is
      // in the `where` twice — so every provider who paid 1₾ to open the
      // client's contact here paid for a lead that led nowhere. That case is
      // the single loudest grievance against the lead-mills this product is
      // trying not to be, and the answer is not an appeals form: it is that
      // the money comes back on its own, from the same sweep that noticed.
      //
      // Refunding AFTER the claim means it happens once — a second tick finds
      // the row already CLOSED and never reaches here — and `refundDeadContacts`
      // is idempotent by its own unique index anyway, so the belt has a brace.
      out.contactsRefunded += await refundDeadRequest(r.id, topicLabel(r.topic))

      if (!r.email) continue
      const mail = await requestClosedNoOffersClientEmail({
        publicRef: r.publicRef,
        topicLabel: topicLabel(r.topic),
      })
      try { await sendMail({ key: 'request.closedNoOffers.client', to: r.email, ...mail }) } catch { /* best-effort */ }
    }

    const oldMatched = await prisma.serviceRequest.updateMany({
      where: {
        status: 'MATCHED',
        updatedAt: { lte: new Date(now - MATCHED_CLOSE_DAYS * 86_400_000) },
      },
      data: { status: 'CLOSED' },
    })
    out.autoClosed = staleClosed + oldMatched.count
  } catch { /* one job's failure is not the tick's */ }

  // ── 1b. Refunds that did not land the first time ────────────────────────
  // ⚠️ THE PROMISE NEEDS A SECOND CHANCE, BECAUSE ITS FIRST ONE IS A SINGLE
  // MOMENT. Everything above refunds AT THE INSTANT a request dies, and a row
  // is closed exactly once — so a refund lost to a dropped connection, a
  // timeout, or a mail that threw is lost for good, with nobody told. That is
  // the failure mode this whole feature exists to prevent, arriving through
  // the back door.
  //
  // Cheap because it asks the LEDGER, not the requests: two queries find every
  // contact ever bought on a request that has since died without being paid
  // back. `refundDeadContacts` is idempotent, so a tick that finds nothing
  // costs two indexed reads and writes nothing.
  try {
    out.contactsRefunded += await sweepDeadContactRefunds()
  } catch { /* one job's failure is not the tick's */ }

  // ── 1c. The 48-hour promise on a contact the client never answered ──────
  // Counted into the same total: from the operator's side both are „a paid
  // lead that came to nothing, given back", and splitting the number would
  // make the dashboard describe the implementation rather than the promise.
  try {
    out.contactsRefunded += await sweepSilentContacts(now)
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
      const mail = await requestVerifiedProviderEmail({
        topicLabel: topicLabel(r.topic),
        kindLabel: KIND[kind].label,
        budgetLabel: budgetLabel(kind, r.budgetMin, r.budgetMax),
        timingLabel: timingLabel(kind, r.timing),
        requestId: r.id,
      })
      const smsText = await verifiedRequestSms(topicLabel(r.topic))
      for (const p of providers) {
        // Null for a phone-registered provider — see the same guard in notifyProviders.
        if (p.email) {
          try { await sendMail({ key: 'request.verified.provider', to: p.email, ...mail }) } catch { /* best-effort */ }
        }
        if (p.phone) {
          try { await sendSms({ key: 'request.verified.provider', to: p.phone, text: smsText }) } catch { /* best-effort */ }
        }
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
      const mail = await offerArrivedClientEmail({
        publicRef: r.publicRef,
        topicLabel: topicLabel(r.topic),
        priceLabel: `${r.offerCount} შეთავაზება`,
        providerName: 'ექსპერტები',
        offerCount: r.offerCount,
      })
      try { await sendMail({ key: 'request.offerDigest.client', to: r.email, ...mail }); out.clientNudges++ } catch { /* best-effort */ }
    }
  } catch { /* … */ }

  return out
}

/** Re-exported so the cron's JSON and the tests read the same numbers. */
export { UNANSWERED_NUDGE_HOURS, CLIENT_NUDGE_HOURS, STALE_OPEN_DAYS, MATCHED_CLOSE_DAYS }
