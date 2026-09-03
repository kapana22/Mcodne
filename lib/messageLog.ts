// The write half of MessageLog. Called by the SENDERS (lib/mailer, lib/sms) and
// by nobody else — a caller that logs its own send is a caller that can forget
// to, and then the table and the truth disagree about what happened.
//
// ⚠️ IT SWALLOWS EVERYTHING. A log row that cannot be written must never turn a
// delivered message into a failed request; the send already happened by the
// time we get here. A throw is reported with the `[server-error]` prefix and
// dropped, exactly as lib/notify does for the same reason.

import { prisma } from './prisma'
import type { Channel } from './outbound'

/** 'sent' the provider took it · 'failed' it did not · 'held' a rule here
 *  stopped it · 'logged' no transport was configured, so it only printed. */
export type MessageStatus = 'sent' | 'failed' | 'held' | 'logged'

/** The four statuses, derived from the sender's own `mode` so the two can never
 *  drift. `mode` is the exact branch; `status` is what an operator scans for. */
export function statusOf(ok: boolean, mode: string): MessageStatus {
  if (!ok) return 'failed'
  if (mode.startsWith('held')) return 'held'
  if (mode === 'off' || mode.startsWith('log')) return 'logged'
  return 'sent'
}

/**
 * ⚠️ `MESSAGE_LOG=off` EXISTS FOR THE TEST SUITE, and for nothing else.
 *
 * tests/mailer and tests/sms call the real senders — that is the point of them,
 * behaviour rather than source — and the gate runs with DATABASE_URL set,
 * because the schema stage needs it. So every `npm run check` was writing ~25
 * `test.manual` rows into the table an operator reads, which is noise in the
 * one place that has to be trustworthy at a glance.
 *
 * The switch is here rather than in the senders so that what is skipped is
 * exactly the WRITE: a test still exercises the real send path, the real
 * branches and the real result, and only the row is dropped.
 */
export async function logMessage(row: {
  channel: Channel
  key: string
  to: string
  ok: boolean
  mode: string
  detail?: string | null
  ref?: string | null
  parts?: number | null
}): Promise<void> {
  if (process.env.MESSAGE_LOG === 'off') return
  try {
    await prisma.messageLog.create({
      data: {
        channel: row.channel,
        key: row.key,
        to: row.to,
        status: statusOf(row.ok, row.mode),
        mode: row.mode,
        detail: row.detail ? row.detail.slice(0, 300) : null,
        ref: row.ref ?? null,
        parts: row.parts ?? null,
      },
    })
  } catch (err) {
    console.error('[server-error]', JSON.stringify({ scope: 'messageLog', key: row.key, err: String(err) }))
  }
}

/**
 * Ask sender.ge what became of the texts we sent and have not settled.
 *
 * Runs on the cleanup tick beside the other sweeps. Bounded per run for the
 * reason every job in that route is bounded: a timer that can do unbounded work
 * is a timer that can hold a connection until the whole route times out.
 *
 * ⚠️ ONLY ROWS THAT LEFT. `ref` is sender.ge's own id and exists only on a real
 * send, so a held, logged or failed row is never polled — there is nothing to
 * ask about. A row already `DELIVERED` is final and skipped for ever; a
 * `PENDING` or `UNDELIVERED` one is asked again, because a carrier can settle
 * late and „undelivered" is worth re-reading before somebody is chased about it.
 */
export async function refreshDeliveries(limit = 50): Promise<{ checked: number; settled: number }> {
  const { deliveryStatus, DELIVERY } = await import('./sms')
  let checked = 0
  let settled = 0
  try {
    const rows = await prisma.messageLog.findMany({
      where: {
        channel: 'sms',
        status: 'sent',
        ref: { not: null },
        OR: [{ delivery: null }, { delivery: { not: DELIVERY.DELIVERED } }],
        // Nothing older than a week: a report that has not arrived by then is
        // not going to, and the query would otherwise walk the whole table.
        createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, ref: true },
    })
    for (const r of rows) {
      if (!r.ref) continue
      checked++
      const st = await deliveryStatus(r.ref)
      if (st === null) continue
      await prisma.messageLog.update({
        where: { id: r.id },
        data: { delivery: st, deliveryAt: new Date() },
      })
      if (st === DELIVERY.DELIVERED || st === DELIVERY.UNDELIVERED) settled++
    }
  } catch (err) {
    console.error('[server-error]', JSON.stringify({ scope: 'refreshDeliveries', err: String(err) }))
  }
  return { checked, settled }
}
