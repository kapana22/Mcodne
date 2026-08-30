import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoleApi } from '@/lib/auth'
import { ensureDbReady } from '@/lib/dbBoot'
import { EVENT_RETENTION_DAYS } from '@/lib/events'
import { REQUEST_FUNNEL_EVENTS } from '@/app/request/requestFunnelEvents'
import { requestsViewer, requestsNotFound } from '@/lib/requestsServer'

// Where a client stops in /request, before a request row exists.
//
// Failures and abandons are counted apart on purpose: one is a bug with an
// error code, the other is a design problem, and one number hides both.
//
// "Event" is boot-time DDL and may be empty or briefly absent, so every read
// falls back to [] rather than blanking the tab.
export const dynamic = 'force-dynamic'

const ALLOWED_DAYS = [7, 30, 90] as const
export type FunnelDays = (typeof ALLOWED_DAYS)[number]

// Flows driven by an ADMIN — the operator testing their own product. Measured
// 2026-08-05 on the booking funnel: 68 of 132 flows were staff, so unfiltered
// the panel reported the operator's own clicking as a conversion problem.
// A whole flow is excluded if ANY of its events carries an admin userId:
// attribution is opportunistic, so a flow is usually part-attributed.
// Anonymous flows are kept — they cannot be told from real visitors.
const STAFF_FLOWS = `
  SELECT DISTINCT e2."props"->>'flowId'
    FROM "Event" e2
    JOIN "User" u2 ON u2."id" = e2."userId"
   WHERE u2."role" = 'ADMIN' AND e2."props" ? 'flowId'`

const SPINE = [
  { key: 'opened',  event: REQUEST_FUNNEL_EVENTS.opened },
  { key: 'kind',    event: REQUEST_FUNNEL_EVENTS.kindChosen },
  { key: 'topic',   event: REQUEST_FUNNEL_EVENTS.topicChosen },
  { key: 'details', event: REQUEST_FUNNEL_EVENTS.detailsDone },
  { key: 'sent',    event: REQUEST_FUNNEL_EVENTS.sent },
] as const

type SpineRow = {
  attempts: number; opened: number; kind: number; topic: number
  details: number; sent: number; failed: number; abandoned: number
}

const EMPTY_SPINE: SpineRow = {
  attempts: 0, opened: 0, kind: 0, topic: 0, details: 0, sent: 0, failed: 0, abandoned: 0,
}

// Reach is cumulative (GREATEST over this step and every later one). Beacons
// are fired with keepalive over a network we don't control, and the order is
// not guaranteed — a deep link into /request?topic=… emits topic_chosen before
// kind_chosen. Sequential counting would print drop-offs that never happened.
const spineSql = `
  WITH f AS (
    SELECT "props"->>'flowId' AS flow,
           MAX(CASE WHEN "name" = $1 THEN 1 ELSE 0 END) AS s_open,
           MAX(CASE WHEN "name" = $2 THEN 1 ELSE 0 END) AS s_kind,
           MAX(CASE WHEN "name" = $3 THEN 1 ELSE 0 END) AS s_topic,
           MAX(CASE WHEN "name" = $4 THEN 1 ELSE 0 END) AS s_details,
           MAX(CASE WHEN "name" = $5 THEN 1 ELSE 0 END) AS s_sent,
           MAX(CASE WHEN "name" = $6 THEN 1 ELSE 0 END) AS s_failed
      FROM "Event"
     WHERE "name" IN ($1, $2, $3, $4, $5, $6)
       AND "at" >  now() - ($7 * interval '1 day')
       AND "at" <= now() - ($8 * interval '1 day')
       AND "props"->>'flowId' IS NOT NULL
       AND "props"->>'flowId' NOT IN (${STAFF_FLOWS})
     GROUP BY 1
  )
  SELECT COUNT(*)::int AS "attempts",
         COALESCE(SUM(GREATEST(s_open, s_kind, s_topic, s_details, s_sent)), 0)::int AS "opened",
         COALESCE(SUM(GREATEST(s_kind, s_topic, s_details, s_sent)), 0)::int         AS "kind",
         COALESCE(SUM(GREATEST(s_topic, s_details, s_sent)), 0)::int                 AS "topic",
         COALESCE(SUM(GREATEST(s_details, s_sent)), 0)::int                          AS "details",
         COALESCE(SUM(s_sent), 0)::int                                               AS "sent",
         COALESCE(SUM(CASE WHEN s_sent = 0 AND s_failed = 1 THEN 1 ELSE 0 END), 0)::int AS "failed",
         COALESCE(SUM(CASE WHEN s_sent = 0 AND s_failed = 0 THEN 1 ELSE 0 END), 0)::int AS "abandoned"
    FROM f`

const spineParams = (days: number, offset: number) => [
  SPINE[0].event, SPINE[1].event, SPINE[2].event, SPINE[3].event, SPINE[4].event,
  REQUEST_FUNNEL_EVENTS.failed,
  days + offset,
  offset,
]

// The last value of a prop across one flow — what the person ended on, not
// whichever string sorts higher. 'pending' is the placeholder the topic-first
// path posts before a kind exists; it is not an answer.
const lastProp = (key: string) =>
  `(ARRAY_AGG("props"->>'${key}' ORDER BY "at" DESC)
      FILTER (WHERE "props"->>'${key}' IS NOT NULL AND "props"->>'${key}' <> 'pending'))[1]`

