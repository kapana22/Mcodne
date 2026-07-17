'use client'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { Icon } from './Icon'

// Notification bell + dropdown panel.
// Polls /api/notifications on mount + every 60s (cheap, ~30 rows returned).
// Clicking a notification marks it read and navigates to its href.

type NotifItem = {
  id: string
  title: string
  body: string | null
  href: string | null
  readAt: string | null
  createdAt: string
}

const KA_MONTHS_SHORT = ['იან.','თებ.','მარ.','აპრ.','მაი.','ივნ.','ივლ.','აგვ.','სექ.','ოქტ.','ნოე.','დეკ.']

const timeAgo = (iso: string): string => {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const diffMs = Date.now() - d.getTime()
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return 'ახლა'
  if (min < 60) return `${min} წთ`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} სთ`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day} დ.`
  return `${d.getDate()} ${KA_MONTHS_SHORT[d.getMonth()]}`
}

export function NotifBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotifItem[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  const load = async () => {
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const d = await res.json()
      setItems(d.items ?? [])
      setUnread(d.unreadCount ?? 0)
    } catch {}
  }

  useEffect(() => {
    load()
    // Poll every 60s so users see new notifications without a full page refresh.
    const t = setInterval(load, 60_000)
    // Cross-tab: refresh when another tab marks anything read.
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'mcodne:notif-check') load()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      clearInterval(t)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  // Close dropdown on outside click.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // Bump the cross-tab sync key so the BottomNav profile dot and UserMenu
  // avatar dot in other tabs re-poll and update their unread counts.
  const pingCrossTab = () => {
    try { localStorage.setItem('mcodne:notif-check', String(Date.now())) } catch {}
  }

  const markAllRead = async () => {
    if (unread === 0) return
    setLoading(true)
    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      setItems(prev => prev.map(n => n.readAt ? n : { ...n, readAt: new Date().toISOString() }))
      setUnread(0)
      pingCrossTab()
    } finally {
      setLoading(false)
    }
  }

  const clickItem = async (n: NotifItem) => {
    // Mark this one read (optimistic), then navigate.
    if (!n.readAt) {
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x))
      setUnread(u => Math.max(0, u - 1))
      fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [n.id] }),
      }).catch(() => {})
      pingCrossTab()
    }
    if (n.href) window.location.href = n.href
    else setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="შეტყობინებები"
        aria-expanded={open}
        className="relative w-10 h-10 rounded-btn text-ink-600 hover:text-ink-900 hover:bg-ink-100 inline-flex items-center justify-center transition-colors"
      >
        <Icon.bell className="w-[18px] h-[18px]" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-danger-500 text-white font-display text-[9.5px] font-bold tabular-nums inline-flex items-center justify-center ring-2 ring-white motion-safe:animate-scale-in">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[340px] max-w-[calc(100vw-32px)] bg-white border border-ink-200 rounded-card shadow-float z-50 overflow-hidden motion-safe:animate-scale-in origin-top-right">
          <div className="flex items-center justify-between px-4 py-3 border-b border-ink-100">
            <div className="font-display text-[13px] font-bold text-ink-900">შეტყობინებები</div>
            <button
              type="button"
              onClick={markAllRead}
              disabled={loading || unread === 0}
              className="text-[11.5px] font-display font-semibold text-brand-700 hover:text-brand-800 disabled:text-ink-400 disabled:cursor-default transition-colors"
            >
              ყველა წაკითხულად
            </button>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-ink-500">ცარიელი inbox</div>
            ) : (
              <ul className="divide-y divide-ink-100">
                {items.map(n => {
                  const isUnread = !n.readAt
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => clickItem(n)}
                        className={`w-full text-left px-4 py-3 hover:bg-ink-50 transition-colors flex items-start gap-2.5 ${isUnread ? 'bg-brand-50/40' : ''}`}
                      >
                        <span className={`shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full ${isUnread ? 'bg-brand-500' : 'bg-transparent'}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className={`font-display text-[13px] truncate ${isUnread ? 'font-bold text-ink-900' : 'font-medium text-ink-700'}`}>
                              {n.title}
                            </span>
                            <span className="text-[10.5px] text-ink-400 font-mono tabular-nums shrink-0">{timeAgo(n.createdAt)}</span>
                          </div>
                          {n.body && (
                            <div className="text-[12px] text-ink-600 mt-0.5 line-clamp-2">{n.body}</div>
                          )}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <div className="px-4 py-2.5 border-t border-ink-100 bg-ink-50/40">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="w-full h-9 rounded-btn font-display text-[12px] font-semibold text-ink-700 hover:bg-white inline-flex items-center justify-center gap-1.5 transition-colors"
            >
              ყველა შეტყობინება
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
