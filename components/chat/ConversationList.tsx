'use client'
import { useEffect, useMemo, useState } from 'react'
import { useParams, usePathname } from 'next/navigation'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { ConversationRow } from '@/components/ConversationRow'
import { Skeleton } from '@/components/Skeleton'

// ONE LIST, EVERY KIND (2026-08-19). The rows arrive already built as
// lib/inboxRows → InboxRow: booking threads, pre-booking pair threads and — on
// the supply side — the offer conversations that used to be embedded one per
// row on /work/offers. The list does not know how a row was made; in
// particular it never masks anything, because an OFFER row's `peerName` was
// masked where it was BUILT. Type-only import: the module's loader half touches
// prisma and must never reach the browser bundle.
//
// ⚠️ AND ONE LIST, BOTH ROOMS, SINCE 2026-08-31. The client's inbox came back
// with the owner's „Messages" artboard, and it is this component pointed at
// `/api/me/threads`. Same rows, same sort, same search, same empty state — only
// the words in the empty state and the address it polls differ, both passed in.
// Two lists is how the booking inbox and the offer accordion drifted apart in
// the first place.
import type { InboxRow } from '@/lib/inboxRows'

type Thread = InboxRow

type EmptyCopy = {
  title: string
  description: string
  cta: { label: string; href: string }
}

// Last-known threads, cached at module scope (stale-while-revalidate — the same
// pattern as lib/me.ts). Opening a thread re-mounts this list (the parent
// force-dynamic segment re-creates the client subtree on navigation), which
// would otherwise flash the skeleton every time. Seeding state from this cache
// shows the previous list instantly while the fetch refreshes it in the
// background. User-scoped API + single-session, so cross-user leakage isn't a
// concern (a role swap self-corrects on the next fetch).
//
// ⚠️ KEYED BY ENDPOINT AGAIN (2026-08-31). It was keyed by SPACE until
// 2026-08-24 and then flattened to one entry, on the reasoning that „a client
// has no inbox now". They have one again — /me/messages, from the owner's
// Messages artboard — so a person who sells AND buys holds two lists once more,
// and one shared slot is exactly the bug that was described here before: the
// wrong inbox flashes for a beat when they switch rooms. The endpoint IS the
// room, so it is the key.
const cachedThreads = new Map<string, Thread[]>()

/* Left pane of the messages center. Fetches /api/work/threads on mount, every
   20s while visible, on route change (returning from a thread clears its unread
   — the thread GET stamped readByProviderAt), and on the
   `mcodne:threads-refresh` window event the thread pane fires after
   sends/receives. The empty-state copy is the caller's. */
