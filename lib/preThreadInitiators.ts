import { prisma } from '@/lib/prisma'

// Authoritative INITIATOR (= the client) per pre-booking partner for a user.
//
// A pre-booking pair thread (bookingId:null) belongs to the CLIENT's space, and
// the client is whoever sent the EARLIEST message. The inbox and nav-badge read
// paths otherwise infer this from "the oldest row within the 200-most-recent
// messages," which mis-identifies the initiator once a user has >200 recent
// pre-booking messages (an old thread's true first message falls out of the
// window) — and can then disagree with the POST path, which resolves the true
// first message. This computes it authoritatively for ALL partners in ONE query
// (Postgres DISTINCT ON → the min-createdAt row per partner), so every surface
// buckets a thread into the same space.
//
// Returns Map<partnerUserId, initiatorUserId>.
export async function preThreadInitiators(userId: string): Promise<Map<string, string>> {
  // `partner` is materialized in a subquery so DISTINCT ON / ORDER BY reference a
  // real column (Postgres won't take a CASE alias directly in DISTINCT ON).
  // DISTINCT ON (partner) + ORDER BY partner, createdAt ASC → the earliest
  // message per partner, whose sender is the initiator.
  const rows = await prisma.$queryRaw<{ partner: string; initiator: string }[]>`
    SELECT DISTINCT ON (t.partner) t.partner, t."fromId" AS initiator
    FROM (
      SELECT
        CASE WHEN "fromId" = ${userId} THEN "toId" ELSE "fromId" END AS partner,
        "fromId",
        "createdAt",
        "id"
      FROM "Message"
      WHERE "bookingId" IS NULL AND ("fromId" = ${userId} OR "toId" = ${userId})
    ) t
    -- id is the final tiebreaker so two messages with an identical createdAt
    -- (both directions at the same instant) resolve to a STABLE initiator rather
    -- than flipping between calls (which would refile the thread's space).
    ORDER BY t.partner, t."createdAt" ASC, t."id" ASC
  `
  return new Map(rows.map(r => [r.partner, r.initiator]))
}
