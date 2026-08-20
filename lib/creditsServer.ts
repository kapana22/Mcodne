// The credit ledger's WRITES. The arithmetic and the vocabulary live in
// lib/credits.ts and are pure; this file is the only place that touches the
// table, so „how did this balance get here" has one answer.

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  CREDIT_TASKS, OFFER_COST_TETRI, BIO_MIN, earnedTasks,
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
  const [user, tutor, provider] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } }),
    prisma.tutorProfile.findUnique({
      where: { userId },
      select: {
        bio: true, professions: true, yearsExp: true,
        certificates: { select: { id: true }, take: 1 },
        consultations: { select: { id: true }, take: 1 },
      },
    }),
    prisma.serviceProfile.findUnique({
      where: { userId },
      select: { about: true, services: true, areas: true, priceList: true, photoUrl: true, workPhotos: true },
    }),
  ])
  const bio = (tutor?.bio ?? provider?.about ?? '').trim()

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
    hasProfessions: (tutor?.professions ?? []).length > 0 || (provider?.services ?? []).length > 0,
    hasExperience: (tutor?.yearsExp ?? 0) > 0 || (provider?.areas ?? []).length > 0,
    hasService: (tutor?.consultations.length ?? 0) > 0 || priced,
    hasCertificate: (tutor?.certificates.length ?? 0) > 0 || (provider?.workPhotos ?? []).length > 0,
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
export async function grantEarnedTasks(userId: string): Promise<{ key: CreditTaskKey; tetri: number }[]> {
  const facts = await profileFacts(userId)
  const earned = earnedTasks(facts)
  if (earned.length === 0) return []

  const already = await prisma.creditEntry.findMany({
    where: { userId, grantKey: { in: earned } },
    select: { grantKey: true },
  })
  const paid = new Set(already.map(r => r.grantKey))
  const fresh = CREDIT_TASKS.filter(t => (earned as string[]).includes(t.key) && !paid.has(t.key))
  if (fresh.length === 0) return []

  await prisma.creditEntry.createMany({
    data: fresh.map(t => ({
      userId,
      amountTetri: t.tetri,
      reason: t.key,
      grantKey: t.key,
    })),
    skipDuplicates: true,
  })
  return fresh.map(t => ({ key: t.key, tetri: t.tetri }))
}

/**
 * Charge for one sent offer.
 *
 * ⚠️ `grantKey` STAYS NULL, and that is what lets this repeat. The unique index
 * only constrains non-null keys; a spend is identified by `refId` (the offer),
 * which is indexed for reading but never unique — an offer is charged once
 * because it is only created once, inside the same transaction.
 *
 * Takes a transaction client so the charge and the offer are one write: an
 * offer that exists without its charge is a free lead, and a charge without its
 * offer is money taken for nothing.
 */
export async function chargeForOffer(
  // `Prisma.TransactionClient` and not a hand-written shape: the full client
  // satisfies it too, so the same function serves both the transactional call
  // and the best-effort one in app/api/provider/offers.
  tx: Prisma.TransactionClient,
  userId: string,
  offerId: string,
): Promise<void> {
  await tx.creditEntry.create({
    data: {
      userId,
      amountTetri: -OFFER_COST_TETRI,
      reason: 'OFFER_SENT',
      refId: offerId,
    },
  })
}
