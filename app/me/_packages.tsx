'use client'
// „ჩემი პაკეტები" — the client's credits, and the times to spend them on.
//
// The single job of this component is to stop a paid credit becoming an expired
// one, so the balance and the booking action are deliberately the same card:
// every extra click between „I have 6 lessons left" and „book one" is where
// those lessons get lost.
//
// Times are grouped by day (Preply's „My lessons" does the same) because nobody
// scans a flat list of 60 timestamps — they pick a day first, then an hour.

import { useCallback, useEffect, useState } from 'react'
import { Btn } from '@/components/Btn'
import { Eyebrow } from '@/components/Eyebrow'
import { useToast } from '@/components/ToastProvider'
import { fmtKaDate, fmtKaTime } from '@/lib/kaDate'
import { WeeklyPattern } from './_pattern'

type Item = {
  id: string
  status: 'REQUESTED' | 'ACTIVE'
  lessonsTotal: number
  lessonsUsed: number
  left: number
  priceTotal: number
  expiresAt: string | null
  minutes: number
  title: string
  tutorName: string
  tutorSlug: string
  starts: string[]
}

/** Group ISO starts by calendar day, preserving order. */
function byDay(starts: string[]): { day: Date; times: Date[] }[] {
  const out: { day: Date; times: Date[] }[] = []
  for (const iso of starts) {
    const d = new Date(iso)
    const key = new Date(d); key.setHours(0, 0, 0, 0)
    const last = out[out.length - 1]
    if (last && last.day.getTime() === key.getTime()) last.times.push(d)
    else out.push({ day: key, times: [d] })
  }
  return out
}

export function StudentPackages() {
  const { toast } = useToast()
  const [items, setItems] = useState<Item[]>([])
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [pattern, setPattern] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/student/enrollments', { cache: 'no-store' })
      if (res.status === 404 || res.status === 401) return setLoaded(true)
      const j = await res.json()
      setItems(j.items ?? [])
      setLoaded(true)
    } catch {
      // Never render a fetch failure as „you have no packages".
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const book = async (enrollmentId: string, startAt: string) => {
    setBusy(startAt)
    try {
      const res = await fetch(`/api/enrollments/${enrollmentId}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startAt }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast(j.message || 'ვერ დაიჯავშნა', 'error'); return }
      toast('გაკვეთილი დაიჯავშნა', 'success')
      setOpen(null)
      await load()
    } catch { toast('ქსელის შეცდომა', 'error') }
    finally { setBusy(null) }
  }

  if (!loaded || items.length === 0) return null

  return (
    <section className="rounded-card border border-ink-200 bg-white p-5 sm:p-6 space-y-4">
      <div>
        <Eyebrow tone="muted" className="mb-1">ჩემი პაკეტები</Eyebrow>
        <p className="text-meta text-ink-500 leading-snug">დარჩენილი გაკვეთილები და თავისუფალი დრო.</p>
      </div>

      {items.map(it => {
        const pct = it.lessonsTotal > 0 ? Math.round((it.lessonsUsed / it.lessonsTotal) * 100) : 0
        const days = byDay(it.starts)
        return (
          <div key={it.id} className="p-4 rounded-card border border-ink-200">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="font-display text-body font-bold text-ink-900">{it.tutorName}</div>
                <div className="mt-0.5 text-meta text-ink-600 tabular-nums">
                  {it.title} · {it.minutes} წთ
                  {it.expiresAt && <> · ვადა {fmtKaDate(new Date(it.expiresAt))}</>}
                </div>
              </div>
              {it.status === 'REQUESTED' && (
                <span className="inline-flex items-center h-6 px-2 rounded-pill border border-warning-300 text-warning-800 font-display text-micro font-bold uppercase">
                  დასტურს ელოდება
                </span>
              )}
            </div>

            {it.status === 'ACTIVE' && (
              <>
                <div className="mt-3">
                  <div className="flex items-baseline justify-between gap-2 text-meta tabular-nums">
                    <span className="text-ink-600">{it.lessonsUsed} / {it.lessonsTotal} დაჯავშნილი</span>
                    <span className="font-display font-bold text-ink-900">დარჩა {it.left}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-pill bg-ink-100 overflow-hidden">
                    <div className="h-full bg-brand-500 rounded-pill" style={{ width: `${pct}%` }} />
                  </div>
                </div>

                {it.left === 0 ? (
                  <p className="mt-3 text-meta text-ink-500">ყველა გაკვეთილი დაჯავშნილია.</p>
                ) : days.length === 0 ? (
                  <p className="mt-3 text-meta text-warning-800">ექსპერტს ჯერ არ გამოუქვეყნებია თავისუფალი დრო.</p>
                ) : open === it.id ? (
                  <div className="mt-3 space-y-3">
                    {days.slice(0, 10).map(d => (
                      <div key={d.day.toISOString()}>
                        <div className="font-display text-meta font-semibold text-ink-700 mb-1.5">{fmtKaDate(d.day)}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {d.times.map(t => {
                            const iso = t.toISOString()
                            return (
                              <button
                                key={iso}
                                type="button"
                                disabled={busy !== null}
                                onClick={() => book(it.id, iso)}
                                className="h-9 px-3 rounded-btn border border-ink-200 bg-white hover:border-brand-400 hover:text-brand-700 font-display text-meta font-semibold tabular-nums transition-colors duration-fast disabled:opacity-50 motion-safe:active:scale-[0.97]"
                              >
                                {busy === iso ? '…' : fmtKaTime(t)}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                    <Btn variant="ghost" size="sm" type="button" onClick={() => setOpen(null)}>დახურვა</Btn>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    {/* The pattern is the PRIMARY action and the single lesson
                        the secondary one: booking eight lessons one at a time is
                        eight decisions about the same decision, and the credits
                        that never get booked are the ones that expire. */}
                    <Btn variant="primary" size="sm" type="button" onClick={() => setPattern(pattern === it.id ? null : it.id)}>
                      ყოველკვირეული განრიგი
                    </Btn>
                    <Btn variant="secondary" size="sm" type="button" onClick={() => setOpen(it.id)}>
                      ერთი გაკვეთილი
                    </Btn>
                  </div>
                )}

                {pattern === it.id && open !== it.id && (
                  <WeeklyPattern
                    enrollmentId={it.id}
                    starts={it.starts}
                    left={it.left}
                    onDone={() => { setPattern(null); void load() }}
                  />
                )}
              </>
            )}
          </div>
        )
      })}
    </section>
  )
}
