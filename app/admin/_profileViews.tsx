'use client'
import { AdminEmpty, AdminError, AdminLoading, CopyBtn, OpenBtn, Stat } from './_parts'
import { useEffect, useState } from 'react'
import { Icon } from '@/components/Icon'
import { Avatar } from '@/components/Avatar'
import { fmtKaDateTime } from '@/lib/kaDate'

/* WHO LOOKED, AND DID THEY BOOK.
 *
 * The step BEFORE the booking funnel. Without it, „nobody sees this expert" and
 * „people see them and walk away" look identical from the panel — and the two
 * have opposite fixes (bring traffic vs. fix the profile, the price, or the
 * empty calendar). The `profile_view` event has been written since 2026-07-27;
 * this is the first thing that reads it back.
 *
 * Honest about its own limits, on screen and not just here: `uniqueViewers`
 * counts DISTINCT userId, so it counts SIGNED-IN people only. An anonymous
 * visitor has no identity to de-duplicate by (the Event row stores nothing but
 * userId — no ip, no fingerprint), so anonymous views are a VIEW count, never a
 * people count. The two are shown separately and never summed into „visitors".
 */

type Expert = {
  tutorId: string; slug: string | null; fullName: string | null; avatarUrl: string | null
  views: number; uniqueViewers: number; anonViews: number; bookings: number
  convertRate: number | null; lastAt: string
  bookable: boolean; hasSlots: boolean; hasService: boolean; listed: boolean
}
type Overview = {
  days: number
  totals: { views: number; bookings: number; anonViews: number; experts: number; deadEndViews: number }
  experts: Expert[]
}
type Viewer = {
  userId: string; fullName: string | null; email: string
  views: number; lastAt: string; booked: boolean
}
type Drill = { days: number; tutorId: string; anonViews: number; viewers: Viewer[] }

/** A rate that never rounds a real result down to „0%".
 *
 *  1 booking out of 234 views is 0.4%, and `Math.round` turns that into „0%" —
 *  which reads as „nobody booked at all". That is a different and worse claim
 *  than „almost nobody booked", and it is exactly the mistake this tab already
 *  guards against elsewhere (zeroShare is null, never 0, when there were no
 *  searches). Anything above zero but below one percent renders „<1%".
 */
const ratePct = (a: number, b: number): string => {
  if (b <= 0) return '—'
  if (a === 0) return '0%'
  const p = (a / b) * 100
  return p < 1 ? '<1%' : `${Math.round(p)}%`
}

/** Why this expert cannot take a booking, in the fewest words that still say
 *  what to do. Nothing at all when they are bookable — a green „ok" badge on
 *  every healthy row is noise that hides the three that matter. */
const Blocker = ({ e }: { e: Expert }) => {
  if (e.bookable) return null
  const label =
    !e.listed ? 'გამორთულია' :
    !e.hasService ? 'სერვისი არ აქვს' :
    !e.hasSlots ? 'თავისუფალი დრო არ აქვს' :
    'დაუჯავშნადია'
  return (
    <span className="inline-flex items-center h-5 px-2 rounded-pill border border-danger-200 text-danger-700 font-display text-micro font-bold uppercase shrink-0">
      {label}
    </span>
  )
}

const ViewerRow = ({ v }: { v: Viewer }) => {
  return (
    <div className="py-2.5 px-4 border-b border-ink-100 last:border-0 flex items-center gap-3 flex-wrap">
      <div className="min-w-0 flex-1">
        <div className="font-display text-small font-semibold text-ink-900 truncate">
          {v.fullName || v.email}
        </div>
        <div className="text-meta text-ink-600 mt-0.5">
          {v.views} ნახვა · ბოლოს {fmtKaDateTime(new Date(v.lastAt))}
        </div>
      </div>
      {v.booked ? (
        <span className="inline-flex items-center gap-1 h-5 px-2 rounded-pill border border-brand-200 text-brand-700 font-display text-micro font-bold uppercase shrink-0">
          <Icon.check className="w-3 h-3" /> დაჯავშნა
        </span>
      ) : v.views > 1 ? (
        // Looked more than once and still did not book — the highest-intent row
        // on this panel, and the only one worth a message.
        <span className="inline-flex items-center h-5 px-2 rounded-pill border border-warning-300 text-warning-800 font-display text-micro font-bold uppercase shrink-0">
          დაბრუნდა, არ დაჯავშნა
        </span>
      ) : null}
      <span className="shrink-0"><CopyBtn value={v.email} label="ელფოსტა" /></span>
    </div>
  )
}

