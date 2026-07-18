'use client'
import { useEffect, useMemo, useState } from 'react'
import { useParams, usePathname } from 'next/navigation'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { ConversationRow } from '@/components/ConversationRow'
import { Skeleton } from '@/components/Skeleton'

type Thread = {
  // Stable row key across booking (`b-<id>`) and pre-booking pair (`u-<id>`)
  // threads — the two thread kinds share this list.
  key: string
  bookingId?: string
  pre?: boolean
  name: string | null
  avatarUrl?: string | null
  topic: string
  status: string
  preview: string
  lastFromMe: boolean
  lastHasFile: boolean
  at: string
  unreadCount: number
  href: string
}

/* Left pane of the messages center. Fetches the threads-mode messages API on
   mount, every 20s while visible, on route change (returning from a thread
   clears its unread — the thread GET stamped readAt), and on the
   `mcodne:threads-refresh` window event that the thread pane fires after
   sends/receives. */
export function ConversationList() {
  const [threads, setThreads] = useState<Thread[] | null>(null)
  const [err, setErr] = useState(false)
  const [query, setQuery] = useState('')
  const params = useParams<{ bookingId?: string; userId?: string }>()
  const path = usePathname()
  // Active row: the open booking thread (`b-<id>`) OR the open pair thread
  // (`u-<userId>` for /tutor/messages/u/[userId]).
  const activeKey = params?.userId
    ? `u-${params.userId}`
    : params?.bookingId
      ? `b-${params.bookingId}`
      : null

  useEffect(() => {
    let cancelled = false
    const load = () => {
      if (document.visibilityState === 'hidden') return
      fetch('/api/messages')
        .then(r => (r.ok ? r.json() : null))
        .then(j => {
          if (cancelled) return
          if (j?.ok && Array.isArray(j.threads)) { setThreads(j.threads); setErr(false) }
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
      ? threads.filter(t => (t.name ?? '').toLowerCase().includes(q) || t.topic.toLowerCase().includes(q))
      : threads
    return [...filtered].sort((a, z) => {
      const ua = a.unreadCount > 0 ? 1 : 0
      const uz = z.unreadCount > 0 ? 1 : 0
      if (ua !== uz) return uz - ua
      return new Date(z.at).getTime() - new Date(a.at).getTime()
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
      <div className="p-5 text-center text-[13px] text-ink-500">
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
        <EmptyState
          icon={<Icon.chat className="w-6 h-6" />}
          title="ჯერ არ გაქვს მიმოწერა"
          description="როცა კლიენტი დაგიწერს, საუბარი აქ გამოჩნდება."
          cta={{ label: 'ჩემი ჯავშნები', href: '/tutor/bookings' }}
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
              placeholder="ძებნა სახელით ან თემით…"
              className="w-full h-9 pl-9 pr-3 rounded-field border border-ink-200 text-[13px] focus:outline-none"
              aria-label="მიმოწერების ძებნა"
            />
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-ink-100">
        {sorted.map(t => (
          <div key={t.key} className={activeKey === t.key ? 'bg-brand-50/50' : ''}>
            <ConversationRow
              href={t.href}
              name={t.name}
              avatarUrl={t.avatarUrl}
              topic={t.topic}
              lastBody={t.preview}
              lastHasFile={t.lastHasFile}
              lastAt={t.at ? new Date(t.at) : null}
              lastFromMe={t.lastFromMe}
              unread={t.unreadCount}
              now={now}
            />
          </div>
        ))}
        {sorted.length === 0 && (
          <div className="p-6 text-center text-[13px] text-ink-500">ვერაფერი მოიძებნა.</div>
        )}
      </div>
    </>
  )
}
