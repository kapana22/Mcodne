'use client'
import { useEffect, useState } from 'react'
import { Container } from '@/components/Container'
import Link from 'next/link'
import { Icon } from '@/components/Icon'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { useToast } from '@/components/ToastProvider'
import { homeForRole } from '@/lib/roleHome'
import { fmtKaDate, fmtKaTime } from '@/lib/kaDate'
import { Eyebrow } from '@/components/Eyebrow'

type Item = {
  id: string
  title: string
  body: string | null
  href: string | null
  type: string
  readAt: string | null
  createdAt: string
}

const dayKey = (iso: string) => {
  const d = new Date(iso)
  const today = new Date(); today.setHours(0,0,0,0)
  const yest  = new Date(today); yest.setDate(yest.getDate() - 1)
  const day = new Date(d); day.setHours(0,0,0,0)
  if (day.getTime() === today.getTime()) return 'დღეს'
  if (day.getTime() === yest.getTime()) return 'გუშინ'
  // "24 ივლისი 2026" — shared Georgian month names (lib/kaDate).
  return fmtKaDate(d, { month: 'long', year: true })
}

const timeShort = (iso: string) => fmtKaTime(new Date(iso))

const TYPE_LABEL: Record<string, { l: string; cls: string }> = {
  BOOKING_CREATED:    { l: 'ჯავშანი',      cls: 'bg-brand-50 text-brand-700 border-brand-200' },
  BOOKING_CANCELED:   { l: 'გაუქმება',     cls: 'bg-danger-50 text-danger-700 border-danger-200' },
  MESSAGE_NEW:        { l: 'შეტყობინება',  cls: 'bg-ink-75 text-ink-700 border-ink-200' },
  REVIEW_NEW:         { l: 'შეფასება',     cls: 'bg-warning-50 text-warning-700 border-warning-200' },
  APPLICATION_STATUS: { l: 'განაცხადი',    cls: 'bg-success-50 text-success-700 border-success-200' },
  BOOKING_REMINDER:   { l: 'შეხსენება',    cls: 'bg-brand-50 text-brand-700 border-brand-200' },
  APPLICATION_NEW:    { l: 'განაცხადი',    cls: 'bg-ink-75 text-ink-700 border-ink-200' },
  PAYOUT:             { l: 'ანგარიშსწორება', cls: 'bg-brand-50 text-brand-700 border-brand-200' },
  ADMIN_BROADCAST:    { l: 'გუნდიდან',     cls: 'bg-ink-100 text-ink-700 border-ink-200' },
  GENERIC:            { l: 'შეტყობინება',  cls: 'bg-ink-50 text-ink-700 border-ink-200' },
}

