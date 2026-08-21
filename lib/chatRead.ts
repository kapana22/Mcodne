// „READ UP TO HERE" — the one rule behind the „წაკითხულია" line.
//
// Added 2026-08-21. Owner: „დამატე ნახვის ფუნქცია, რომ მომხმარებელმა ნახა
// მესიჯი." The database already knew — `Message.readAt` is stamped when the
// recipient opens the thread and has been paying for the inbox's unread badges
// since long before this — but the SENDER was never told anything.
//
// ⚠️ WHY A TIMESTAMP AND NOT A FLAG PER MESSAGE. The booking/pair thread polls
// INCREMENTALLY (`/api/messages?since=`), so a poll carries only rows created
// since the last one it saw. „They read what you sent an hour ago" is a change
// to an OLD row: no incremental poll can ever deliver it, and re-sending the
// whole thread to catch it would undo the payload cap that poll exists for. One
// aggregate — the newest `readAt` among the messages I sent — answers it in a
// value small enough to ride on every response.
//
// Pure and react-free on purpose: the component renders, this decides.

type ReadableMsg = { id: string; fromId: string; createdAt: string }

/**
 * The last message of MINE the other side has read, or null.
 *
 * `null` is the honest answer for „they are behind" and for „we cannot tell
 * yet" alike — the UI shows nothing in both cases rather than claiming somebody
 * has NOT read something, which is a fact this platform never actually holds.
 *
 * ⚠️ OPTIMISTIC ROWS ARE EXCLUDED BY ID (`tmp-`), not by trust in the clock. A
 * bubble that has not reached the server yet carries the BROWSER's time in
 * `createdAt`, and a browser running a few minutes fast would otherwise stamp
 * it older than the server's read mark and print a receipt for a message
 * nobody has received, let alone read.
 *
 * The comparison is `<=`: the mark is „everything up to this instant", and the
 * message that produced it must be included in its own receipt.
 */
export function lastReadMessageId(
  msgs: readonly ReadableMsg[],
  meId: string | null | undefined,
  peerReadAt: string | null | undefined,
): string | null {
  if (!meId || !peerReadAt) return null
  const cutoff = new Date(peerReadAt).getTime()
  if (Number.isNaN(cutoff)) return null
  let last: string | null = null
  for (const m of msgs) {
    if (m.fromId !== meId || m.id.startsWith('tmp-')) continue
    const at = new Date(m.createdAt).getTime()
    if (!Number.isNaN(at) && at <= cutoff) last = m.id
  }
  return last
}
