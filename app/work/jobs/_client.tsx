'use client'
// The one list, rendered. The ROW MODEL is lib/jobRows (pure, tested); this
// file is the screen around it — the three buckets, the day headers and the
// undated tail.
//
// ⚠️ EVERY ACTION ON THIS SCREEN WAS A BOOKING'S (2026-08-24). A booking had a
// lifecycle the provider drove from the list — accept, decline, cancel,
// complete, no-show — plus a video room and a confirm modal for the three
// destructive ones. An accepted quote has none of that: the „დასრულდა" button
// belongs to the CLIENT, and the provider's copy of it lives on /work/offers
// beside the message thread. So a row opens; it does not act. That was already
// true of half this list, and it is now true of all of it.

import { Suspense, useMemo } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Avatar } from '@/components/Avatar'
import { EmptyState } from '@/components/EmptyState'
import { Eyebrow } from '@/components/Eyebrow'
import { Icon } from '@/components/Icon'
import { TzNote } from '@/components/workspace/TzNote'
import { sessionDate, sessionTime } from '@/components/workspace/sessionTime'
import {
  buildJobRows, splitDated, jobDayKey, UNDATED_LABEL,
  type JobBucket, type JobRow, type QuoteJobInput,
} from '@/lib/jobRows'

// ⚠️ NOT A TAB BAR ANY MORE — the labels went with it (2026-08-29). What is
// left is the set of values `?tab=` may carry, kept so a legacy link is still
// recognised rather than silently ignored.
const BUCKETS: JobBucket[] = ['attention', 'active', 'history']

// Old links keep their intent: ?tab=PREPARING came from the dashboard and the
// notifications, ?tab=upcoming from the bookings list this page replaced.
const LEGACY_TAB: Record<string, JobBucket> = {
  upcoming: 'active',
  PREPARING: 'attention',
  LIVE: 'active',
  CONFIRMED: 'active',
  COMPLETED: 'history',
  CANCELED: 'history',
  ALL: 'attention',
}

// Grouped by the TBILISI day, because the row times are Tbilisi wall-clock —
// grouping on the viewer's midnight would file a 00:30 Tbilisi row under
// „ხვალ" and then print „00:30" next to it.
const dayLabel = (row: JobRow, now: Date) => {
  const key = jobDayKey(row)
  if (!key) return UNDATED_LABEL
  const days = (k: string) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) / 86_400_000
  const nowKey = jobDayKey({ ...row, when: now })
  const diff = days(key) - (nowKey ? days(nowKey) : 0)
  if (diff === 0) return 'დღეს'
  if (diff === 1) return 'ხვალ'
  return sessionDate((row.when as Date).toISOString(), { weekday: true })
}

type Props = { quotes: QuoteJobInput[] }

