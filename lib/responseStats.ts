// „პასუხობს 2 საათში" — MEASURED, or not printed.
//
// ⚠️ WHY THIS FILE EXISTS (2026-08-31). The owner's design canvas („mcodne.ge
// პროფილის რედიზაინი") puts three facts on a provider that the product had no
// way to answer: how fast they reply, how often they reply at all, and how long
// they have been here. The canvas fills them with 2 საათში / 18 of 20 / 2024,
// which are placeholders — and CLAUDE.md rule 6 („never invent a number") makes
// a placeholder unshippable. The owner's call, asked directly: „გავზომოთ —
// ნამდვილი ციფრები."
//
// ⚠️ `ServiceProfile.responseHours` AND `responseMedianMin` ALREADY EXIST AND
// ARE NOT USED. `responseMedianMin` / `responseSampleN` were added by a
// migration and NOTHING has ever written to them — measured 2026-08-31: the
// only mentions in the whole tree are the DDL that creates them and an admin
// route that nulls them. A column nobody fills is not a measurement, so this
// derives from the event journal instead, which is written by the code that
// actually happens. Nothing here writes those columns either; if a nightly job
// ever wants to cache this, that is where it goes.
//
// ⚠️ THE CLOCK STARTS WHEN THE PROVIDER COULD FIRST HAVE ANSWERED, and that is
// two different moments:
//   · an offer the provider WROTE — the row is created at the moment it is
//     sent, so the wait began when the request became answerable at all
//     (`request.verifiedAt`);
//   · an offer the CLIENT opened („Клиент предлагает вам заказ" — the INVITED
//     status) — the row already existed, created by the client, and the wait
//     began then.
// Both are read off the same two timestamps: an INVITED-born row is one whose
// SENT event lands materially after its own `createdAt`. Measuring both from
// `verifiedAt` would credit a provider for hours that were the client's.
//
// PURE-ISH: it touches prisma and nothing else — no react, no environment — so
// a page, an API route and a script can all call it.

import { prisma } from '@/lib/prisma'

/**
 * How many answered leads a median needs before it is a fact about somebody.
 *
 * Two is a coin toss with a decimal point. Three is still small, and it is
 * deliberately the SAME floor the site uses for a rating — the reader is being
 * asked to trust a number either way, and „we only say it once we have seen it
 * happen a few times" is the honest rule at both places.
 */
export const MIN_RESPONSE_SAMPLE = 3

/** A row is INVITED-born when its SENT event lands this far after creation.
 *  A minute of slack absorbs the write of the row and the write of its event
 *  landing in two statements. */
const INVITED_SLACK_MS = 60_000

export type ResponseStat = {
  /** Median minutes from „could answer" to „answered", or null under the
   *  sample floor. 🔒 null means the surface prints nothing. */
  medianMin: number | null
  /** How many answered leads the median is built from. */
  sampleN: number
  /** How many clients wrote to this provider directly. */
  invited: number
  /** …and how many of those they answered. `invited` 0 ⇒ nothing to print. */
  answered: number
}

export const EMPTY_RESPONSE_STAT: ResponseStat = {
  medianMin: null, sampleN: 0, invited: 0, answered: 0,
}

/** The key both halves of a provider identity fold onto — a ServiceProfile
 *  carries exactly one of the two (the schema's CHECK), and an offer is filed
 *  under the same one. */
export const providerKey = (p: { userId?: string | null; companyId?: string | null }): string | null =>
  p.userId ?? p.companyId ?? null

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

/**
 * One query, however many providers.
 *
 * Returns a map keyed by `providerKey`. A provider with no offers is simply
 * absent — the caller falls back to `EMPTY_RESPONSE_STAT`, which prints nothing
 * anywhere.
 */
export async function responseStatsFor(
  providers: readonly { userId?: string | null; companyId?: string | null }[],
): Promise<Map<string, ResponseStat>> {
  const userIds = providers.map(p => p.userId).filter((v): v is string => !!v)
  const companyIds = providers.map(p => p.companyId).filter((v): v is string => !!v)
  const out = new Map<string, ResponseStat>()
  if (userIds.length === 0 && companyIds.length === 0) return out

  const rows = await prisma.requestOffer.findMany({
    where: {
      OR: [
        ...(userIds.length ? [{ expertUserId: { in: userIds } }] : []),
        ...(companyIds.length ? [{ companyId: { in: companyIds } }] : []),
      ],
    },
    select: {
      expertUserId: true,
      companyId: true,
      createdAt: true,
      status: true,
      request: { select: { verifiedAt: true } },
      // The provider's own act of answering — see the header for why this is
      // the timestamp rather than `updatedAt`, which moves on every write.
      events: { where: { type: 'SENT' }, select: { at: true }, take: 1 },
    },
  })

  const acc = new Map<string, { waits: number[]; invited: number; answered: number }>()
  for (const r of rows) {
    const key = providerKey({ userId: r.expertUserId, companyId: r.companyId })
    if (!key) continue
    const bucket = acc.get(key) ?? { waits: [], invited: 0, answered: 0 }
    acc.set(key, bucket)

    const sentAt = r.events[0]?.at ?? null
    const bornInvited =
      r.status === 'INVITED' ||
      (sentAt !== null && sentAt.getTime() - r.createdAt.getTime() > INVITED_SLACK_MS)

    if (bornInvited) {
      bucket.invited += 1
      if (sentAt) bucket.answered += 1
    }
    if (!sentAt) continue

    const startedAt = bornInvited ? r.createdAt : (r.request.verifiedAt ?? r.createdAt)
    const min = Math.round((sentAt.getTime() - startedAt.getTime()) / 60_000)
    // A negative or zero wait is a clock artefact (an offer written against a
    // request verified a second later), not a superhuman provider.
    if (min > 0) bucket.waits.push(min)
  }

  for (const [key, b] of acc) {
    out.set(key, {
      medianMin: b.waits.length >= MIN_RESPONSE_SAMPLE ? median(b.waits) : null,
      sampleN: b.waits.length,
      invited: b.invited,
      answered: b.answered,
    })
  }
  return out
}

/**
 * „პასუხობს ~2 საათში" — the median as a sentence, or null.
 *
 * 🔒 THE TILDE IS NOT DECORATION. This is a median over a handful of leads, and
 * printing „პასუხობს 2 საათში" states a precision the sample does not carry.
 * Rounding is coarse on purpose for the same reason: minutes under an hour,
 * hours under a day, then days.
 */
export function replyLabel(stat: ResponseStat | undefined): string | null {
  const m = stat?.medianMin
  if (m === null || m === undefined) return null
  if (m < 60) return `პასუხობს ~${Math.max(5, Math.round(m / 5) * 5)} წუთში`
  if (m < 60 * 24) return `პასუხობს ~${Math.round(m / 60)} საათში`
  return `პასუხობს ~${Math.round(m / (60 * 24))} დღეში`
}

/** „უპასუხოდ არ ტოვებს — 18 / 20", or null while nobody has written to them. */
export function answeredLabel(stat: ResponseStat | undefined): string | null {
  if (!stat || stat.invited < MIN_RESPONSE_SAMPLE) return null
  return `${stat.answered} / ${stat.invited}`
}
