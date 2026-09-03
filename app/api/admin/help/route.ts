import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireRoleApi } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { tbilisiDayKey } from '@/lib/tz'
import { parseIntParam } from '@/lib/apiParams'
import { HELP_EVENTS, ALL_TOPICS } from '@/lib/helpTopics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * WHAT THE HELP WIDGET LEARNED — the read side of the loop.
 *
 * The widget's stated job is to make itself unnecessary. That only happens if
 * somebody can see WHICH question gets asked WHERE, because „12 people opened
 * help on the booking sheet and asked about the price" is not a support metric,
 * it is an instruction: that answer belongs on that screen. This route turns
 * the three (now four) event rows into exactly that instruction.
 *
 * Four questions, four sections:
 *   1. which answer is read on which page  → move it onto the page
 *   2. what people TYPED that we could not answer → write those answers
 *   3. who gave up and went to a human, with what they had already read
 *   4. is any of it getting better week over week
 *
 * Shape notes, all copied from the existing insights route rather than invented:
 *  · `"Event"` is a boot-time DDL table with no Prisma model, so every read is
 *    `$queryRawUnsafe` with bound params and `::int` casts (raw counts come back
 *    as BigInt and do not serialise).
 *  · Every query is individually `.catch(() => [])`. A panel that renders four
 *    sections must degrade to three, never 500 — an analytics read is not worth
 *    an error page.
 *  · Event NAMES are imported, never typed. A renamed constant must break the
 *    build here, not silently return zero rows forever (which is precisely the
 *    failure this whole feature already survived once).
 */

const ALLOWED_DAYS = [7, 30, 90]
const DEFAULT_DAYS = 30

/** Resolve a topic id to its Georgian question for display. Ids are stable and
 *  the wording is not, so the join happens here rather than in the row. */
const QUESTION_BY_ID = new Map(ALL_TOPICS.map(t => [t.id, t.q]))