export default function NotificationsPage() {
  const { toast } = useToast()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  // Role drives the header's home link — this page is shared across roles.
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => setRole(d?.user?.role ?? null))
      .catch(() => {})
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/notifications?limit=100${filter === 'unread' ? '&onlyUnread=1' : ''}`)
      if (res.status === 401) { window.location.href = '/signin?redirect=/notifications'; return }
      if (!res.ok) return
      // Anonymous hits get a 307 → fetch follows it to /signin and returns its
      // HTML with 200, so res.ok can't catch it — json() would throw. Treat an
      // unparsable body as "not signed in" and route to signin.
      const d = await res.json().catch(() => null)
      if (!d) { window.location.href = '/signin?redirect=/notifications'; return }
      setItems(d.items ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filter])

  // Cross-tab bump so bottom nav + avatar dot in other tabs re-poll and
  // clear their unread state without a full reload.
  const pingCrossTab = () => {
    try { localStorage.setItem('mcodne:notif-check', String(Date.now())) } catch {}
  }

  const markOne = async (id: string) => {
    // On the „წაუკითხავი" filter a just-read item no longer belongs in the
    // list — drop it immediately instead of leaving it until the next load.
    setItems(prev => filter === 'unread'
      ? prev.filter(n => n.id !== id)
      : prev.map(n => n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n))
    await fetch('/api/notifications/read', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    }).catch(() => {})
    pingCrossTab()
  }

  const markAll = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/notifications/read', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      if (!res.ok) {
        toast('ვერ მოხერხდა — სცადეთ თავიდან', 'error')
        return
      }
      toast('ყველა შეტყობინება წაკითხულია', 'success')
      pingCrossTab()
      await load()
    } catch {
      toast('ქსელის შეცდომა', 'error')
    } finally { setBusy(false) }
  }

  const unread = items.filter(n => !n.readAt).length

  // Group by day
  const groups = items.reduce<Record<string, Item[]>>((acc, n) => {
    const k = dayKey(n.createdAt)
    if (!acc[k]) acc[k] = []
    acc[k].push(n)
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-ink-50/40">
      <header className="sticky top-0 z-40 bg-ink-50 lg:bg-ink-50/90 lg:backdrop-blur-md border-b border-ink-100">
        <Container size="content" className="h-16 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center" aria-label="მცოდნე">
            <img src="/logo.svg" alt="მცოდნე" className="h-6 w-auto object-contain" />
          </Link>
          <nav className="flex items-center gap-3 text-[13px] font-display font-semibold">
            <Link href={role ? homeForRole(role) : '/'} className="text-ink-700 hover:text-ink-900">მთავარი</Link>
            <Link href="/tutors" className="text-ink-700 hover:text-ink-900">ექსპერტები</Link>
          </nav>
        </Container>
      </header>

      <Container as="main" size="content" className="py-8 lg:py-12">
        <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
          <div>
            <Eyebrow tone="muted" className="mb-1">შეტყობინებები</Eyebrow>
            <h1 className="font-display text-[26px] sm:text-[32px] font-bold text-ink-900 tracking-tight leading-[1.05]">
              შეტყობინებები {unread > 0 && <span className="text-brand-600">({unread})</span>}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-btn border border-ink-200 bg-white overflow-hidden">
              <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')} className={`h-9 px-3 font-display text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400 ${filter === 'all' ? 'bg-brand-500 text-white' : 'text-ink-700 hover:bg-ink-50'}`}>ყველა</button>
              <button type="button" aria-pressed={filter === 'unread'} onClick={() => setFilter('unread')} className={`h-9 px-3 font-display text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400 ${filter === 'unread' ? 'bg-brand-500 text-white' : 'text-ink-700 hover:bg-ink-50'}`}>წაუკითხავი</button>
            </div>
            <button type="button" onClick={markAll} disabled={busy || unread === 0} className="h-9 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 disabled:opacity-50 disabled:cursor-not-allowed text-ink-700 font-display font-semibold text-[12px] inline-flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2">
              ყველა წაკითხულად
            </button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-card border border-ink-200 bg-white overflow-hidden divide-y divide-ink-100" aria-busy="true" aria-label="იტვირთება">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-4 flex items-start gap-3 min-h-[92px]">
                <Skeleton className="h-2 w-2 mt-1.5 rounded-full" rounded="" />
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-16" rounded="rounded-pill" />
                    <Skeleton.Line width={45} />
                  </div>
                  <Skeleton.Line width={80} />
                  <Skeleton.Line width={60} />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Icon.bell className="w-6 h-6" />}
            title="ცარიელია"
            description="როცა რაიმე მოხდება — ჯავშანი, შეტყობინება, შეფასება — აქ ჩნდება."
          />
        ) : (
          <div className="space-y-6">
            {Object.entries(groups).map(([day, list]) => (
              <section key={day}>
                <Eyebrow tone="muted" className="mb-2">{day}</Eyebrow>
                <ul className="rounded-card border border-ink-200 bg-white overflow-hidden divide-y divide-ink-100">
                  {list.map(n => {
                    const meta = TYPE_LABEL[n.type] ?? TYPE_LABEL.GENERIC
                    const isUnread = !n.readAt
                    return (
                      <li key={n.id} className={isUnread ? 'bg-brand-50/30' : ''}>
                        <div className="p-4 flex items-start gap-3">
                          <span className={`shrink-0 mt-1 w-2 h-2 rounded-full ${isUnread ? 'bg-brand-500' : 'bg-transparent'}`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className={`inline-flex items-center h-5 px-1.5 rounded-pill border font-display text-[10px] font-bold uppercase tracking-[0.14em] shrink-0 ${meta.cls}`}>{meta.l}</span>
                              <span className={`font-display text-[13.5px] tracking-tight line-clamp-1 min-w-0 flex-1 ${isUnread ? 'font-bold text-ink-900' : 'font-medium text-ink-800'}`}>{n.title}</span>
                              <span className="ml-auto text-[10.5px] text-ink-400 font-mono tabular-nums shrink-0">{timeShort(n.createdAt)}</span>
                            </div>
                            {n.body && (
                              <div className="text-[12.5px] text-ink-600 mt-1 leading-[1.5] line-clamp-2">{n.body}</div>
                            )}
                            <div className="mt-2 flex items-center gap-3">
                              {n.href && (
                                <Link href={n.href} onClick={() => markOne(n.id)} className="font-display text-[12px] font-semibold text-brand-700 hover:text-brand-800 inline-flex items-center gap-1">
                                  ნახვა
                                </Link>
                              )}
                              {isUnread && (
                                <button type="button" onClick={() => markOne(n.id)} className="font-display text-[12px] font-semibold text-ink-500 hover:text-ink-900">
                                  წაკითხულად მონიშვნა
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Container>
    </div>
  )
}
