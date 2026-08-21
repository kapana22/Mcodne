'use client'
import { useEffect, useRef, useState } from 'react'
import { useScrollIntoResults } from '@/lib/useScrollIntoResults'
import { Container } from '@/components/Container'
import Link from 'next/link'
import { Icon } from '@/components/Icon'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { useToast } from '@/components/ToastProvider'
import { fmtKaDate, fmtKaTime } from '@/lib/kaDate'
import { Eyebrow } from '@/components/Eyebrow'
import { Logo } from '@/components/Logo'
import { NotifBell } from '@/components/NotifBell'
import { UserMenu } from '@/components/UserMenu'
import { homeForRole } from '@/lib/roleHome'
import { ROLE } from '@/lib/roles'

type Role = 'USER' | 'PROVIDER' | 'ADMIN'

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

// Badge canon (2026-07-19): hairline border + colored text, NO pastel fill.
// These chips all carried a `bg-*-50` wash, which turned a dense list into a
// field of pastel blocks. The type stays legible from its label plus the border/
// text hue — green for booking lifecycle, gold for ratings, red for a
// cancellation, neutral for everything conversational.
const TYPE_LABEL: Record<string, { l: string; cls: string }> = {
  BOOKING_CREATED:    { l: 'ჯავშანი',      cls: 'border-brand-200 text-brand-700' },
  BOOKING_CANCELED:   { l: 'გაუქმება',     cls: 'border-danger-200 text-danger-700' },
  BOOKING_COMPLETED:  { l: 'დასრულდა',     cls: 'border-success-200 text-success-700' },
  // Reschedule traffic (request, and the „უარყოფილია" answer) — neutral, not
  // danger: the session itself is untouched either way.
  RESCHEDULE_REQUEST: { l: 'გადადება',     cls: 'border-ink-200 text-ink-600' },
  MESSAGE_NEW:        { l: 'შეტყობინება',  cls: 'border-ink-200 text-ink-700' },
  REVIEW_NEW:         { l: 'შეფასება',     cls: 'border-warning-200 text-warning-700' },
  APPLICATION_STATUS: { l: 'განაცხადი',    cls: 'border-success-200 text-success-700' },
  BOOKING_REMINDER:   { l: 'შეხსენება',    cls: 'border-brand-200 text-brand-700' },
  APPLICATION_NEW:    { l: 'განაცხადი',    cls: 'border-ink-200 text-ink-700' },
  PAYOUT:             { l: 'ანგარიშსწორება', cls: 'border-brand-300 text-brand-800' },
  ADMIN_BROADCAST:    { l: 'გუნდიდან',     cls: 'border-ink-300 text-ink-800' },
  GENERIC:            { l: 'შეტყობინება',  cls: 'border-ink-200 text-ink-500' },
  // The requests subsystem (2026-08-19) — neutral like the conversational rows.
  REQUEST_NEW:        { l: 'მოთხოვნა',     cls: 'border-ink-200 text-ink-700' },
  REQUEST_INVITE:     { l: 'მოთხოვნა',     cls: 'border-ink-200 text-ink-700' },
  REQUEST_MESSAGE:    { l: 'შეტყობინება',  cls: 'border-ink-200 text-ink-700' },
  REQUEST_DONE:       { l: 'დასრულდა',     cls: 'border-success-200 text-success-700' },
}