export async function GET(req: NextRequest) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response

  const raw = parseIntParam(req.nextUrl.searchParams.get('days'), { fallback: DEFAULT_DAYS, min: 1, max: 90 })
  const days = ALLOWED_DAYS.includes(raw) ? raw : DEFAULT_DAYS

  await ensureDbReady().catch(() => {})

  const [messages, byRoute, byQuestion, unanswered, tickets, series, totals] = await Promise.all([
    // 0. THE ONLY ROW WITH A PERSON WAITING. Open ones first, newest first;
    // handled ones are kept but pushed below, because „what did we already
    // answer" is occasionally needed and deleting it is not reversible.
    prisma.$queryRawUnsafe<{
      id: string; at: Date; route: string | null; question: string | null
      message: string; email: string | null; name: string | null; status: string
    }[]>(
      `SELECT "id","at","route","question","message","email","name","status"
         FROM "HelpMessage"
        ORDER BY ("status" = 'new') DESC, "at" DESC
        LIMIT 100`,
    ).catch(() => []),

    // 1a. Where help is opened at all — the denominator for everything else.
    prisma.$queryRawUnsafe<{ route: string; n: number }[]>(
      `SELECT COALESCE("props"->>'route', '?') AS route, COUNT(*)::int AS n
         FROM "Event"
        WHERE "name" = $1 AND "at" > now() - ($2 * interval '1 day')
        GROUP BY 1 ORDER BY n DESC LIMIT 25`,
      HELP_EVENTS.opened, days,
    ).catch(() => []),

    // 1b. THE MAIN TABLE: question × page. This is the row that tells you an
    // answer belongs on a screen instead of behind a circle.
    prisma.$queryRawUnsafe<{ q: string; route: string; n: number }[]>(
      `SELECT "props"->>'q' AS q, COALESCE("props"->>'route', '?') AS route, COUNT(*)::int AS n
         FROM "Event"
        WHERE "name" = $1 AND "at" > now() - ($2 * interval '1 day')
          AND "props"->>'q' IS NOT NULL
        GROUP BY 1, 2 ORDER BY n DESC LIMIT 100`,
      HELP_EVENTS.question, days,
    ).catch(() => []),

    // 2. What people typed that the local matcher had nothing for — the backlog
    // of answers to write. Grouped so ten people asking the same thing reads as
    // one urgent gap rather than ten rows.
    prisma.$queryRawUnsafe<{ text: string; route: string; n: number; last: Date }[]>(
      `SELECT "props"->>'text' AS text, COALESCE("props"->>'route', '?') AS route,
              COUNT(*)::int AS n, MAX("at") AS last
         FROM "Event"
        WHERE "name" = $1 AND "at" > now() - ($2 * interval '1 day')
          AND "props"->>'text' IS NOT NULL
        GROUP BY 1, 2 ORDER BY n DESC, last DESC LIMIT 60`,
      HELP_EVENTS.unanswered, days,
    ).catch(() => []),

    // 3. Gave up and went to a human. `seen` = how many answers they read
    // first: 0 means the suggestions looked irrelevant, 3 means the answers
    // were wrong. Different failures, different fixes — so it is not averaged
    // away here.
    prisma.$queryRawUnsafe<{ route: string; seen: number; n: number; last: Date }[]>(
      `SELECT COALESCE("props"->>'route', '?') AS route,
              COALESCE(("props"->>'seen')::int, 0) AS seen,
              COUNT(*)::int AS n, MAX("at") AS last
         FROM "Event"
        WHERE "name" = $1 AND "at" > now() - ($2 * interval '1 day')
        GROUP BY 1, 2 ORDER BY n DESC LIMIT 40`,
      HELP_EVENTS.unresolved, days,
    ).catch(() => []),

    // 4. Day series for the four names at once — one scan instead of four.
    prisma.$queryRawUnsafe<{ d: string; name: string; n: number }[]>(
      /* ⚠️ BUCKETED IN TBILISI, NOT IN UTC (2026-09-03). `date_trunc('day',
         "at")` runs in the DATABASE session's zone, which is UTC — so an event
         at 01:00 Tbilisi was counted on the previous day. It agreed with the
         axis below, which was making the same mistake, so the chart looked
         right and was a day out for every small hour. `AT TIME ZONE` shifts the
         timestamp into Tbilisi before the truncation; the axis uses
         `tbilisiDayKey` for the same shift, and the two must always move
         together or the keys stop matching and the series reads as zero. */
      `SELECT to_char(date_trunc('day', "at" AT TIME ZONE 'Asia/Tbilisi'), 'YYYY-MM-DD') AS d, "name", COUNT(*)::int AS n
         FROM "Event"
        WHERE "name" = ANY($1) AND "at" > now() - ($2 * interval '1 day')
        GROUP BY 1, 2 ORDER BY 1`,
      [HELP_EVENTS.opened, HELP_EVENTS.question, HELP_EVENTS.unanswered, HELP_EVENTS.unresolved],
      days,
    ).catch(() => []),

    prisma.$queryRawUnsafe<{ name: string; n: number }[]>(
      `SELECT "name", COUNT(*)::int AS n
         FROM "Event"
        WHERE "name" = ANY($1) AND "at" > now() - ($2 * interval '1 day')
        GROUP BY 1`,
      [HELP_EVENTS.opened, HELP_EVENTS.question, HELP_EVENTS.unanswered, HELP_EVENTS.unresolved],
      days,
    ).catch(() => []),
  ])

  const count = (n: string) => Number(totals.find(t => t.name === n)?.n ?? 0)
  const opened = count(HELP_EVENTS.opened)
  const answered = count(HELP_EVENTS.question)
  const failed = count(HELP_EVENTS.unanswered)

  // Dense day axis: a gap in the data is a day with no help traffic, and a
  // chart that silently omits it draws a trend that did not happen.
  const axis: string[] = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    // The Tbilisi day, matching the `AT TIME ZONE` in the query above — see
    // lib/tz → tbilisiDayKey for why `toISOString()` alone was a day out.
    axis.push(tbilisiDayKey(d))
  }
  const pick = (name: string) => {
    const m = new Map(series.filter(s => s.name === name).map(s => [s.d, Number(s.n)]))
    return axis.map(d => m.get(d) ?? 0)
  }

  return NextResponse.json({
    ok: true,
    days,
    messages: messages.map(m => ({
      id: m.id, at: m.at, route: m.route, question: m.question,
      message: m.message, email: m.email, name: m.name, status: m.status,
    })),
    openMessages: messages.filter(m => m.status === 'new').length,
    totals: {
      opened,
      answered,
      unanswered: failed,
      unresolved: count(HELP_EVENTS.unresolved),
      // The number the owner should actually watch: of everything typed, how
      // much we had no answer for. Null rather than 0 when nothing was typed —
      // „0% failure“ out of zero questions is a lie a dashboard tells easily.
      missShare: failed + answered > 0 ? failed / (failed + answered) : null,
    },
    byRoute: byRoute.map(r => ({ route: r.route, n: Number(r.n) })),
    byQuestion: byQuestion.map(r => ({
      id: r.q,
      // A row whose id no longer exists is a question that was renamed or
      // deleted — shown as the raw id rather than dropped, so the history stays
      // readable instead of silently shrinking.
      q: QUESTION_BY_ID.get(r.q) ?? r.q,
      known: QUESTION_BY_ID.has(r.q),
      route: r.route,
      n: Number(r.n),
    })),
    unanswered: unanswered.map(r => ({
      text: r.text, route: r.route, n: Number(r.n), last: r.last,
    })),
    tickets: tickets.map(r => ({
      route: r.route, seen: Number(r.seen), n: Number(r.n), last: r.last,
    })),
    series: {
      days: axis,
      opened: pick(HELP_EVENTS.opened),
      answered: pick(HELP_EVENTS.question),
      unanswered: pick(HELP_EVENTS.unanswered),
      unresolved: pick(HELP_EVENTS.unresolved),
    },
  })
}

/**
 * Close (or reopen) one incoming message.
 *
 * Status only — the message text is never edited from here. An admin panel that
 * can rewrite what somebody wrote is a panel whose record cannot be trusted
 * later, and the whole reason these are stored rather than emailed is that the
 * record is the queue.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireRoleApi('ADMIN')
  if (auth.response) return auth.response

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  }
  const b = body as { id?: unknown; status?: unknown }
  const id = typeof b.id === 'string' ? b.id : ''
  const status = b.status === 'done' || b.status === 'new' ? b.status : null
  if (!id || !status) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  await ensureDbReady().catch(() => {})
  try {
    const n = await prisma.$executeRawUnsafe(
      `UPDATE "HelpMessage" SET "status" = $1::text,
              "handledAt" = CASE WHEN $1::text = 'done' THEN now() ELSE NULL END
        WHERE "id" = $2::text`,
      status, id,
    )
    // 0 rows means the id does not exist — reported honestly rather than as a
    // cheerful `ok:true` that leaves a stale row on screen looking updated.
    if (!n) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  } catch (err) {
    console.error('[admin/help] status update failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ ok: false, error: 'FAILED' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
