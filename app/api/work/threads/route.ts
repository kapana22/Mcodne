// THE PROVIDER'S CONVERSATIONS — the left pane of /work/messages, as rows.
//
// ⚠️ IT REPLACES `/api/messages`, WHICH WAS DELETED WITH THE CONSULTATION
// PRODUCT (2026-08-24) — and for four days nothing replaced it. The list pane
// and the header's unread badge both kept fetching the old address, got a 404
// on every poll, and rendered as a permanent error and a permanent zero. The
// thread PANE was fine the whole time (it talks to /api/request-chat), so the
// break looked like „the inbox is empty" rather than like a 404, which is why
// it survived a deploy.
//
// The rows are built by lib/inboxRows → offerInboxRows, the same function
// /api/work/nav-badges already counts for its badge. ONE source, so the number
// on the pill and the number of bold rows in the list cannot disagree — that
// was the whole argument for the old endpoint owning the count too.
//
// ⚠️ ONE SPACE, NOT TWO. The old route took `?space=client|expert` because a
// dual-role user held two inboxes: threads on their own profile, and threads
// they had started as somebody else's client. A client has no inbox any more —
// they talk to us through /request/<ref>, which is addressed by reference and
// needs no account — so there is one list and it belongs to the supply side.
//
// ⚠️ NOTHING HERE UNMASKS ANYBODY. `offerInboxRow` masks the client's name at
// the point the row is BUILT (lib/inboxRows → offerPeerName), because a
// provider who has not been chosen may not learn who they are bidding against
// or who the client is. This route must never select the request's phone or
// email to „enrich" a row: the offers screen is where a chosen provider finds
// out who to call.

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { ensureDbReady } from '@/lib/dbBoot'
import { requestAccessOf } from '@/lib/requestsServer'
import { offerInboxRows, inboxUnreadTotal } from '@/lib/inboxRows'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  // 401 rather than 404: this address is only ever fetched by a signed-in
  // workspace screen, so there is nothing to conceal from a stranger — and the
  // list pane needs to tell „not signed in" apart from „failed", which a 404
  // would not let it do.
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

  await ensureDbReady()
  // Returns [] for anybody the allowlist does not admit — an ADMIN browsing the
  // workspace included — so there is no second gate to keep in step here.
  const rows = await offerInboxRows(await requestAccessOf(user.id))

  return NextResponse.json({ ok: true, threads: rows, unreadCount: inboxUnreadTotal(rows) })
}
