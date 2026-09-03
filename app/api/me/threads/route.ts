// THE CLIENT'S CONVERSATIONS — the left pane of /me/messages, as rows.
//
// The mirror of /api/work/threads, and deliberately its twin: same row type
// (lib/inboxRows → InboxRow), same envelope, same 401. What differs is the one
// query behind it — `request.userId = me` instead of „the offer is mine" — and
// which unread column counts. One list component polls both.
//
// ⚠️ THE CLIENT HAD NO INBOX BETWEEN 2026-08-24 AND 2026-08-31, and the note on
// the sibling route says why: the pair inbox went with the booking product, and
// a client „talks to us through /request/<ref>". That is still true for somebody
// with no account — the reference is their whole identity — but a SIGNED-IN
// client had three requests, four offers and no single place to read the
// conversations, only three separate reference pages to remember. The owner's
// Messages artboard draws that place; this is the data behind it.
//
// ⚠️ NOTHING HERE IS ADDRESSED BY REFERENCE. `publicRef` is a credential (25
// bits, and it opens a page carrying a phone number), so it is never a key this
// route accepts and never a field it returns: the session is the identity, and
// lib/inboxRows → clientInboxRows puts the ownership in the `where`.

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { ensureDbReady } from '@/lib/dbBoot'
import { clientInboxRows, inboxUnreadTotal } from '@/lib/inboxRows'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  // 401 rather than 404, exactly as the provider's route reasons: this address
  // is only ever fetched by a signed-in room, so there is nothing to conceal
  // from a stranger — and the list pane has to tell „not signed in" apart from
  // „failed", which a 404 would not let it do.
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

  await ensureDbReady()
  // Returns [] with the subsystem off, so there is no second gate to keep in
  // step here.
  const rows = await clientInboxRows(user.id)

  return NextResponse.json({ ok: true, threads: rows, unreadCount: inboxUnreadTotal(rows) })
}