export function ProfileViewsSection({ days }: { days: number }) {
  const [d, setD] = useState<Overview | null>(null)
  const [err, setErr] = useState(false)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [drill, setDrill] = useState<Record<string, Drill | 'loading' | 'error'>>({})

  useEffect(() => {
    let alive = true
    setBusy(true); setErr(false)
    fetch(`/api/admin/profile-views?days=${days}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('bad status'))))
      .then(j => { if (alive) setD(j) })
      // A failed fetch must never render as „no data" — that reads as „nobody
      // viewed anything", which is a different and much worse claim.
      .catch(() => { if (alive) setErr(true) })
      .finally(() => { if (alive) setBusy(false) })
    // The period changed, so every cached drill-down is for the wrong window.
    setDrill({}); setOpen(null)
    return () => { alive = false }
  }, [days])

  const toggle = async (tutorId: string) => {
    if (open === tutorId) { setOpen(null); return }
    setOpen(tutorId)
    if (drill[tutorId] && drill[tutorId] !== 'error') return
    setDrill(s => ({ ...s, [tutorId]: 'loading' }))
    try {
      const r = await fetch(`/api/admin/profile-views?days=${days}&tutorId=${encodeURIComponent(tutorId)}`, { cache: 'no-store' })
      if (!r.ok) throw new Error('bad status')
      const j: Drill = await r.json()
      setDrill(s => ({ ...s, [tutorId]: j }))
    } catch {
      setDrill(s => ({ ...s, [tutorId]: 'error' }))
    }
  }

  if (err) return <AdminError message="პროფილების ნახვები ვერ ჩაიტვირთა." />
  if (!d) return <AdminLoading />
  if (d.experts.length === 0) {
    return <AdminEmpty text={`ბოლო ${d.days} დღეში პროფილი არავის უნახავს.`} />
  }

  return (
    /* While a period change is in flight the OLD numbers are still on screen.
       Left alone they read as this period's answer, which is a lie for as long
       as the query takes; dimmed + aria-busy they read as „being replaced". */
    <div className={`space-y-4 ${busy ? 'opacity-60 transition-opacity duration-fast' : ''}`} aria-busy={busy || undefined}>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat n={String(d.totals.views)} label="პროფილის ნახვა" sub={`ბოლო ${d.days} დღეში`} />
        <Stat n={String(d.totals.bookings)} label="ჯავშანი" sub="იმავე პერიოდში" />
        <Stat
          n={ratePct(d.totals.bookings, d.totals.views)}
          label="ნახვა → ჯავშანი"
          sub="რამდენი ნახვა იქცა ჯავშნად"
          bad={d.totals.views > 0 && d.totals.bookings / d.totals.views < 0.05}
        />
        <Stat
          n={String(d.totals.deadEndViews)}
          label="ჩიხში დაკარგული ნახვა"
          sub="ნახეს პროფილი, რომლის დაჯავშნაც შეუძლებელია"
          bad={d.totals.deadEndViews > 0}
        />
      </div>

      <div className="rounded-card border border-ink-200 bg-white overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-ink-100 flex items-baseline justify-between gap-3">
          <div className="font-display text-small font-bold text-ink-900">ექსპერტები ნახვების მიხედვით</div>
          <div className="text-meta text-ink-500">დააჭირე რიგს — ვინ ნახა</div>
        </div>

        {d.experts.map(e => {
          const dd = drill[e.tutorId]
          return (
            <div key={e.tutorId} className="border-b border-ink-100 last:border-0">
              <button
                type="button"
                onClick={() => toggle(e.tutorId)}
                aria-expanded={open === e.tutorId}
                className="w-full text-left px-4 sm:px-5 py-3 flex items-center gap-3 hover:bg-ink-50/60 transition-colors duration-fast"
              >
                <Avatar src={e.avatarUrl ?? undefined} name={e.fullName ?? '?'} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display text-small font-semibold text-ink-900 truncate">{e.fullName ?? '—'}</span>
                    <Blocker e={e} />
                  </div>
                  <div className="text-meta text-ink-600 mt-0.5">
                    {e.uniqueViewers} დარეგისტრირებული · {e.anonViews} ანონიმური ნახვა · ბოლოს {fmtKaDateTime(new Date(e.lastAt))}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-display text-h3 font-bold tabular-nums text-ink-900 leading-none">{e.views}</div>
                  <div className="text-meta text-ink-500 mt-0.5">ნახვა</div>
                </div>
                <div className="text-right shrink-0 w-16">
                  <div className={`font-display text-h3 font-bold tabular-nums leading-none ${e.bookings > 0 ? 'text-brand-700' : 'text-ink-400'}`}>{e.bookings}</div>
                  <div className="text-meta text-ink-500 mt-0.5">ჯავშანი</div>
                </div>
                <Icon.chevD className={`w-4 h-4 text-ink-400 shrink-0 transition-transform duration-fast ${open === e.tutorId ? 'rotate-180' : ''}`} />
              </button>

              {open === e.tutorId && (
                <div className="bg-ink-50/50 border-t border-ink-100">
                  {dd === 'loading' && <AdminLoading />}
                  {dd === 'error' && <div className="px-4 py-4 text-meta text-danger-700">ვერ ჩაიტვირთა.</div>}
                  {dd && dd !== 'loading' && dd !== 'error' && (
                    <>
                      {dd.viewers.length === 0 ? (
                        <div className="px-4 py-4 text-meta text-ink-600">
                          დარეგისტრირებული მნახველი არ ყოფილა — ყველა ნახვა ანონიმურია ({dd.anonViews}).
                        </div>
                      ) : (
                        <>
                          {dd.viewers.map(v => <ViewerRow key={v.userId} v={v} />)}
                          <div className="px-4 py-2.5 text-meta text-ink-500 border-t border-ink-100">
                            + {dd.anonViews} ანონიმური ნახვა — მათი იდენტიფიცირება არ ხდება და არც ინახება.
                          </div>
                        </>
                      )}
                      {e.slug && (
                        <div className="px-4 py-2.5 border-t border-ink-100">
                          {/* Opens in a new tab on purpose — the admin is
                              mid-review and must not lose the expanded row. */}
                          <OpenBtn href={`/tutors/${e.slug}`} label="პროფილის ნახვა" />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-meta text-ink-500 leading-snug">
        ნახვა ერთხელ ითვლება ერთ ვიზიტზე; ბოტები, ადმინი და ექსპერტის საკუთარი ნახვები არ ითვლება.
        „დარეგისტრირებული“ ნიშნავს შესულ მომხმარებლებს — ანონიმური ვიზიტორის დათვლა ცალკეულ ადამიანებად შეუძლებელია, ამიტომ ეს ორი რიცხვი არასოდეს ჯამდება.
      </p>
    </div>
  )
}
