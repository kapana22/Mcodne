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
// KEYED BY SPACE ('client' | 'expert'): a dual-role user has a different inbox in
// each space, so a single shared cache would flash the other space's list when
// switching. Per-space entries keep each side's stale-while-revalidate correct.
const cachedThreads: Record<string, Thread[] | undefined> = {}

/* Left pane of the messages center — shared by the tutor and student sides.
   Fetches the threads-mode messages API on mount, every 20s while visible, on
   route change (returning from a thread clears its unread — the thread GET
   stamped readAt), and on the `mcodne:threads-refresh` window event that the
   thread pane fires after sends/receives. The API returns role-appropriate
   hrefs, so the only per-side difference is the empty-state copy. */
export function ConversationList({ empty }: { empty: EmptyCopy }) {
  const path = usePathname()
  // Which hat is this inbox showing? The student and tutor messages layouts each
  // render this list under their own route, so the path tells us the active
  // space — passed to the API so a dual-role user sees only that space's threads.
  const space = path.startsWith('/me') ? 'client' : 'expert'
  const [threads, setThreads] = useState<Thread[] | null>(cachedThreads[space] ?? null)
  const [err, setErr] = useState(false)
  const [query, setQuery] = useState('')
  const params = useParams<{ bookingId?: string; id?: string; userId?: string; offerId?: string }>()
  // Active row: the open booking thread (`b-<id>`), the open pair thread
  // (`u-<userId>`) or the open offer thread (`o-<offerId>`). The booking route
  // param is `bookingId` on the tutor side and `id` on the student side —
  // accept either. Same prefixes lib/inboxRows mints, so the highlight cannot
  // drift from the row ids.
  const bookingParam = params?.bookingId ?? params?.id
  const activeKey = params?.offerId
    ? `o-${params.offerId}`
    : params?.userId
      ? `u-${params.userId}`
      : bookingParam
        ? `b-${bookingParam}`
        : null

  useEffect(() => {
    let cancelled = false
    const load = () => {
      if (document.visibilityState === 'hidden') return
      fetch(`/api/messages?space=${space}`)
        .then(r => (r.ok ? r.json() : null))
        .then(j => {
          if (cancelled) return
          if (j?.ok && Array.isArray(j.threads)) { cachedThreads[space] = j.threads; setThreads(j.threads); setErr(false) }
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
  }, [path])

  // Unread conversations first, then most-recent-message within each group.
  const sorted = useMemo(() => {
    if (!threads) return []
    const q = query.trim().toLowerCase()
    const filtered = q
      ? threads.filter(t => (t.peerName ?? '').toLowerCase().includes(q) || t.topic.toLowerCase().includes(q))
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
          <div key={i} className="flex items-center gap-4 p-4">
            <Skeleton.Avatar size={48} />
            <div className="flex-1 min-w-0 space-y-2">
              <Skeleton.Line width={40} />
              <Skeleton.Line width={70} className="h-3" />
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
        <button
          type="button"
          onClick={() => { setErr(false); setThreads(null); window.dispatchEvent(new Event('mcodne:threads-refresh')) }}
          className="ml-2 font-display font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-2"
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
            decision. Only the WORDS differ between the client and expert sides. */}
        <EmptyState
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
      {(threads?.length ?? 0) > 6 && (
        <div className="p-3 border-b border-ink-100">
          <div className="relative">
            <Icon.search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="ძებნა…"
              className="w-full h-9 pl-9 pr-3 rounded-field border border-ink-200 text-small focus:outline-none"
              aria-label="მიმოწერების ძებნა"
            />
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-ink-100">
        {sorted.map(t => (
          <div key={t.id} className={activeKey === t.id ? 'bg-brand-50/50' : ''}>
            <ConversationRow
              href={t.href}
              name={t.peerName}
              avatarUrl={t.avatarUrl}
              topic={t.topic}
              lastBody={t.lastPreview}
              lastHasFile={t.lastHasFile}
              lastAt={t.lastAt ? new Date(t.lastAt) : null}
              lastFromMe={t.lastFromMe}
              unread={t.unread}
              now={now}
            />
          </div>
        ))}
        {sorted.length === 0 && (
          <div className="p-6 text-center text-small text-ink-500">ვერაფერი მოიძებნა.</div>
        )}
      </div>
    </>
  )
}