// ⚠️ `initialThreads` IS WHY THE FIRST PAINT IS RIGHT (2026-08-30). The list
// used to open from `cachedThreads ?? null` — a module-scope cache that makes a
// SECOND visit instant and does nothing for the first, which is the visit that
// matters. The server layout now reads the same rows from the same helper and
// hands them over; the poll below stays, because a message can arrive while the
// page is open.
export function ConversationList({ empty, initialThreads, endpoint = '/api/work/threads' }: {
  empty: EmptyCopy
  initialThreads?: Thread[]
  /**
   * Where the poll reads its rows — the ROOM, in one value.
   *
   * `/api/work/threads` is the provider's (the default: this list was written
   * for it and is mounted there four times over). `/api/me/threads` is the
   * client's. Both answer the identical envelope over the identical row type,
   * which is the whole reason there is one list component and not two.
   */
  endpoint?: string
}) {
  const path = usePathname()
  const [threads, setThreads] = useState<Thread[] | null>(initialThreads ?? cachedThreads.get(endpoint) ?? null)
  const [err, setErr] = useState(false)
  const [query, setQuery] = useState('')
  const params = useParams<{ offerId?: string }>()
  // Active row: the open offer thread, `o-<offerId>` — the same prefix
  // lib/inboxRows mints, so the highlight cannot drift from the row ids.
  //
  // ⚠️ IT MATCHED THREE SHAPES UNTIL 2026-08-24 — `b-<id>` for a booking thread
  // (whose route param was `bookingId` on the provider side and `id` on the
  // client side, so both were accepted) and `u-<userId>` for a PRE-booking pair
  // thread, two people talking before anything was booked. Neither kind of row
  // can be built any more; one address, one prefix.
  //
  // ⚠️ AND ONE PARAM NAME ACROSS BOTH ROOMS: /work/messages/o/[offerId] and
  // /me/messages/o/[offerId] are deliberately spelled the same, so this line
  // needs no branch on which room it is standing in.
  const activeKey = params?.offerId ? `o-${params.offerId}` : null

  useEffect(() => {
    let cancelled = false
    const load = () => {
      if (document.visibilityState === 'hidden') return
      // ⚠️ THE ADDRESS IS THE `endpoint` PROP, defaulting to
      // `/api/work/threads` — and that default was `/api/messages?space=…`
      // until 2026-08-24. That route went with the booking inbox and nothing
      // replaced it for four days: every poll 404'd, so this pane showed its
      // error state for good while the thread pane beside it worked perfectly.
      /* ⚠️ `no-store`, AND `force-dynamic` ON THE ROUTE IS NOT THE SAME THING
         (2026-09-01). That governs Next's server cache; this is the BROWSER's.
         Neither threads route sends a Cache-Control, so a re-poll on the same
         URL could be answered from memory — send a message and the transcript
         showed it while the row beside it kept the old preview, time and dot. */
      fetch(endpoint, { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .then(j => {
          if (cancelled) return
          if (j?.ok && Array.isArray(j.threads)) { cachedThreads.set(endpoint, j.threads); setThreads(j.threads); setErr(false) }
          else if (!j) setErr(true)
        })
        .catch(() => { if (!cancelled && threads === null) setErr(true) })
    }
    load()
    const t = setInterval(load, 20_000)
    const onRefresh = () => load()
    window.addEventListener('mcodne:threads-refresh', onRefresh)
    return () => {
      cancelled = true
      clearInterval(t)
      window.removeEventListener('mcodne:threads-refresh', onRefresh)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, endpoint])

  // Unread conversations first, then most-recent-message within each group.
  const sorted = useMemo(() => {
    if (!threads) return []
    const q = query.trim().toLowerCase()
    const filtered = q
      ? threads.filter(t =>
          (t.peerName ?? '').toLowerCase().includes(q) ||
          t.topic.toLowerCase().includes(q) ||
          // The chip is what the row is titled by on screen since the artboard
          // landed, so the figure in it has to be searchable too — „60" is how
          // somebody looks for the job they agreed 60₾ for.
          (t.price ?? '').toLowerCase().includes(q))
      : threads
    // ⚠️ `lastAt` is when somebody last SPOKE — never a booking's updatedAt,
    // which messages do not bump and which therefore buries a live thread at
    // the bottom of the inbox (the invariant tests/regression-invariants pins).
    return [...filtered].sort((a, z) => {
      const ua = a.unread > 0 ? 1 : 0
      const uz = z.unread > 0 ? 1 : 0
      if (ua !== uz) return uz - ua
      return new Date(z.lastAt).getTime() - new Date(a.lastAt).getTime()
    })
  }, [threads, query])

  const now = new Date()

  if (threads === null && !err) {
    return (
      <div className="divide-y divide-ink-100" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          // 40px, and three lines: the same shape ConversationRow settles into,
          // so the list does not resize under the reader when the rows land.
          <div key={i} className="flex items-start gap-3 p-4">
            <Skeleton.Avatar size={40} />
            <div className="flex-1 min-w-0 space-y-2">
              <Skeleton.Line width={40} />
              <Skeleton.Line width={70} className="h-3" />
              <Skeleton.Line width={35} className="h-3" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (err && threads === null) {
    return (
      <div className="p-5 text-center text-small text-ink-500">
        ჩატვირთვა ვერ მოხერხდა.
        {/* ≥40px, like every other control on this pane: it is the only way out
            of the error state and it was a 16px line of text. */}
        <button
          type="button"
          onClick={() => { setErr(false); setThreads(null); window.dispatchEvent(new Event('mcodne:threads-refresh')) }}
          className="ml-2 -my-2 px-2 min-h-[40px] inline-flex items-center rounded-btn font-display font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-400"
        >
          თავიდან
        </button>
      </div>
    )
  }

  if ((threads?.length ?? 0) === 0) {
    return (
      <div className="p-6 flex-1 flex items-center justify-center">
        {/* `illustration` is hardcoded, not a prop: this list is ALWAYS the
            message inbox, so which drawing belongs here is not the caller's
            decision. Only the WORDS differ between the client and expert sides.
            ⚠️ `inline`, NOT THE DEFAULT CARD (2026-09-01). The default variant
            draws a white dashed card — and this state is already inside one
            (InboxFrame's `bg-white rounded-card border`), so an empty inbox was
            a box outlined inside a box. `inline` is the primitive's own answer
            for „flush inside an existing panel". */}
        <EmptyState
          variant="inline"
          illustration="messages"
          title={empty.title}
          description={empty.description}
          cta={empty.cta}
        />
      </div>
    )
  }

  return (
    <>
      {/* ⚠️ ALWAYS, NOT PAST SIX ROWS (2026-08-31). The artboard puts the field
          in the pane's header unconditionally, and the old threshold was
          answering the wrong question: „is the list long" rather than „does the
          reader know where to look for a name". A 44px field is also the one
          control in this pane, so it is sized like one — the old h-9 was 36px,
          under this project's own tap floor. */}
      <div className="p-3.5 border-b border-ink-100 shrink-0">
        <div className="relative">
          <Icon.search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ძებნა"
            className="w-full h-11 pl-10 pr-3.5 rounded-field border border-ink-200 bg-ink-50 text-body text-ink-900 placeholder-ink-400 focus:border-brand-500 focus:bg-white outline-none transition-colors duration-fast"
            aria-label="მიმოწერების ძებნა"
          />
        </div>
      </div>
      {/* A real list, so a screen reader is told how many conversations there
          are before it starts reading names. The wrapper element was a bare
          `<div key=…>` that did nothing at all. */}
      <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-ink-100">
        {sorted.map(t => {
          // ⚠️ THE OPEN ROW'S DOT GOES OUT AT ONCE (2026-09-01). Reading IS the
          // receipt — /api/request-chat stamps it — but it stamps in Next's
          // `after()`, i.e. once the transcript has already been sent, while
          // this list's own reload fires on the same navigation. The two race,
          // and the loser is the reader: the row they are looking at kept its
          // unread dot for a whole poll interval. The row is open, the pane
          // beside it has fetched, so it IS read; saying otherwise is the
          // „badge nothing can clear" this file was written to end.
          //
          // Display only — `sorted` still ranks on the raw count, so the row
          // does not slide down the list while somebody is reading it.
          const unread = activeKey === t.id ? 0 : t.unread
          return (
            <li key={t.id}>
              <ConversationRow
                href={t.href}
                name={t.peerName}
                avatarUrl={t.avatarUrl}
                topic={t.topic}
                price={t.price}
                lastBody={t.lastPreview}
                lastHasFile={t.lastHasFile}
                lastAt={t.lastAt ? new Date(t.lastAt) : null}
                lastFromMe={t.lastFromMe}
                unread={unread}
                active={activeKey === t.id}
                now={now}
              />
            </li>
          )
        })}
        {sorted.length === 0 && (
          <li className="p-6 text-center text-small text-ink-500">ვერაფერი მოიძებნა.</li>
        )}
      </ul>
    </>
  )
}