export default function NotificationsPage() {
  const { toast } = useToast()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  // A failed load used to fall through to the „ცარიელია" empty state, so a 500
  // told the user they had no notifications. Distinct state, distinct copy.
  const [loadFailed, setLoadFailed] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  // „წაუკითხავი" can drop a long list to two rows — the reader must land on
  // them, not on the empty space where the old list used to be.
  const listRef = useRef<HTMLDivElement | null>(null)
  useScrollIntoResults(listRef, [filter])
  // This page is shared across roles — the authed top bar (bell + user menu)
  // needs the viewer's identity, so we hold name/avatar/role, not just role.
  const [me, setMe] = useState<{ name: string; avatar: string | null; role: Role } | null>(null)

  useEffect(() => {
    fetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const u = d?.user
        if (u?.role) setMe({ name: u.fullName ?? '', avatar: u.avatarUrl ?? null, role: u.role })
      })
      .catch(() => {})
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/notifications?limit=100${filter === 'unread' ? '&onlyUnread=1' : ''}`)
      if (res.status === 401) { window.location.href = '/signin?redirect=/notifications'; return }
      // A 5xx is NOT "you have nothing" — returning here left the empty state
      // rendering „ცარიელია", which is a lie about the user's account.
      if (!res.ok) { setLoadFailed(true); return }
      // Anonymous hits get a 307 → fetch follows it to /signin and returns its
      // HTML with 200, so res.ok can't catch it — json() would throw. Treat an
      // unparsable body as "not signed in" and route to signin.
      const d = await res.json().catch(() => null)
      if (!d) { window.location.href = '/signin?redirect=/notifications'; return }
      setItems(d.items ?? [])
      setLoadFailed(false)
    } catch {
      // Offline / dropped connection — same honest state as a 5xx.
      setLoadFailed(true)
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
    // Optimistic: keep the pre-mutation list so a failed POST can put the item
    // back instead of lying that it was read (it would resurrect on reload).
    const prevItems = items
    setItems(prev => filter === 'unread'
      ? prev.filter(n => n.id !== id)
      : prev.map(n => n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n))
    try {
      const res = await fetch('/api/notifications/read', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      })
      if (!res.ok) throw new Error('http ' + res.status)
      // Only a CONFIRMED write should bump other tabs to re-poll.
      pingCrossTab()
    } catch {
      setItems(prevItems)
      toast('ვერ მოხერხდა — სცადე თავიდან', 'error')
    }
  }

  const markAll = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/notifications/read', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      if (!res.ok) {
        toast('ვერ მოხერხდა — სცადე თავიდან', 'error')
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
      {/* Same authed workspace chrome the rest of the signed-in app uses:
          logo → „/“, saved (heart), notification bell, user menu. No sidebar on
          this standalone page, so the logo stays visible at every breakpoint. */}
      <header className="sticky top-0 z-chrome bg-white lg:bg-white/95 lg:backdrop-blur-md border-b border-ink-100">
        <Container size="content" className="h-14 lg:h-16 flex items-center justify-between gap-4">
          <div className="inline-flex items-center gap-1">
            {/* Way back INTO the workspace. Without it this page was a desktop
                dead end: above lg the BottomNav is hidden and the logo goes to
                the marketing home, so nothing led back to „ჩემი სივრცე".
                Same chevron pattern as /settings; it waits for /api/me so the
                role — and therefore the destination — is the real one. */}
            {me && (
              <Link
                href={homeForRole(me.role)}
                aria-label="უკან, ჩემს სივრცეში"
                className="w-10 h-10 -ml-2 rounded-btn inline-flex items-center justify-center text-ink-600 hover:text-ink-900 hover:bg-ink-100 transition-colors duration-fast"
              >
                <Icon.chevR className="w-4 h-4 rotate-180" />
              </Link>
            )}
            <Logo size="sm" href="/" />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {me?.role === ROLE.USER && (
            <Link
              href="/me/favorites"
              aria-label="შენახული ექსპერტები"
              className="w-10 h-10 rounded-btn inline-flex items-center justify-center text-ink-500 hover:text-ink-900 hover:bg-ink-100 transition-colors duration-fast"
            >
              <Icon.heart className="w-[18px] h-[18px]" />
            </Link>
            )}
            <NotifBell />
            {me && <UserMenu user={{ name: me.name, avatar: me.avatar }} role={me.role} />}
          </div>
        </Container>
      </header>

      <Container as="main" size="content" className="py-8 lg:py-12">
        <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
          <div>
            <Eyebrow tone="muted" className="mb-1">შეტყობინებები</Eyebrow>
            <h1 className="font-display text-h1 sm:text-display font-bold text-ink-900 tracking-tight leading-[1.05]">
              შეტყობინებები {unread > 0 && <span className="text-brand-600">({unread})</span>}
            </h1>
          </div>
          <div ref={listRef} className="flex items-center gap-2">
            <div className="inline-flex rounded-btn border border-ink-200 bg-white overflow-hidden">
              <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')} className={`h-10 sm:h-9 px-3 font-display text-meta font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400 ${filter === 'all' ? 'bg-brand-600 text-white' : 'text-ink-700 hover:bg-ink-50'}`}>ყველა</button>
              <button type="button" aria-pressed={filter === 'unread'} onClick={() => setFilter('unread')} className={`h-10 sm:h-9 px-3 font-display text-meta font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400 ${filter === 'unread' ? 'bg-brand-600 text-white' : 'text-ink-700 hover:bg-ink-50'}`}>წაუკითხავი</button>
            </div>
            <button type="button" onClick={markAll} disabled={busy || unread === 0} className="h-10 sm:h-9 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 disabled:opacity-50 disabled:cursor-not-allowed text-ink-700 font-display font-semibold text-meta inline-flex items-center gap-1.5 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2">
              ყველა წაკითხულად
            </button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-card border border-ink-200 bg-white overflow-hidden divide-y divide-ink-100" aria-busy="true" aria-label="იტვირთება">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-4 flex items-start gap-3 min-h-[92px]">
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
        ) : loadFailed ? (
          /* Load error ≠ empty inbox. Compact per canon: icon + one line + one
             action, neutral (not brand) so it never reads as a real result. */
          <div className="py-10 px-6 text-center rounded-card border border-ink-200 bg-white" role="alert">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-ink-100 text-ink-500 mb-3">
              <Icon.warn className="w-6 h-6" />
            </span>
            <div className="font-display text-body-lg font-semibold text-ink-800">შეტყობინებები ვერ ჩაიტვირთა</div>
            <p className="text-small text-ink-500 mt-1">დროებითი შეფერხებაა — სცადე თავიდან.</p>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => { setLoadFailed(false); void load() }}
                className="h-10 sm:h-9 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-700 font-display font-semibold text-meta inline-flex items-center transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
              >
                თავიდან ცდა
              </button>
            </div>
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
                      <li key={n.id} className={`relative ${isUnread ? 'bg-brand-50/30' : ''}`}>
                        {/* Unread = left accent bar + bold title, the same
                            treatment ConversationRow uses. No status dots. */}
                        {isUnread && <span aria-hidden className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full bg-brand-500" />}
                        <div className="p-4 flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className={`inline-flex items-center h-5 px-1.5 rounded-pill border bg-transparent font-display text-micro font-bold uppercase shrink-0 ${meta.cls}`}>{meta.l}</span>
                              <span className={`font-display text-body tracking-tight line-clamp-1 min-w-0 flex-1 ${isUnread ? 'font-bold text-ink-900' : 'font-medium text-ink-800'}`}>{n.title}</span>
                              <span className="ml-auto text-meta text-ink-400 font-mono tabular-nums shrink-0">{timeShort(n.createdAt)}</span>
                            </div>
                            {n.body && (
                              <div className="text-small text-ink-600 mt-1 line-clamp-2">{n.body}</div>
                            )}
                            <div className="mt-2 flex items-center gap-3">
                              {n.href && (
                                <Link href={n.href} onClick={() => markOne(n.id)} className="font-display text-meta font-semibold text-brand-700 hover:text-brand-800 inline-flex items-center gap-1">
                                  ნახვა
                                </Link>
                              )}
                              {isUnread && (
                                <button type="button" onClick={() => markOne(n.id)} className="font-display text-meta font-semibold text-ink-500 hover:text-ink-900">
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