export async function GET(req: Request) {
  // Feature before role, so the flag cannot be probed with a session.
  const viewer = await requestsViewer()
  if (!viewer.providerAllowed) return requestsNotFound()
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response

  const asked = Number(new URL(req.url).searchParams.get('days'))
  const days: FunnelDays = (ALLOWED_DAYS as readonly number[]).includes(asked)
    ? (asked as FunnelDays)
    : 30

  await ensureDbReady().catch(() => {})

  const [now, prev, byKind, byTopic, failureCodes, staff] = await Promise.all([
    prisma.$queryRawUnsafe<SpineRow[]>(spineSql, ...spineParams(days, 0)).catch(() => []),
    prisma.$queryRawUnsafe<SpineRow[]>(spineSql, ...spineParams(days, days)).catch(() => []),

    // Which of the four kinds leaks. Base is "chose a kind", not "opened":
    // request_opened carries no kind, so an attempt that left before the first
    // tap cannot appear here. That loss is the opened→kind gap on the spine.
    prisma
      .$queryRawUnsafe<{ kind: string; chose: number; details: number; sent: number }[]>(
        `WITH f AS (
           SELECT "props"->>'flowId' AS flow,
                  ${lastProp('kind')} AS kind,
                  MAX(CASE WHEN "name" IN ($3, $4) THEN 1 ELSE 0 END) AS s_details,
                  MAX(CASE WHEN "name" = $4 THEN 1 ELSE 0 END)        AS s_sent
             FROM "Event"
            WHERE "name" IN ($1, $2, $3, $4)
              AND "at" > now() - ($5 * interval '1 day')
              AND "props"->>'flowId' IS NOT NULL
              AND "props"->>'flowId' NOT IN (${STAFF_FLOWS})
            GROUP BY 1
         )
         SELECT kind, COUNT(*)::int AS "chose",
                COALESCE(SUM(s_details), 0)::int AS "details",
                COALESCE(SUM(s_sent), 0)::int    AS "sent"
           FROM f WHERE kind IS NOT NULL
          GROUP BY 1 ORDER BY "chose" DESC`,
        REQUEST_FUNNEL_EVENTS.kindChosen,
        REQUEST_FUNNEL_EVENTS.topicChosen,
        REQUEST_FUNNEL_EVENTS.detailsDone,
        REQUEST_FUNNEL_EVENTS.sent,
        days,
      )
      .catch(() => []),

    // Two steps only — there are dozens of topics and a full spine each is a
    // wall. "Chose it" against "sent it" names a subject people give up on.
    prisma
      .$queryRawUnsafe<{ topic: string; chose: number; sent: number }[]>(
        `WITH f AS (
           SELECT "props"->>'flowId' AS flow,
                  ${lastProp('topic')} AS topic,
                  MAX(CASE WHEN "name" = $3 THEN 1 ELSE 0 END) AS s_sent
             FROM "Event"
            WHERE "name" IN ($1, $2, $3)
              AND "at" > now() - ($4 * interval '1 day')
              AND "props"->>'flowId' IS NOT NULL
              AND "props"->>'flowId' NOT IN (${STAFF_FLOWS})
            GROUP BY 1
         )
         SELECT topic, COUNT(*)::int AS "chose",
                COALESCE(SUM(s_sent), 0)::int AS "sent"
           FROM f WHERE topic IS NOT NULL
          GROUP BY 1 ORDER BY "chose" DESC, topic
          LIMIT 20`,
        REQUEST_FUNNEL_EVENTS.topicChosen,
        REQUEST_FUNNEL_EVENTS.detailsDone,
        REQUEST_FUNNEL_EVENTS.sent,
        days,
      )
      .catch(() => []),

    // The server's own error code, one row per attempt.
    prisma
      .$queryRawUnsafe<{ code: string; n: number }[]>(
        `SELECT "props"->>'code' AS "code",
                COUNT(DISTINCT "props"->>'flowId')::int AS "n"
           FROM "Event"
          WHERE "name" = $1
            AND "at" > now() - ($2 * interval '1 day')
            AND "props"->>'code' IS NOT NULL
            AND "props"->>'flowId' NOT IN (${STAFF_FLOWS})
          GROUP BY 1 ORDER BY "n" DESC LIMIT 12`,
        REQUEST_FUNNEL_EVENTS.failed,
        days,
      )
      .catch(() => []),

    // Reported, not silently dropped: "0 attempts" and "0 attempts that were
    // not you" are different facts, and early on the second is the likely one.
    prisma
      .$queryRawUnsafe<{ n: number }[]>(
        `SELECT COUNT(DISTINCT e."props"->>'flowId')::int AS "n"
           FROM "Event" e
           JOIN "User" u ON u."id" = e."userId"
          WHERE u."role" = 'ADMIN'
            AND e."props" ? 'flowId'
            AND e."name" = ANY($1)
            AND e."at" > now() - ($2 * interval '1 day')`,
        [...SPINE.map(s => s.event), REQUEST_FUNNEL_EVENTS.failed],
        days,
      )
      .catch(() => []),
  ])

  const f = now[0] ?? EMPTY_SPINE
  const p = prev[0] ?? EMPTY_SPINE

  return NextResponse.json({
    ok: true,
    days,
    retentionDays: EVENT_RETENTION_DAYS,
    funnel: {
      attempts: f.attempts,
      steps: SPINE.map(s => ({ key: s.key, n: f[s.key as keyof SpineRow] as number })),
      outcomes: { failed: f.failed, abandoned: f.abandoned },
    },
    prev: { attempts: p.attempts, sent: p.sent },
    byKind,
    byTopic,
    failureCodes,
    staffFlows: staff[0]?.n ?? 0,
  })
}
