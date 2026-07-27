'use client'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Icon } from './Icon'
import { useNotifications, markAllNotificationsRead, markNotificationRead, type NotifItem } from '@/lib/notifications'

// Notification bell + dropdown panel.
// Notifications come from the shared lib/notifications store (ONE poller for the
// whole app — bell + user menu + bottom nav share it). Clicking a notification
// marks it read (optimistic, via the store) and navigates to its href.

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
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const router = useRouter()
  // Shared store — the poll, visibility gating and cross-tab sync all live in
  // lib/notifications now, so this component only reads + triggers mutations.
  const { items, unreadCount: unread } = useNotifications()

  // Close dropdown on outside click OR Escape (keyboard parity with UserMenu).
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus() }
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey) }
  }, [open])

  const markAllRead = async () => {
    if (unread === 0) return
    setLoading(true)
    try {
      await markAllNotificationsRead()
    } finally {
      setLoading(false)
    }
  }

  const clickItem = (n: NotifItem) => {
    // Mark this one read (optimistic, via the store), then navigate.
    // Client transition, not a full reload — the read POST is fire-and-forget
    // and now survives the navigation instead of racing an unload. The
    // explicit refresh() replaces what the reload used to give us for free:
    // fresh server data even when the href is the route we're already on.
    if (!n.readAt) markNotificationRead(n.id)
    setOpen(false)
    if (n.href) { router.push(n.href); router.refresh() }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={unread > 0 ? `შეტყობინებები — ${unread} წაუკითხავი` : 'შეტყობინებები'}
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
        /* Mobile: the bell sits mid-bar, so a right-0 anchored 340px panel
           would hang off the LEFT edge of a phone screen. Below `sm` the panel
           is fixed full-width just under the app bar (the sticky header is
           always at viewport top, so these coordinates hold whether the
           backdrop-blur header or the viewport is the containing block).
           From `sm` up it re-anchors to the bell as before. */
        <div className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[340px] bg-white border border-ink-200 rounded-card shadow-float z-50 overflow-hidden motion-safe:animate-scale-in origin-top sm:origin-top-right">
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
              <div className="py-10 text-center text-[13px] text-ink-500">შემოსული ცარიელია</div>
            ) : (
              <ul className="divide-y divide-ink-100">
                {items.map(n => {
                  const isUnread = !n.readAt
                  return (
                    <li key={n.id}>
                      {/* no-caps: rows are content (title + body sentences),
                          not button labels — the global button→mtavruli rule
                          made the whole inbox shout in caps. */}
                      <button
                        type="button"
                        onClick={() => clickItem(n)}
                        className={`no-caps relative w-full text-left px-4 py-3 hover:bg-ink-50 transition-colors flex items-start gap-2.5 ${isUnread ? 'bg-brand-50/40' : ''}`}
                      >
                        {/* Unread = left accent bar + bold title (same as
                            ConversationRow). No status dots — canon. */}
                        {isUnread && <span aria-hidden className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full bg-brand-500" />}
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