function JobsInner({ quotes }: Props) {
  const searchParams = useSearchParams()

  const now = Date.now()
  const nowDate = new Date()

  // ONE call builds every bucket, so the tab counters and the rows under them
  // can never come from two different sorts (lib/jobRows → buildJobRows).
  const buckets = useMemo(
    () => buildJobRows({ quotes }, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quotes],
  )

  const rawTab = searchParams?.get('tab') ?? null
  const fromUrl: JobBucket | null =
    rawTab && (BUCKETS.includes(rawTab as JobBucket) || LEGACY_TAB[rawTab])
      ? ((BUCKETS.includes(rawTab as JobBucket) ? rawTab : LEGACY_TAB[rawTab]) as JobBucket)
      : null
  // ⚠️ THE STAGE BAR DECIDES, AND THERE IS NO LOCAL TAB STATE ANY MORE
  // (2026-08-29). This held its own `useState` and wrote the URL back with
  // `history.replaceState`, because the three buttons above it were this page's
  // own. They are the workspace's now — „ხელში მაქვს" links here, „დასრულებული"
  // links here with ?tab=history — so the URL is the single source of which
  // slice is open, and a link into the page can no longer disagree with what it
  // draws.
  const tab: JobBucket = fromUrl === 'history' ? 'history' : 'active'

  // ⚠️ `attention` IS NOT A FILTER ANY MORE, IT IS AN ORDER. A row that needs an
  // answer says so on the row (`JobRowItem`), so hiding the rest behind a fourth
  // button asked somebody to go looking for work they already hold. What the
  // bucket is still good for is putting those rows first.
  const list = tab === 'history'
    ? buckets.history
    : [...buckets.attention, ...buckets.active]
  const total = buckets.attention.length + buckets.active.length + buckets.history.length
  const { dated, undated } = splitDated(list)

  // Day headers only where a day means something: work still ahead. History is
  // one reverse-chronological column.
  const grouped = useMemo(() => {
    if (tab !== 'active') return null
    const groups: { label: string; items: JobRow[] }[] = []
    for (const r of dated) {
      const label = dayLabel(r, nowDate)
      const last = groups[groups.length - 1]
      if (last && last.label === label) last.items.push(r)
      else groups.push({ label, items: [r] })
    }
    return groups
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, list])

  const row = (r: JobRow) => <JobRowItem key={`${r.kind}:${r.id}`} r={r} />

  return (
    <div>
      {/* ⚠️ THIS PAGE'S OWN THREE-TAB BAR STOOD HERE (removed 2026-08-29):
          „ყურადღება · მიმდინარე · ისტორია" — a second tab bar directly under
          the stage bar the workspace now draws (app/work/_components/WorkTabs),
          so one screen asked the reader to hold two different ideas of „which
          slice am I looking at". Owner: „ერთი ნაკადი გახდეს."

          The stage bar owns the split now — „ხელში მაქვს" is this page at
          ?tab=active and „დასრულებული" is ?tab=history — and `attention` folded
          into the first of those: a row that needs an answer is not a separate
          filter, it is a row that says so. `buildJobRows` still returns all
          three buckets; the merge happens where the list is read. */}
      <div className="flex items-end justify-end gap-4 mb-5">
        <TzNote className="hidden sm:block text-meta text-ink-500 shrink-0" />
      </div>

      {list.length === 0 ? (
        // TWO empty states, and the difference is the whole point: „you have no
        // work yet" is news about the account, „nothing in this filter" is news
        // about the tab. Showing the first inside a filter tells somebody with
        // eleven finished jobs that they have never worked here.
        total === 0 ? (
          <EmptyState
            illustration="bookings"
            title="ჯერ სამუშაო არ გაქვს"
            description="მიღებული შეთავაზებები აქ ჩნდება."
            cta={{ label: 'ახალი მოთხოვნები', href: '/work/requests' }}
          />
        ) : (
          <EmptyState
            icon={<Icon.check className="w-6 h-6" />}
            title={tab === 'active' ? 'ყველაფერი მოგვარებულია' : 'ამ ფილტრში არაფერია'}
            description={
              tab === 'active'
                ? 'მიმდინარე სამუშაო არ არის — ნახე დასრულებული.'
                : 'დასრულებული სამუშაო ჯერ არ გაქვს.'
            }
          />
        )
      ) : (
        /* ⚠️ KEYED ON THE TAB. Switching a filter here is instant (the rows are
           already in memory), which is right — but instant with no transition
           reads as „did that work?". The key remounts the results so the site's
           own `fade-in-fast` (140ms, the same token every other state toggle
           uses) plays once per switch. Nothing moves; only the opacity does,
           so no control is delayed and nothing shifts under the cursor. */
        <div key={tab} className="space-y-6 motion-safe:animate-fade-in-fast">
          {grouped
            ? grouped.map(g => (
                <section key={g.label} aria-label={g.label}>
                  <Eyebrow tone="muted" className="mb-2.5">{g.label}</Eyebrow>
                  <ul className="space-y-3 stagger">{g.items.map(row)}</ul>
                </section>
              ))
            : dated.length > 0 && <ul className="space-y-3 stagger">{dated.map(row)}</ul>}

          {/* ⚠️ THE UNDATED TAIL. A quote has no slot; it sits under its own
              heading instead of borrowing one. */}
          {undated.length > 0 && (
            <section aria-label={UNDATED_LABEL}>
              <Eyebrow tone="muted" className="mb-2.5">{UNDATED_LABEL}</Eyebrow>
              <ul className="space-y-3 stagger">{undated.map(row)}</ul>
            </section>
          )}
        </div>
      )}

      {tab === 'history' && list.length >= 30 && (
        <p className="mt-4 text-center text-meta text-ink-400">ნაჩვენებია ბოლო სამუშაოები.</p>
      )}
    </div>
  )
}

/* One job row — the SHARED model: the same name, status, title, time and price
   shape whatever the row came from, so the list reads as one list. */
function JobRowItem({ r }: { r: JobRow }) {
  return (
    <li className="rounded-card border border-ink-200 bg-white shadow-xs hover:border-ink-300 transition-colors duration-fast">
      <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <Link href={r.href} className="flex items-center gap-3 min-w-0 flex-1 group">
          <Avatar name={r.peerName} size={44} />
          <span className="min-w-0 flex-1 block">
            <span className="flex items-center gap-2 flex-wrap">
              <span className="font-display text-body font-bold text-ink-900 truncate group-hover:text-brand-800 transition-colors duration-fast">
                {r.peerName}
              </span>
              <span className="inline-flex items-center h-6 px-2.5 rounded-pill border bg-transparent font-display text-micro font-bold uppercase border-ink-200 text-ink-500">
                {r.statusLabel}
              </span>
            </span>
            <span className="block text-small text-ink-600 truncate mt-0.5" title={r.title}>{r.title}</span>
            <span className="text-meta text-ink-500 mt-1 flex items-center gap-3 flex-wrap">
              {r.when ? (
                <span className="inline-flex items-center gap-1">
                  <Icon.calendar className="w-3.5 h-3.5" />
                  {sessionDate(r.when.toISOString())} · {sessionTime(r.when.toISOString())}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1"><Icon.briefcase className="w-3.5 h-3.5" />შეთანხმებული სამუშაო</span>
              )}
              <span className="font-display font-bold text-ink-800 tabular-nums">{r.price}</span>
            </span>
          </span>
        </Link>
      </div>
    </li>
  )
}

// useSearchParams requires a Suspense boundary in Next 15.
export function JobsClient(props: Props) {
  return (
    <Suspense fallback={null}>
      <JobsInner {...props} />
    </Suspense>
  )
}
