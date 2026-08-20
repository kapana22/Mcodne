'use client'
// The offers page, kept current by the room's stream.
//
// /request/[ref] is server-rendered — the offers, their contact rule
// (lib/requests → clientOfferView), the unread counts all come from the one
// query on the page — and stays that way. This component adds no data path: it
// joins the request's stream (lib/requestLiveClient) and, when the route says
// the request moved, asks the server for the page again through the ONE render
// path everything else uses (`router.refresh()`, the same call AutoRefresh and
// the accept button make). A new offer is on the screen within a tick of being
// written; OfferList draws it with its entrance.
//
// AutoRefresh stays beside it, on its 30-second timer — that is the fallback
// when there is no stream, and it costs nothing to keep. Nothing here decides
// what the page shows; it only decides WHEN to ask.

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { subscribeRequestLive } from '@/lib/requestLiveClient'

export function LiveRefresh({ publicRef }: { publicRef: string }) {
  const router = useRouter()
  // The route opens with a catch-up — one `status` and one `messages` event
  // describing what the page already shows. Those two are skipped; everything
  // after them is news. (On a reconnect the catch-up is NOT skipped: the page
  // may have missed something while the socket was down, and one extra render
  // is the cheap side of that.)
  const seen = useRef({ status: false, messages: false })
  // Two events can land in the same tick (an offer that also opens a thread);
  // one render answers both.
  const pending = useRef<number | null>(null)
  const refresh = () => {
    if (pending.current !== null) return
    pending.current = window.setTimeout(() => { pending.current = null; router.refresh() }, 50)
  }
  useEffect(() => {
    const off = subscribeRequestLive(publicRef, {
      onStatus: () => {
        if (!seen.current.status) { seen.current.status = true; return }
        refresh()
      },
      // A message on a collapsed thread changes its unread badge, which is
      // server-rendered; the open panes refetch on their own as well.
      onMessages: () => {
        if (!seen.current.messages) { seen.current.messages = true; return }
        refresh()
      },
    })
    return () => {
      off()
      if (pending.current !== null) window.clearTimeout(pending.current)
    }
    // `refresh` closes over the stable router only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicRef, router])
  return null
}
